/**
 * Tests for Flock Directory lifecycle — heartbeat, stale sweep, and self-registration flow.
 *
 * Covers the periodic maintenance behavior added for #903:
 * - selfRegister idempotency acts as heartbeat
 * - sweepStaleAgents marks agents inactive after heartbeat timeout
 * - Full lifecycle: register → heartbeat → stale → sweep → re-register
 */
import { test, expect, describe, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { FlockDirectoryService } from '../flock-directory/service';

let db: Database;
let svc: FlockDirectoryService;

beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    svc = new FlockDirectoryService(db);
});

const SELF_OPTS = {
    address: 'ALGO_LIFECYCLE',
    name: 'corvid-agent',
    description: 'Test agent',
    instanceUrl: 'http://localhost:3000',
    capabilities: ['code', 'test'],
};

// ─── Heartbeat via selfRegister ─────────────────────────────────────────────

describe('heartbeat via selfRegister', () => {
    test('selfRegister on already-active agent updates heartbeat timestamp', async () => {
        const first = await svc.selfRegister(SELF_OPTS);
        // Small delay to ensure timestamp difference
        await new Promise(r => setTimeout(r, 50));

        await svc.selfRegister(SELF_OPTS);
        const updated = svc.getByAddress(SELF_OPTS.address)!;

        expect(updated.id).toBe(first.id);
        expect(updated.status).toBe('active');
        expect(updated.lastHeartbeat).not.toBeNull();
    });

    test('explicit heartbeat keeps agent active', async () => {
        const agent = await svc.selfRegister(SELF_OPTS);
        const result = svc.heartbeat(agent.id);
        expect(result).toBe(true);

        const refreshed = svc.getById(agent.id)!;
        expect(refreshed.status).toBe('active');
    });
});

// ─── Stale Sweep ────────────────────────────────────────────────────────────

describe('sweepStaleAgents', () => {
    test('marks agents inactive after heartbeat timeout', async () => {
        const agent = await svc.selfRegister(SELF_OPTS);

        // Backdate the heartbeat to 45 minutes ago (beyond 30-min threshold)
        db.query(
            `UPDATE flock_agents SET last_heartbeat = datetime('now', '-45 minutes') WHERE id = ?`,
        ).run(agent.id);

        const swept = svc.sweepStaleAgents();
        expect(swept).toBe(1);

        const stale = svc.getById(agent.id)!;
        expect(stale.status).toBe('inactive');
    });

    test('does not sweep agents with recent heartbeat', async () => {
        await svc.selfRegister(SELF_OPTS);

        const swept = svc.sweepStaleAgents();
        expect(swept).toBe(0);
    });

    test('does not sweep deregistered agents', async () => {
        const agent = await svc.selfRegister(SELF_OPTS);
        svc.deregister(agent.id);

        // Backdate heartbeat
        db.query(
            `UPDATE flock_agents SET last_heartbeat = datetime('now', '-45 minutes') WHERE id = ?`,
        ).run(agent.id);

        const swept = svc.sweepStaleAgents();
        expect(swept).toBe(0);
    });

    test('sweeps multiple stale agents at once', async () => {
        const a1 = svc.register({ address: 'STALE_1', name: 'Agent1' });
        const a2 = svc.register({ address: 'STALE_2', name: 'Agent2' });
        svc.register({ address: 'FRESH', name: 'Agent3' }); // stays fresh

        // Backdate two agents
        db.query(
            `UPDATE flock_agents SET last_heartbeat = datetime('now', '-60 minutes') WHERE id IN (?, ?)`,
        ).run(a1.id, a2.id);

        const swept = svc.sweepStaleAgents();
        expect(swept).toBe(2);

        expect(svc.getById(a1.id)!.status).toBe('inactive');
        expect(svc.getById(a2.id)!.status).toBe('inactive');
    });
});

// ─── Full Lifecycle ─────────────────────────────────────────────────────────

describe('full lifecycle', () => {
    test('register → heartbeat → go stale → sweep → re-register', async () => {
        // 1. Register
        const agent = await svc.selfRegister(SELF_OPTS);
        expect(agent.status).toBe('active');

        // 2. Heartbeat
        svc.heartbeat(agent.id);
        expect(svc.getById(agent.id)!.status).toBe('active');

        // 3. Go stale (backdate heartbeat)
        db.query(
            `UPDATE flock_agents SET last_heartbeat = datetime('now', '-45 minutes') WHERE id = ?`,
        ).run(agent.id);

        // 4. Sweep
        const swept = svc.sweepStaleAgents();
        expect(swept).toBe(1);
        expect(svc.getById(agent.id)!.status).toBe('inactive');

        // 5. Self-register again — heartbeat should reactivate
        await svc.selfRegister(SELF_OPTS);
        const recovered = svc.getById(agent.id)!;
        expect(recovered.id).toBe(agent.id);
        expect(recovered.status).toBe('active');
    });

    test('stats reflect active/inactive counts after sweep', async () => {
        svc.register({ address: 'S_ACTIVE', name: 'Active' });
        const staleAgent = svc.register({ address: 'S_STALE', name: 'Stale' });

        db.query(
            `UPDATE flock_agents SET last_heartbeat = datetime('now', '-60 minutes') WHERE id = ?`,
        ).run(staleAgent.id);

        svc.sweepStaleAgents();

        const stats = svc.getStats();
        expect(stats.total).toBe(2);
        expect(stats.active).toBe(1);
        expect(stats.inactive).toBe(1);
    });
});

/**
 * Tests for the Flock Directory service:
 * - Agent registration, deregistration
 * - Heartbeat and stale sweep
 * - Search and filtering
 * - Lookup by ID and address
 */
import { test, expect, describe, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { FlockDirectoryService } from '../flock-directory/service';

// ─── DB Setup ────────────────────────────────────────────────────────────────

let db: Database;
let svc: FlockDirectoryService;

beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    svc = new FlockDirectoryService(db);
});

// ─── Registration ────────────────────────────────────────────────────────────

describe('register', () => {
    test('creates an agent and returns it', () => {
        const agent = svc.register({
            address: 'ALGO123456789',
            name: 'TestAgent',
            description: 'A test agent',
            capabilities: ['coding', 'research'],
        });

        expect(agent.id).toBeTruthy();
        expect(agent.address).toBe('ALGO123456789');
        expect(agent.name).toBe('TestAgent');
        expect(agent.description).toBe('A test agent');
        expect(agent.capabilities).toEqual(['coding', 'research']);
        expect(agent.status).toBe('active');
        expect(agent.reputationScore).toBe(0);
        expect(agent.lastHeartbeat).toBeTruthy();
    });

    test('enforces unique address', () => {
        svc.register({ address: 'ALGO_UNIQUE', name: 'Agent1' });
        expect(() => svc.register({ address: 'ALGO_UNIQUE', name: 'Agent2' })).toThrow();
    });

    test('defaults capabilities to empty array', () => {
        const agent = svc.register({ address: 'ALGO_EMPTY', name: 'EmptyAgent' });
        expect(agent.capabilities).toEqual([]);
    });
});

// ─── Deregistration ──────────────────────────────────────────────────────────

describe('deregister', () => {
    test('soft-deletes an agent', () => {
        const agent = svc.register({ address: 'ALGO_DEL', name: 'ToDelete' });
        const ok = svc.deregister(agent.id);
        expect(ok).toBe(true);

        const found = svc.getById(agent.id);
        expect(found).not.toBeNull();
        expect(found!.status).toBe('deregistered');
    });

    test('returns false for non-existent agent', () => {
        expect(svc.deregister('nonexistent-id')).toBe(false);
    });

    test('returns false for already deregistered agent', () => {
        const agent = svc.register({ address: 'ALGO_ALREADY', name: 'Already' });
        svc.deregister(agent.id);
        expect(svc.deregister(agent.id)).toBe(false);
    });
});

// ─── Heartbeat ───────────────────────────────────────────────────────────────

describe('heartbeat', () => {
    test('updates last heartbeat', () => {
        const agent = svc.register({ address: 'ALGO_HB', name: 'HeartbeatAgent' });


        const ok = svc.heartbeat(agent.id);
        expect(ok).toBe(true);

        const updated = svc.getById(agent.id)!;
        expect(updated.lastHeartbeat).toBeTruthy();
        expect(updated.status).toBe('active');
    });

    test('returns false for deregistered agent', () => {
        const agent = svc.register({ address: 'ALGO_HB2', name: 'Dead' });
        svc.deregister(agent.id);
        expect(svc.heartbeat(agent.id)).toBe(false);
    });
});

// ─── Update ──────────────────────────────────────────────────────────────────

describe('update', () => {
    test('updates agent metadata', () => {
        const agent = svc.register({ address: 'ALGO_UPD', name: 'OldName' });
        const updated = svc.update(agent.id, {
            name: 'NewName',
            description: 'Updated description',
            capabilities: ['security'],
            reputationScore: 85,
        });

        expect(updated).not.toBeNull();
        expect(updated!.name).toBe('NewName');
        expect(updated!.description).toBe('Updated description');
        expect(updated!.capabilities).toEqual(['security']);
        expect(updated!.reputationScore).toBe(85);
    });

    test('returns null for deregistered agent', () => {
        const agent = svc.register({ address: 'ALGO_UPD2', name: 'Gone' });
        svc.deregister(agent.id);
        expect(svc.update(agent.id, { name: 'Nope' })).toBeNull();
    });

    test('returns agent unchanged for empty update', () => {
        const agent = svc.register({ address: 'ALGO_UPD3', name: 'Unchanged' });
        const updated = svc.update(agent.id, {});
        expect(updated!.name).toBe('Unchanged');
    });
});

// ─── Lookup ──────────────────────────────────────────────────────────────────

describe('lookup', () => {
    test('getById returns agent by ID', () => {
        const agent = svc.register({ address: 'ALGO_LOOK', name: 'LookupAgent' });
        const found = svc.getById(agent.id);
        expect(found).not.toBeNull();
        expect(found!.name).toBe('LookupAgent');
    });

    test('getByAddress returns agent by address', () => {
        svc.register({ address: 'ALGO_ADDR_LOOK', name: 'AddrAgent' });
        const found = svc.getByAddress('ALGO_ADDR_LOOK');
        expect(found).not.toBeNull();
        expect(found!.name).toBe('AddrAgent');
    });

    test('returns null for non-existent ID', () => {
        expect(svc.getById('nonexistent')).toBeNull();
    });

    test('returns null for non-existent address', () => {
        expect(svc.getByAddress('ALGO_NOPE')).toBeNull();
    });
});

// ─── List & Search ───────────────────────────────────────────────────────────

describe('listActive', () => {
    test('returns only active agents sorted by reputation', () => {
        svc.register({ address: 'ALGO_A1', name: 'Agent1' });
        const a2 = svc.register({ address: 'ALGO_A2', name: 'Agent2' });
        svc.update(a2.id, { reputationScore: 90 });
        svc.register({ address: 'ALGO_A3', name: 'Agent3' });
        const a4 = svc.register({ address: 'ALGO_A4', name: 'Agent4' });
        svc.deregister(a4.id);

        const active = svc.listActive();
        expect(active.length).toBe(3);
        expect(active[0].name).toBe('Agent2'); // highest rep
    });

    test('respects limit and offset', () => {
        for (let i = 0; i < 5; i++) {
            svc.register({ address: `ALGO_PAGE_${i}`, name: `Agent${i}` });
        }
        const page = svc.listActive(2, 1);
        expect(page.length).toBe(2);
    });
});

describe('search', () => {
    test('searches by query', () => {
        svc.register({ address: 'ALGO_S1', name: 'CodeBot', description: 'A coding assistant' });
        svc.register({ address: 'ALGO_S2', name: 'ResearchBot', description: 'A research tool' });

        const result = svc.search({ query: 'coding' });
        expect(result.total).toBe(1);
        expect(result.agents[0].name).toBe('CodeBot');
    });

    test('searches by capability', () => {
        svc.register({ address: 'ALGO_C1', name: 'SecBot', capabilities: ['security', 'audit'] });
        svc.register({ address: 'ALGO_C2', name: 'DevBot', capabilities: ['coding', 'devops'] });

        const result = svc.search({ capability: 'security' });
        expect(result.total).toBe(1);
        expect(result.agents[0].name).toBe('SecBot');
    });

    test('filters by minimum reputation', () => {
        const a1 = svc.register({ address: 'ALGO_R1', name: 'HighRep' });
        svc.update(a1.id, { reputationScore: 90 });
        svc.register({ address: 'ALGO_R2', name: 'LowRep' });

        const result = svc.search({ minReputation: 50 });
        expect(result.total).toBe(1);
        expect(result.agents[0].name).toBe('HighRep');
    });

    test('excludes deregistered agents by default', () => {
        svc.register({ address: 'ALGO_EX1', name: 'Active' });
        const a2 = svc.register({ address: 'ALGO_EX2', name: 'Gone' });
        svc.deregister(a2.id);

        const result = svc.search({});
        expect(result.total).toBe(1);
    });

    test('filters by status when specified', () => {
        svc.register({ address: 'ALGO_ST1', name: 'Active' });
        const a2 = svc.register({ address: 'ALGO_ST2', name: 'Dereg' });
        svc.deregister(a2.id);

        const result = svc.search({ status: 'deregistered' });
        expect(result.total).toBe(1);
        expect(result.agents[0].name).toBe('Dereg');
    });
});

// ─── Stats ───────────────────────────────────────────────────────────────────

describe('getStats', () => {
    test('returns correct counts', () => {
        svc.register({ address: 'ALGO_STAT1', name: 'Active1' });
        svc.register({ address: 'ALGO_STAT2', name: 'Active2' });
        const a3 = svc.register({ address: 'ALGO_STAT3', name: 'Dereg' });
        svc.deregister(a3.id);

        const stats = svc.getStats();
        expect(stats.total).toBe(2); // excludes deregistered
        expect(stats.active).toBe(2);
        expect(stats.inactive).toBe(0);
    });
});

// ─── Stale Sweep ─────────────────────────────────────────────────────────────

describe('sweepStaleAgents', () => {
    test('marks agents with old heartbeats as inactive', () => {
        const agent = svc.register({ address: 'ALGO_STALE', name: 'Stale' });

        // Manually set heartbeat to the past
        db.query(`UPDATE flock_agents SET last_heartbeat = datetime('now', '-60 minutes') WHERE id = ?`).run(agent.id);

        const count = svc.sweepStaleAgents();
        expect(count).toBe(1);

        const updated = svc.getById(agent.id)!;
        expect(updated.status).toBe('inactive');
    });

    test('does not touch agents with recent heartbeats', () => {
        svc.register({ address: 'ALGO_RECENT', name: 'Recent' });

        const count = svc.sweepStaleAgents();
        expect(count).toBe(0);
    });
});

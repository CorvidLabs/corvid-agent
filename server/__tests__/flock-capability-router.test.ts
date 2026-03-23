/**
 * Tests for CapabilityRouter:
 * - Capability matching
 * - Score-based ranking
 * - Exclusion rules
 * - Repo conflict filtering
 */
import { test, expect, describe, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { FlockDirectoryService } from '../flock-directory/service';
import { FlockConflictResolver } from '../flock-directory/conflict-resolver';
import { CapabilityRouter, CAPABILITIES } from '../flock-directory/capability-router';

let db: Database;
let flockService: FlockDirectoryService;
let conflictResolver: FlockConflictResolver;
let router: CapabilityRouter;

const SELF_ID = 'self-agent';

beforeEach(async () => {
    db = new Database(':memory:');
    runMigrations(db);
    flockService = new FlockDirectoryService(db);
    conflictResolver = new FlockConflictResolver(db, flockService, {
        selfAgentId: SELF_ID,
        selfAgentName: 'Self',
    });
    conflictResolver.ensureSchema();
    router = new CapabilityRouter(flockService, conflictResolver, SELF_ID);

    // Register some agents in the flock
    await flockService.register({
        address: 'ADDR_ALICE',
        name: 'Alice',
        description: 'Code review specialist',
        capabilities: [CAPABILITIES.CODE_REVIEW, CAPABILITIES.SECURITY_AUDIT],
    });
    await flockService.register({
        address: 'ADDR_BOB',
        name: 'Bob',
        description: 'Feature developer',
        capabilities: [CAPABILITIES.FEATURE_WORK, CAPABILITIES.BUG_FIX, CAPABILITIES.TESTING],
    });
    await flockService.register({
        address: 'ADDR_CHARLIE',
        name: 'Charlie',
        description: 'DevOps engineer',
        capabilities: [CAPABILITIES.DEVOPS, CAPABILITIES.TESTING],
    });

    // Set reputation scores for deterministic ordering
    const alice = flockService.getByAddress('ADDR_ALICE')!;
    const bob = flockService.getByAddress('ADDR_BOB')!;
    const charlie = flockService.getByAddress('ADDR_CHARLIE')!;
    flockService.update(alice.id, { reputationScore: 90, uptimePct: 99 });
    flockService.update(bob.id, { reputationScore: 75, uptimePct: 95 });
    flockService.update(charlie.id, { reputationScore: 60, uptimePct: 80 });
});

// ─── Capability Matching ────────────────────────────────────────────────────

describe('capability matching', () => {
    test('routes to agent with matching capability', () => {
        const result = router.route({
            actionType: 'code_review',
        });

        expect(result.bestCandidate).toBeTruthy();
        expect(result.bestCandidate!.agent.name).toBe('Alice');
        expect(result.candidates).toHaveLength(1); // Only Alice has code_review
    });

    test('routes to agent with matching explicit capabilities', () => {
        const result = router.route({
            requiredCapabilities: [CAPABILITIES.TESTING],
        });

        expect(result.bestCandidate).toBeTruthy();
        // Both Bob and Charlie have testing — Bob should win on reputation
        expect(result.candidates).toHaveLength(2);
        expect(result.bestCandidate!.agent.name).toBe('Bob');
    });

    test('excludes agents missing required capabilities', () => {
        const result = router.route({
            requiredCapabilities: [CAPABILITIES.DOCUMENTATION],
        });

        // No agent has documentation capability
        expect(result.bestCandidate).toBeNull();
        expect(result.candidates).toHaveLength(0);
        expect(result.exclusions.length).toBeGreaterThan(0);
        expect(result.exclusions.some(e => e.reason.includes('missing capabilities'))).toBe(true);
    });

    test('requires all capabilities when multiple specified', () => {
        const result = router.route({
            requiredCapabilities: [CAPABILITIES.FEATURE_WORK, CAPABILITIES.TESTING],
        });

        // Only Bob has both
        expect(result.candidates).toHaveLength(1);
        expect(result.bestCandidate!.agent.name).toBe('Bob');
    });
});

// ─── Exclusion Rules ────────────────────────────────────────────────────────

describe('exclusion rules', () => {
    test('always excludes self from routing', () => {
        // Register self in the flock
        flockService.register({
            address: 'ADDR_SELF',
            name: 'Self',
            capabilities: [CAPABILITIES.CODE_REVIEW],
        });
        // Manually set the ID to match SELF_ID
        const self = flockService.getByAddress('ADDR_SELF')!;
        // The self exclusion is by ID, not address. Since the IDs are random UUIDs,
        // the router checks against SELF_ID which won't match any flock agent unless
        // the IDs happen to align. This test verifies the excludeAgentIds mechanism.

        const result = router.route({
            requiredCapabilities: [CAPABILITIES.CODE_REVIEW],
            excludeAgentIds: [self.id],
        });

        // Alice should still be found (she has code_review), self excluded
        expect(result.bestCandidate).toBeTruthy();
        expect(result.bestCandidate!.agent.name).toBe('Alice');
        expect(result.exclusions.some(e => e.reason === 'excluded')).toBe(true);
    });

    test('excludes explicitly listed agent IDs', () => {
        const alice = flockService.getByAddress('ADDR_ALICE')!;

        const result = router.route({
            requiredCapabilities: [CAPABILITIES.CODE_REVIEW],
            excludeAgentIds: [alice.id],
        });

        // Alice excluded — no one else has code_review
        expect(result.bestCandidate).toBeNull();
    });
});

// ─── Repo Conflict Filtering ────────────────────────────────────────────────

describe('repo conflict filtering', () => {
    test('excludes agents that already have claims on the same repo', () => {
        const bob = flockService.getByAddress('ADDR_BOB')!;

        // Simulate Bob claiming a repo
        db.query(`
            INSERT INTO work_claims (id, agent_id, agent_name, repo, description, expires_at)
            VALUES (?, ?, ?, ?, ?, datetime('now', '+1 hour'))
        `).run('bob-claim', bob.id, 'Bob', 'CorvidLabs/corvid-agent', 'Working');

        const result = router.route({
            requiredCapabilities: [CAPABILITIES.FEATURE_WORK],
            repo: 'CorvidLabs/corvid-agent',
        });

        // Bob excluded because he already has a claim on this repo
        expect(result.bestCandidate).toBeNull();
        expect(result.exclusions.some(e =>
            e.agentName === 'Bob' && e.reason.includes('already working'),
        )).toBe(true);
    });
});

// ─── Score Ranking ──────────────────────────────────────────────────────────

describe('score ranking', () => {
    test('ranks candidates by composite score', () => {
        const result = router.route({
            requiredCapabilities: [CAPABILITIES.TESTING],
        });

        // Both Bob (rep=75, uptime=95) and Charlie (rep=60, uptime=80) have testing
        // Bob should rank higher due to better reputation and uptime
        expect(result.candidates).toHaveLength(2);
        expect(result.candidates[0].agent.name).toBe('Bob');
        expect(result.candidates[1].agent.name).toBe('Charlie');
        expect(result.candidates[0].score).toBeGreaterThan(result.candidates[1].score);
    });

    test('score breakdown includes all components', () => {
        const result = router.route({
            requiredCapabilities: [CAPABILITIES.CODE_REVIEW],
        });

        const breakdown = result.bestCandidate!.breakdown;
        expect(breakdown.capabilityMatch).toBe(100);
        expect(breakdown.reputation).toBeGreaterThan(0);
        expect(breakdown.uptime).toBeGreaterThan(0);
        expect(breakdown.workload).toBeGreaterThan(0);
    });

    test('workload score decreases with more active claims', () => {
        const bob = flockService.getByAddress('ADDR_BOB')!;

        // Add claims for Bob
        for (let i = 0; i < 3; i++) {
            db.query(`
                INSERT INTO work_claims (id, agent_id, agent_name, repo, description, expires_at)
                VALUES (?, ?, ?, ?, ?, datetime('now', '+1 hour'))
            `).run(`claim-${i}`, bob.id, 'Bob', `repo-${i}`, 'Busy', );
        }

        const result = router.route({
            requiredCapabilities: [CAPABILITIES.TESTING],
        });

        // Charlie should now rank higher because Bob has 3 active claims
        expect(result.candidates[0].agent.name).toBe('Charlie');
    });
});

// ─── Utility Methods ────────────────────────────────────────────────────────

describe('utility methods', () => {
    test('getRequiredCapabilities returns mapped capabilities', () => {
        expect(router.getRequiredCapabilities('code_review')).toEqual([CAPABILITIES.CODE_REVIEW]);
        expect(router.getRequiredCapabilities('security_audit')).toEqual([CAPABILITIES.SECURITY_AUDIT]);
    });

    test('getRequiredCapabilities returns empty for unknown action', () => {
        expect(router.getRequiredCapabilities('unknown_action')).toEqual([]);
    });

    test('isRoutable returns true for known actions', () => {
        expect(router.isRoutable('code_review')).toBe(true);
        expect(router.isRoutable('security_audit')).toBe(true);
        expect(router.isRoutable('unknown')).toBe(false);
    });

    test('listCapabilities returns all known capabilities', () => {
        const caps = router.listCapabilities();
        expect(caps.length).toBeGreaterThan(0);
        expect(caps.some(c => c.id === 'code_review')).toBe(true);
        expect(caps.some(c => c.id === 'security_audit')).toBe(true);
    });
});

// ─── No Capability Filter ───────────────────────────────────────────────────

describe('no capability filter', () => {
    test('returns all agents when no capabilities required', () => {
        const result = router.route({});

        // All 3 agents should be candidates (self excluded)
        expect(result.candidates).toHaveLength(3);
    });
});

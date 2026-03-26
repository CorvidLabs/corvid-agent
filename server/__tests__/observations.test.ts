/**
 * Tests for server/db/observations.ts — CRUD operations for memory observations,
 * FTS search, graduation candidates, expiry, and purge.
 */

import { test, expect, describe, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import {
    recordObservation,
    getObservation,
    listObservations,
    searchObservations,
    boostObservation,
    markGraduated,
    dismissObservation,
    getGraduationCandidates,
    expireObservations,
    purgeOldObservations,
    countObservations,
} from '../db/observations';
import { up } from '../db/migrations/095_memory_observations';

const AGENT_ID = 'agent-test-001';

function createTestDb(): Database {
    const db = new Database(':memory:');
    db.exec('PRAGMA journal_mode = WAL');
    // The observations migration references agents(id) FK, so create a stub table
    db.exec(`CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY)`);
    db.prepare('INSERT INTO agents (id) VALUES (?)').run(AGENT_ID);
    up(db);
    return db;
}

describe('recordObservation', () => {
    let db: Database;
    beforeEach(() => { db = createTestDb(); });

    test('creates an observation with defaults', () => {
        const obs = recordObservation(db, {
            agentId: AGENT_ID,
            source: 'session',
            content: 'User prefers verbose output',
        });

        expect(obs.id).toBeDefined();
        expect(obs.agentId).toBe(AGENT_ID);
        expect(obs.source).toBe('session');
        expect(obs.content).toBe('User prefers verbose output');
        expect(obs.relevanceScore).toBe(1.0);
        expect(obs.accessCount).toBe(0);
        expect(obs.status).toBe('active');
        expect(obs.suggestedKey).toBeNull();
        expect(obs.graduatedKey).toBeNull();
        expect(obs.expiresAt).toBeDefined(); // 7 day default
    });

    test('creates observation with custom parameters', () => {
        const obs = recordObservation(db, {
            agentId: AGENT_ID,
            source: 'feedback',
            sourceId: 'msg-123',
            content: 'Avoid mocking the database',
            suggestedKey: 'feedback-no-mocks',
            relevanceScore: 2.5,
            expiresAt: '2099-01-01T00:00:00.000Z',
        });

        expect(obs.source).toBe('feedback');
        expect(obs.sourceId).toBe('msg-123');
        expect(obs.suggestedKey).toBe('feedback-no-mocks');
        expect(obs.relevanceScore).toBe(2.5);
        expect(obs.expiresAt).toBe('2099-01-01T00:00:00.000Z');
    });
});

describe('getObservation', () => {
    let db: Database;
    beforeEach(() => { db = createTestDb(); });

    test('returns observation by id', () => {
        const created = recordObservation(db, {
            agentId: AGENT_ID,
            source: 'manual',
            content: 'test content',
        });
        const found = getObservation(db, created.id);
        expect(found).not.toBeNull();
        expect(found!.id).toBe(created.id);
        expect(found!.content).toBe('test content');
    });

    test('returns null for nonexistent id', () => {
        const found = getObservation(db, 'nonexistent-id');
        expect(found).toBeNull();
    });
});

describe('listObservations', () => {
    let db: Database;
    beforeEach(() => { db = createTestDb(); });

    test('lists observations for an agent ordered by relevance', () => {
        recordObservation(db, { agentId: AGENT_ID, source: 'session', content: 'Low relevance', relevanceScore: 0.5 });
        recordObservation(db, { agentId: AGENT_ID, source: 'session', content: 'High relevance', relevanceScore: 5.0 });

        const list = listObservations(db, AGENT_ID);
        expect(list).toHaveLength(2);
        expect(list[0].content).toBe('High relevance');
        expect(list[1].content).toBe('Low relevance');
    });

    test('filters by status', () => {
        const obs = recordObservation(db, { agentId: AGENT_ID, source: 'session', content: 'will dismiss' });
        recordObservation(db, { agentId: AGENT_ID, source: 'session', content: 'stays active' });
        dismissObservation(db, obs.id);

        const active = listObservations(db, AGENT_ID, { status: 'active' });
        expect(active).toHaveLength(1);
        expect(active[0].content).toBe('stays active');

        const dismissed = listObservations(db, AGENT_ID, { status: 'dismissed' });
        expect(dismissed).toHaveLength(1);
        expect(dismissed[0].content).toBe('will dismiss');
    });

    test('filters by source', () => {
        recordObservation(db, { agentId: AGENT_ID, source: 'feedback', content: 'from feedback' });
        recordObservation(db, { agentId: AGENT_ID, source: 'session', content: 'from session' });

        const feedbackOnly = listObservations(db, AGENT_ID, { source: 'feedback' });
        expect(feedbackOnly).toHaveLength(1);
        expect(feedbackOnly[0].source).toBe('feedback');
    });

    test('respects limit', () => {
        for (let i = 0; i < 5; i++) {
            recordObservation(db, { agentId: AGENT_ID, source: 'session', content: `obs ${i}` });
        }
        const limited = listObservations(db, AGENT_ID, { limit: 2 });
        expect(limited).toHaveLength(2);
    });

    test('returns empty array for unknown agent', () => {
        const list = listObservations(db, 'no-such-agent');
        expect(list).toHaveLength(0);
    });
});

describe('searchObservations', () => {
    let db: Database;
    beforeEach(() => { db = createTestDb(); });

    test('finds observations by keyword via FTS', () => {
        recordObservation(db, { agentId: AGENT_ID, source: 'session', content: 'The Algorand blockchain is fast' });
        recordObservation(db, { agentId: AGENT_ID, source: 'session', content: 'TypeScript is great for safety' });

        const results = searchObservations(db, AGENT_ID, 'Algorand');
        expect(results.length).toBeGreaterThanOrEqual(1);
        expect(results[0].content).toContain('Algorand');
    });

    test('falls back to LIKE for special characters', () => {
        recordObservation(db, { agentId: AGENT_ID, source: 'session', content: 'Config key: app.debug=true' });

        // Special chars get cleaned, LIKE fallback should find it
        const results = searchObservations(db, AGENT_ID, 'app.debug');
        expect(results.length).toBeGreaterThanOrEqual(1);
    });

    test('returns empty for no matches', () => {
        recordObservation(db, { agentId: AGENT_ID, source: 'session', content: 'hello world' });
        const results = searchObservations(db, AGENT_ID, 'zzzznonexistent');
        expect(results).toHaveLength(0);
    });

    test('only returns active observations', () => {
        const obs = recordObservation(db, { agentId: AGENT_ID, source: 'session', content: 'dismissed content' });
        dismissObservation(db, obs.id);

        const results = searchObservations(db, AGENT_ID, 'dismissed');
        expect(results).toHaveLength(0);
    });
});

describe('boostObservation', () => {
    let db: Database;
    beforeEach(() => { db = createTestDb(); });

    test('increments score and access count', () => {
        const obs = recordObservation(db, { agentId: AGENT_ID, source: 'session', content: 'boost me' });
        boostObservation(db, obs.id, 2.0);

        const updated = getObservation(db, obs.id)!;
        expect(updated.relevanceScore).toBe(3.0); // 1.0 + 2.0
        expect(updated.accessCount).toBe(1);
        expect(updated.lastAccessedAt).not.toBeNull();
    });

    test('uses default boost of 1.0', () => {
        const obs = recordObservation(db, { agentId: AGENT_ID, source: 'session', content: 'boost default' });
        boostObservation(db, obs.id);
        const updated = getObservation(db, obs.id)!;
        expect(updated.relevanceScore).toBe(2.0);
    });

    test('accumulates across multiple boosts', () => {
        const obs = recordObservation(db, { agentId: AGENT_ID, source: 'session', content: 'multi boost' });
        boostObservation(db, obs.id, 1.0);
        boostObservation(db, obs.id, 1.5);
        boostObservation(db, obs.id, 0.5);

        const updated = getObservation(db, obs.id)!;
        expect(updated.relevanceScore).toBe(4.0); // 1.0 + 1.0 + 1.5 + 0.5
        expect(updated.accessCount).toBe(3);
    });
});

describe('markGraduated', () => {
    let db: Database;
    beforeEach(() => { db = createTestDb(); });

    test('sets status to graduated and records key', () => {
        const obs = recordObservation(db, { agentId: AGENT_ID, source: 'session', content: 'graduate me' });
        markGraduated(db, obs.id, 'feedback-testing');

        const updated = getObservation(db, obs.id)!;
        expect(updated.status).toBe('graduated');
        expect(updated.graduatedKey).toBe('feedback-testing');
    });
});

describe('dismissObservation', () => {
    let db: Database;
    beforeEach(() => { db = createTestDb(); });

    test('sets status to dismissed', () => {
        const obs = recordObservation(db, { agentId: AGENT_ID, source: 'session', content: 'dismiss me' });
        dismissObservation(db, obs.id);

        const updated = getObservation(db, obs.id)!;
        expect(updated.status).toBe('dismissed');
    });
});

describe('getGraduationCandidates', () => {
    let db: Database;
    beforeEach(() => { db = createTestDb(); });

    test('returns observations meeting score and access thresholds', () => {
        const obs = recordObservation(db, {
            agentId: AGENT_ID,
            source: 'session',
            content: 'high value observation',
            relevanceScore: 1.0,
        });
        // Boost to score 4.0, access count 3
        boostObservation(db, obs.id, 1.0);
        boostObservation(db, obs.id, 1.0);
        boostObservation(db, obs.id, 1.0);

        const candidates = getGraduationCandidates(db, AGENT_ID);
        expect(candidates).toHaveLength(1);
        expect(candidates[0].id).toBe(obs.id);
    });

    test('excludes observations below threshold', () => {
        recordObservation(db, {
            agentId: AGENT_ID,
            source: 'session',
            content: 'low value',
            relevanceScore: 0.5,
        });

        const candidates = getGraduationCandidates(db, AGENT_ID);
        expect(candidates).toHaveLength(0);
    });

    test('excludes already graduated observations', () => {
        const obs = recordObservation(db, {
            agentId: AGENT_ID,
            source: 'session',
            content: 'will graduate',
            relevanceScore: 5.0,
        });
        boostObservation(db, obs.id, 1.0);
        boostObservation(db, obs.id, 1.0);
        markGraduated(db, obs.id, 'some-key');

        const candidates = getGraduationCandidates(db, AGENT_ID);
        expect(candidates).toHaveLength(0);
    });

    test('respects custom thresholds', () => {
        const obs = recordObservation(db, {
            agentId: AGENT_ID,
            source: 'session',
            content: 'custom threshold',
            relevanceScore: 2.0,
        });
        boostObservation(db, obs.id); // score 3.0, access 1

        // Default thresholds (3.0, 2 access) should exclude it
        expect(getGraduationCandidates(db, AGENT_ID)).toHaveLength(0);

        // Lowered thresholds should include it
        const candidates = getGraduationCandidates(db, AGENT_ID, {
            scoreThreshold: 2.0,
            minAccess: 1,
        });
        expect(candidates).toHaveLength(1);
    });
});

describe('expireObservations', () => {
    test('expires observations past their expiry date', () => {
        const db = createTestDb();
        recordObservation(db, {
            agentId: AGENT_ID,
            source: 'session',
            content: 'already expired',
            expiresAt: '2020-01-01T00:00:00.000Z',
        });
        recordObservation(db, {
            agentId: AGENT_ID,
            source: 'session',
            content: 'still valid',
            expiresAt: '2099-01-01T00:00:00.000Z',
        });

        const count = expireObservations(db);
        // count includes FTS trigger changes, so just verify it's > 0
        expect(count).toBeGreaterThan(0);

        // Verify actual DB state
        const active = listObservations(db, AGENT_ID, { status: 'active' });
        expect(active).toHaveLength(1);
        expect(active[0].content).toBe('still valid');

        const expired = listObservations(db, AGENT_ID, { status: 'expired' });
        expect(expired).toHaveLength(1);
        expect(expired[0].content).toBe('already expired');
    });

    test('returns 0 when nothing to expire', () => {
        const db = createTestDb();
        recordObservation(db, {
            agentId: AGENT_ID,
            source: 'session',
            content: 'far future',
            expiresAt: '2099-01-01T00:00:00.000Z',
        });
        expect(expireObservations(db)).toBe(0);
    });
});

describe('purgeOldObservations', () => {
    test('deletes expired/dismissed observations older than retention', () => {
        const db = createTestDb();
        const obs = recordObservation(db, {
            agentId: AGENT_ID,
            source: 'session',
            content: 'old dismissed',
        });
        dismissObservation(db, obs.id);

        // Manually set created_at to 60 days ago
        db.prepare("UPDATE memory_observations SET created_at = datetime('now', '-60 days') WHERE id = ?").run(obs.id);

        const purged = purgeOldObservations(db, 30);
        // purge count includes FTS trigger changes, so just verify it's > 0
        expect(purged).toBeGreaterThan(0);
        expect(getObservation(db, obs.id)).toBeNull();
    });

    test('does not purge active observations', () => {
        const db = createTestDb();
        const obs = recordObservation(db, {
            agentId: AGENT_ID,
            source: 'session',
            content: 'still active',
        });
        db.prepare("UPDATE memory_observations SET created_at = datetime('now', '-60 days') WHERE id = ?").run(obs.id);

        const purged = purgeOldObservations(db, 30);
        expect(purged).toBe(0);
        expect(getObservation(db, obs.id)).not.toBeNull();
    });
});

describe('countObservations', () => {
    let db: Database;
    beforeEach(() => { db = createTestDb(); });

    test('returns counts by status', () => {
        recordObservation(db, { agentId: AGENT_ID, source: 'session', content: 'active 1' });
        recordObservation(db, { agentId: AGENT_ID, source: 'session', content: 'active 2' });

        const obs3 = recordObservation(db, { agentId: AGENT_ID, source: 'session', content: 'will dismiss' });
        dismissObservation(db, obs3.id);

        const obs4 = recordObservation(db, { agentId: AGENT_ID, source: 'session', content: 'will graduate' });
        markGraduated(db, obs4.id, 'key');

        const counts = countObservations(db, AGENT_ID);
        expect(counts.active).toBe(2);
        expect(counts.dismissed).toBe(1);
        expect(counts.graduated).toBe(1);
        expect(counts.expired).toBe(0);
    });

    test('returns zeros for unknown agent', () => {
        const counts = countObservations(db, 'unknown-agent');
        expect(counts).toEqual({ active: 0, graduated: 0, expired: 0, dismissed: 0 });
    });
});

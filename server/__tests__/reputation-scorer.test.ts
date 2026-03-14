import { test, expect, beforeEach, afterEach, describe } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { ReputationScorer } from '../reputation/scorer';

let db: Database;
let scorer: ReputationScorer;

function seedAgent(id: string = 'agent-1', name: string = 'Test Agent'): void {
    db.query('INSERT OR IGNORE INTO agents (id, name) VALUES (?, ?)').run(id, name);
}

function seedProject(id: string = 'proj-1', name: string = 'test-project'): void {
    db.query('INSERT OR IGNORE INTO projects (id, name, working_dir) VALUES (?, ?, ?)').run(id, name, '/tmp/test');
}

function seedWorkTask(agentId: string, status: string, daysAgo: number = 0): void {
    const id = crypto.randomUUID();
    const createdAt = new Date(Date.now() - daysAgo * 86400_000).toISOString();
    db.query(
        'INSERT INTO work_tasks (id, agent_id, project_id, description, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(id, agentId, 'proj-1', 'test task', status, createdAt);
}

function seedSession(agentId: string, daysAgo: number = 0): void {
    const id = crypto.randomUUID();
    const createdAt = new Date(Date.now() - daysAgo * 86400_000).toISOString();
    db.query('INSERT INTO sessions (id, agent_id, created_at) VALUES (?, ?, ?)').run(id, agentId, createdAt);
}

function seedReputationEvent(agentId: string, eventType: string, impact: number, daysAgo: number = 0): void {
    const id = crypto.randomUUID();
    const createdAt = new Date(Date.now() - daysAgo * 86400_000).toISOString();
    db.query(
        'INSERT INTO reputation_events (id, agent_id, event_type, score_impact, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(id, agentId, eventType, impact, createdAt);
}

function seedMarketplaceReview(agentId: string, rating: number): void {
    const listingId = crypto.randomUUID();
    db.query('INSERT INTO marketplace_listings (id, agent_id, name, description, category) VALUES (?, ?, ?, ?, ?)').run(
        listingId, agentId, 'Test Listing', 'desc', 'utility',
    );
    db.query('INSERT INTO marketplace_reviews (id, listing_id, rating) VALUES (?, ?, ?)').run(
        crypto.randomUUID(), listingId, rating,
    );
}

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
    seedAgent('agent-1');
    seedProject('proj-1');
    scorer = new ReputationScorer(db);
});

afterEach(() => {
    db.close();
});

// ─── computeScore ───────────────────────────────────────────────────────────

describe('computeScore', () => {
    test('returns default scores for agent with no activity', () => {
        const score = scorer.computeScore('agent-1');

        expect(score.agentId).toBe('agent-1');
        expect(score.overallScore).toBeGreaterThanOrEqual(1);
        expect(score.overallScore).toBeLessThanOrEqual(100);
        expect(score.trustLevel).toBeDefined();
        expect(score.computedAt).toBeTruthy();
        expect(score.attestationHash).toBeNull();
    });

    test('task completion improves score', () => {
        for (let i = 0; i < 5; i++) seedWorkTask('agent-1', 'completed');

        const score = scorer.computeScore('agent-1');
        expect(score.components.taskCompletion).toBe(100);
    });

    test('failed tasks reduce task completion component', () => {
        for (let i = 0; i < 3; i++) seedWorkTask('agent-1', 'completed');
        for (let i = 0; i < 3; i++) seedWorkTask('agent-1', 'failed');

        const score = scorer.computeScore('agent-1');
        expect(score.components.taskCompletion).toBe(50);
    });

    test('insufficient tasks default to 50', () => {
        seedWorkTask('agent-1', 'completed');

        const score = scorer.computeScore('agent-1');
        expect(score.components.taskCompletion).toBe(50);
    });

    test('peer rating from marketplace reviews', () => {
        seedMarketplaceReview('agent-1', 5);

        const score = scorer.computeScore('agent-1');
        expect(score.components.peerRating).toBe(100);
    });

    test('low peer rating', () => {
        seedMarketplaceReview('agent-1', 1);

        const score = scorer.computeScore('agent-1');
        expect(score.components.peerRating).toBe(0);
    });

    test('security violations reduce compliance score', () => {
        seedReputationEvent('agent-1', 'security_violation', -20, 5);
        seedReputationEvent('agent-1', 'security_violation', -20, 10);

        const score = scorer.computeScore('agent-1');
        expect(score.components.securityCompliance).toBe(60);
    });

    test('5+ violations floor security compliance at 0', () => {
        for (let i = 0; i < 6; i++) {
            seedReputationEvent('agent-1', 'security_violation', -20, i);
        }

        const score = scorer.computeScore('agent-1');
        expect(score.components.securityCompliance).toBe(0);
    });

    test('activity level increases with sessions', () => {
        for (let i = 0; i < 12; i++) seedSession('agent-1', i);

        const score = scorer.computeScore('agent-1');
        expect(score.components.activityLevel).toBe(100);
    });

    test('no sessions gives zero activity', () => {
        const score = scorer.computeScore('agent-1');
        expect(score.components.activityLevel).toBe(0);
    });

    test('persists score to agent_reputation table', () => {
        scorer.computeScore('agent-1');

        const row = db.query('SELECT * FROM agent_reputation WHERE agent_id = ?').get('agent-1') as Record<string, unknown>;
        expect(row).toBeTruthy();
        expect(row.overall_score).toBeGreaterThanOrEqual(1);
    });
});

// ─── trust levels ───────────────────────────────────────────────────────────

describe('trust levels', () => {
    test('high-performing agent gets high trust', () => {
        for (let i = 0; i < 10; i++) seedWorkTask('agent-1', 'completed');
        for (let i = 0; i < 15; i++) seedSession('agent-1', i);
        seedMarketplaceReview('agent-1', 5);

        const score = scorer.computeScore('agent-1');
        expect(['high', 'verified']).toContain(score.trustLevel);
    });
});

// ─── getCachedScore ─────────────────────────────────────────────────────────

describe('getCachedScore', () => {
    test('returns null for unknown agent', () => {
        expect(scorer.getCachedScore('nonexistent')).toBeNull();
    });

    test('returns cached score after compute', () => {
        scorer.computeScore('agent-1');
        const cached = scorer.getCachedScore('agent-1');

        expect(cached).not.toBeNull();
        expect(cached!.agentId).toBe('agent-1');
        expect(cached!.components).toBeDefined();
    });
});

// ─── recordEvent / getEvents ────────────────────────────────────────────────

describe('recordEvent', () => {
    test('records and retrieves reputation events', () => {
        scorer.recordEvent({
            agentId: 'agent-1',
            eventType: 'task_completed',
            scoreImpact: 5,
            metadata: { taskId: 'task-123' },
        });

        const events = scorer.getEvents('agent-1');
        expect(events).toHaveLength(1);
        expect(events[0].agent_id).toBe('agent-1');
        expect(events[0].event_type).toBe('task_completed');
        expect(events[0].score_impact).toBe(5);
    });

    test('respects event limit', () => {
        for (let i = 0; i < 10; i++) {
            scorer.recordEvent({
                agentId: 'agent-1',
                eventType: 'session_completed',
                scoreImpact: 1,
            });
        }

        const events = scorer.getEvents('agent-1', 5);
        expect(events).toHaveLength(5);
    });
});

// ─── setAttestationHash ─────────────────────────────────────────────────────

describe('setAttestationHash', () => {
    test('updates attestation hash', () => {
        scorer.computeScore('agent-1');
        scorer.setAttestationHash('agent-1', 'abc123hash');

        const cached = scorer.getCachedScore('agent-1');
        expect(cached!.attestationHash).toBe('abc123hash');
    });
});

// ─── computeAll / getAllScores ───────────────────────────────────────────────

describe('computeAll', () => {
    test('computes scores for all agents', () => {
        seedAgent('agent-2', 'Agent Two');

        const scores = scorer.computeAll();
        expect(scores).toHaveLength(2);
        expect(scores[0].overallScore).toBeGreaterThanOrEqual(scores[1].overallScore);
    });
});

describe('getAllScores', () => {
    test('returns empty when no scores computed', () => {
        expect(scorer.getAllScores()).toHaveLength(0);
    });

    test('returns all cached scores', () => {
        seedAgent('agent-2', 'Agent Two');
        scorer.computeAll();

        const all = scorer.getAllScores();
        expect(all).toHaveLength(2);
    });
});

// ─── custom weights ─────────────────────────────────────────────────────────

describe('custom weights', () => {
    test('security-only weighting emphasizes compliance', () => {
        const securityScorer = new ReputationScorer(db, {
            taskCompletion: 0,
            peerRating: 0,
            creditPattern: 0,
            securityCompliance: 1.0,
            activityLevel: 0,
        });

        const score = securityScorer.computeScore('agent-1');
        expect(score.overallScore).toBeGreaterThanOrEqual(90);

        seedReputationEvent('agent-1', 'security_violation', -20, 1);
        seedReputationEvent('agent-1', 'security_violation', -20, 2);
        seedReputationEvent('agent-1', 'security_violation', -20, 3);

        const score2 = securityScorer.computeScore('agent-1');
        expect(score2.overallScore).toBeLessThanOrEqual(50);
    });
});

// ─── credit patterns ────────────────────────────────────────────────────────

describe('credit patterns', () => {
    test('earning more than spending gives high score', () => {
        seedReputationEvent('agent-1', 'credit_earned', 100, 5);
        seedReputationEvent('agent-1', 'credit_spent', 50, 5);

        const score = scorer.computeScore('agent-1');
        expect(score.components.creditPattern).toBe(100);
    });

    test('no credit activity defaults to 50', () => {
        const score = scorer.computeScore('agent-1');
        expect(score.components.creditPattern).toBe(50);
    });
});

/**
 * Tests for reputation decay — scores decay 5%/week after 30 days of inactivity.
 */
import { test, expect, describe, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { ReputationScorer } from '../reputation/scorer';

// ─── DB Setup ───────────────────────────────────────────────────────────────

let db: Database;

function setupDb(): Database {
    const d = new Database(':memory:');
    runMigrations(d);

    d.exec(`
        CREATE TABLE IF NOT EXISTS agent_reputation (
            agent_id TEXT PRIMARY KEY,
            overall_score INTEGER DEFAULT 0,
            trust_level TEXT DEFAULT 'untrusted',
            task_completion INTEGER DEFAULT 0,
            peer_rating INTEGER DEFAULT 0,
            credit_pattern INTEGER DEFAULT 0,
            security_compliance INTEGER DEFAULT 0,
            activity_level INTEGER DEFAULT 0,
            attestation_hash TEXT DEFAULT NULL,
            computed_at TEXT DEFAULT (datetime('now'))
        )
    `);

    d.exec(`
        CREATE TABLE IF NOT EXISTS reputation_events (
            id TEXT PRIMARY KEY,
            agent_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            score_impact REAL DEFAULT 0,
            metadata TEXT DEFAULT '{}',
            created_at TEXT DEFAULT (datetime('now'))
        )
    `);

    d.exec(`
        CREATE TABLE IF NOT EXISTS reputation_attestations (
            agent_id TEXT NOT NULL,
            hash TEXT NOT NULL,
            payload TEXT NOT NULL,
            txid TEXT DEFAULT NULL,
            published_at TEXT DEFAULT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (agent_id, hash)
        )
    `);

    d.exec(`
        CREATE TABLE IF NOT EXISTS marketplace_reviews (
            id TEXT PRIMARY KEY,
            listing_id TEXT NOT NULL,
            reviewer_agent_id TEXT DEFAULT NULL,
            reviewer_address TEXT DEFAULT NULL,
            rating INTEGER NOT NULL,
            comment TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now'))
        )
    `);

    d.exec(`
        CREATE TABLE IF NOT EXISTS marketplace_listings (
            id TEXT PRIMARY KEY,
            agent_id TEXT NOT NULL,
            name TEXT NOT NULL DEFAULT '',
            description TEXT NOT NULL DEFAULT '',
            long_description TEXT DEFAULT '',
            category TEXT NOT NULL DEFAULT 'general',
            tags TEXT DEFAULT '[]',
            pricing_model TEXT DEFAULT 'free',
            price_credits INTEGER DEFAULT 0,
            instance_url TEXT DEFAULT NULL,
            status TEXT DEFAULT 'draft',
            use_count INTEGER DEFAULT 0,
            avg_rating REAL DEFAULT 0,
            review_count INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    `);

    return d;
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function insertAgent(d: Database, agentId: string, createdDaysAgo: number): void {
    const date = new Date(Date.now() - createdDaysAgo * 24 * 60 * 60 * 1000).toISOString();
    d.exec(`INSERT OR IGNORE INTO agents (id, name, created_at) VALUES ('${agentId}', '${agentId}', '${date}')`);
}

function ensureProject(d: Database): string {
    const projectId = 'test-project';
    d.exec(`INSERT OR IGNORE INTO projects (id, name, working_dir) VALUES ('${projectId}', 'test', '/tmp')`);
    return projectId;
}

function insertCompletedTask(d: Database, agentId: string, daysAgo: number): void {
    const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
    const id = crypto.randomUUID();
    const projectId = ensureProject(d);
    d.exec(`INSERT INTO work_tasks (id, agent_id, project_id, description, status, created_at) VALUES ('${id}', '${agentId}', '${projectId}', 'test task', 'completed', '${date}')`);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Reputation Decay', () => {
    let scorer: ReputationScorer;

    beforeEach(() => {
        db = setupDb();
        scorer = new ReputationScorer(db);
    });

    test('active agent (recent tasks) has no decay', () => {
        insertAgent(db, 'active-agent', 90);
        // Add enough completed tasks for a meaningful score (within 90 days)
        for (let i = 0; i < 5; i++) {
            insertCompletedTask(db, 'active-agent', i + 1);
        }

        const score = scorer.computeScore('active-agent');
        // Score should not be decayed — recent activity exists
        expect(score.overallScore).toBeGreaterThan(10);
    });

    test('agent inactive for < 30 days has no decay', () => {
        insertAgent(db, 'recent-agent', 60);
        insertCompletedTask(db, 'recent-agent', 15); // 15 days ago

        const score = scorer.computeScore('recent-agent');
        expect(score.overallScore).toBeGreaterThan(1);
    });

    test('agent inactive for > 30 days has decayed score', () => {
        insertAgent(db, 'stale-agent', 120);
        // Only activity was 60 days ago (30+ days inactive → decay applies)
        insertCompletedTask(db, 'stale-agent', 60);

        const score = scorer.computeScore('stale-agent');
        // Decay should reduce score compared to a fresh agent
        // 60 days - 30 day grace = 30 days inactive = ~4.3 weeks
        // Factor = 0.95^4.3 ≈ 0.80
        expect(score.overallScore).toBeLessThan(50);
    });

    test('very inactive agent decays toward floor', () => {
        insertAgent(db, 'ancient-agent', 365);
        // Last activity was 300 days ago
        insertCompletedTask(db, 'ancient-agent', 300);

        const score = scorer.computeScore('ancient-agent');
        // (300 - 30) / 7 = ~38.6 weeks
        // Factor = 0.95^38.6 ≈ 0.13 — score should be very low
        expect(score.overallScore).toBeLessThanOrEqual(10);
    });

    test('score never drops below floor of 1', () => {
        insertAgent(db, 'dead-agent', 730);
        insertCompletedTask(db, 'dead-agent', 700);

        const score = scorer.computeScore('dead-agent');
        expect(score.overallScore).toBeGreaterThanOrEqual(1);
    });

    test('agent with no activity at all gets appropriate score', () => {
        insertAgent(db, 'empty-agent', 90);
        // No tasks, no events at all

        const score = scorer.computeScore('empty-agent');
        // Should still get a score (default components), possibly decayed
        expect(score.overallScore).toBeGreaterThanOrEqual(1);
    });

    test('recent attestation event prevents decay', () => {
        insertAgent(db, 'attested-agent', 90);
        // No tasks completed recently, but a recent attestation
        insertCompletedTask(db, 'attested-agent', 60);

        scorer.recordEvent({
            agentId: 'attested-agent',
            eventType: 'attestation_published',
            scoreImpact: 1,
        });

        const score = scorer.computeScore('attested-agent');
        // Attestation is recent → no decay
        expect(score.overallScore).toBeGreaterThan(10);
    });
});

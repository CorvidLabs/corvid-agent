/**
 * Tests for Agent Reputation & Trust Scores:
 * - scorer.ts: Weighted composite scoring, event recording
 * - attestation.ts: On-chain hash attestation
 * - types.ts: Default weights
 */
import { test, expect, describe, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { ReputationScorer } from '../reputation/scorer';
import { ReputationAttestation } from '../reputation/attestation';
import { DEFAULT_WEIGHTS } from '../reputation/types';
import type { TrustLevel } from '../reputation/types';

// ─── DB Setup ───────────────────────────────────────────────────────────────

let db: Database;

function setupDb(): Database {
    const d = new Database(':memory:');
    runMigrations(d);

    // Migration 42 tables
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

    // The scorer checks these tables, so create minimal versions
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

// ─── Default Weights ─────────────────────────────────────────────────────────

describe('Default Weights', () => {
    test('weights sum to 1.0', () => {
        const sum = DEFAULT_WEIGHTS.taskCompletion +
            DEFAULT_WEIGHTS.peerRating +
            DEFAULT_WEIGHTS.creditPattern +
            DEFAULT_WEIGHTS.securityCompliance +
            DEFAULT_WEIGHTS.activityLevel;
        expect(Math.abs(sum - 1.0)).toBeLessThan(0.001);
    });

    test('weights have expected values', () => {
        expect(DEFAULT_WEIGHTS.taskCompletion).toBe(0.30);
        expect(DEFAULT_WEIGHTS.peerRating).toBe(0.25);
        expect(DEFAULT_WEIGHTS.creditPattern).toBe(0.15);
        expect(DEFAULT_WEIGHTS.securityCompliance).toBe(0.20);
        expect(DEFAULT_WEIGHTS.activityLevel).toBe(0.10);
    });
});

// ─── Scorer Tests ────────────────────────────────────────────────────────────

describe('ReputationScorer', () => {
    let scorer: ReputationScorer;

    beforeEach(() => {
        db = setupDb();
        scorer = new ReputationScorer(db);
    });

    test('computeScore returns valid score for new agent', () => {
        const score = scorer.computeScore('agent-new');
        expect(score.agentId).toBe('agent-new');
        expect(score.overallScore).toBeGreaterThanOrEqual(0);
        expect(score.overallScore).toBeLessThanOrEqual(100);
        expect(score.trustLevel).toBeTruthy();
        expect(score.components).toBeTruthy();
        expect(score.computedAt).toBeTruthy();
    });

    test('new agent with no data gets default components', () => {
        const score = scorer.computeScore('agent-fresh');
        // No tasks, reviews, credits, sessions → defaults (50 for data-lacking components)
        expect(score.components.taskCompletion).toBe(50);
        expect(score.components.peerRating).toBe(50);
        expect(score.components.creditPattern).toBe(50);
        expect(score.components.securityCompliance).toBe(100); // No violations
        expect(score.components.activityLevel).toBe(0); // No sessions
    });

    test('getCachedScore returns null for unknown agent', () => {
        expect(scorer.getCachedScore('nonexistent')).toBeNull();
    });

    test('getCachedScore returns computed score after compute', () => {
        scorer.computeScore('agent-1');
        const cached = scorer.getCachedScore('agent-1');
        expect(cached).not.toBeNull();
        expect(cached!.agentId).toBe('agent-1');
    });

    test('recordEvent stores event', () => {
        scorer.recordEvent({
            agentId: 'agent-1',
            eventType: 'task_completed',
            scoreImpact: 5,
            metadata: { taskId: 'task-123' },
        });

        const events = scorer.getEvents('agent-1');
        expect(events.length).toBe(1);
        expect(events[0].event_type).toBe('task_completed');
        expect(events[0].score_impact).toBe(5);
    });

    test('getEvents respects limit', () => {
        for (let i = 0; i < 10; i++) {
            scorer.recordEvent({
                agentId: 'agent-1',
                eventType: 'session_completed',
                scoreImpact: 1,
            });
        }

        const limited = scorer.getEvents('agent-1', 3);
        expect(limited.length).toBe(3);
    });

    test('security violations reduce compliance score', () => {
        // Record some violations
        for (let i = 0; i < 3; i++) {
            scorer.recordEvent({
                agentId: 'agent-bad',
                eventType: 'security_violation',
                scoreImpact: -10,
            });
        }

        const score = scorer.computeScore('agent-bad');
        // 3 violations × 20 = 60 deducted from 100
        expect(score.components.securityCompliance).toBe(40);
    });

    test('getAllScores returns all computed scores', () => {
        scorer.computeScore('agent-1');
        scorer.computeScore('agent-2');

        const all = scorer.getAllScores();
        expect(all.length).toBe(2);
    });

    test('setAttestationHash updates stored hash', () => {
        scorer.computeScore('agent-1');
        scorer.setAttestationHash('agent-1', 'abc123hash');

        const cached = scorer.getCachedScore('agent-1');
        expect(cached!.attestationHash).toBe('abc123hash');
    });

    test('trust levels correspond to score ranges', () => {
        // We can't easily control exact scores, but we can verify the structure
        const score = scorer.computeScore('agent-levels');

        const validLevels: TrustLevel[] = ['untrusted', 'low', 'medium', 'high', 'verified'];
        expect(validLevels).toContain(score.trustLevel);
    });
});

// ─── Attestation Tests ───────────────────────────────────────────────────────

describe('ReputationAttestation', () => {
    let scorer: ReputationScorer;
    let attestation: ReputationAttestation;

    beforeEach(() => {
        db = setupDb();
        scorer = new ReputationScorer(db);
        attestation = new ReputationAttestation(db);
    });

    test('createAttestation returns hash', async () => {
        const score = scorer.computeScore('agent-1');
        const hash = await attestation.createAttestation(score);

        expect(hash).toBeTruthy();
        expect(typeof hash).toBe('string');
        expect(hash.length).toBe(64); // SHA-256 hex
    });

    test('createAttestation stores attestation in DB', async () => {
        const score = scorer.computeScore('agent-1');
        await attestation.createAttestation(score);

        const stored = attestation.getAttestation('agent-1');
        expect(stored).not.toBeNull();
        expect(stored!.hash.length).toBe(64);
        expect(stored!.payload).toBeTruthy();
    });

    test('verifyAttestation returns true for matching score', async () => {
        const score = scorer.computeScore('agent-1');
        const hash = await attestation.createAttestation(score);

        const valid = await attestation.verifyAttestation(score, hash);
        expect(valid).toBe(true);
    });

    test('verifyAttestation returns false for tampered score', async () => {
        const score = scorer.computeScore('agent-1');
        const hash = await attestation.createAttestation(score);

        // Tamper with the score
        const tampered = { ...score, overallScore: 999 };
        const valid = await attestation.verifyAttestation(tampered, hash);
        expect(valid).toBe(false);
    });

    test('getAttestation returns null for unknown agent', () => {
        expect(attestation.getAttestation('nonexistent')).toBeNull();
    });

    test('createAttestation updates reputation record hash', async () => {
        const score = scorer.computeScore('agent-1');
        const hash = await attestation.createAttestation(score);

        const cached = scorer.getCachedScore('agent-1');
        expect(cached!.attestationHash).toBe(hash);
    });

    test('same score produces same hash (deterministic)', async () => {
        const score = scorer.computeScore('agent-1');
        const hash1 = await attestation.createAttestation(score);
        const hash2 = await attestation.createAttestation(score);

        expect(hash1).toBe(hash2);
    });
});

/**
 * Tests for identity verification tier system.
 */
import { test, expect, describe, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { IdentityVerification } from '../reputation/identity-verification';

// ─── DB Setup ───────────────────────────────────────────────────────────────

let db: Database;

function setupDb(): Database {
    const d = new Database(':memory:');
    runMigrations(d);

    d.exec(`
        CREATE TABLE IF NOT EXISTS agent_identity (
            agent_id               TEXT PRIMARY KEY,
            tier                   TEXT NOT NULL DEFAULT 'UNVERIFIED',
            verified_at            TEXT DEFAULT NULL,
            verification_data_hash TEXT DEFAULT NULL,
            updated_at             TEXT DEFAULT (datetime('now'))
        )
    `);

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

    return d;
}

function insertAgent(d: Database, agentId: string, daysAgo: number): void {
    const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
    d.exec(`INSERT OR IGNORE INTO agents (id, name, created_at) VALUES ('${agentId}', '${agentId}', '${date}')`);
}

function insertCompletedTasks(d: Database, agentId: string, count: number): void {
    d.exec(`INSERT OR IGNORE INTO projects (id, name, working_dir) VALUES ('test-project', 'test', '/tmp')`);
    for (let i = 0; i < count; i++) {
        const id = crypto.randomUUID();
        d.exec(`INSERT INTO work_tasks (id, agent_id, project_id, description, status) VALUES ('${id}', '${agentId}', 'test-project', 'test task', 'completed')`);
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('IdentityVerification', () => {
    let iv: IdentityVerification;

    beforeEach(() => {
        db = setupDb();
        iv = new IdentityVerification(db);
    });

    test('getTier returns UNVERIFIED for unknown agent', () => {
        expect(iv.getTier('unknown')).toBe('UNVERIFIED');
    });

    test('getIdentity returns null for unknown agent', () => {
        expect(iv.getIdentity('unknown')).toBeNull();
    });

    test('setTier creates identity record', () => {
        const identity = iv.setTier('agent-1', 'GITHUB_VERIFIED', 'hash123');
        expect(identity.agentId).toBe('agent-1');
        expect(identity.tier).toBe('GITHUB_VERIFIED');
        expect(identity.verificationDataHash).toBe('hash123');
        expect(identity.verifiedAt).toBeTruthy();
    });

    test('setTier allows upgrades', () => {
        iv.setTier('agent-1', 'GITHUB_VERIFIED');
        iv.setTier('agent-1', 'OWNER_VOUCHED');

        expect(iv.getTier('agent-1')).toBe('OWNER_VOUCHED');
    });

    test('setTier blocks downgrades', () => {
        iv.setTier('agent-1', 'OWNER_VOUCHED');
        iv.setTier('agent-1', 'GITHUB_VERIFIED'); // Attempted downgrade

        expect(iv.getTier('agent-1')).toBe('OWNER_VOUCHED');
    });

    test('verifyGithub sets GITHUB_VERIFIED', () => {
        const identity = iv.verifyGithub('agent-1', 'gh-hash');
        expect(identity.tier).toBe('GITHUB_VERIFIED');
        expect(identity.verificationDataHash).toBe('gh-hash');
    });

    test('recordVouch sets OWNER_VOUCHED', () => {
        const identity = iv.recordVouch('agent-1', 'vouch-hash');
        expect(identity.tier).toBe('OWNER_VOUCHED');
    });

    test('evaluateEstablished does not upgrade agent below thresholds', () => {
        insertAgent(db, 'young-agent', 10); // Only 10 days old
        expect(iv.evaluateEstablished('young-agent')).toBe('UNVERIFIED');
    });

    test('evaluateEstablished upgrades qualified agent', () => {
        insertAgent(db, 'vet-agent', 45); // 45 days old
        insertCompletedTasks(db, 'vet-agent', 12); // 12 completed tasks

        // Set reputation score > 70
        db.exec(`
            INSERT INTO agent_reputation (agent_id, overall_score, trust_level)
            VALUES ('vet-agent', 80, 'high')
        `);

        const tier = iv.evaluateEstablished('vet-agent');
        expect(tier).toBe('ESTABLISHED');
        expect(iv.getTier('vet-agent')).toBe('ESTABLISHED');
    });

    test('evaluateEstablished skips agent with low score', () => {
        insertAgent(db, 'low-score', 45);
        insertCompletedTasks(db, 'low-score', 12);

        db.exec(`
            INSERT INTO agent_reputation (agent_id, overall_score, trust_level)
            VALUES ('low-score', 50, 'medium')
        `);

        expect(iv.evaluateEstablished('low-score')).toBe('UNVERIFIED');
    });

    test('evaluateEstablished skips agent with few tasks', () => {
        insertAgent(db, 'few-tasks', 45);
        insertCompletedTasks(db, 'few-tasks', 5); // Only 5, need 10

        db.exec(`
            INSERT INTO agent_reputation (agent_id, overall_score, trust_level)
            VALUES ('few-tasks', 80, 'high')
        `);

        expect(iv.evaluateEstablished('few-tasks')).toBe('UNVERIFIED');
    });

    test('meetsMinimumTier works correctly', () => {
        expect(iv.meetsMinimumTier('UNVERIFIED', 'UNVERIFIED')).toBe(true);
        expect(iv.meetsMinimumTier('UNVERIFIED', 'GITHUB_VERIFIED')).toBe(false);
        expect(iv.meetsMinimumTier('GITHUB_VERIFIED', 'GITHUB_VERIFIED')).toBe(true);
        expect(iv.meetsMinimumTier('ESTABLISHED', 'GITHUB_VERIFIED')).toBe(true);
        expect(iv.meetsMinimumTier('OWNER_VOUCHED', 'ESTABLISHED')).toBe(false);
    });

    test('getEscrowCap returns correct caps', () => {
        expect(iv.getEscrowCap('UNVERIFIED')).toBe(0);
        expect(iv.getEscrowCap('GITHUB_VERIFIED')).toBe(500);
        expect(iv.getEscrowCap('OWNER_VOUCHED')).toBe(2000);
        expect(iv.getEscrowCap('ESTABLISHED')).toBe(10000);
    });

    test('getAllIdentities lists all records', () => {
        iv.setTier('agent-1', 'GITHUB_VERIFIED');
        iv.setTier('agent-2', 'OWNER_VOUCHED');

        const all = iv.getAllIdentities();
        expect(all.length).toBe(2);
    });
});

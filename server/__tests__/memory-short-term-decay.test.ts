/**
 * Tests for short-term memory TTL decay and cleanup (issue #1722).
 *
 * Migration 112 (server/db/migrations/112_memory_decay.ts) is governance-protected
 * (Layer 1 / Structural) and requires human approval before merging. These tests
 * apply the migration SQL inline in beforeEach so they can run independently.
 */
import { test, expect, beforeEach, afterEach, describe } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { createAgent } from '../db/agents';
import {
    saveMemory,
    recallMemory,
    updateMemoryStatus,
    expireShortTermMemories,
    purgeOldArchivedMemories,
} from '../db/agent-memories';

let db: Database;
let agentId: string;

/** Apply migration 112 inline (pending governance approval of the migration file). */
function applyMigration112(database: Database): void {
    database.exec(`ALTER TABLE agent_memories ADD COLUMN expires_at TEXT DEFAULT NULL`);
    database.exec(`ALTER TABLE agent_memories ADD COLUMN access_count INTEGER NOT NULL DEFAULT 0`);
    database.exec(`
        UPDATE agent_memories
        SET expires_at = datetime(updated_at, '+7 days')
        WHERE status = 'short_term'
    `);
    database.exec(`
        CREATE INDEX IF NOT EXISTS idx_agent_memories_expires
        ON agent_memories(expires_at)
        WHERE expires_at IS NOT NULL
    `);
}

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
    applyMigration112(db);
    const agent = createAgent(db, { name: 'Decay Agent', model: 'sonnet' });
    agentId = agent.id;
});

afterEach(() => {
    db.close();
});

// ─── saveMemory sets expires_at ──────────────────────────────────────────────

describe('saveMemory with decay columns', () => {
    test('sets expires_at to ~+7 days for short_term', () => {
        const mem = saveMemory(db, { agentId, key: 'ttl-test', content: 'data' });
        expect(mem.expiresAt).not.toBeNull();
        const expires = new Date(mem.expiresAt!).getTime();
        const now = Date.now();
        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
        expect(expires).toBeGreaterThan(now + sevenDaysMs - 60_000);
        expect(expires).toBeLessThan(now + sevenDaysMs + 60_000);
    });

    test('accepts custom ttlDays', () => {
        const mem = saveMemory(db, { agentId, key: 'ttl-custom', content: 'data', ttlDays: 14 });
        expect(mem.expiresAt).not.toBeNull();
        const expires = new Date(mem.expiresAt!).getTime();
        const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
        expect(expires).toBeGreaterThan(Date.now() + fourteenDaysMs - 60_000);
    });

    test('resets expires_at on upsert', () => {
        const m1 = saveMemory(db, { agentId, key: 'upsert', content: 'v1' });
        const m2 = saveMemory(db, { agentId, key: 'upsert', content: 'v2' });
        expect(m2.expiresAt).not.toBeNull();
        expect(new Date(m2.expiresAt!).getTime()).toBeGreaterThanOrEqual(
            new Date(m1.expiresAt!).getTime() - 1000,
        );
    });

    test('accessCount starts at 0', () => {
        const mem = saveMemory(db, { agentId, key: 'count', content: 'data' });
        expect(mem.accessCount).toBe(0);
    });
});

// ─── recallMemory increments access_count ────────────────────────────────────

describe('recallMemory with decay columns', () => {
    test('increments access_count on each recall', () => {
        saveMemory(db, { agentId, key: 'recall', content: 'data' });

        const r1 = recallMemory(db, agentId, 'recall');
        expect(r1?.accessCount).toBe(1);

        const r2 = recallMemory(db, agentId, 'recall');
        expect(r2?.accessCount).toBe(2);

        const r3 = recallMemory(db, agentId, 'recall');
        expect(r3?.accessCount).toBe(3);
    });

    test('extends TTL to +14 days when access_count reaches 3', () => {
        saveMemory(db, { agentId, key: 'extend', content: 'data' });

        recallMemory(db, agentId, 'extend');
        recallMemory(db, agentId, 'extend');
        const r3 = recallMemory(db, agentId, 'extend');

        expect(r3?.accessCount).toBe(3);
        expect(r3?.expiresAt).not.toBeNull();
        const expires = new Date(r3!.expiresAt!).getTime();
        const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
        expect(expires).toBeGreaterThan(Date.now() + fourteenDaysMs - 60_000);
    });

    test('does not extend TTL if expires_at already >= 90 days from now', () => {
        saveMemory(db, { agentId, key: 'capped', content: 'data' });
        db.exec(
            `UPDATE agent_memories SET expires_at = datetime('now', '+91 days'), access_count = 2
             WHERE agent_id = '${agentId}' AND key = 'capped'`
        );

        const r = recallMemory(db, agentId, 'capped');
        expect(r?.accessCount).toBe(3);
        const expires = new Date(r!.expiresAt!).getTime();
        const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
        expect(expires).toBeGreaterThan(Date.now() + ninetyDaysMs);
    });

    test('returns null for nonexistent key', () => {
        expect(recallMemory(db, agentId, 'ghost')).toBeNull();
    });

    test('does not modify access_count for non-short_term memories', () => {
        const mem = saveMemory(db, { agentId, key: 'promoted', content: 'data' });
        updateMemoryStatus(db, mem.id, 'pending');

        const r = recallMemory(db, agentId, 'promoted');
        expect(r?.accessCount).toBe(0);
    });
});

// ─── expireShortTermMemories ─────────────────────────────────────────────────

describe('expireShortTermMemories', () => {
    test('archives short_term memories past expires_at', () => {
        saveMemory(db, { agentId, key: 'stale', content: 'data' });
        db.exec(
            `UPDATE agent_memories SET expires_at = datetime('now', '-1 hour')
             WHERE agent_id = '${agentId}' AND key = 'stale'`
        );

        expect(expireShortTermMemories(db)).toBe(1);

        const row = db.query(
            "SELECT archived FROM agent_memories WHERE agent_id = ? AND key = 'stale'"
        ).get(agentId) as { archived: number } | null;
        expect(row?.archived).toBe(1);
    });

    test('does not archive memories whose expires_at is in the future', () => {
        saveMemory(db, { agentId, key: 'fresh', content: 'data' });
        expect(expireShortTermMemories(db)).toBe(0);
    });

    test('does not archive memories with NULL expires_at', () => {
        saveMemory(db, { agentId, key: 'no-ttl', content: 'data' });
        db.exec(
            `UPDATE agent_memories SET expires_at = NULL WHERE agent_id = '${agentId}' AND key = 'no-ttl'`
        );
        expect(expireShortTermMemories(db)).toBe(0);
    });

    test('does not touch pending or confirmed memories', () => {
        const m1 = saveMemory(db, { agentId, key: 'pending', content: 'data' });
        const m2 = saveMemory(db, { agentId, key: 'confirmed', content: 'data' });
        updateMemoryStatus(db, m1.id, 'pending');
        updateMemoryStatus(db, m2.id, 'confirmed');
        db.exec(
            `UPDATE agent_memories SET expires_at = datetime('now', '-1 day') WHERE agent_id = '${agentId}'`
        );
        expect(expireShortTermMemories(db)).toBe(0);
    });

    test('skips already-archived memories', () => {
        saveMemory(db, { agentId, key: 'already-archived', content: 'data' });
        db.exec(
            `UPDATE agent_memories SET archived = 1, expires_at = datetime('now', '-1 hour')
             WHERE agent_id = '${agentId}' AND key = 'already-archived'`
        );
        expect(expireShortTermMemories(db)).toBe(0);
    });
});

// ─── purgeOldArchivedMemories ────────────────────────────────────────────────

describe('purgeOldArchivedMemories', () => {
    test('deletes archived short_term memories older than 30 days', () => {
        saveMemory(db, { agentId, key: 'old-archived', content: 'data' });
        db.exec(
            `UPDATE agent_memories SET archived = 1, updated_at = datetime('now', '-31 days')
             WHERE agent_id = '${agentId}' AND key = 'old-archived'`
        );

        expect(purgeOldArchivedMemories(db)).toBe(1);
        const row = db.query(
            "SELECT id FROM agent_memories WHERE agent_id = ? AND key = 'old-archived'"
        ).get(agentId);
        expect(row).toBeNull();
    });

    test('skips recently archived memories (< 30 days)', () => {
        saveMemory(db, { agentId, key: 'new-archived', content: 'data' });
        db.exec(
            `UPDATE agent_memories SET archived = 1 WHERE agent_id = '${agentId}' AND key = 'new-archived'`
        );
        expect(purgeOldArchivedMemories(db)).toBe(0);
    });

    test('respects custom daysAfterArchive param', () => {
        saveMemory(db, { agentId, key: 'week-old', content: 'data' });
        db.exec(
            `UPDATE agent_memories SET archived = 1, updated_at = datetime('now', '-8 days')
             WHERE agent_id = '${agentId}' AND key = 'week-old'`
        );

        expect(purgeOldArchivedMemories(db)).toBe(0);    // default 30 days
        expect(purgeOldArchivedMemories(db, 7)).toBe(1); // custom 7 days
    });

    test('does not delete non-archived memories', () => {
        saveMemory(db, { agentId, key: 'live', content: 'data' });
        db.exec(
            `UPDATE agent_memories SET updated_at = datetime('now', '-60 days')
             WHERE agent_id = '${agentId}' AND key = 'live'`
        );
        expect(purgeOldArchivedMemories(db)).toBe(0);
    });

    test('does not delete archived confirmed memories', () => {
        const m = saveMemory(db, { agentId, key: 'prom', content: 'data' });
        updateMemoryStatus(db, m.id, 'confirmed');
        db.exec(
            `UPDATE agent_memories SET archived = 1, updated_at = datetime('now', '-60 days')
             WHERE agent_id = '${agentId}' AND key = 'prom'`
        );
        expect(purgeOldArchivedMemories(db)).toBe(0);
    });
});

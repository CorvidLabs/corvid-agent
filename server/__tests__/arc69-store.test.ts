/**
 * Tests for ARC-69 memory store — DB helper functions, note payload encoding,
 * and resolveAsaForKey. On-chain operations (createMemoryAsa, etc.) require
 * a live localnet, so they are tested separately in integration tests.
 */
import { test, expect, beforeEach, afterEach, describe } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { createAgent } from '../db/agents';
import {
    saveMemory,
    recallMemory,
    updateMemoryTxid,
    updateMemoryAsaId,
    getMemoryByAsaId,
    deleteMemoryRow,
    archiveMemory,
    listMemories,
} from '../db/agent-memories';
import { resolveAsaForKey } from '../memory/arc69-store';

let db: Database;
let agentId: string;

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
    const agent = createAgent(db, { name: 'Arc69 Agent', model: 'sonnet' });
    agentId = agent.id;
});

afterEach(() => {
    db.close();
});

// ─── DB helpers ─────────────────────────────────────────────────────────────

describe('updateMemoryAsaId', () => {
    test('sets asa_id on a memory', () => {
        const mem = saveMemory(db, { agentId, key: 'team-leif', content: 'architect' });
        expect(mem.asaId).toBeNull();

        updateMemoryAsaId(db, mem.id, 42);

        const recalled = recallMemory(db, agentId, 'team-leif');
        expect(recalled).not.toBeNull();
        expect(recalled!.asaId).toBe(42);
    });
});

describe('getMemoryByAsaId', () => {
    test('finds memory by ASA ID', () => {
        const mem = saveMemory(db, { agentId, key: 'pref', content: 'dark mode' });
        updateMemoryAsaId(db, mem.id, 100);

        const found = getMemoryByAsaId(db, agentId, 100);
        expect(found).not.toBeNull();
        expect(found!.key).toBe('pref');
        expect(found!.content).toBe('dark mode');
        expect(found!.asaId).toBe(100);
    });

    test('returns null for nonexistent ASA ID', () => {
        expect(getMemoryByAsaId(db, agentId, 999)).toBeNull();
    });

    test('is agent-scoped', () => {
        const agent2 = createAgent(db, { name: 'Agent 2' });
        const mem = saveMemory(db, { agentId, key: 'secret', content: 'mine' });
        updateMemoryAsaId(db, mem.id, 50);

        expect(getMemoryByAsaId(db, agent2.id, 50)).toBeNull();
        expect(getMemoryByAsaId(db, agentId, 50)).not.toBeNull();
    });
});

describe('deleteMemoryRow', () => {
    test('deletes a memory row', () => {
        saveMemory(db, { agentId, key: 'to-delete', content: 'gone' });
        expect(recallMemory(db, agentId, 'to-delete')).not.toBeNull();

        const deleted = deleteMemoryRow(db, agentId, 'to-delete');
        expect(deleted).toBe(true);
        expect(recallMemory(db, agentId, 'to-delete')).toBeNull();
    });

    test('returns false for nonexistent key', () => {
        expect(deleteMemoryRow(db, agentId, 'nonexistent')).toBe(false);
    });
});

describe('archiveMemory', () => {
    test('archives a memory (sets archived = 1)', () => {
        saveMemory(db, { agentId, key: 'to-archive', content: 'hidden' });
        const archived = archiveMemory(db, agentId, 'to-archive');
        expect(archived).toBe(true);

        // archived memories are excluded from listMemories (which filters archived = 0)
        const list = listMemories(db, agentId);
        expect(list.find(m => m.key === 'to-archive')).toBeUndefined();

        // But recallMemory still finds it (no archived filter)
        const recalled = recallMemory(db, agentId, 'to-archive');
        expect(recalled).not.toBeNull();
    });
});

// ─── resolveAsaForKey ───────────────────────────────────────────────────────

describe('resolveAsaForKey', () => {
    test('returns ASA ID when present', () => {
        const mem = saveMemory(db, { agentId, key: 'team-kyn', content: 'amazing' });
        updateMemoryAsaId(db, mem.id, 77);

        expect(resolveAsaForKey(db, agentId, 'team-kyn')).toBe(77);
    });

    test('returns null when no ASA ID', () => {
        saveMemory(db, { agentId, key: 'plain', content: 'no asa' });
        expect(resolveAsaForKey(db, agentId, 'plain')).toBeNull();
    });

    test('returns null for nonexistent key', () => {
        expect(resolveAsaForKey(db, agentId, 'nope')).toBeNull();
    });
});

// ─── ARC-69 memory with asaId in saveMemory ─────────────────────────────────

describe('saveMemory with ASA integration', () => {
    test('upsert preserves asa_id when content changes', () => {
        const mem = saveMemory(db, { agentId, key: 'updatable', content: 'v1' });
        updateMemoryTxid(db, mem.id, 'txid-1');
        updateMemoryAsaId(db, mem.id, 200);

        // Upsert with new content
        const updated = saveMemory(db, { agentId, key: 'updatable', content: 'v2' });
        expect(updated.content).toBe('v2');
        expect(updated.status).toBe('short_term'); // Reset to short_term — needs explicit re-promotion
        // asaId should be preserved by the upsert (ON CONFLICT only updates content/status/txid)
        expect(updated.asaId).toBe(200);
    });

    test('new memory has null asaId', () => {
        const mem = saveMemory(db, { agentId, key: 'fresh', content: 'new' });
        expect(mem.asaId).toBeNull();
    });
});

// ─── Migration 094 ──────────────────────────────────────────────────────────

describe('Migration 094 — asa_id column', () => {
    test('asa_id column exists and defaults to NULL', () => {
        const mem = saveMemory(db, { agentId, key: 'test', content: 'x' });
        const row = db.query('SELECT asa_id FROM agent_memories WHERE id = ?').get(mem.id) as { asa_id: number | null };
        expect(row.asa_id).toBeNull();
    });

    test('idx_agent_memories_asa index exists', () => {
        const indexes = db.query("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_agent_memories_asa'").all();
        expect(indexes.length).toBe(1);
    });

    test('asa_id can be set and queried', () => {
        const mem = saveMemory(db, { agentId, key: 'indexed', content: 'y' });
        db.query('UPDATE agent_memories SET asa_id = ? WHERE id = ?').run(42, mem.id);

        const row = db.query('SELECT * FROM agent_memories WHERE agent_id = ? AND asa_id = 42').get(agentId) as { key: string; asa_id: number };
        expect(row.key).toBe('indexed');
        expect(row.asa_id).toBe(42);
    });
});

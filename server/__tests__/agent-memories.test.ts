import { test, expect, beforeEach, afterEach, describe } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { createAgent } from '../db/agents';
import {
    saveMemory,
    recallMemory,
    searchMemories,
    listMemories,
    updateMemoryTxid,
    updateMemoryStatus,
    getPendingMemories,
    countPendingMemories,
} from '../db/agent-memories';

let db: Database;
let agentId: string;

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
    const agent = createAgent(db, { name: 'Memory Agent', model: 'sonnet' });
    agentId = agent.id;
});

afterEach(() => {
    db.close();
});

// ─── Save & Recall ───────────────────────────────────────────────────────────

describe('Save and Recall', () => {
    test('save and recall a memory', () => {
        const mem = saveMemory(db, { agentId, key: 'greeting', content: 'Hello World' });
        expect(mem.id).toBeTruthy();
        expect(mem.agentId).toBe(agentId);
        expect(mem.key).toBe('greeting');
        expect(mem.content).toBe('Hello World');
        expect(mem.status).toBe('pending');
        expect(mem.txid).toBeNull();
        expect(mem.createdAt).toBeTruthy();
        expect(mem.updatedAt).toBeTruthy();

        const recalled = recallMemory(db, agentId, 'greeting');
        expect(recalled).not.toBeNull();
        expect(recalled!.content).toBe('Hello World');
    });

    test('recall returns null for nonexistent key', () => {
        expect(recallMemory(db, agentId, 'nonexistent')).toBeNull();
    });

    test('recall is agent-scoped', () => {
        const agent2 = createAgent(db, { name: 'Agent 2' });
        saveMemory(db, { agentId, key: 'secret', content: 'agent1-data' });
        saveMemory(db, { agentId: agent2.id, key: 'secret', content: 'agent2-data' });

        expect(recallMemory(db, agentId, 'secret')!.content).toBe('agent1-data');
        expect(recallMemory(db, agent2.id, 'secret')!.content).toBe('agent2-data');
    });

    test('save upserts on same agent + key', () => {
        saveMemory(db, { agentId, key: 'config', content: 'v1' });
        const updated = saveMemory(db, { agentId, key: 'config', content: 'v2' });

        expect(updated.content).toBe('v2');
        expect(updated.status).toBe('pending'); // reset to pending on update

        // Should only be one row
        const all = listMemories(db, agentId);
        expect(all).toHaveLength(1);
    });

    test('upsert resets txid to null', () => {
        const mem = saveMemory(db, { agentId, key: 'sync', content: 'original' });
        updateMemoryTxid(db, mem.id, 'TX_CONFIRMED');

        const confirmed = recallMemory(db, agentId, 'sync');
        expect(confirmed!.txid).toBe('TX_CONFIRMED');
        expect(confirmed!.status).toBe('confirmed');

        // Upsert should reset txid
        saveMemory(db, { agentId, key: 'sync', content: 'updated' });
        const after = recallMemory(db, agentId, 'sync');
        expect(after!.txid).toBeNull();
        expect(after!.status).toBe('pending');
    });
});

// ─── Search ──────────────────────────────────────────────────────────────────

describe('Search Memories', () => {
    test('search matches key', () => {
        saveMemory(db, { agentId, key: 'project-config', content: 'some data' });
        saveMemory(db, { agentId, key: 'user-prefs', content: 'other data' });

        const results = searchMemories(db, agentId, 'config');
        expect(results).toHaveLength(1);
        expect(results[0].key).toBe('project-config');
    });

    test('search matches content', () => {
        saveMemory(db, { agentId, key: 'note-1', content: 'The quick brown fox' });
        saveMemory(db, { agentId, key: 'note-2', content: 'The lazy dog' });

        const results = searchMemories(db, agentId, 'brown fox');
        expect(results).toHaveLength(1);
        expect(results[0].key).toBe('note-1');
    });

    test('search is case-insensitive (via LIKE)', () => {
        saveMemory(db, { agentId, key: 'API-KEY', content: 'secret-value' });

        // SQLite LIKE is case-insensitive for ASCII
        const results = searchMemories(db, agentId, 'api-key');
        expect(results).toHaveLength(1);
    });

    test('search returns empty for no matches', () => {
        saveMemory(db, { agentId, key: 'data', content: 'something' });
        expect(searchMemories(db, agentId, 'nonexistent')).toHaveLength(0);
    });

    test('search is agent-scoped', () => {
        const agent2 = createAgent(db, { name: 'Agent 2' });
        saveMemory(db, { agentId, key: 'shared-key', content: 'agent1' });
        saveMemory(db, { agentId: agent2.id, key: 'shared-key', content: 'agent2' });

        expect(searchMemories(db, agentId, 'shared')).toHaveLength(1);
        expect(searchMemories(db, agent2.id, 'shared')).toHaveLength(1);
    });

    test('search returns max 20 results', () => {
        for (let i = 0; i < 25; i++) {
            saveMemory(db, { agentId, key: `item-${i}`, content: `data-${i}` });
        }
        const results = searchMemories(db, agentId, 'item');
        expect(results).toHaveLength(20);
    });
});

// ─── FTS5 Full-Text Search ───────────────────────────────────────────────────

describe('FTS5 Search', () => {
    test('FTS5 finds matches by prefix', () => {
        saveMemory(db, { agentId, key: 'deployment', content: 'Kubernetes cluster config for production' });
        saveMemory(db, { agentId, key: 'testing', content: 'Unit test strategy' });

        const results = searchMemories(db, agentId, 'kuber');
        expect(results).toHaveLength(1);
        expect(results[0].key).toBe('deployment');
    });

    test('FTS5 ranks results by relevance', () => {
        saveMemory(db, { agentId, key: 'about-typescript', content: 'TypeScript is a typed superset of JavaScript' });
        saveMemory(db, { agentId, key: 'misc', content: 'Some random notes about Python and Go' });
        saveMemory(db, { agentId, key: 'ts-config', content: 'TypeScript configuration for the TypeScript compiler' });

        const results = searchMemories(db, agentId, 'TypeScript');
        expect(results.length).toBeGreaterThanOrEqual(2);
        // ts-config mentions TypeScript twice, so should rank higher
        expect(results[0].key).toBe('ts-config');
    });

    test('FTS5 multi-word search matches all terms', () => {
        saveMemory(db, { agentId, key: 'note-1', content: 'The quick brown fox jumps' });
        saveMemory(db, { agentId, key: 'note-2', content: 'The quick red car drives' });
        saveMemory(db, { agentId, key: 'note-3', content: 'A brown lazy dog sleeps' });

        // Both "quick" and "brown" required (implicit AND)
        const results = searchMemories(db, agentId, 'quick brown');
        expect(results).toHaveLength(1);
        expect(results[0].key).toBe('note-1');
    });

    test('FTS5 search handles special characters safely', () => {
        saveMemory(db, { agentId, key: 'code', content: 'function foo() { return true; }' });

        // Special FTS5 chars should be sanitized, not cause errors
        const results = searchMemories(db, agentId, 'foo() {');
        expect(results).toHaveLength(1);
        expect(results[0].key).toBe('code');
    });

    test('FTS5 index updates on memory content change', () => {
        saveMemory(db, { agentId, key: 'evolving', content: 'original content about databases' });

        let results = searchMemories(db, agentId, 'databases');
        expect(results).toHaveLength(1);

        // Update the memory content
        saveMemory(db, { agentId, key: 'evolving', content: 'updated content about networking' });

        // Old term should not match
        results = searchMemories(db, agentId, 'databases');
        expect(results).toHaveLength(0);

        // New term should match
        results = searchMemories(db, agentId, 'networking');
        expect(results).toHaveLength(1);
    });

    test('FTS5 search is agent-scoped', () => {
        const agent2 = createAgent(db, { name: 'Agent 2' });
        saveMemory(db, { agentId, key: 'secret', content: 'agent1 confidential data' });
        saveMemory(db, { agentId: agent2.id, key: 'secret', content: 'agent2 confidential data' });

        const agent1Results = searchMemories(db, agentId, 'confidential');
        expect(agent1Results).toHaveLength(1);
        expect(agent1Results[0].agentId).toBe(agentId);

        const agent2Results = searchMemories(db, agent2.id, 'confidential');
        expect(agent2Results).toHaveLength(1);
        expect(agent2Results[0].agentId).toBe(agent2.id);
    });
});

// ─── List ────────────────────────────────────────────────────────────────────

describe('List Memories', () => {
    test('list returns all agent memories', () => {
        saveMemory(db, { agentId, key: 'a', content: 'data-a' });
        saveMemory(db, { agentId, key: 'b', content: 'data-b' });

        const all = listMemories(db, agentId);
        expect(all).toHaveLength(2);
    });

    test('list returns all memories for agent', () => {
        saveMemory(db, { agentId, key: 'first', content: 'data' });
        saveMemory(db, { agentId, key: 'second', content: 'data' });

        const all = listMemories(db, agentId);
        expect(all).toHaveLength(2);
        const keys = all.map(m => m.key);
        expect(keys).toContain('first');
        expect(keys).toContain('second');
    });

    test('list is agent-scoped', () => {
        const agent2 = createAgent(db, { name: 'Agent 2' });
        saveMemory(db, { agentId, key: 'a', content: 'data' });
        saveMemory(db, { agentId: agent2.id, key: 'b', content: 'data' });

        expect(listMemories(db, agentId)).toHaveLength(1);
        expect(listMemories(db, agent2.id)).toHaveLength(1);
    });

    test('list returns max 20 results', () => {
        for (let i = 0; i < 25; i++) {
            saveMemory(db, { agentId, key: `mem-${i}`, content: 'data' });
        }
        expect(listMemories(db, agentId)).toHaveLength(20);
    });
});

// ─── Status & Txid Updates ───────────────────────────────────────────────────

describe('Status and Txid Updates', () => {
    test('updateMemoryTxid sets txid and confirms', () => {
        const mem = saveMemory(db, { agentId, key: 'tx-test', content: 'data' });
        updateMemoryTxid(db, mem.id, 'TXID_ABC123');

        const updated = recallMemory(db, agentId, 'tx-test');
        expect(updated!.txid).toBe('TXID_ABC123');
        expect(updated!.status).toBe('confirmed');
    });

    test('updateMemoryStatus changes status', () => {
        const mem = saveMemory(db, { agentId, key: 'status-test', content: 'data' });
        expect(mem.status).toBe('pending');

        updateMemoryStatus(db, mem.id, 'failed');
        const found = recallMemory(db, agentId, 'status-test');
        expect(found!.status).toBe('failed');
    });

    test('status transition: pending → confirmed → pending (on re-save)', () => {
        const mem = saveMemory(db, { agentId, key: 'lifecycle', content: 'v1' });
        updateMemoryTxid(db, mem.id, 'TX1');

        const confirmed = recallMemory(db, agentId, 'lifecycle');
        expect(confirmed!.status).toBe('confirmed');

        // Re-save with new content resets to pending
        saveMemory(db, { agentId, key: 'lifecycle', content: 'v2' });
        const pending = recallMemory(db, agentId, 'lifecycle');
        expect(pending!.status).toBe('pending');
        expect(pending!.txid).toBeNull();
    });
});

// ─── Pending Memories ────────────────────────────────────────────────────────

describe('Pending Memories', () => {
    test('getPendingMemories returns pending and failed', () => {
        saveMemory(db, { agentId, key: 'pending-1', content: 'data' });
        const m2 = saveMemory(db, { agentId, key: 'pending-2', content: 'data' });
        const m3 = saveMemory(db, { agentId, key: 'confirmed', content: 'data' });

        updateMemoryTxid(db, m3.id, 'TX1'); // confirmed
        updateMemoryStatus(db, m2.id, 'failed');

        const pending = getPendingMemories(db);
        expect(pending).toHaveLength(2);
        const keys = pending.map(m => m.key);
        expect(keys).toContain('pending-1');
        expect(keys).toContain('pending-2'); // failed is also returned
    });

    test('getPendingMemories respects limit', () => {
        for (let i = 0; i < 5; i++) {
            saveMemory(db, { agentId, key: `p-${i}`, content: 'data' });
        }
        expect(getPendingMemories(db, 3)).toHaveLength(3);
    });

    test('getPendingMemories ordered by updated_at ASC (oldest first)', () => {
        saveMemory(db, { agentId, key: 'old', content: 'data' });
        saveMemory(db, { agentId, key: 'new', content: 'data' });

        const pending = getPendingMemories(db);
        expect(pending[0].key).toBe('old');
        expect(pending[1].key).toBe('new');
    });

    test('countPendingMemories returns correct count', () => {
        expect(countPendingMemories(db)).toBe(0);

        saveMemory(db, { agentId, key: 'a', content: 'data' });
        saveMemory(db, { agentId, key: 'b', content: 'data' });
        expect(countPendingMemories(db)).toBe(2);

        // Confirm one
        const mem = recallMemory(db, agentId, 'a');
        updateMemoryTxid(db, mem!.id, 'TX1');
        expect(countPendingMemories(db)).toBe(1);
    });

    test('getPendingMemories spans across agents', () => {
        const agent2 = createAgent(db, { name: 'Agent 2' });
        saveMemory(db, { agentId, key: 'a', content: 'data' });
        saveMemory(db, { agentId: agent2.id, key: 'b', content: 'data' });

        // getPendingMemories is not agent-scoped
        expect(getPendingMemories(db)).toHaveLength(2);
    });
});

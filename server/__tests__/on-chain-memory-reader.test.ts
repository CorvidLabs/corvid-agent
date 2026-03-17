import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { handleReadOnChainMemories, handleSyncOnChainMemories } from '../mcp/tool-handlers/memory';
import { recallMemory } from '../db/agent-memories';
import { runMigrations } from '../db/schema';
import type { McpToolContext } from '../mcp/tool-handlers/types';

function extractText(result: { content: Array<{ type: string; text?: string }> }): string {
    const first = result.content[0];
    return first && 'text' in first ? (first.text ?? '') : '';
}

function createTestDb(): Database {
    const db = new Database(':memory:');
    runMigrations(db);
    // Insert a test agent
    db.query(
        "INSERT INTO agents (id, name, model, system_prompt) VALUES ('agent-1', 'test-agent', 'test', 'test')",
    ).run();
    return db;
}

function createMockContext(db: Database, memories: Array<{ key: string; content: string; txid: string; timestamp: string; confirmedRound: number }> = []): McpToolContext {
    return {
        agentId: 'agent-1',
        db,
        agentMessenger: {
            readOnChainMemories: mock(async () => memories),
            sendOnChainToSelf: mock(async () => null),
        } as unknown as McpToolContext['agentMessenger'],
        agentDirectory: {} as McpToolContext['agentDirectory'],
        agentWalletService: {} as McpToolContext['agentWalletService'],
        serverMnemonic: 'test-mnemonic',
        network: 'localnet',
    };
}

describe('handleReadOnChainMemories', () => {
    let db: Database;

    beforeEach(() => {
        db = createTestDb();
    });
    afterEach(() => db.close());

    test('returns empty message when no memories found', async () => {
        const ctx = createMockContext(db);
        const result = await handleReadOnChainMemories(ctx, {});
        const text = extractText(result);
        expect(text).toBe('No on-chain memories found.');
    });

    test('returns empty message with search term when no matches', async () => {
        const ctx = createMockContext(db);
        const result = await handleReadOnChainMemories(ctx, { search: 'missing' });
        const text = extractText(result);
        expect(text).toBe('No on-chain memories found matching "missing".');
    });

    test('returns formatted memories when found', async () => {
        const memories = [
            { key: 'user-pref', content: 'likes dark mode', txid: 'ABCDEF123456789012345678901234567890123456789012', timestamp: '2026-03-17T10:00:00.000Z', confirmedRound: 100 },
            { key: 'project-status', content: 'v1.0 in progress', txid: 'ZYXWVU987654321098765432109876543210987654321098', timestamp: '2026-03-17T11:00:00.000Z', confirmedRound: 200 },
        ];
        const ctx = createMockContext(db, memories);
        const result = await handleReadOnChainMemories(ctx, {});
        const text = extractText(result);

        expect(text).toContain('Found 2 on-chain memories');
        expect(text).toContain('[user-pref] likes dark mode');
        expect(text).toContain('[project-status] v1.0 in progress');
        expect(text).toContain('ABCDEF123456');
    });

    test('passes search and limit to agentMessenger', async () => {
        const ctx = createMockContext(db);
        await handleReadOnChainMemories(ctx, { search: 'test', limit: 10 });

        const mockFn = ctx.agentMessenger.readOnChainMemories as ReturnType<typeof mock>;
        expect(mockFn.mock.calls.length).toBe(1);
        const callArgs = mockFn.mock.calls[0] as unknown[];
        expect(callArgs[0]).toBe('agent-1');
        expect(callArgs[3]).toEqual({ limit: 10, search: 'test' });
    });

    test('singular grammar for single memory', async () => {
        const memories = [
            { key: 'solo', content: 'just one', txid: 'TX123456789012', timestamp: '2026-03-17T10:00:00.000Z', confirmedRound: 50 },
        ];
        const ctx = createMockContext(db, memories);
        const result = await handleReadOnChainMemories(ctx, {});
        const text = extractText(result);
        expect(text).toContain('Found 1 on-chain memory');
    });
});

describe('handleSyncOnChainMemories', () => {
    let db: Database;

    beforeEach(() => {
        db = createTestDb();
    });
    afterEach(() => db.close());

    test('returns empty message when no memories to sync', async () => {
        const ctx = createMockContext(db);
        const result = await handleSyncOnChainMemories(ctx, {});
        const text = extractText(result);
        expect(text).toBe('No on-chain memories found to sync.');
    });

    test('restores missing memories from on-chain to SQLite', async () => {
        const memories = [
            { key: 'restored-key', content: 'restored content', txid: 'TXID1234567890', timestamp: '2026-03-17T10:00:00.000Z', confirmedRound: 100 },
        ];
        const ctx = createMockContext(db, memories);
        const result = await handleSyncOnChainMemories(ctx, {});
        const text = extractText(result);

        expect(text).toContain('1 memory restored/updated');
        expect(text).toContain('Total on-chain: 1');

        // Verify memory was actually saved to SQLite
        const recalled = recallMemory(db, 'agent-1', 'restored-key');
        expect(recalled).not.toBeNull();
        expect(recalled!.content).toBe('restored content');
        expect(recalled!.txid).toBe('TXID1234567890');
        expect(recalled!.status).toBe('confirmed');
    });

    test('skips memories already present and confirmed', async () => {
        // Pre-populate a confirmed memory
        db.query(
            "INSERT INTO agent_memories (id, agent_id, key, content, txid, status) VALUES ('id-1', 'agent-1', 'existing-key', 'existing content', 'TXID_EXISTING', 'confirmed')",
        ).run();

        const memories = [
            { key: 'existing-key', content: 'existing content', txid: 'TXID_EXISTING', timestamp: '2026-03-17T10:00:00.000Z', confirmedRound: 100 },
        ];
        const ctx = createMockContext(db, memories);
        const result = await handleSyncOnChainMemories(ctx, {});
        const text = extractText(result);

        expect(text).toContain('0 memories restored/updated');
        expect(text).toContain('1 already up-to-date');
    });

    test('updates pending memories with txid from on-chain', async () => {
        // Pre-populate a pending memory (no txid)
        db.query(
            "INSERT INTO agent_memories (id, agent_id, key, content, txid, status) VALUES ('id-2', 'agent-1', 'pending-key', 'pending content', NULL, 'pending')",
        ).run();

        const memories = [
            { key: 'pending-key', content: 'pending content', txid: 'TXID_FROM_CHAIN', timestamp: '2026-03-17T10:00:00.000Z', confirmedRound: 100 },
        ];
        const ctx = createMockContext(db, memories);
        const result = await handleSyncOnChainMemories(ctx, {});
        const text = extractText(result);

        expect(text).toContain('1 memory restored/updated');

        const recalled = recallMemory(db, 'agent-1', 'pending-key');
        expect(recalled!.txid).toBe('TXID_FROM_CHAIN');
        expect(recalled!.status).toBe('confirmed');
    });

    test('handles mix of new, pending, and confirmed memories', async () => {
        // Confirmed
        db.query(
            "INSERT INTO agent_memories (id, agent_id, key, content, txid, status) VALUES ('id-c', 'agent-1', 'confirmed-key', 'c', 'TX_C', 'confirmed')",
        ).run();
        // Pending
        db.query(
            "INSERT INTO agent_memories (id, agent_id, key, content, txid, status) VALUES ('id-p', 'agent-1', 'pending-key', 'p', NULL, 'pending')",
        ).run();

        const memories = [
            { key: 'confirmed-key', content: 'c', txid: 'TX_C', timestamp: '2026-03-17T10:00:00.000Z', confirmedRound: 100 },
            { key: 'pending-key', content: 'p', txid: 'TX_P', timestamp: '2026-03-17T11:00:00.000Z', confirmedRound: 200 },
            { key: 'new-key', content: 'n', txid: 'TX_N', timestamp: '2026-03-17T12:00:00.000Z', confirmedRound: 300 },
        ];
        const ctx = createMockContext(db, memories);
        const result = await handleSyncOnChainMemories(ctx, {});
        const text = extractText(result);

        expect(text).toContain('2 memories restored/updated');
        expect(text).toContain('1 already up-to-date');
        expect(text).toContain('Total on-chain: 3');
    });
});

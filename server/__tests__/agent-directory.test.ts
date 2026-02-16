import { test, expect, beforeEach, describe, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { createAgent } from '../db/agents';
import { setAgentWallet } from '../db/agents';
import { AgentDirectory } from '../algochat/agent-directory';
import type { AgentWalletService } from '../algochat/agent-wallet';

let db: Database;
let directory: AgentDirectory;
let mockGetAgentChatAccount: ReturnType<typeof mock>;

const MOCK_PUBLIC_KEY = new Uint8Array([1, 2, 3, 4, 5]);

function createMockWalletService(): AgentWalletService {
    mockGetAgentChatAccount = mock((_agentId: string) =>
        Promise.resolve({
            address: 'MOCKADDR',
            account: {
                encryptionKeys: {
                    publicKey: MOCK_PUBLIC_KEY,
                },
            },
        }),
    );

    return {
        getAgentChatAccount: mockGetAgentChatAccount,
    } as unknown as AgentWalletService;
}

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
    directory = new AgentDirectory(db, createMockWalletService());
});

// ─── resolve ────────────────────────────────────────────────────────────────

describe('resolve', () => {
    test('returns entry for existing agent', async () => {
        const agent = createAgent(db, { name: 'TestAgent', model: 'sonnet' });
        setAgentWallet(db, agent.id, 'TESTWALLET123', 'encrypted-mnemonic');

        const entry = await directory.resolve(agent.id);

        expect(entry).not.toBeNull();
        expect(entry!.agentId).toBe(agent.id);
        expect(entry!.agentName).toBe('TestAgent');
        expect(entry!.walletAddress).toBe('TESTWALLET123');
        expect(entry!.publicKey).toEqual(MOCK_PUBLIC_KEY);
    });

    test('returns null for nonexistent agent', async () => {
        const entry = await directory.resolve('nonexistent-id');
        expect(entry).toBeNull();
    });

    test('caches results on first resolve', async () => {
        const agent = createAgent(db, { name: 'CachedAgent', model: 'sonnet' });

        const first = await directory.resolve(agent.id);
        const second = await directory.resolve(agent.id);

        expect(first).not.toBeNull();
        expect(second).toBe(first); // Same reference from cache
        // getAgentChatAccount should only be called once due to caching
        expect(mockGetAgentChatAccount).toHaveBeenCalledTimes(1);
    });

    test('handles wallet service error gracefully', async () => {
        const agent = createAgent(db, { name: 'ErrorAgent', model: 'sonnet' });

        const failingService = {
            getAgentChatAccount: mock(() => Promise.reject(new Error('wallet error'))),
        } as unknown as AgentWalletService;
        const errorDirectory = new AgentDirectory(db, failingService);

        const entry = await errorDirectory.resolve(agent.id);

        expect(entry).not.toBeNull();
        expect(entry!.agentId).toBe(agent.id);
        expect(entry!.publicKey).toBeNull();
    });

    test('sets publicKey to null when chatAccount has no encryption keys', async () => {
        const agent = createAgent(db, { name: 'NoKeysAgent', model: 'sonnet' });

        const noKeysService = {
            getAgentChatAccount: mock(() =>
                Promise.resolve({
                    address: 'ADDR',
                    account: { encryptionKeys: null },
                }),
            ),
        } as unknown as AgentWalletService;
        const noKeysDirectory = new AgentDirectory(db, noKeysService);

        const entry = await noKeysDirectory.resolve(agent.id);

        expect(entry).not.toBeNull();
        expect(entry!.publicKey).toBeNull();
    });

    test('sets publicKey to null when chatAccount is null', async () => {
        const agent = createAgent(db, { name: 'NullAccountAgent', model: 'sonnet' });

        const nullService = {
            getAgentChatAccount: mock(() => Promise.resolve(null)),
        } as unknown as AgentWalletService;
        const nullDirectory = new AgentDirectory(db, nullService);

        const entry = await nullDirectory.resolve(agent.id);

        expect(entry).not.toBeNull();
        expect(entry!.publicKey).toBeNull();
    });
});

// ─── findAgentByAddress ─────────────────────────────────────────────────────

describe('findAgentByAddress', () => {
    test('finds agent from cache', async () => {
        const agent = createAgent(db, { name: 'CacheFind', model: 'sonnet' });
        setAgentWallet(db, agent.id, 'CACHEDWALLET', 'encrypted');

        // Populate the cache via resolve
        await directory.resolve(agent.id);

        const found = directory.findAgentByAddress('CACHEDWALLET');
        expect(found).toBe(agent.id);
    });

    test('finds agent from DB when not in cache', () => {
        const agent = createAgent(db, { name: 'DBFind', model: 'sonnet' });
        setAgentWallet(db, agent.id, 'DBWALLET', 'encrypted');

        // Do not call resolve — cache is empty
        const found = directory.findAgentByAddress('DBWALLET');
        expect(found).toBe(agent.id);
    });

    test('returns null for unknown address', () => {
        const found = directory.findAgentByAddress('UNKNOWNADDR');
        expect(found).toBeNull();
    });

    test('prefers cache hit over DB query', async () => {
        const agent = createAgent(db, { name: 'PreferCache', model: 'sonnet' });
        setAgentWallet(db, agent.id, 'PREFERWALLET', 'encrypted');

        // Populate cache
        await directory.resolve(agent.id);

        // Now remove from DB to prove cache is used
        db.query('UPDATE agents SET wallet_address = NULL WHERE id = ?').run(agent.id);

        const found = directory.findAgentByAddress('PREFERWALLET');
        expect(found).toBe(agent.id);
    });
});

// ─── listAvailable ──────────────────────────────────────────────────────────

describe('listAvailable', () => {
    test('returns all agents', async () => {
        createAgent(db, { name: 'Agent1', model: 'sonnet' });
        createAgent(db, { name: 'Agent2', model: 'opus' });
        createAgent(db, { name: 'Agent3', model: 'haiku' });

        const entries = await directory.listAvailable();

        expect(entries).toHaveLength(3);
        const names = entries.map((e) => e.agentName);
        expect(names).toContain('Agent1');
        expect(names).toContain('Agent2');
        expect(names).toContain('Agent3');
    });

    test('returns empty array when no agents exist', async () => {
        const entries = await directory.listAvailable();
        expect(entries).toEqual([]);
    });

    test('populates cache for all resolved agents', async () => {
        const agent1 = createAgent(db, { name: 'A1', model: 'sonnet' });
        const agent2 = createAgent(db, { name: 'A2', model: 'sonnet' });

        await directory.listAvailable();

        // Resolve again — should use cache (no additional wallet calls)
        const callsBefore = mockGetAgentChatAccount.mock.calls.length;
        await directory.resolve(agent1.id);
        await directory.resolve(agent2.id);
        expect(mockGetAgentChatAccount.mock.calls.length).toBe(callsBefore);
    });
});

// ─── clearCache ─────────────────────────────────────────────────────────────

describe('clearCache', () => {
    test('clears the cache so resolve fetches again', async () => {
        const agent = createAgent(db, { name: 'ClearAgent', model: 'sonnet' });

        await directory.resolve(agent.id);
        expect(mockGetAgentChatAccount).toHaveBeenCalledTimes(1);

        directory.clearCache();

        await directory.resolve(agent.id);
        expect(mockGetAgentChatAccount).toHaveBeenCalledTimes(2);
    });

    test('clears cache so findAgentByAddress falls back to DB', async () => {
        const agent = createAgent(db, { name: 'ClearFind', model: 'sonnet' });
        setAgentWallet(db, agent.id, 'CLEARWALLET', 'encrypted');

        // Populate cache
        await directory.resolve(agent.id);

        // Verify cache hit works
        expect(directory.findAgentByAddress('CLEARWALLET')).toBe(agent.id);

        // Clear and verify DB fallback still works
        directory.clearCache();

        const found = directory.findAgentByAddress('CLEARWALLET');
        expect(found).toBe(agent.id);
    });
});

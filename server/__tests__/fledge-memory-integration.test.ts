/**
 * Tests for fledge plugin integration in memory tool handlers.
 *
 * Verifies that when a fledgeClient is present in the McpToolContext:
 * - Save, recall, promote, delete, and read-on-chain try fledge first
 * - Gracefully fall back to internal implementation when fledge fails
 */

import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { saveMemory, updateMemoryAsaId, updateMemoryStatus } from '../db/agent-memories';
import { createAgent } from '../db/agents';
import { runMigrations } from '../db/schema';
import { type FledgeClient, FledgeError } from '../lib/fledge-client';

// Mock arc69-store
mock.module('../memory/arc69-store', () => ({
  createMemoryAsa: mock(() => Promise.resolve({ asaId: 100, txid: 'TX-CREATE' })),
  updateMemoryAsa: mock(() => Promise.resolve({ txid: 'TX-UPDATE' })),
  resolveAsaForKey: mock((): number | null => null),
  deleteMemoryAsa: mock(() => Promise.resolve({ txid: 'TX-DEL' })),
  listMemoryAsas: mock(() => Promise.resolve([])),
  readMemoryAsa: mock(() => Promise.resolve(null)),
}));

mock.module('../algochat/config', () => ({
  loadAlgoChatConfig: () => ({
    mnemonic: null,
    network: 'localnet' as const,
    agentNetwork: 'localnet' as const,
    syncInterval: 30000,
    defaultAgentId: null,
    enabled: false,
    pskContact: null,
    ownerAddresses: new Set<string>(),
  }),
  _resetConfigCache: () => {},
}));

import {
  handleDeleteMemory,
  handlePromoteMemory,
  handleReadOnChainMemories,
  handleRecallMemory,
  handleSaveMemory,
  type McpToolContext,
} from '../mcp/tool-handlers';

let db: Database;
let agentId: string;

function createMockFledgeClient(overrides?: Partial<FledgeClient>): FledgeClient {
  return {
    exec: mock(() => Promise.resolve({ ok: true })),
    memory: mock(() => Promise.resolve({ ok: true })),
    algochat: mock(() => Promise.resolve({ ok: true })),
    sql: mock(() => Promise.resolve({ ok: true })),
    localnet: mock(() => Promise.resolve({ ok: true })),
    available: mock(() => Promise.resolve(true)),
    ...overrides,
  } as unknown as FledgeClient;
}

function createMockContext(overrides?: Partial<McpToolContext>): McpToolContext {
  return {
    agentId,
    db,
    agentMessenger: {
      invokeAndWait: mock(() => Promise.resolve({ response: 'mock', threadId: 't1' })),
      sendOnChainToSelf: mock(() => Promise.resolve('mock-txid')),
      sendNotificationToAddress: mock(() => Promise.resolve()),
      readOnChainMemories: mock(() => Promise.resolve([])),
    } as unknown as McpToolContext['agentMessenger'],
    agentDirectory: {
      listAvailable: mock(() => Promise.resolve([])),
    } as unknown as McpToolContext['agentDirectory'],
    agentWalletService: {} as McpToolContext['agentWalletService'],
    ...overrides,
  };
}

beforeEach(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
  const agent = createAgent(db, { name: 'TestAgent', model: 'sonnet' });
  agentId = agent.id;
});

afterEach(() => {
  db.close();
});

// ─── handleSaveMemory with fledge ──────────────────────────────────────────

describe('handleSaveMemory with fledgeClient', () => {
  test('uses fledge when available and succeeds', async () => {
    const fledge = createMockFledgeClient({
      memory: mock(() => Promise.resolve({ ok: true, tier: 'ephemeral' })),
    });
    const ctx = createMockContext({ fledgeClient: fledge });

    const result = await handleSaveMemory(ctx, { key: 'fledge-key', content: 'fledge-val' });
    const text = (result.content[0] as { text: string }).text;

    expect(result.isError).toBeFalsy();
    expect(text).toContain('via fledge');
    expect(text).toContain('ephemeral');
    expect((fledge.memory as any).mock.calls.length).toBe(1);
  });

  test('falls back to internal when fledge throws', async () => {
    const fledge = createMockFledgeClient({
      memory: mock(() => Promise.reject(new FledgeError('plugin crashed', 1))),
    });
    const ctx = createMockContext({ fledgeClient: fledge });

    const result = await handleSaveMemory(ctx, { key: 'fallback-save', content: 'fallback-val' });
    const text = (result.content[0] as { text: string }).text;

    expect(result.isError).toBeFalsy();
    expect(text).toContain('short-term');
    expect(text).not.toContain('via fledge');
  });

  test('skips fledge when fledgeClient is undefined', async () => {
    const ctx = createMockContext({ fledgeClient: undefined });

    const result = await handleSaveMemory(ctx, { key: 'no-fledge', content: 'val' });
    const text = (result.content[0] as { text: string }).text;

    expect(result.isError).toBeFalsy();
    expect(text).toContain('short-term');
  });
});

// ─── handleRecallMemory with fledge ────────────────────────────────────────

describe('handleRecallMemory with fledgeClient', () => {
  test('returns fledge result when key is found', async () => {
    const fledge = createMockFledgeClient({
      memory: mock(() =>
        Promise.resolve({
          ok: true,
          value: 'recalled-content',
          tier: 'mutable',
          txid: 'TXRECALL123',
        }),
      ),
    });
    const ctx = createMockContext({ fledgeClient: fledge });

    const result = await handleRecallMemory(ctx, { key: 'test-recall' });
    const text = (result.content[0] as { text: string }).text;

    expect(result.isError).toBeFalsy();
    expect(text).toContain('recalled-content');
    expect(text).toContain('via fledge');
    expect(text).toContain('TXRECALL123');
  });

  test('falls back to internal when fledge returns not_found', async () => {
    const fledge = createMockFledgeClient({
      memory: mock(() => Promise.resolve({ ok: false, error: 'not_found' })),
    });
    const ctx = createMockContext({ fledgeClient: fledge });
    saveMemory(db, { agentId, key: 'local-key', content: 'local-val' });

    const result = await handleRecallMemory(ctx, { key: 'local-key' });
    const text = (result.content[0] as { text: string }).text;

    expect(result.isError).toBeFalsy();
    expect(text).toContain('local-val');
    expect(text).not.toContain('via fledge');
  });

  test('falls back to internal when fledge throws', async () => {
    const fledge = createMockFledgeClient({
      memory: mock(() => Promise.reject(new FledgeError('timeout', 1))),
    });
    const ctx = createMockContext({ fledgeClient: fledge });
    saveMemory(db, { agentId, key: 'fallback-recall', content: 'fb-content' });

    const result = await handleRecallMemory(ctx, { key: 'fallback-recall' });
    const text = (result.content[0] as { text: string }).text;

    expect(result.isError).toBeFalsy();
    expect(text).toContain('fb-content');
  });
});

// ─── handlePromoteMemory with fledge ───────────────────────────────────────

describe('handlePromoteMemory with fledgeClient', () => {
  test('promotes via fledge and updates local DB', async () => {
    const fledge = createMockFledgeClient({
      memory: mock(() =>
        Promise.resolve({
          ok: true,
          asaId: 555,
          txid: 'TXPROMOTE456',
        }),
      ),
    });
    const ctx = createMockContext({ fledgeClient: fledge });
    saveMemory(db, { agentId, key: 'promote-fledge', content: 'data' });

    const result = await handlePromoteMemory(ctx, { key: 'promote-fledge' });
    const text = (result.content[0] as { text: string }).text;

    expect(result.isError).toBeFalsy();
    expect(text).toContain('promoted to on-chain storage via fledge');
    expect(text).toContain('555');
    expect(text).toContain('TXPROMOTE456');
  });

  test('falls back to internal when fledge promote throws', async () => {
    const fledge = createMockFledgeClient({
      memory: mock(() => Promise.reject(new FledgeError('localnet unreachable', 1))),
    });
    const ctx = createMockContext({
      fledgeClient: fledge,
      network: 'localnet',
    });
    saveMemory(db, { agentId, key: 'promote-fallback', content: 'data' });

    const result = await handlePromoteMemory(ctx, { key: 'promote-fallback' });
    const text = (result.content[0] as { text: string }).text;

    // Should fall through to internal logic which will fail due to missing ARC-69 context
    expect(result.isError).toBe(true);
    expect(text).toContain('Cannot promote memory');
  });
});

// ─── handleDeleteMemory with fledge ────────────────────────────────────────

describe('handleDeleteMemory with fledgeClient', () => {
  test('deletes via fledge for on-chain memory (soft mode)', async () => {
    const fledge = createMockFledgeClient({
      memory: mock(() => Promise.resolve({ ok: true, txid: 'TXDEL789' })),
    });
    const ctx = createMockContext({ fledgeClient: fledge });
    const mem = saveMemory(db, { agentId, key: 'del-fledge', content: 'data' });
    updateMemoryAsaId(db, mem.id, 999);
    updateMemoryStatus(db, mem.id, 'confirmed');

    const result = await handleDeleteMemory(ctx, { key: 'del-fledge' });
    const text = (result.content[0] as { text: string }).text;

    expect(result.isError).toBeFalsy();
    expect(text).toContain('via fledge');
    expect(text).toContain('999');
    expect(text).toContain('soft-deleted');
  });

  test('deletes via fledge for on-chain memory (hard mode)', async () => {
    const fledge = createMockFledgeClient({
      memory: mock(() => Promise.resolve({ ok: true, txid: 'TXHARDDEL' })),
    });
    const ctx = createMockContext({ fledgeClient: fledge });
    const mem = saveMemory(db, { agentId, key: 'hard-del-fledge', content: 'data' });
    updateMemoryAsaId(db, mem.id, 888);
    updateMemoryStatus(db, mem.id, 'confirmed');

    const result = await handleDeleteMemory(ctx, { key: 'hard-del-fledge', mode: 'hard' });
    const text = (result.content[0] as { text: string }).text;

    expect(result.isError).toBeFalsy();
    expect(text).toContain('permanently deleted');
    expect(text).toContain('via fledge');
  });

  test('falls back to internal when fledge delete throws', async () => {
    const fledge = createMockFledgeClient({
      memory: mock(() => Promise.reject(new FledgeError('network error', 1))),
    });
    const ctx = createMockContext({
      fledgeClient: fledge,
      network: 'localnet',
      agentWalletService: {
        getAlgoChatService: () => ({
          algodClient: {} as any,
          indexerClient: {} as any,
        }),
        getAgentChatAccount: mock(() => Promise.resolve({ account: {} as any })),
      } as unknown as McpToolContext['agentWalletService'],
    });
    const mem = saveMemory(db, { agentId, key: 'del-fallback', content: 'data' });
    updateMemoryAsaId(db, mem.id, 777);
    updateMemoryStatus(db, mem.id, 'confirmed');

    const result = await handleDeleteMemory(ctx, { key: 'del-fallback' });
    const text = (result.content[0] as { text: string }).text;

    // Falls through to internal — should attempt ARC-69 delete
    expect(result.isError).toBeFalsy();
    expect(text).not.toContain('via fledge');
  });

  test('skips fledge for non-ASA memories', async () => {
    const fledge = createMockFledgeClient();
    const ctx = createMockContext({ fledgeClient: fledge });
    saveMemory(db, { agentId, key: 'no-asa-del', content: 'data' });

    const result = await handleDeleteMemory(ctx, { key: 'no-asa-del' });
    const text = (result.content[0] as { text: string }).text;

    // No asaId means it's not on-chain, fledge path should be skipped
    expect((fledge.memory as any).mock.calls.length).toBe(0);
    expect(text).toContain('permanent');
  });
});

// ─── handleReadOnChainMemories with fledge ─────────────────────────────────

describe('handleReadOnChainMemories with fledgeClient', () => {
  test('returns fledge list results', async () => {
    const fledge = createMockFledgeClient({
      memory: mock(() =>
        Promise.resolve({
          ok: true,
          memories: [
            { key: 'mem-1', value: 'content-1', assetId: 100, created: '2026-05-01' },
            { key: 'mem-2', value: 'content-2', txid: 'TX999', created: '2026-05-02' },
          ],
        }),
      ),
    });
    const ctx = createMockContext({ fledgeClient: fledge });

    const result = await handleReadOnChainMemories(ctx, {});
    const text = (result.content[0] as { text: string }).text;

    expect(result.isError).toBeFalsy();
    expect(text).toContain('via fledge');
    expect(text).toContain('mem-1');
    expect(text).toContain('content-1');
    expect(text).toContain('ASA 100');
    expect(text).toContain('mem-2');
    expect(text).toContain('TX999');
  });

  test('filters results by search query', async () => {
    const fledge = createMockFledgeClient({
      memory: mock(() =>
        Promise.resolve({
          ok: true,
          memories: [
            { key: 'project-alpha', value: 'alpha details', assetId: 101 },
            { key: 'user-bob', value: 'bob info', assetId: 102 },
          ],
        }),
      ),
    });
    const ctx = createMockContext({ fledgeClient: fledge });

    const result = await handleReadOnChainMemories(ctx, { search: 'alpha' });
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain('project-alpha');
    expect(text).not.toContain('user-bob');
  });

  test('reports empty when fledge returns no memories', async () => {
    const fledge = createMockFledgeClient({
      memory: mock(() => Promise.resolve({ ok: true, memories: [] })),
    });
    const ctx = createMockContext({ fledgeClient: fledge });

    const result = await handleReadOnChainMemories(ctx, {});
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain('No on-chain memories found');
    expect(text).toContain('via fledge');
  });

  test('falls back to internal when fledge list throws', async () => {
    const fledge = createMockFledgeClient({
      memory: mock(() => Promise.reject(new FledgeError('plugin not installed', 1))),
    });
    const ctx = createMockContext({
      fledgeClient: fledge,
      network: 'localnet',
    });

    const result = await handleReadOnChainMemories(ctx, {});
    const text = (result.content[0] as { text: string }).text;

    // Falls through to internal, which returns empty from mock
    expect(text).not.toContain('via fledge');
  });
});

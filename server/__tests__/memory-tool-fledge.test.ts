import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { recallMemory, saveMemory, updateMemoryAsaId } from '../db/agent-memories';
import { runMigrations } from '../db/schema';
import type { FledgeClient } from '../lib/fledge-client';
import {
  handleDeleteMemory,
  handlePromoteMemory,
  handleRecallMemory,
  handleSaveMemory,
} from '../mcp/tool-handlers/memory';
import type { McpToolContext } from '../mcp/tool-handlers/types';

function extractText(result: { content: Array<{ type: string; text?: string }> }): string {
  const first = result.content[0];
  return first && 'text' in first ? (first.text ?? '') : '';
}

let db: Database;

function createMockContext(overrides?: Partial<McpToolContext>): McpToolContext {
  return {
    agentId: 'agent-test',
    db,
    agentMessenger: {
      readOnChainMemories: mock(() => Promise.resolve([])),
      sendOnChainToSelf: mock(() => Promise.resolve(null)),
    } as unknown as McpToolContext['agentMessenger'],
    agentDirectory: {} as McpToolContext['agentDirectory'],
    agentWalletService: {
      getAlgoChatService: () => ({ indexerClient: null }),
    } as unknown as McpToolContext['agentWalletService'],
    network: 'localnet',
    ...overrides,
  } as McpToolContext;
}

function createMockFledgeClient(overrides?: Partial<Record<string, Function>>): FledgeClient {
  return {
    memory: mock(() => Promise.resolve({ ok: true, tier: 'ephemeral' })),
    ...overrides,
  } as unknown as FledgeClient;
}

beforeEach(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
  db.query("INSERT INTO agents (id, name, model, system_prompt) VALUES (?, ?, ?, ?)").run(
    'agent-test',
    'TestAgent',
    'test',
    'test',
  );
});

afterEach(() => {
  db.close();
});

describe('handleSaveMemory (fledge delegation)', () => {
  test('uses fledge when available and result contains via fledge', async () => {
    const fledge = createMockFledgeClient();
    const ctx = createMockContext({ fledgeClient: fledge });
    const result = await handleSaveMemory(ctx, { key: 'greeting', content: 'hello world' });
    const text = extractText(result);
    expect(text).toContain('via fledge');
    expect(text).toContain('greeting');
    expect(fledge.memory).toHaveBeenCalled();
  });

  test('also saves locally when fledge succeeds', async () => {
    const fledge = createMockFledgeClient();
    const ctx = createMockContext({ fledgeClient: fledge });
    await handleSaveMemory(ctx, { key: 'local-check', content: 'should persist locally' });
    const local = recallMemory(db, 'agent-test', 'local-check');
    expect(local).not.toBeNull();
    expect(local!.content).toBe('should persist locally');
  });

  test('falls back to internal when fledge is undefined', async () => {
    const ctx = createMockContext({ fledgeClient: undefined });
    const result = await handleSaveMemory(ctx, { key: 'internal-key', content: 'internal data' });
    const text = extractText(result);
    expect(text).toContain('SQLite only');
    expect(text).not.toContain('via fledge');
    const local = recallMemory(db, 'agent-test', 'internal-key');
    expect(local).not.toBeNull();
  });

  test('falls back to internal when fledge throws', async () => {
    const fledge = createMockFledgeClient({
      memory: mock(() => Promise.reject(new Error('fledge unavailable'))),
    });
    const ctx = createMockContext({ fledgeClient: fledge });
    const result = await handleSaveMemory(ctx, { key: 'fallback-key', content: 'fallback data' });
    const text = extractText(result);
    expect(text).toContain('SQLite only');
    expect(text).not.toContain('via fledge');
  });
});

describe('handleRecallMemory (fledge delegation)', () => {
  test('uses fledge recall when available and result contains via fledge', async () => {
    const fledge = createMockFledgeClient({
      memory: mock(() =>
        Promise.resolve({ ok: true, value: 'recalled data', tier: 'mutable', txid: 'TX123' }),
      ),
    });
    const ctx = createMockContext({ fledgeClient: fledge });
    const result = await handleRecallMemory(ctx, { key: 'my-key' });
    const text = extractText(result);
    expect(text).toContain('via fledge');
    expect(text).toContain('recalled data');
  });

  test('falls back to local DB when fledge throws', async () => {
    saveMemory(db, { agentId: 'agent-test', key: 'local-mem', content: 'local content' });
    const fledge = createMockFledgeClient({
      memory: mock(() => Promise.reject(new Error('connection refused'))),
    });
    const ctx = createMockContext({ fledgeClient: fledge });
    const result = await handleRecallMemory(ctx, { key: 'local-mem' });
    const text = extractText(result);
    expect(text).toContain('local content');
    expect(text).not.toContain('via fledge');
  });
});

describe('handlePromoteMemory (fledge delegation)', () => {
  test('uses fledge promote when available', async () => {
    saveMemory(db, { agentId: 'agent-test', key: 'promote-key', content: 'promote me' });
    const fledge = createMockFledgeClient({
      memory: mock(() =>
        Promise.resolve({ ok: true, assetId: 999, txid: 'TX-PROMOTE' }),
      ),
    });
    const ctx = createMockContext({ fledgeClient: fledge });
    const result = await handlePromoteMemory(ctx, { key: 'promote-key' });
    const text = extractText(result);
    expect(text).toContain('via fledge');
    expect(text).toContain('999');
  });

  test('falls back to internal when fledge throws', async () => {
    saveMemory(db, { agentId: 'agent-test', key: 'fallback-promote', content: 'promote fallback' });
    const fledge = createMockFledgeClient({
      memory: mock(() => Promise.reject(new Error('promote failed'))),
    });
    const ctx = createMockContext({ fledgeClient: fledge });
    const result = await handlePromoteMemory(ctx, { key: 'fallback-promote' });
    const text = extractText(result);
    expect(text).not.toContain('via fledge');
  });
});

describe('handleDeleteMemory (fledge delegation)', () => {
  test('uses fledge delete when memory has asaId', async () => {
    const mem = saveMemory(db, { agentId: 'agent-test', key: 'delete-key', content: 'delete me' });
    updateMemoryAsaId(db, mem.id, 500);
    const fledge = createMockFledgeClient({
      memory: mock(() => Promise.resolve({ ok: true, txid: 'TX-DEL' })),
    });
    const ctx = createMockContext({ fledgeClient: fledge });
    const result = await handleDeleteMemory(ctx, { key: 'delete-key' });
    const text = extractText(result);
    expect(text).toContain('via fledge');
    expect(text).toContain('500');
  });

  test('falls back to internal when fledge delete throws', async () => {
    const mem = saveMemory(db, { agentId: 'agent-test', key: 'del-fallback', content: 'del fallback' });
    updateMemoryAsaId(db, mem.id, 600);
    const fledge = createMockFledgeClient({
      memory: mock(() => Promise.reject(new Error('delete failed'))),
    });
    const ctx = createMockContext({ fledgeClient: fledge });
    const result = await handleDeleteMemory(ctx, { key: 'del-fallback' });
    const text = extractText(result);
    expect(text).not.toContain('via fledge');
  });
});

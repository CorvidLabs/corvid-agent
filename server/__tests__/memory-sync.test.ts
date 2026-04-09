import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Load the REAL agent-memories module so we can pass-through when this test's
// mocks aren't active.  mock.module is process-wide in Bun and leaks into other
// test files (like agent-memories.test.ts), so the mock must delegate to real
// implementations by default.
// @ts-expect-error Bun supports query-string imports; TS does not resolve them
const _realAgentMemories = await import('../db/agent-memories?real');

const mockGetPendingMemories = mock(
  () =>
    [] as Array<{
      id: string;
      agentId: string;
      key: string;
      content: string;
      status: string;
      updatedAt: string;
      asaId: number | null;
    }>,
);
const mockUpdateMemoryTxid = mock(() => undefined);
const mockUpdateMemoryStatus = mock(() => undefined);
const mockUpdateMemoryAsaId = mock(() => undefined);
const mockCountPendingMemories = mock(() => 0);

mock.module('../db/agent-memories', () => ({
  ..._realAgentMemories,
  getPendingMemories: mockGetPendingMemories,
  updateMemoryTxid: mockUpdateMemoryTxid,
  updateMemoryStatus: mockUpdateMemoryStatus,
  updateMemoryAsaId: mockUpdateMemoryAsaId,
  countPendingMemories: mockCountPendingMemories,
}));

// Load the REAL crypto module so we can pass-through when this test's mocks
// aren't active.  mock.module is process-wide in Bun and leaks into other
// test files (like crypto.test.ts), so the mock must delegate to real
// implementations by default.
// @ts-expect-error Bun supports query-string imports; TS does not resolve them
const _realCrypto = await import('../lib/crypto?real');
const mockEncryptMemoryContent = mock(async (content: string) => `encrypted:${content}`);

mock.module('../lib/crypto', () => ({
  ..._realCrypto,
  encryptMemoryContent: mockEncryptMemoryContent,
}));

import { MemorySyncService } from '../db/memory-sync';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeMemory(
  overrides: Partial<{
    id: string;
    agentId: string;
    key: string;
    content: string;
    status: string;
    updatedAt: string;
    asaId: number | null;
  }> = {},
) {
  return {
    id: 'mem-1',
    agentId: 'agent-1',
    key: 'test-key',
    content: 'test content',
    status: 'pending',
    updatedAt: new Date().toISOString().replace('Z', ''),
    asaId: null,
    ...overrides,
  };
}

function makeMockMessenger(txid: string | null = 'txid-abc') {
  return {
    sendOnChainToSelf: mock(async () => txid),
  } as unknown as import('../algochat/agent-messenger').AgentMessenger;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

let db: Database;
let service: MemorySyncService;

beforeEach(() => {
  db = new Database(':memory:');
  service = new MemorySyncService(db);
  mockGetPendingMemories.mockReset();
  mockUpdateMemoryTxid.mockReset();
  mockUpdateMemoryStatus.mockReset();
  mockUpdateMemoryAsaId.mockReset();
  mockCountPendingMemories.mockReset();
  mockEncryptMemoryContent.mockReset();
  // Restore defaults
  mockGetPendingMemories.mockImplementation(() => []);
  mockCountPendingMemories.mockImplementation(() => 0);
  mockEncryptMemoryContent.mockImplementation(async (content: string) => `encrypted:${content}`);
});

afterEach(() => {
  service.stop();
  // Restore pass-through so agent-memories.test.ts (which may run later) gets real behavior
  mockGetPendingMemories.mockImplementation((...args: any[]) =>
    (_realAgentMemories.getPendingMemories as (...a: any[]) => any)(...args),
  );
  mockUpdateMemoryTxid.mockImplementation((...args: any[]) =>
    (_realAgentMemories.updateMemoryTxid as (...a: any[]) => any)(...args),
  );
  mockUpdateMemoryStatus.mockImplementation((...args: any[]) =>
    (_realAgentMemories.updateMemoryStatus as (...a: any[]) => any)(...args),
  );
  mockUpdateMemoryAsaId.mockImplementation((...args: any[]) =>
    (_realAgentMemories.updateMemoryAsaId as (...a: any[]) => any)(...args),
  );
  mockCountPendingMemories.mockImplementation((...args: any[]) =>
    (_realAgentMemories.countPendingMemories as (...a: any[]) => any)(...args),
  );
  // Restore pass-through so crypto.test.ts (which may run later) gets real behavior
  mockEncryptMemoryContent.mockImplementation((...args: any[]) =>
    (_realCrypto.encryptMemoryContent as (...a: any[]) => any)(...args),
  );
});

describe('MemorySyncService constructor + getStats', () => {
  test('isRunning is false before start', () => {
    const stats = service.getStats();
    expect(stats.isRunning).toBe(false);
  });

  test('getStats calls countPendingMemories with the DB', () => {
    mockCountPendingMemories.mockImplementation(() => 5);
    const stats = service.getStats();
    expect(stats.pendingCount).toBe(5);
    expect(mockCountPendingMemories).toHaveBeenCalledWith(db);
  });
});

describe('MemorySyncService start / stop', () => {
  test('start sets isRunning to true', () => {
    service.start();
    expect(service.getStats().isRunning).toBe(true);
  });

  test('stop sets isRunning to false', () => {
    service.start();
    service.stop();
    expect(service.getStats().isRunning).toBe(false);
  });

  test('calling start twice does not crash (warns and skips)', () => {
    service.start();
    expect(() => service.start()).not.toThrow();
    expect(service.getStats().isRunning).toBe(true);
  });

  test('calling stop without start does not crash', () => {
    expect(() => service.stop()).not.toThrow();
    expect(service.getStats().isRunning).toBe(false);
  });
});

describe('MemorySyncService tick', () => {
  test('tick returns early when no agentMessenger is set', async () => {
    await service.tick();
    expect(mockGetPendingMemories).not.toHaveBeenCalled();
  });

  test('tick completes without errors when queue is empty', async () => {
    const messenger = makeMockMessenger();
    service.setServices(messenger, undefined, 'testnet');
    mockGetPendingMemories.mockImplementation(() => []);

    await expect(service.tick()).resolves.toBeUndefined();
    expect(mockGetPendingMemories).toHaveBeenCalledWith(db, 10);
  });

  test('tick syncs a pending memory via non-localnet path', async () => {
    const messenger = makeMockMessenger('txid-xyz');
    service.setServices(messenger, 'mnemonic words', 'testnet');
    mockGetPendingMemories.mockImplementation(() => [makeMemory()]);

    await service.tick();

    expect(mockEncryptMemoryContent).toHaveBeenCalledTimes(1);
    expect(messenger.sendOnChainToSelf).toHaveBeenCalledTimes(1);
    expect(mockUpdateMemoryTxid).toHaveBeenCalledWith(db, 'mem-1', 'txid-xyz');
  });

  test('tick skips failed memory within backoff window', async () => {
    const messenger = makeMockMessenger();
    service.setServices(messenger, undefined, 'testnet');
    // updatedAt is "now" — within 5-minute backoff
    const recentlyFailed = makeMemory({
      status: 'failed',
      updatedAt: new Date().toISOString().replace('Z', ''),
    });
    mockGetPendingMemories.mockImplementation(() => [recentlyFailed]);

    await service.tick();

    expect(mockUpdateMemoryTxid).not.toHaveBeenCalled();
    expect(mockUpdateMemoryStatus).not.toHaveBeenCalled();
  });

  test('tick retries failed memory outside backoff window (non-localnet)', async () => {
    const messenger = makeMockMessenger('txid-retry');
    service.setServices(messenger, undefined, 'testnet');
    // updatedAt is 10 minutes ago — outside backoff
    const oldFailedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString().replace('Z', '');
    const failedMemory = makeMemory({ status: 'failed', updatedAt: oldFailedAt });
    mockGetPendingMemories.mockImplementation(() => [failedMemory]);

    await service.tick();

    expect(mockUpdateMemoryTxid).toHaveBeenCalledWith(db, 'mem-1', 'txid-retry');
  });

  test('tick marks memory as failed when sendOnChainToSelf throws', async () => {
    const messenger = {
      sendOnChainToSelf: mock(async () => {
        throw new Error('network error');
      }),
    } as unknown as import('../algochat/agent-messenger').AgentMessenger;
    service.setServices(messenger, undefined, 'testnet');
    mockGetPendingMemories.mockImplementation(() => [makeMemory()]);

    await service.tick();

    expect(mockUpdateMemoryStatus).toHaveBeenCalledWith(db, 'mem-1', 'failed');
  });

  test('tick skips memory when sendOnChainToSelf returns null', async () => {
    const messenger = makeMockMessenger(null);
    service.setServices(messenger, undefined, 'testnet');
    mockGetPendingMemories.mockImplementation(() => [makeMemory()]);

    await service.tick();

    expect(mockUpdateMemoryTxid).not.toHaveBeenCalled();
    expect(mockUpdateMemoryStatus).not.toHaveBeenCalled();
  });
});

describe('MemorySyncService setServices / setWalletService', () => {
  test('setServices can be called without error', () => {
    const messenger = makeMockMessenger();
    expect(() => service.setServices(messenger, 'mnemonic', 'testnet')).not.toThrow();
  });

  test('setWalletService can be called without error', () => {
    const walletService = {} as import('../algochat/agent-wallet').AgentWalletService;
    expect(() => service.setWalletService(walletService)).not.toThrow();
  });

  test('after setServices with null mnemonic, tick proceeds', async () => {
    const messenger = makeMockMessenger('txid-null-mnemonic');
    service.setServices(messenger, null, 'testnet');
    mockGetPendingMemories.mockImplementation(() => [makeMemory()]);

    await service.tick();
    expect(mockGetPendingMemories).toHaveBeenCalled();
  });
});

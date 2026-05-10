/**
 * Tests for AlgoChatBridge.addLocalnetPSKBridge — dual-network PSK bridge.
 *
 * Uses minimal mocks for AlgoChatService and ProcessManager since the bridge
 * constructor and addLocalnetPSKBridge only store references and wire callbacks.
 */

import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { AlgoChatBridge } from '../algochat/bridge';
import type { AlgoChatConfig } from '../algochat/config';
import type { AlgoChatService } from '../algochat/service';
import { runMigrations } from '../db/schema';
import type { ProcessManager } from '../process/manager';

function createMockService(): AlgoChatService {
  return {
    syncManager: {
      on: () => {},
      start: () => {},
      stop: () => {},
    },
    chatAccount: {},
    algorandService: {},
    algodClient: {},
    indexerClient: null,
  } as unknown as AlgoChatService;
}

function createMockProcessManager(): ProcessManager {
  return {
    setOwnerCheck: () => {},
    extendTimeout: () => false,
    subscribeAll: () => {},
    unsubscribeAll: () => {},
  } as unknown as ProcessManager;
}

function createTestConfig(overrides?: Partial<AlgoChatConfig>): AlgoChatConfig {
  return {
    mnemonic: null,
    network: 'testnet' as const,
    agentNetwork: 'localnet' as const,
    syncInterval: 30000,
    defaultAgentId: null,
    enabled: true,
    pskContact: null,
    ownerAddresses: new Set<string>(),
    ...overrides,
  };
}

let db: Database;

beforeEach(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
});

afterEach(() => {
  db.close();
});

describe('AlgoChatBridge.addLocalnetPSKBridge', () => {
  test('constructs bridge and adds localnet PSK bridge without error', () => {
    const service = createMockService();
    const processManager = createMockProcessManager();
    const config = createTestConfig();

    const bridge = new AlgoChatBridge(db, processManager, config, service);

    const localnetService = createMockService();
    const localnetConfig = createTestConfig({ network: 'localnet' as const });

    expect(() => bridge.addLocalnetPSKBridge(localnetService, localnetConfig)).not.toThrow();
  });

  test('start includes localnet managers when bridge is configured', () => {
    const service = createMockService();
    const processManager = createMockProcessManager();
    const config = createTestConfig();

    const bridge = new AlgoChatBridge(db, processManager, config, service);

    const localnetService = createMockService();
    const localnetConfig = createTestConfig({ network: 'localnet' as const });
    bridge.addLocalnetPSKBridge(localnetService, localnetConfig);

    expect(() => bridge.start()).not.toThrow();
    bridge.stop();
  });

  test('stop cleans up localnet managers when bridge is configured', () => {
    const service = createMockService();
    const processManager = createMockProcessManager();
    const config = createTestConfig();

    const bridge = new AlgoChatBridge(db, processManager, config, service);

    const localnetService = createMockService();
    const localnetConfig = createTestConfig({ network: 'localnet' as const });
    bridge.addLocalnetPSKBridge(localnetService, localnetConfig);

    bridge.start();
    expect(() => bridge.stop()).not.toThrow();
  });

  test('start and stop work without localnet bridge', () => {
    const service = createMockService();
    const processManager = createMockProcessManager();
    const config = createTestConfig();

    const bridge = new AlgoChatBridge(db, processManager, config, service);

    expect(() => bridge.start()).not.toThrow();
    expect(() => bridge.stop()).not.toThrow();
  });

  test('localnet PSK contacts from DB are loaded during bridge setup', () => {
    const service = createMockService();
    const processManager = createMockProcessManager();
    const config = createTestConfig();

    const bridge = new AlgoChatBridge(db, processManager, config, service);

    // Insert a localnet PSK contact before adding bridge
    const psk = crypto.getRandomValues(new Uint8Array(32));
    db.prepare(`
      INSERT INTO psk_contacts (id, nickname, network, initial_psk, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'))
    `).run('merlin-test', 'Merlin', 'localnet', psk);

    const localnetService = createMockService();
    const localnetConfig = createTestConfig({ network: 'localnet' as const });

    // Should not throw even with contacts in the DB
    expect(() => bridge.addLocalnetPSKBridge(localnetService, localnetConfig)).not.toThrow();
  });
});

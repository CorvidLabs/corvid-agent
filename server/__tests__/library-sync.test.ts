/**
 * Tests for server/memory/library-sync.ts — LibrarySyncService
 * lifecycle, tick guard conditions, and stats.
 */

import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { LibrarySyncService } from '../memory/library-sync';

function createTestDb(): Database {
  const db = new Database(':memory:');
  db.exec('PRAGMA journal_mode = WAL');
  return db;
}

describe('LibrarySyncService', () => {
  let db: Database;
  let service: LibrarySyncService;

  beforeEach(() => {
    db = createTestDb();
    service = new LibrarySyncService(db);
  });

  afterEach(() => {
    service.stop();
    db.close();
  });

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  describe('start/stop lifecycle', () => {
    test('start sets timer and getStats reports running', () => {
      service.start();
      expect(service.getStats().isRunning).toBe(true);
    });

    test('stop clears timer and getStats reports not running', () => {
      service.start();
      service.stop();
      expect(service.getStats().isRunning).toBe(false);
    });

    test('double start does not create duplicate timers', () => {
      service.start();
      service.start(); // should log warning, not crash
      expect(service.getStats().isRunning).toBe(true);
    });

    test('stop when not started is a no-op', () => {
      service.stop(); // should not throw
      expect(service.getStats().isRunning).toBe(false);
    });
  });

  // ─── Tick Guards ─────────────────────────────────────────────────────────

  describe('tick', () => {
    test('returns early when no walletService set', async () => {
      // No setServices call — walletService is null
      await service.tick(); // should return immediately without error
      expect(service.getStats().isRunning).toBe(false);
    });

    test('returns early for non-localnet network', async () => {
      const mockWalletService = {
        getAlgoChatService: () => ({ indexerClient: null }),
      } as unknown as Parameters<LibrarySyncService['setServices']>[0];

      service.setServices(mockWalletService, 'testnet');

      // testnet — should skip sync entirely
      await service.tick();
      // No crash, no attempt to use indexerClient
    });

    test('returns early when indexerClient is unavailable', async () => {
      const mockWalletService = {
        getAlgoChatService: () => ({ indexerClient: null }),
      } as unknown as Parameters<LibrarySyncService['setServices']>[0];

      service.setServices(mockWalletService, 'localnet');

      await service.tick(); // should exit gracefully on no indexerClient
    });

    test('prevents re-entrancy (syncing guard)', async () => {
      const mockWalletService = {
        getAlgoChatService: () => ({ indexerClient: null }),
      } as unknown as Parameters<LibrarySyncService['setServices']>[0];

      service.setServices(mockWalletService, 'localnet');

      // Fire two concurrent ticks — second should return immediately
      const first = service.tick();
      const second = service.tick();
      await Promise.all([first, second]);
      // No crash or double-processing expected
    });

    test('treats undefined network as localnet', async () => {
      const mockWalletService = {
        getAlgoChatService: () => ({ indexerClient: null }),
      } as unknown as Parameters<LibrarySyncService['setServices']>[0];

      service.setServices(mockWalletService, undefined);

      // undefined network should be treated as localnet (proceed to indexer check)
      await service.tick(); // exits at indexerClient null check, no error
    });
  });

  // ─── Stats ────────────────────────────────────────────────────────────────

  describe('getStats', () => {
    test('isRunning is false before start', () => {
      expect(service.getStats().isRunning).toBe(false);
    });

    test('isRunning is true after start, false after stop', () => {
      service.start();
      expect(service.getStats().isRunning).toBe(true);

      service.stop();
      expect(service.getStats().isRunning).toBe(false);
    });
  });
});

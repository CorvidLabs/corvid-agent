/**
 * Tests for the on-chain FlockDirectory client and deploy helpers.
 *
 * These tests verify:
 * - OnChainFlockClient construction and type exports
 * - Tier constants
 * - App ID persistence (config table read/write)
 * - AlgoKit generated client structure (APP_SPEC, typed structs)
 */

import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, test } from 'bun:test';
import { runMigrations } from '../db/schema';
import {
  APP_SPEC,
  FlockDirectoryClient,
  FlockDirectoryFactory,
} from '../flock-directory/contract/FlockDirectoryClient.generated';
import { getPersistedAppId, setPersistedAppId } from '../flock-directory/deploy';
import {
  OnChainFlockClient,
  TIER_ESTABLISHED,
  TIER_NAMES,
  TIER_REGISTERED,
  TIER_TESTED,
  TIER_TRUSTED,
} from '../flock-directory/on-chain-client';

// ─── DB Setup ────────────────────────────────────────────────────────────────

let db: Database;

beforeEach(() => {
  db = new Database(':memory:');
  runMigrations(db);
});

// ─── Tier Constants ──────────────────────────────────────────────────────────

describe('tier constants', () => {
  test('tier values are correct', () => {
    expect(TIER_REGISTERED).toBe(1);
    expect(TIER_TESTED).toBe(2);
    expect(TIER_ESTABLISHED).toBe(3);
    expect(TIER_TRUSTED).toBe(4);
  });

  test('tier names map correctly', () => {
    expect(TIER_NAMES[TIER_REGISTERED]).toBe('Registered');
    expect(TIER_NAMES[TIER_TESTED]).toBe('Tested');
    expect(TIER_NAMES[TIER_ESTABLISHED]).toBe('Established');
    expect(TIER_NAMES[TIER_TRUSTED]).toBe('Trusted');
  });
});

// ─── App ID Persistence ─────────────────────────────────────────────────────

describe('app ID persistence', () => {
  test('returns 0 when no app ID is persisted', () => {
    expect(getPersistedAppId(db)).toBe(0);
  });

  test('persists and retrieves app ID', () => {
    setPersistedAppId(db, 12345);
    expect(getPersistedAppId(db)).toBe(12345);
  });

  test('overwrites previous app ID', () => {
    setPersistedAppId(db, 100);
    setPersistedAppId(db, 200);
    expect(getPersistedAppId(db)).toBe(200);
  });

  test('handles zero app ID', () => {
    setPersistedAppId(db, 0);
    expect(getPersistedAppId(db)).toBe(0);
  });
});

// ─── Client Construction ─────────────────────────────────────────────────────

describe('OnChainFlockClient', () => {
  test('constructs with config', () => {
    const mockAlgod = {} as import('algosdk').default.Algodv2;
    const client = new OnChainFlockClient({
      appId: 42,
      algodClient: mockAlgod,
    });
    expect(client.getAppId()).toBe(42);
  });

  test('constructs with custom wait rounds', () => {
    const mockAlgod = {} as import('algosdk').default.Algodv2;
    const client = new OnChainFlockClient({
      appId: 99,
      algodClient: mockAlgod,
      waitRounds: 10,
    });
    expect(client.getAppId()).toBe(99);
  });
});

// ─── AlgoKit Generated Client ────────────────────────────────────────────────

describe('AlgoKit generated client (APP_SPEC)', () => {
  test('APP_SPEC has correct contract name', () => {
    expect(APP_SPEC.name).toBe('FlockDirectory');
  });

  test('APP_SPEC has all expected ABI methods', () => {
    const methodNames = APP_SPEC.methods.map((m) => m.name);
    expect(methodNames).toContain('registerAgent');
    expect(methodNames).toContain('updateAgent');
    expect(methodNames).toContain('heartbeat');
    expect(methodNames).toContain('deregister');
    expect(methodNames).toContain('createChallenge');
    expect(methodNames).toContain('recordTestResult');
    expect(methodNames).toContain('getAgentInfo');
    expect(methodNames).toContain('getAgentTier');
    expect(methodNames).toContain('getAgentScore');
    expect(methodNames).toContain('createApplication');
  });

  test('APP_SPEC has 17 methods total', () => {
    expect(APP_SPEC.methods.length).toBe(17);
  });

  test('registerAgent method requires payment arg', () => {
    const registerMethod = APP_SPEC.methods.find((m) => m.name === 'registerAgent');
    expect(registerMethod).toBeTruthy();
    const payArg = registerMethod!.args.find((a) => a.type === 'pay');
    expect(payArg).toBeTruthy();
    expect(payArg!.name).toBe('payment');
  });

  test('getAgentInfo returns AgentRecord struct', () => {
    const method = APP_SPEC.methods.find((m) => m.name === 'getAgentInfo');
    expect(method).toBeTruthy();
    expect(method!.returns.type).toBe('(string,string,string,uint64,uint64,uint64,uint64,uint64,uint64,uint64)');
  });

  test('structs are defined with correct fields', () => {
    expect(APP_SPEC.structs).toBeTruthy();
    expect(APP_SPEC.structs.AgentRecord).toBeArray();
    expect(APP_SPEC.structs.AgentRecord.length).toBe(10);
    expect(APP_SPEC.structs.Challenge).toBeArray();
    expect(APP_SPEC.structs.TestResult).toBeArray();
  });

  test('byteCode is embedded in APP_SPEC', () => {
    expect(APP_SPEC.byteCode).toBeTruthy();
    expect(APP_SPEC.byteCode!.approval).toBeTruthy();
    expect(APP_SPEC.byteCode!.clear).toBeTruthy();
    // Approval program should be substantial
    expect(APP_SPEC.byteCode!.approval.length).toBeGreaterThan(100);
  });

  test('state schema is correct', () => {
    expect(APP_SPEC.state.schema.global.ints).toBe(4);
    expect(APP_SPEC.state.schema.global.bytes).toBe(1);
  });

  test('box maps are defined for agents, challenges, testResults', () => {
    const boxMaps = APP_SPEC.state.maps.box;
    expect(boxMaps.agents).toBeTruthy();
    expect(boxMaps.challenges).toBeTruthy();
    expect(boxMaps.testResults).toBeTruthy();
  });

  test('networks field exists (for future app ID storage)', () => {
    expect(APP_SPEC.networks).toBeDefined();
  });
});

describe('generated typed exports', () => {
  test('FlockDirectoryClient class is exported', () => {
    expect(FlockDirectoryClient).toBeDefined();
    expect(typeof FlockDirectoryClient).toBe('function');
  });

  test('FlockDirectoryFactory class is exported', () => {
    expect(FlockDirectoryFactory).toBeDefined();
    expect(typeof FlockDirectoryFactory).toBe('function');
  });
});

// ─── Migration ───────────────────────────────────────────────────────────────

describe('migration 079', () => {
  test('flock_directory_config table exists after migration', () => {
    const tables = db
      .query(`SELECT name FROM sqlite_master WHERE type='table' AND name='flock_directory_config'`)
      .all();
    expect(tables.length).toBe(1);
  });

  test('flock_directory_config table has correct columns', () => {
    const info = db.query(`PRAGMA table_info(flock_directory_config)`).all() as {
      name: string;
      type: string;
    }[];
    const columnNames = info.map((c) => c.name);
    expect(columnNames).toContain('key');
    expect(columnNames).toContain('value');
    expect(columnNames).toContain('updated_at');
  });
});

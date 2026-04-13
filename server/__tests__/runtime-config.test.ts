/**
 * Tests for runtime config — DB-backed settings that can be changed without
 * restarting the server.
 *
 * Validates get, set, batch update, delete, and table-missing graceful fallback.
 */

import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, test } from 'bun:test';
import {
  deleteRuntimeConfigKey,
  getRuntimeConfig,
  RUNTIME_CONFIG_KEYS,
  setRuntimeConfigKey,
  updateRuntimeConfigBatch,
} from '../db/runtime-config';
import { runMigrations } from '../db/schema';

let db: Database;

beforeEach(() => {
  db = new Database(':memory:');
  runMigrations(db);
});

// ─── getRuntimeConfig ─────────────────────────────────────────────────────

describe('getRuntimeConfig', () => {
  test('returns empty object when no rows exist', () => {
    const config = getRuntimeConfig(db);
    expect(config).toEqual({});
  });

  test('returns stored key-value pairs', () => {
    setRuntimeConfigKey(db, 'log_level', 'debug');
    setRuntimeConfigKey(db, 'ollama_host', 'http://remote:11434');
    const config = getRuntimeConfig(db);
    expect(config.log_level).toBe('debug');
    expect(config.ollama_host).toBe('http://remote:11434');
  });

  test('returns empty object when table does not exist', () => {
    db.exec('DROP TABLE IF EXISTS runtime_config');
    const config = getRuntimeConfig(db);
    expect(config).toEqual({});
  });
});

// ─── setRuntimeConfigKey ──────────────────────────────────────────────────

describe('setRuntimeConfigKey', () => {
  test('inserts a new config key', () => {
    setRuntimeConfigKey(db, 'log_level', 'warn');
    const config = getRuntimeConfig(db);
    expect(config.log_level).toBe('warn');
  });

  test('upserts an existing config key', () => {
    setRuntimeConfigKey(db, 'log_level', 'info');
    setRuntimeConfigKey(db, 'log_level', 'error');
    const config = getRuntimeConfig(db);
    expect(config.log_level).toBe('error');
  });
});

// ─── updateRuntimeConfigBatch ─────────────────────────────────────────────

describe('updateRuntimeConfigBatch', () => {
  test('inserts multiple keys in one call', () => {
    const count = updateRuntimeConfigBatch(db, {
      log_level: 'debug',
      work_max_iterations: '5',
      agent_timeout_ms: '60000',
    });
    expect(count).toBe(3);
    const config = getRuntimeConfig(db);
    expect(config.log_level).toBe('debug');
    expect(config.work_max_iterations).toBe('5');
    expect(config.agent_timeout_ms).toBe('60000');
  });

  test('returns 0 for empty updates', () => {
    const count = updateRuntimeConfigBatch(db, {});
    expect(count).toBe(0);
  });

  test('upserts existing keys', () => {
    setRuntimeConfigKey(db, 'log_level', 'info');
    updateRuntimeConfigBatch(db, { log_level: 'debug', ollama_host: 'http://new:11434' });
    const config = getRuntimeConfig(db);
    expect(config.log_level).toBe('debug');
    expect(config.ollama_host).toBe('http://new:11434');
  });
});

// ─── deleteRuntimeConfigKey ───────────────────────────────────────────────

describe('deleteRuntimeConfigKey', () => {
  test('deletes an existing key and returns true', () => {
    setRuntimeConfigKey(db, 'log_level', 'debug');
    const deleted = deleteRuntimeConfigKey(db, 'log_level');
    expect(deleted).toBe(true);
    const config = getRuntimeConfig(db);
    expect(config.log_level).toBeUndefined();
  });

  test('returns false when key does not exist', () => {
    const deleted = deleteRuntimeConfigKey(db, 'log_level');
    expect(deleted).toBe(false);
  });
});

// ─── RUNTIME_CONFIG_KEYS ─────────────────────────────────────────────────

describe('RUNTIME_CONFIG_KEYS', () => {
  test('contains expected keys', () => {
    expect(RUNTIME_CONFIG_KEYS).toContain('log_level');
    expect(RUNTIME_CONFIG_KEYS).toContain('work_max_iterations');
    expect(RUNTIME_CONFIG_KEYS).toContain('work_max_per_day');
    expect(RUNTIME_CONFIG_KEYS).toContain('agent_timeout_ms');
    expect(RUNTIME_CONFIG_KEYS).toContain('ollama_host');
    expect(RUNTIME_CONFIG_KEYS).toContain('brave_search_api_key');
  });
});

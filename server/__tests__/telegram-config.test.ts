/**
 * Tests for Telegram dynamic config — DB-backed CRUD operations.
 *
 * Validates get, getRaw, batch update, init from env,
 * and parsing edge cases.
 */

import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { runMigrations } from '../db/schema';
import {
  getTelegramConfig,
  getTelegramConfigRaw,
  initTelegramConfigFromEnv,
  updateTelegramConfigBatch,
  VALID_TELEGRAM_CONFIG_KEYS,
} from '../db/telegram-config';

let db: Database;

beforeEach(() => {
  db = new Database(':memory:');
  runMigrations(db);
});

// ─── getTelegramConfig ───────────────────────────────────────────────────────

describe('getTelegramConfig', () => {
  test('returns defaults when no config rows exist', () => {
    const config = getTelegramConfig(db);
    expect(config.mode).toBe('chat');
    expect(config.allowedUserIds).toEqual([]);
  });

  test('reads stored config values', () => {
    updateTelegramConfigBatch(db, { mode: 'work_intake' });
    const config = getTelegramConfig(db);
    expect(config.mode).toBe('work_intake');
  });

  test('parses comma-separated allowed user IDs', () => {
    updateTelegramConfigBatch(db, { allowed_user_ids: '111,222,333' });
    const config = getTelegramConfig(db);
    expect(config.allowedUserIds).toEqual(['111', '222', '333']);
  });

  test('handles whitespace in comma-separated values', () => {
    updateTelegramConfigBatch(db, { allowed_user_ids: ' user1 , user2 , user3 ' });
    const config = getTelegramConfig(db);
    expect(config.allowedUserIds).toEqual(['user1', 'user2', 'user3']);
  });

  test('returns defaults if table does not exist', () => {
    const emptyDb = new Database(':memory:');
    const config = getTelegramConfig(emptyDb);
    expect(config.mode).toBe('chat');
    expect(config.allowedUserIds).toEqual([]);
  });
});

// ─── getTelegramConfigRaw ────────────────────────────────────────────────────

describe('getTelegramConfigRaw', () => {
  test('returns empty object when no config', () => {
    expect(getTelegramConfigRaw(db)).toEqual({});
  });

  test('returns raw key-value pairs', () => {
    updateTelegramConfigBatch(db, { mode: 'work_intake', allowed_user_ids: '123' });
    const raw = getTelegramConfigRaw(db);
    expect(raw.mode).toBe('work_intake');
    expect(raw.allowed_user_ids).toBe('123');
  });

  test('returns empty object if table does not exist', () => {
    const emptyDb = new Database(':memory:');
    expect(getTelegramConfigRaw(emptyDb)).toEqual({});
  });
});

// ─── updateTelegramConfigBatch ───────────────────────────────────────────────

describe('updateTelegramConfigBatch', () => {
  test('updates multiple keys atomically', () => {
    const count = updateTelegramConfigBatch(db, {
      mode: 'work_intake',
      allowed_user_ids: '111,222',
    });
    expect(count).toBe(2);

    const config = getTelegramConfig(db);
    expect(config.mode).toBe('work_intake');
    expect(config.allowedUserIds).toEqual(['111', '222']);
  });

  test('returns 0 for empty batch', () => {
    expect(updateTelegramConfigBatch(db, {})).toBe(0);
  });

  test('upserts existing keys', () => {
    updateTelegramConfigBatch(db, { mode: 'chat' });
    updateTelegramConfigBatch(db, { mode: 'work_intake' });
    const config = getTelegramConfig(db);
    expect(config.mode).toBe('work_intake');
  });
});

// ─── initTelegramConfigFromEnv ───────────────────────────────────────────────

describe('initTelegramConfigFromEnv', () => {
  const envKeys = ['TELEGRAM_ALLOWED_USER_IDS', 'TELEGRAM_BRIDGE_MODE'];

  afterEach(() => {
    for (const key of envKeys) {
      delete process.env[key];
    }
  });

  test('seeds config from env vars', () => {
    process.env.TELEGRAM_BRIDGE_MODE = 'work_intake';
    process.env.TELEGRAM_ALLOWED_USER_IDS = '111,222';
    initTelegramConfigFromEnv(db);

    const config = getTelegramConfig(db);
    expect(config.mode).toBe('work_intake');
    expect(config.allowedUserIds).toEqual(['111', '222']);
  });

  test('does not overwrite existing config values', () => {
    updateTelegramConfigBatch(db, { mode: 'chat' });
    process.env.TELEGRAM_BRIDGE_MODE = 'work_intake';
    initTelegramConfigFromEnv(db);

    const config = getTelegramConfig(db);
    expect(config.mode).toBe('chat'); // NOT overwritten
  });

  test('ignores empty env values', () => {
    process.env.TELEGRAM_BRIDGE_MODE = '';
    initTelegramConfigFromEnv(db);

    const raw = getTelegramConfigRaw(db);
    expect(raw.mode).toBeUndefined();
  });

  test('handles missing table gracefully', () => {
    const emptyDb = new Database(':memory:');
    process.env.TELEGRAM_BRIDGE_MODE = 'work_intake';
    // Should not throw
    initTelegramConfigFromEnv(emptyDb);
  });
});

// ─── VALID_TELEGRAM_CONFIG_KEYS ──────────────────────────────────────────────

describe('VALID_TELEGRAM_CONFIG_KEYS', () => {
  test('contains expected keys', () => {
    expect(VALID_TELEGRAM_CONFIG_KEYS.has('allowed_user_ids')).toBe(true);
    expect(VALID_TELEGRAM_CONFIG_KEYS.has('mode')).toBe(true);
  });

  test('does not contain invalid keys', () => {
    expect(VALID_TELEGRAM_CONFIG_KEYS.has('bot_token')).toBe(false);
    expect(VALID_TELEGRAM_CONFIG_KEYS.has('chat_id')).toBe(false);
  });
});

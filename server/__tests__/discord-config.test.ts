/**
 * Tests for Discord dynamic config — DB-backed CRUD operations.
 *
 * Validates get, update, batch update, delete, init from env,
 * and parsing edge cases.
 */

import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  deleteDiscordConfigKey,
  getDiscordConfig,
  getDiscordConfigRaw,
  initDiscordConfigFromEnv,
  updateDiscordConfig,
  updateDiscordConfigBatch,
  VALID_DISCORD_CONFIG_KEYS,
} from '../db/discord-config';
import { runMigrations } from '../db/schema';

let db: Database;

beforeEach(() => {
  db = new Database(':memory:');
  runMigrations(db);
});

// ─── getDiscordConfig ───────────────────────────────────────────────────────

describe('getDiscordConfig', () => {
  test('returns defaults when no config rows exist', () => {
    const config = getDiscordConfig(db);
    expect(config.mode).toBe('chat');
    expect(config.publicMode).toBe(false);
    expect(config.defaultAgentId).toBeNull();
    expect(config.additionalChannelIds).toEqual([]);
    expect(config.allowedUserIds).toEqual([]);
    expect(config.statusText).toBe('corvid-agent');
    expect(config.activityType).toBe(3);
    expect(config.defaultPermissionLevel).toBe(1);
    expect(config.rolePermissions).toEqual({});
    expect(config.rateLimitByLevel).toEqual({});
    expect(config.interactedUsers).toEqual([]);
  });

  test('reads stored config values', () => {
    updateDiscordConfig(db, 'mode', 'work_intake');
    updateDiscordConfig(db, 'public_mode', 'true');
    updateDiscordConfig(db, 'default_agent_id', 'agent-xyz');

    const config = getDiscordConfig(db);
    expect(config.mode).toBe('work_intake');
    expect(config.publicMode).toBe(true);
    expect(config.defaultAgentId).toBe('agent-xyz');
  });

  test('parses comma-separated channel IDs', () => {
    updateDiscordConfig(db, 'additional_channel_ids', '111,222,333');
    const config = getDiscordConfig(db);
    expect(config.additionalChannelIds).toEqual(['111', '222', '333']);
  });

  test('handles whitespace in comma-separated values', () => {
    updateDiscordConfig(db, 'allowed_user_ids', ' user1 , user2 , user3 ');
    const config = getDiscordConfig(db);
    expect(config.allowedUserIds).toEqual(['user1', 'user2', 'user3']);
  });

  test('parses JSON role permissions', () => {
    updateDiscordConfig(db, 'role_permissions', '{"admin": 10, "mod": 5}');
    const config = getDiscordConfig(db);
    expect(config.rolePermissions).toEqual({ admin: 10, mod: 5 });
  });

  test('handles invalid JSON gracefully — returns default', () => {
    updateDiscordConfig(db, 'role_permissions', 'not json');
    const config = getDiscordConfig(db);
    expect(config.rolePermissions).toEqual({});
  });

  test('returns defaults if table does not exist', () => {
    const emptyDb = new Database(':memory:');
    const config = getDiscordConfig(emptyDb);
    expect(config.mode).toBe('chat');
  });
});

// ─── getDiscordConfigRaw ────────────────────────────────────────────────────

describe('getDiscordConfigRaw', () => {
  test('returns empty object when no config', () => {
    expect(getDiscordConfigRaw(db)).toEqual({});
  });

  test('returns raw key-value pairs', () => {
    updateDiscordConfig(db, 'mode', 'work_intake');
    updateDiscordConfig(db, 'public_mode', 'true');
    const raw = getDiscordConfigRaw(db);
    expect(raw.mode).toBe('work_intake');
    expect(raw.public_mode).toBe('true');
  });
});

// ─── updateDiscordConfig ────────────────────────────────────────────────────

describe('updateDiscordConfig', () => {
  test('inserts a new key', () => {
    updateDiscordConfig(db, 'status_text', 'online');
    const raw = getDiscordConfigRaw(db);
    expect(raw.status_text).toBe('online');
  });

  test('upserts existing key', () => {
    updateDiscordConfig(db, 'status_text', 'online');
    updateDiscordConfig(db, 'status_text', 'busy');
    const raw = getDiscordConfigRaw(db);
    expect(raw.status_text).toBe('busy');
  });
});

// ─── updateDiscordConfigBatch ───────────────────────────────────────────────

describe('updateDiscordConfigBatch', () => {
  test('updates multiple keys atomically', () => {
    const count = updateDiscordConfigBatch(db, {
      mode: 'work_intake',
      public_mode: 'true',
      status_text: 'testing',
    });
    expect(count).toBe(3);

    const config = getDiscordConfig(db);
    expect(config.mode).toBe('work_intake');
    expect(config.publicMode).toBe(true);
    expect(config.statusText).toBe('testing');
  });

  test('returns 0 for empty batch', () => {
    expect(updateDiscordConfigBatch(db, {})).toBe(0);
  });
});

// ─── deleteDiscordConfigKey ─────────────────────────────────────────────────

describe('deleteDiscordConfigKey', () => {
  test('deletes existing key and returns true', () => {
    updateDiscordConfig(db, 'mode', 'work_intake');
    expect(deleteDiscordConfigKey(db, 'mode')).toBe(true);
    const raw = getDiscordConfigRaw(db);
    expect(raw.mode).toBeUndefined();
  });

  test('returns false for non-existent key', () => {
    expect(deleteDiscordConfigKey(db, 'nonexistent')).toBe(false);
  });

  test('config falls back to default after key deletion', () => {
    updateDiscordConfig(db, 'mode', 'work_intake');
    deleteDiscordConfigKey(db, 'mode');
    const config = getDiscordConfig(db);
    expect(config.mode).toBe('chat'); // default
  });
});

// ─── initDiscordConfigFromEnv ───────────────────────────────────────────────

describe('initDiscordConfigFromEnv', () => {
  const envKeys = [
    'DISCORD_ADDITIONAL_CHANNEL_IDS',
    'DISCORD_ALLOWED_USER_IDS',
    'DISCORD_BRIDGE_MODE',
    'DISCORD_DEFAULT_AGENT_ID',
    'DISCORD_PUBLIC_MODE',
    'DISCORD_ROLE_PERMISSIONS',
    'DISCORD_DEFAULT_PERMISSION_LEVEL',
    'DISCORD_RATE_LIMIT_BY_LEVEL',
    'DISCORD_STATUS',
    'DISCORD_ACTIVITY_TYPE',
  ];

  afterEach(() => {
    for (const key of envKeys) {
      delete process.env[key];
    }
  });

  test('seeds config from env vars', () => {
    process.env.DISCORD_BRIDGE_MODE = 'work_intake';
    process.env.DISCORD_STATUS = 'seeded';
    initDiscordConfigFromEnv(db);

    const config = getDiscordConfig(db);
    expect(config.mode).toBe('work_intake');
    expect(config.statusText).toBe('seeded');
  });

  test('does not overwrite existing config values', () => {
    updateDiscordConfig(db, 'mode', 'chat');
    process.env.DISCORD_BRIDGE_MODE = 'work_intake';
    initDiscordConfigFromEnv(db);

    const config = getDiscordConfig(db);
    expect(config.mode).toBe('chat'); // NOT overwritten
  });

  test('ignores empty env values', () => {
    process.env.DISCORD_STATUS = '';
    initDiscordConfigFromEnv(db);

    const raw = getDiscordConfigRaw(db);
    expect(raw.status_text).toBeUndefined();
  });
});

// ─── VALID_DISCORD_CONFIG_KEYS ──────────────────────────────────────────────

describe('VALID_DISCORD_CONFIG_KEYS', () => {
  test('contains expected keys', () => {
    expect(VALID_DISCORD_CONFIG_KEYS.has('mode')).toBe(true);
    expect(VALID_DISCORD_CONFIG_KEYS.has('public_mode')).toBe(true);
    expect(VALID_DISCORD_CONFIG_KEYS.has('status_text')).toBe(true);
  });

  test('does not contain internal keys', () => {
    expect(VALID_DISCORD_CONFIG_KEYS.has('interacted_users')).toBe(false);
  });
});

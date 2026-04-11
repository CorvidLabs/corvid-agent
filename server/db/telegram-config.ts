/**
 * Telegram runtime configuration — DB-backed settings that can be
 * changed without restarting the server.
 *
 * Static settings (bot token, chat ID) remain environment-only.
 * Dynamic settings (allowed users, mode) live here.
 */
import type { Database } from 'bun:sqlite';
import { createLogger } from '../lib/logger';
import { writeTransaction } from './pool';

const log = createLogger('TelegramConfig');

// ─── Types ────────────────────────────────────────────────────────────────

export interface TelegramDynamicConfig {
  /** Allowed Telegram user IDs (empty = allow all) */
  allowedUserIds: string[];
  /** Bridge mode: 'chat' | 'work_intake' */
  mode: 'chat' | 'work_intake';
}

// ─── Config helpers ───────────────────────────────────────────────────────

const DEFAULTS: TelegramDynamicConfig = {
  allowedUserIds: [],
  mode: 'chat',
};

function parseCommaSeparated(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getTelegramConfig(db: Database): TelegramDynamicConfig {
  let rows: { key: string; value: string }[];
  try {
    rows = db.query('SELECT key, value FROM telegram_config').all() as { key: string; value: string }[];
  } catch {
    // Table may not exist yet if migrations haven't run
    return { ...DEFAULTS };
  }
  const map = new Map(rows.map((r) => [r.key, r.value]));

  return {
    allowedUserIds: parseCommaSeparated(map.get('allowed_user_ids')),
    mode: (map.get('mode') as 'chat' | 'work_intake') || DEFAULTS.mode,
  };
}

export function getTelegramConfigRaw(db: Database): Record<string, string> {
  let rows: { key: string; value: string }[];
  try {
    rows = db.query('SELECT key, value FROM telegram_config').all() as { key: string; value: string }[];
  } catch {
    return {};
  }
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

export function updateTelegramConfigBatch(db: Database, updates: Record<string, string>): number {
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO telegram_config (key, value, updated_at) VALUES (?, ?, datetime('now'))`,
  );
  let count = 0;
  writeTransaction(db, (_db) => {
    for (const [key, value] of Object.entries(updates)) {
      stmt.run(key, value);
      count++;
    }
  });
  log.info('Telegram config batch updated', { count });
  return count;
}

/** Valid config keys that can be set via the API */
export const VALID_TELEGRAM_CONFIG_KEYS = new Set(['allowed_user_ids', 'mode']);

/**
 * Initialize telegram_config from environment variables.
 * Only sets values that don't already exist in the DB (preserves runtime changes).
 */
export function initTelegramConfigFromEnv(db: Database): void {
  const envMappings: [string, string][] = [
    ['TELEGRAM_ALLOWED_USER_IDS', 'allowed_user_ids'],
    ['TELEGRAM_BRIDGE_MODE', 'mode'],
  ];

  const stmt = db.prepare(
    `INSERT OR IGNORE INTO telegram_config (key, value, updated_at) VALUES (?, ?, datetime('now'))`,
  );

  let seeded = 0;
  try {
    writeTransaction(db, (_db) => {
      for (const [envKey, dbKey] of envMappings) {
        const value = process.env[envKey];
        if (value !== undefined && value !== '') {
          const result = stmt.run(dbKey, value);
          if (result.changes > 0) seeded++;
        }
      }
    });
  } catch {
    // Table may not exist yet if migration 119 hasn't been applied
    return;
  }

  if (seeded > 0) {
    log.info('Telegram config seeded from environment', { count: seeded });
  }
}

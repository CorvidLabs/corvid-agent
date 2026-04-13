/**
 * Runtime configuration — DB-backed settings that can be changed without
 * restarting the server.
 *
 * Covers work limits, log level, agent timeout, and external host overrides.
 * Static settings (bind host, DB path) remain environment-only.
 */
import type { Database } from 'bun:sqlite';
import { createLogger } from '../lib/logger';
import { writeTransaction } from './pool';

const log = createLogger('RuntimeConfig');

// ─── Types ────────────────────────────────────────────────────────────────

/** Keys that can be updated at runtime without restart */
export const RUNTIME_CONFIG_KEYS = [
  'log_level',
  'work_max_iterations',
  'work_max_per_day',
  'agent_timeout_ms',
  'ollama_host',
  'brave_search_api_key',
] as const;

export type RuntimeConfigKey = (typeof RUNTIME_CONFIG_KEYS)[number];

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Returns all runtime_config rows as a plain key→value map. */
export function getRuntimeConfig(db: Database): Record<string, string> {
  let rows: { key: string; value: string }[];
  try {
    rows = db.query('SELECT key, value FROM runtime_config').all() as { key: string; value: string }[];
  } catch {
    // Table may not exist yet if migration 120 hasn't been applied
    return {};
  }
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

/** Update a single runtime config key. */
export function setRuntimeConfigKey(db: Database, key: RuntimeConfigKey, value: string): void {
  db.prepare(`INSERT OR REPLACE INTO runtime_config (key, value, updated_at) VALUES (?, ?, datetime('now'))`).run(
    key,
    value,
  );
  log.info('Runtime config key updated', { key });
}

/** Update multiple keys in one transaction. Returns the number of keys written. */
export function updateRuntimeConfigBatch(db: Database, updates: Record<string, string>): number {
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO runtime_config (key, value, updated_at) VALUES (?, ?, datetime('now'))`,
  );
  let count = 0;
  writeTransaction(db, (_db) => {
    for (const [key, value] of Object.entries(updates)) {
      stmt.run(key, value);
      count++;
    }
  });
  log.info('Runtime config batch updated', { count });
  return count;
}

/** Delete a runtime config key (reverts to env/default). */
export function deleteRuntimeConfigKey(db: Database, key: RuntimeConfigKey): boolean {
  const result = db.prepare('DELETE FROM runtime_config WHERE key = ?').run(key);
  return result.changes > 0;
}

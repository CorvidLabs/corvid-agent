/**
 * Retention policies for append-only tables.
 *
 * Periodically prunes old records to prevent unbounded growth in SQLite.
 * Follows the same pattern as health-snapshots.ts pruneHealthSnapshots().
 *
 * Wiring: Call `runRetentionCleanup(db)` at startup and on a daily interval
 * from server/index.ts.
 */

import type { Database } from 'bun:sqlite';
import { createLogger } from '../lib/logger';

const log = createLogger('Retention');

/** Allowlist pattern for valid SQL identifiers (table/column names). */
const SAFE_SQL_IDENTIFIER = /^[a-z_][a-z0-9_]*$/i;

/** Retention policy for a single table. */
interface RetentionPolicy {
  table: string;
  /** Column containing the timestamp (ISO 8601 or datetime('now') format). */
  timestampColumn: string;
  /** Number of days to retain records. */
  retentionDays: number;
}

/**
 * Default retention policies for append-only tables.
 * These can be overridden via environment variables if needed.
 */
const RETENTION_POLICIES: RetentionPolicy[] = [
  { table: 'daily_spending', timestampColumn: 'date', retentionDays: 90 },
  { table: 'agent_daily_spending', timestampColumn: 'date', retentionDays: 90 },
  { table: 'credit_transactions', timestampColumn: 'created_at', retentionDays: 365 },
  { table: 'audit_log', timestampColumn: 'timestamp', retentionDays: 180 },
  { table: 'reputation_events', timestampColumn: 'created_at', retentionDays: 180 },
];

/**
 * Prune records older than the retention period for a single table.
 * Returns the number of deleted rows.
 */
export function pruneTable(db: Database, policy: RetentionPolicy): number {
  if (!SAFE_SQL_IDENTIFIER.test(policy.table)) {
    throw new Error(`pruneTable: invalid table name '${policy.table}'`);
  }
  if (!SAFE_SQL_IDENTIFIER.test(policy.timestampColumn)) {
    throw new Error(`pruneTable: invalid column name '${policy.timestampColumn}'`);
  }
  const cutoff = new Date(Date.now() - policy.retentionDays * 24 * 60 * 60 * 1000);
  // daily_spending and agent_daily_spending use date-only format (YYYY-MM-DD)
  const cutoffStr = policy.timestampColumn === 'date' ? cutoff.toISOString().split('T')[0] : cutoff.toISOString();

  const result = db.query(`DELETE FROM ${policy.table} WHERE ${policy.timestampColumn} < ?`).run(cutoffStr);
  return result.changes;
}

/**
 * Run retention cleanup across all configured tables.
 * Safe to call on startup and on a daily schedule.
 */
export function runRetentionCleanup(db: Database): void {
  let totalDeleted = 0;

  for (const policy of RETENTION_POLICIES) {
    try {
      const deleted = pruneTable(db, policy);
      if (deleted > 0) {
        log.info('Retention cleanup', {
          table: policy.table,
          deleted,
          retentionDays: policy.retentionDays,
        });
        totalDeleted += deleted;
      }
    } catch (err) {
      // Table may not exist yet (migration not applied) — skip gracefully
      log.debug('Retention cleanup skipped', {
        table: policy.table,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (totalDeleted > 0) {
    log.info('Retention cleanup complete', { totalDeleted });
  }
}

/** Exported for testing. */
export { RETENTION_POLICIES };

import type { Database } from 'bun:sqlite';

/**
 * Migration 087: Create session_metrics table for tool-chain analytics.
 *
 * Stores structured metrics collected during direct-process execution,
 * enabling observability into session quality, model performance, and
 * stall patterns. See #1022.
 */

export function up(db: Database): void {
  db.exec(`
        CREATE TABLE IF NOT EXISTS session_metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
            model TEXT NOT NULL DEFAULT '',
            tier TEXT NOT NULL DEFAULT '',
            total_iterations INTEGER NOT NULL DEFAULT 0,
            tool_call_count INTEGER NOT NULL DEFAULT 0,
            max_chain_depth INTEGER NOT NULL DEFAULT 0,
            nudge_count INTEGER NOT NULL DEFAULT 0,
            mid_chain_nudge_count INTEGER NOT NULL DEFAULT 0,
            exploration_drift_count INTEGER NOT NULL DEFAULT 0,
            stall_detected INTEGER NOT NULL DEFAULT 0,
            stall_type TEXT DEFAULT NULL,
            termination_reason TEXT NOT NULL DEFAULT 'normal',
            duration_ms INTEGER NOT NULL DEFAULT 0,
            needs_summary INTEGER NOT NULL DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        )
    `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_session_metrics_session ON session_metrics(session_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_session_metrics_model ON session_metrics(model)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_session_metrics_created ON session_metrics(created_at)`);
}

export function down(db: Database): void {
  db.exec(`DROP TABLE IF EXISTS session_metrics`);
}

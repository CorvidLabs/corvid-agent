import type { Database } from 'bun:sqlite';

/**
 * Migration 105: Add restart_pending flag to sessions.
 *
 * When the server shuts down or restarts, active sessions are force-stopped.
 * Previously these were just marked 'stopped' and forgotten. This flag lets
 * us distinguish "stopped by user" from "stopped by server restart" so the
 * server can automatically resume interrupted sessions on next startup.
 */

function hasColumn(db: Database, table: string, column: string): boolean {
  const cols = db.query(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some((c) => c.name === column);
}

export function up(db: Database): void {
  if (!hasColumn(db, 'sessions', 'restart_pending')) {
    db.exec(`ALTER TABLE sessions ADD COLUMN restart_pending INTEGER NOT NULL DEFAULT 0`);
  }
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_sessions_restart_pending ON sessions(restart_pending) WHERE restart_pending = 1`,
  );
}

export function down(db: Database): void {
  db.exec(`DROP INDEX IF EXISTS idx_sessions_restart_pending`);
  // SQLite doesn't support DROP COLUMN before 3.35.0; Bun ships ≥3.38
  db.exec(`ALTER TABLE sessions DROP COLUMN restart_pending`);
}

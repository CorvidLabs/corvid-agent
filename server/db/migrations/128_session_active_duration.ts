import type { Database } from 'bun:sqlite';

export function up(db: Database): void {
  const columns = db.query('PRAGMA table_info(sessions)').all() as { name: string }[];
  if (!columns.find((c) => c.name === 'active_duration_ms')) {
    db.exec('ALTER TABLE sessions ADD COLUMN active_duration_ms INTEGER NOT NULL DEFAULT 0');
  }
  if (!columns.find((c) => c.name === 'duration_checkpoint')) {
    db.exec('ALTER TABLE sessions ADD COLUMN duration_checkpoint INTEGER');
  }
}

export function down(_db: Database): void {
  // SQLite does not support DROP COLUMN in older versions; no-op rollback
}

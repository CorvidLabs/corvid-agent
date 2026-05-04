import type { Database } from 'bun:sqlite';

export function up(db: Database): void {
  const columns = db.query('PRAGMA table_info(sessions)').all() as { name: string }[];
  if (!columns.find((c) => c.name === 'keep_alive')) {
    db.exec(`ALTER TABLE sessions ADD COLUMN keep_alive INTEGER NOT NULL DEFAULT 0`);
  }
}

export function down(_db: Database): void {
  // SQLite does not support DROP COLUMN in older versions; no-op rollback
}

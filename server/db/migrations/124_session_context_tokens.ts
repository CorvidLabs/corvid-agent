import type { Database } from 'bun:sqlite';

export function up(db: Database): void {
  const columns = db.query('PRAGMA table_info(sessions)').all() as { name: string }[];
  if (!columns.find((c) => c.name === 'last_context_tokens')) {
    db.exec(`ALTER TABLE sessions ADD COLUMN last_context_tokens INTEGER`);
  }
  if (!columns.find((c) => c.name === 'last_context_window')) {
    db.exec(`ALTER TABLE sessions ADD COLUMN last_context_window INTEGER`);
  }
}

export function down(_db: Database): void {
  // SQLite does not support DROP COLUMN in older versions; no-op rollback
}

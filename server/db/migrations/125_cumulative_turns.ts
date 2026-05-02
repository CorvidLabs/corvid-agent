import type { Database } from 'bun:sqlite';

export function up(db: Database): void {
  const columns = db.query('PRAGMA table_info(sessions)').all() as { name: string }[];
  if (!columns.find((c) => c.name === 'cumulative_turns')) {
    db.exec(`ALTER TABLE sessions ADD COLUMN cumulative_turns INTEGER DEFAULT 0`);
    db.exec(`UPDATE sessions SET cumulative_turns = total_turns`);
  }
}

export function down(_db: Database): void {
  // SQLite does not support DROP COLUMN in older versions; no-op rollback
}

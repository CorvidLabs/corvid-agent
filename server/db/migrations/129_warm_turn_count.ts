import type { Database } from 'bun:sqlite';

export function up(db: Database): void {
  const columns = db.query("PRAGMA table_info('sessions')").all() as { name: string }[];
  if (!columns.find((c) => c.name === 'warm_turn_count')) {
    db.exec(`ALTER TABLE sessions ADD COLUMN warm_turn_count INTEGER NOT NULL DEFAULT 0`);
  }
}

export function down(db: Database): void {
  // SQLite does not support DROP COLUMN in older versions;
  // warm_turn_count is additive-only — just leave it in place on rollback.
  void db;
}

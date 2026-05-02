import type { Database } from 'bun:sqlite';

export function up(db: Database): void {
  const columns = db.query('PRAGMA table_info(councils)').all() as { name: string }[];
  if (!columns.find((c) => c.name === 'min_trust_level')) {
    db.exec(`ALTER TABLE councils ADD COLUMN min_trust_level TEXT`);
  }
}

export function down(_db: Database): void {
  // SQLite does not support DROP COLUMN in older versions; no-op rollback
}

import type { Database } from 'bun:sqlite';

export function up(db: Database): void {
  db.exec(`
        CREATE TABLE IF NOT EXISTS flock_directory_config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    `);
}

export function down(db: Database): void {
  db.exec('DROP TABLE IF EXISTS flock_directory_config');
}

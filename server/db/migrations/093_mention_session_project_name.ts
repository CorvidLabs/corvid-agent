import type { Database } from 'bun:sqlite';

/**
 * Migration 093: Add project_name column to discord_mention_sessions.
 *
 * Stores the project name in mention session mappings so Discord embed
 * footers can show which project context the session is running in.
 */

function columnExists(db: Database, table: string, column: string): boolean {
  const cols = db.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return cols.some((c) => c.name === column);
}

export function up(db: Database): void {
  if (!columnExists(db, 'discord_mention_sessions', 'project_name')) {
    db.exec(`ALTER TABLE discord_mention_sessions ADD COLUMN project_name TEXT`);
  }
}

export function down(db: Database): void {
  db.exec(`ALTER TABLE discord_mention_sessions DROP COLUMN project_name`);
}

import type { Database } from 'bun:sqlite';

/**
 * Migration 096: Add channel_id column to discord_mention_sessions.
 *
 * Stores the Discord channel ID so the agent always knows which channel
 * a mention-reply session originated from (e.g. for sending images back).
 */

function columnExists(db: Database, table: string, column: string): boolean {
  const cols = db.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return cols.some((c) => c.name === column);
}

export function up(db: Database): void {
  if (!columnExists(db, 'discord_mention_sessions', 'channel_id')) {
    db.exec(`ALTER TABLE discord_mention_sessions ADD COLUMN channel_id TEXT`);
  }
}

export function down(db: Database): void {
  db.exec(`ALTER TABLE discord_mention_sessions DROP COLUMN channel_id`);
}

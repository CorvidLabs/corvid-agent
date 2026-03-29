import type { Database } from 'bun:sqlite';

/**
 * Migration 109: Persist processed Discord message IDs across restarts.
 *
 * The in-memory dedup Set is lost on server restart, allowing gateway
 * reconnect to re-deliver messages that were already processed.
 * This table provides durable dedup that survives restarts.
 */

export function up(db: Database): void {
  db.exec(`
        CREATE TABLE IF NOT EXISTS discord_processed_messages (
            message_id  TEXT PRIMARY KEY,
            channel_id  TEXT NOT NULL,
            created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        )
    `);
  db.exec(`
        CREATE INDEX IF NOT EXISTS idx_discord_processed_messages_created
            ON discord_processed_messages(created_at)
    `);
}

export function down(db: Database): void {
  db.exec('DROP TABLE IF EXISTS discord_processed_messages');
}

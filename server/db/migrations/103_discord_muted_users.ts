import type { Database } from 'bun:sqlite';

/**
 * Migration 103: Persist Discord muted users across restarts.
 *
 * Creates a table to store muted Discord user IDs so mutes
 * survive server restarts instead of being lost from in-memory Set.
 */

export function up(db: Database): void {
  db.exec(`
        CREATE TABLE IF NOT EXISTS discord_muted_users (
            user_id    TEXT PRIMARY KEY,
            muted_by   TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    `);
}

export function down(db: Database): void {
  db.exec('DROP TABLE IF EXISTS discord_muted_users');
}

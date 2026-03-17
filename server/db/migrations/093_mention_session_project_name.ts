import { Database } from 'bun:sqlite';

/**
 * Migration 093: Add project_name column to discord_mention_sessions.
 *
 * Stores the project name in mention session mappings so Discord embed
 * footers can show which project context the session is running in.
 */

export function up(db: Database): void {
    db.exec(`ALTER TABLE discord_mention_sessions ADD COLUMN project_name TEXT`);
}

export function down(db: Database): void {
    db.exec(`ALTER TABLE discord_mention_sessions DROP COLUMN project_name`);
}

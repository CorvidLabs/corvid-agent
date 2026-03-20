import { Database } from 'bun:sqlite';

/**
 * Migration 097: Add conversation_only column to discord_mention_sessions.
 *
 * Tracks whether a mention session was created via /message command
 * (conversation-only mode with no tools) so the flag persists across
 * server restarts and session resumes.
 */

function columnExists(db: Database, table: string, column: string): boolean {
    const cols = db.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    return cols.some((c) => c.name === column);
}

export function up(db: Database): void {
    if (!columnExists(db, 'discord_mention_sessions', 'conversation_only')) {
        db.exec(`ALTER TABLE discord_mention_sessions ADD COLUMN conversation_only INTEGER DEFAULT 0`);
    }
}

export function down(db: Database): void {
    db.exec(`ALTER TABLE discord_mention_sessions DROP COLUMN conversation_only`);
}

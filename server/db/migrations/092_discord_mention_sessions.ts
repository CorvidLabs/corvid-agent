import { Database } from 'bun:sqlite';

/**
 * Migration 092: Add discord_mention_sessions table.
 *
 * Persists mention-reply session mappings so they survive server restarts.
 * Maps bot message IDs to session info, enabling conversation continuity
 * when a user replies to a bot message after the server has restarted.
 */

export function up(db: Database): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS discord_mention_sessions (
            bot_message_id  TEXT PRIMARY KEY,
            session_id      TEXT NOT NULL,
            agent_name      TEXT NOT NULL,
            agent_model     TEXT NOT NULL,
            created_at      TEXT DEFAULT (datetime('now'))
        )
    `);

    db.exec(`CREATE INDEX IF NOT EXISTS idx_discord_mention_sessions_session ON discord_mention_sessions(session_id)`);
}

export function down(db: Database): void {
    db.exec(`DROP TABLE IF EXISTS discord_mention_sessions`);
}

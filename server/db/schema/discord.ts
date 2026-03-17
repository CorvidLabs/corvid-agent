/**
 * Schema definitions for the Discord domain.
 *
 * Tables: discord_config (v80), discord_mention_sessions (v92)
 */

export const tables: string[] = [];

export const indexes: string[] = [];

/** v80 — Discord bridge dynamic configuration */
export const migrationV80: string[] = [
    `CREATE TABLE IF NOT EXISTS discord_config (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
];

/** v92 — Persist Discord mention-reply session mappings across restarts */
export const migrationV92: string[] = [
    `CREATE TABLE IF NOT EXISTS discord_mention_sessions (
        bot_message_id  TEXT PRIMARY KEY,
        session_id      TEXT NOT NULL,
        agent_name      TEXT NOT NULL,
        agent_model     TEXT NOT NULL,
        created_at      TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_discord_mention_sessions_session ON discord_mention_sessions(session_id)`,
];

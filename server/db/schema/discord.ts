/** Discord bridge configuration and mention session tables. */

export const tables: string[] = [
    `CREATE TABLE IF NOT EXISTS discord_config (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS discord_mention_sessions (
        bot_message_id  TEXT PRIMARY KEY,
        session_id      TEXT NOT NULL,
        agent_name      TEXT NOT NULL,
        agent_model     TEXT NOT NULL,
        project_name    TEXT,
        channel_id      TEXT,
        created_at      TEXT DEFAULT (datetime('now'))
    )`,
];

export const indexes: string[] = [
    `CREATE INDEX IF NOT EXISTS idx_discord_mention_sessions_session ON discord_mention_sessions(session_id)`,
];

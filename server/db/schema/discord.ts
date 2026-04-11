/** Discord bridge configuration and mention session tables. */

export const tables: string[] = [
  `CREATE TABLE IF NOT EXISTS discord_config (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,

  `CREATE TABLE IF NOT EXISTS discord_muted_users (
        user_id    TEXT PRIMARY KEY,
        muted_by   TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,

  `CREATE TABLE IF NOT EXISTS discord_mention_sessions (
        bot_message_id  TEXT PRIMARY KEY,
        session_id      TEXT NOT NULL,
        agent_name      TEXT NOT NULL,
        agent_model     TEXT NOT NULL,
        project_name    TEXT,
        channel_id      TEXT,
        conversation_only INTEGER DEFAULT 0,
        created_at      TEXT DEFAULT (datetime('now'))
    )`,

  `CREATE TABLE IF NOT EXISTS discord_processed_messages (
        message_id  TEXT PRIMARY KEY,
        channel_id  TEXT NOT NULL,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )`,

  `CREATE TABLE IF NOT EXISTS discord_thread_sessions (
        thread_id          TEXT PRIMARY KEY,
        session_id         TEXT NOT NULL,
        agent_name         TEXT NOT NULL,
        agent_model        TEXT NOT NULL,
        owner_user_id      TEXT NOT NULL DEFAULT '',
        topic              TEXT,
        project_name       TEXT,
        display_color      TEXT,
        display_icon       TEXT,
        avatar_url         TEXT,
        creator_perm_level INTEGER,
        buddy_agent_id     TEXT,
        buddy_agent_name   TEXT,
        buddy_max_rounds   INTEGER,
        last_summary       TEXT,
        last_activity_at   TEXT NOT NULL DEFAULT (datetime('now')),
        created_at         TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
];

export const indexes: string[] = [
  `CREATE INDEX IF NOT EXISTS idx_discord_mention_sessions_session ON discord_mention_sessions(session_id)`,
  `CREATE INDEX IF NOT EXISTS idx_discord_processed_messages_created ON discord_processed_messages(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_discord_thread_sessions_session ON discord_thread_sessions(session_id)`,
  `CREATE INDEX IF NOT EXISTS idx_discord_thread_sessions_activity ON discord_thread_sessions(last_activity_at)`,
];

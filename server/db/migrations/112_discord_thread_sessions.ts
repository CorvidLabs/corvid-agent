import type { Database } from 'bun:sqlite';

export function up(db: Database): void {
    db.run(`CREATE TABLE IF NOT EXISTS discord_thread_sessions (
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
        last_activity_at   TEXT NOT NULL DEFAULT (datetime('now')),
        created_at         TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

    db.run(`CREATE INDEX IF NOT EXISTS idx_discord_thread_sessions_session ON discord_thread_sessions(session_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_discord_thread_sessions_activity ON discord_thread_sessions(last_activity_at)`);

    // Add last_activity_at to mention sessions for unified activity tracking
    const cols = db.query('PRAGMA table_info(discord_mention_sessions)').all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === 'last_activity_at')) {
        db.run(`ALTER TABLE discord_mention_sessions ADD COLUMN last_activity_at TEXT DEFAULT (datetime('now'))`);
    }
}

export function down(db: Database): void {
    db.run(`DROP TABLE IF EXISTS discord_thread_sessions`);
}

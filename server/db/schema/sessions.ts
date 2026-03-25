/** Sessions, session messages, and session metrics. */

export const tables: string[] = [
    `CREATE TABLE IF NOT EXISTS session_messages (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL REFERENCES sessions(id),
        role       TEXT NOT NULL,
        content    TEXT NOT NULL,
        cost_usd   REAL DEFAULT 0,
        tenant_id  TEXT NOT NULL DEFAULT 'default',
        timestamp  TEXT DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS session_metrics (
        id                      INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id              TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        model                   TEXT NOT NULL DEFAULT '',
        tier                    TEXT NOT NULL DEFAULT '',
        total_iterations        INTEGER NOT NULL DEFAULT 0,
        tool_call_count         INTEGER NOT NULL DEFAULT 0,
        max_chain_depth         INTEGER NOT NULL DEFAULT 0,
        nudge_count             INTEGER NOT NULL DEFAULT 0,
        mid_chain_nudge_count   INTEGER NOT NULL DEFAULT 0,
        exploration_drift_count INTEGER NOT NULL DEFAULT 0,
        stall_detected          INTEGER NOT NULL DEFAULT 0,
        stall_type              TEXT DEFAULT NULL,
        termination_reason      TEXT NOT NULL DEFAULT 'normal',
        duration_ms             INTEGER NOT NULL DEFAULT 0,
        needs_summary           INTEGER NOT NULL DEFAULT 0,
        created_at              TEXT DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS sessions (
        id                TEXT PRIMARY KEY,
        project_id        TEXT REFERENCES projects(id),
        agent_id          TEXT REFERENCES agents(id),
        name              TEXT DEFAULT '',
        status            TEXT DEFAULT 'idle',
        source            TEXT DEFAULT 'web',
        initial_prompt    TEXT DEFAULT '',
        pid               INTEGER DEFAULT NULL,
        total_cost_usd    REAL DEFAULT 0,
        total_algo_spent  REAL DEFAULT 0,
        total_turns       INTEGER DEFAULT 0,
        council_launch_id TEXT DEFAULT NULL,
        council_role      TEXT DEFAULT NULL,
        work_dir          TEXT DEFAULT NULL,
        credits_consumed  REAL DEFAULT 0,
        restart_pending   INTEGER NOT NULL DEFAULT 0,
        tenant_id         TEXT NOT NULL DEFAULT 'default',
        created_at        TEXT DEFAULT (datetime('now')),
        updated_at        TEXT DEFAULT (datetime('now'))
    )`,
];

export const indexes: string[] = [
    `CREATE INDEX IF NOT EXISTS idx_session_messages_session ON session_messages(session_id)`,
    `CREATE INDEX IF NOT EXISTS idx_session_messages_session_timestamp ON session_messages(session_id, timestamp ASC)`,
    `CREATE INDEX IF NOT EXISTS idx_session_messages_tenant ON session_messages(tenant_id)`,
    `CREATE INDEX IF NOT EXISTS idx_session_metrics_session ON session_metrics(session_id)`,
    `CREATE INDEX IF NOT EXISTS idx_session_metrics_model ON session_metrics(model)`,
    `CREATE INDEX IF NOT EXISTS idx_session_metrics_created ON session_metrics(created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_sessions_agent ON sessions(agent_id)`,
    `CREATE INDEX IF NOT EXISTS idx_sessions_council_launch ON sessions(council_launch_id)`,
    `CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id)`,
    `CREATE INDEX IF NOT EXISTS idx_sessions_tenant ON sessions(tenant_id)`,
];

/** Buddy mode tables + indexes. */

export const tables: string[] = [
  `CREATE TABLE IF NOT EXISTS buddy_pairings (
        id              TEXT PRIMARY KEY,
        agent_id        TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        buddy_agent_id  TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        enabled         INTEGER NOT NULL DEFAULT 1,
        max_rounds      INTEGER NOT NULL DEFAULT 5,
        buddy_role      TEXT NOT NULL DEFAULT 'reviewer',
        created_at      TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(agent_id, buddy_agent_id)
    )`,

  `CREATE TABLE IF NOT EXISTS buddy_sessions (
        id              TEXT PRIMARY KEY,
        work_task_id    TEXT REFERENCES work_tasks(id) ON DELETE SET NULL,
        session_id      TEXT REFERENCES sessions(id) ON DELETE SET NULL,
        lead_agent_id   TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        buddy_agent_id  TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        source          TEXT NOT NULL DEFAULT 'web',
        source_id       TEXT,
        prompt          TEXT NOT NULL,
        status          TEXT NOT NULL DEFAULT 'active',
        current_round   INTEGER NOT NULL DEFAULT 0,
        max_rounds      INTEGER NOT NULL DEFAULT 5,
        created_at      TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at    TEXT
    )`,

  `CREATE TABLE IF NOT EXISTS buddy_messages (
        id                TEXT PRIMARY KEY,
        buddy_session_id  TEXT NOT NULL REFERENCES buddy_sessions(id) ON DELETE CASCADE,
        agent_id          TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        round             INTEGER NOT NULL,
        role              TEXT NOT NULL,
        content           TEXT NOT NULL,
        created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
];

export const indexes: string[] = [
  `CREATE INDEX IF NOT EXISTS idx_buddy_pairings_agent ON buddy_pairings(agent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_buddy_pairings_buddy ON buddy_pairings(buddy_agent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_buddy_sessions_lead ON buddy_sessions(lead_agent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_buddy_sessions_buddy ON buddy_sessions(buddy_agent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_buddy_sessions_work_task ON buddy_sessions(work_task_id)`,
  `CREATE INDEX IF NOT EXISTS idx_buddy_sessions_status ON buddy_sessions(status)`,
  `CREATE INDEX IF NOT EXISTS idx_buddy_messages_session ON buddy_messages(buddy_session_id)`,
];

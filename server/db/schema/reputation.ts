/** Reputation scores, events, attestations, and response feedback. */

export const tables: string[] = [
  `CREATE TABLE IF NOT EXISTS agent_reputation (
        agent_id            TEXT PRIMARY KEY,
        overall_score       INTEGER DEFAULT 0,
        trust_level         TEXT DEFAULT 'untrusted',
        task_completion     INTEGER DEFAULT 0,
        peer_rating         INTEGER DEFAULT 0,
        credit_pattern      INTEGER DEFAULT 0,
        security_compliance INTEGER DEFAULT 0,
        activity_level      INTEGER DEFAULT 0,
        attestation_hash    TEXT DEFAULT NULL,
        tenant_id           TEXT NOT NULL DEFAULT 'default',
        computed_at         TEXT DEFAULT (datetime('now'))
    )`,

  `CREATE TABLE IF NOT EXISTS reputation_attestations (
        agent_id     TEXT NOT NULL,
        hash         TEXT NOT NULL,
        payload      TEXT NOT NULL,
        txid         TEXT DEFAULT NULL,
        published_at TEXT DEFAULT NULL,
        created_at   TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (agent_id, hash)
    )`,

  `CREATE TABLE IF NOT EXISTS reputation_events (
        id           TEXT PRIMARY KEY,
        agent_id     TEXT NOT NULL,
        event_type   TEXT NOT NULL,
        score_impact REAL DEFAULT 0,
        metadata     TEXT DEFAULT '{}',
        created_at   TEXT DEFAULT (datetime('now'))
    )`,

  `CREATE TABLE IF NOT EXISTS response_feedback (
        id              TEXT PRIMARY KEY,
        agent_id        TEXT NOT NULL,
        session_id      TEXT DEFAULT NULL,
        source          TEXT NOT NULL DEFAULT 'api',
        sentiment       TEXT NOT NULL,
        category        TEXT DEFAULT NULL,
        comment         TEXT DEFAULT NULL,
        submitted_by    TEXT DEFAULT NULL,
        created_at      TEXT DEFAULT (datetime('now'))
    )`,

  `CREATE TABLE IF NOT EXISTS agent_blocklist (
        agent_id    TEXT PRIMARY KEY,
        reason      TEXT NOT NULL DEFAULT 'manual',
        detail      TEXT DEFAULT '',
        blocked_by  TEXT DEFAULT 'system',
        created_at  TEXT DEFAULT (datetime('now'))
    )`,

  `CREATE TABLE IF NOT EXISTS reputation_history (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id            TEXT NOT NULL,
        overall_score       INTEGER NOT NULL,
        trust_level         TEXT NOT NULL,
        task_completion     INTEGER NOT NULL DEFAULT 0,
        peer_rating         INTEGER NOT NULL DEFAULT 0,
        credit_pattern      INTEGER NOT NULL DEFAULT 0,
        security_compliance INTEGER NOT NULL DEFAULT 0,
        activity_level      INTEGER NOT NULL DEFAULT 0,
        computed_at         TEXT NOT NULL DEFAULT (datetime('now'))
    )`,

  `CREATE TABLE IF NOT EXISTS activity_summaries (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        period       TEXT NOT NULL,
        period_start TEXT NOT NULL,
        period_end   TEXT NOT NULL,
        payload      TEXT NOT NULL,
        hash         TEXT NOT NULL,
        txid         TEXT,
        published_at TEXT,
        created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
];

export const indexes: string[] = [
  `CREATE INDEX IF NOT EXISTS idx_agent_reputation_tenant ON agent_reputation(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_reputation_events_agent ON reputation_events(agent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_reputation_events_type ON reputation_events(event_type)`,
  `CREATE INDEX IF NOT EXISTS idx_response_feedback_agent ON response_feedback(agent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_response_feedback_created ON response_feedback(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_blocklist_reason ON agent_blocklist(reason)`,
  `CREATE INDEX IF NOT EXISTS idx_reputation_history_agent ON reputation_history(agent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_reputation_history_computed ON reputation_history(computed_at)`,
  `CREATE INDEX IF NOT EXISTS idx_reputation_history_agent_time ON reputation_history(agent_id, computed_at)`,
  `CREATE INDEX IF NOT EXISTS idx_activity_summaries_period ON activity_summaries(period)`,
  `CREATE INDEX IF NOT EXISTS idx_activity_summaries_hash ON activity_summaries(hash)`,
];

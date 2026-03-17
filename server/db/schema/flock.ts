/** Flock Directory agents, config, and automated testing. */

export const tables: string[] = [
    `CREATE TABLE IF NOT EXISTS flock_agents (
        id                     TEXT PRIMARY KEY,
        address                TEXT NOT NULL UNIQUE,
        name                   TEXT NOT NULL,
        description            TEXT NOT NULL DEFAULT '',
        instance_url           TEXT,
        capabilities           TEXT NOT NULL DEFAULT '[]',
        status                 TEXT NOT NULL DEFAULT 'active',
        reputation_score       INTEGER NOT NULL DEFAULT 0,
        attestation_count      INTEGER NOT NULL DEFAULT 0,
        council_participations INTEGER NOT NULL DEFAULT 0,
        uptime_pct             REAL NOT NULL DEFAULT 0.0,
        last_heartbeat         TEXT,
        registered_at          TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS flock_directory_config (
        key         TEXT PRIMARY KEY,
        value       TEXT NOT NULL,
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS flock_test_results (
        id              TEXT PRIMARY KEY,
        agent_id        TEXT NOT NULL,
        overall_score   INTEGER NOT NULL DEFAULT 0,
        category_scores TEXT NOT NULL DEFAULT '{}',
        challenge_count INTEGER NOT NULL DEFAULT 0,
        responded_count INTEGER NOT NULL DEFAULT 0,
        duration_ms     INTEGER NOT NULL DEFAULT 0,
        started_at      TEXT NOT NULL,
        completed_at    TEXT NOT NULL,
        created_at      TEXT DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS flock_test_challenge_results (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        test_result_id   TEXT NOT NULL REFERENCES flock_test_results(id) ON DELETE CASCADE,
        challenge_id     TEXT NOT NULL,
        category         TEXT NOT NULL,
        score            INTEGER NOT NULL DEFAULT 0,
        responded        INTEGER NOT NULL DEFAULT 0,
        response_time_ms INTEGER DEFAULT NULL,
        response         TEXT DEFAULT NULL,
        reason           TEXT DEFAULT NULL,
        weight           INTEGER NOT NULL DEFAULT 1
    )`,
];

export const indexes: string[] = [
    `CREATE INDEX IF NOT EXISTS idx_flock_agents_address ON flock_agents(address)`,
    `CREATE INDEX IF NOT EXISTS idx_flock_agents_name ON flock_agents(name)`,
    `CREATE INDEX IF NOT EXISTS idx_flock_agents_status ON flock_agents(status)`,
    `CREATE INDEX IF NOT EXISTS idx_flock_test_results_agent ON flock_test_results(agent_id)`,
    `CREATE INDEX IF NOT EXISTS idx_flock_test_results_completed ON flock_test_results(completed_at)`,
    `CREATE INDEX IF NOT EXISTS idx_flock_test_challenge_results_test ON flock_test_challenge_results(test_result_id)`,
];

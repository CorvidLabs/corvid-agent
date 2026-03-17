/** Health snapshots, performance metrics, audit log, and infrastructure. */

export const tables: string[] = [
    `CREATE TABLE IF NOT EXISTS audit_log (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp     TEXT NOT NULL DEFAULT (datetime('now')),
        action        TEXT NOT NULL,
        actor         TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        resource_id   TEXT,
        detail        TEXT,
        trace_id      TEXT,
        ip_address    TEXT
    )`,

    `CREATE TABLE IF NOT EXISTS dedup_state (
        namespace  TEXT NOT NULL,
        key        TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        PRIMARY KEY (namespace, key)
    )`,

    `CREATE TABLE IF NOT EXISTS health_snapshots (
        id                 TEXT PRIMARY KEY,
        agent_id           TEXT NOT NULL,
        project_id         TEXT NOT NULL,
        tsc_error_count    INTEGER DEFAULT 0,
        tsc_passed         INTEGER DEFAULT 0,
        tests_passed       INTEGER DEFAULT 0,
        test_failure_count INTEGER DEFAULT 0,
        todo_count         INTEGER DEFAULT 0,
        fixme_count        INTEGER DEFAULT 0,
        hack_count         INTEGER DEFAULT 0,
        large_file_count   INTEGER DEFAULT 0,
        outdated_dep_count INTEGER DEFAULT 0,
        collected_at       TEXT DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS performance_metrics (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        metric    TEXT NOT NULL,
        labels    TEXT DEFAULT NULL,
        value     REAL NOT NULL,
        unit      TEXT DEFAULT NULL
    )`,

    `CREATE TABLE IF NOT EXISTS rate_limit_state (
        key           TEXT    NOT NULL,
        bucket        TEXT    NOT NULL,
        window_start  INTEGER NOT NULL,
        request_count INTEGER NOT NULL DEFAULT 1,
        updated_at    TEXT    DEFAULT (datetime('now')),
        PRIMARY KEY (key, bucket, window_start)
    )`,

    `CREATE TABLE IF NOT EXISTS sandbox_configs (
        id               TEXT PRIMARY KEY,
        agent_id         TEXT NOT NULL UNIQUE,
        image            TEXT DEFAULT 'corvid-agent-sandbox:latest',
        cpu_limit        REAL DEFAULT 1.0,
        memory_limit_mb  INTEGER DEFAULT 512,
        network_policy   TEXT DEFAULT 'restricted',
        timeout_seconds  INTEGER DEFAULT 600,
        read_only_mounts TEXT DEFAULT '[]',
        work_dir         TEXT DEFAULT NULL,
        tenant_id        TEXT NOT NULL DEFAULT 'default',
        created_at       TEXT DEFAULT (datetime('now')),
        updated_at       TEXT DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS server_health_snapshots (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp        TEXT NOT NULL DEFAULT (datetime('now')),
        status           TEXT NOT NULL,
        response_time_ms INTEGER DEFAULT NULL,
        dependencies     TEXT DEFAULT NULL,
        source           TEXT NOT NULL DEFAULT 'internal'
    )`,

    `CREATE TABLE IF NOT EXISTS voice_cache (
        id           TEXT PRIMARY KEY,
        text_hash    TEXT NOT NULL,
        voice_preset TEXT NOT NULL,
        audio_data   BLOB NOT NULL,
        format       TEXT DEFAULT 'mp3',
        duration_ms  INTEGER DEFAULT 0,
        created_at   TEXT DEFAULT (datetime('now'))
    )`,
];

export const indexes: string[] = [
    `CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_log_trace_id ON audit_log(trace_id)`,
    `CREATE INDEX IF NOT EXISTS idx_dedup_state_expires ON dedup_state(expires_at)`,
    `CREATE INDEX IF NOT EXISTS idx_dedup_state_ns_expires ON dedup_state(namespace, expires_at)`,
    `CREATE INDEX IF NOT EXISTS idx_health_snap_agent ON health_snapshots(agent_id, project_id)`,
    `CREATE INDEX IF NOT EXISTS idx_perf_metric_ts ON performance_metrics(metric, timestamp)`,
    `CREATE INDEX IF NOT EXISTS idx_perf_ts ON performance_metrics(timestamp)`,
    `CREATE INDEX IF NOT EXISTS idx_rate_limit_window ON rate_limit_state(window_start)`,
    `CREATE INDEX IF NOT EXISTS idx_sandbox_configs_tenant ON sandbox_configs(tenant_id)`,
    `CREATE INDEX IF NOT EXISTS idx_server_health_snapshots_status ON server_health_snapshots(status)`,
    `CREATE INDEX IF NOT EXISTS idx_server_health_snapshots_timestamp ON server_health_snapshots(timestamp)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_voice_cache_hash ON voice_cache(text_hash, voice_preset)`,
];

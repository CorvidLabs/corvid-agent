/** Agent schedules, execution history, and repo locks. */

export const tables: string[] = [
    `CREATE TABLE IF NOT EXISTS agent_schedules (
        id                 TEXT PRIMARY KEY,
        agent_id           TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        name               TEXT NOT NULL,
        description        TEXT DEFAULT '',
        cron_expression    TEXT DEFAULT NULL,
        interval_ms        INTEGER DEFAULT NULL,
        actions            TEXT NOT NULL DEFAULT '[]',
        approval_policy    TEXT DEFAULT 'owner_approve',
        status             TEXT DEFAULT 'active',
        max_executions     INTEGER DEFAULT NULL,
        execution_count    INTEGER DEFAULT 0,
        max_budget_per_run REAL DEFAULT NULL,
        last_run_at        TEXT DEFAULT NULL,
        next_run_at        TEXT DEFAULT NULL,
        notify_address     TEXT DEFAULT NULL,
        trigger_events     TEXT DEFAULT NULL,
        output_destinations TEXT DEFAULT NULL,
        tenant_id          TEXT NOT NULL DEFAULT 'default',
        created_at         TEXT DEFAULT (datetime('now')),
        updated_at         TEXT DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS repo_locks (
        repo         TEXT NOT NULL PRIMARY KEY,
        execution_id TEXT NOT NULL,
        schedule_id  TEXT NOT NULL,
        action_type  TEXT NOT NULL,
        locked_at    TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at   TEXT NOT NULL
    )`,

    `CREATE TABLE IF NOT EXISTS schedule_executions (
        id              TEXT PRIMARY KEY,
        schedule_id     TEXT NOT NULL REFERENCES agent_schedules(id) ON DELETE CASCADE,
        agent_id        TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        status          TEXT DEFAULT 'running',
        action_type     TEXT NOT NULL,
        action_input    TEXT DEFAULT '{}',
        result          TEXT DEFAULT NULL,
        session_id      TEXT DEFAULT NULL,
        work_task_id    TEXT DEFAULT NULL,
        cost_usd        REAL DEFAULT 0,
        config_snapshot TEXT DEFAULT NULL,
        tenant_id       TEXT NOT NULL DEFAULT 'default',
        started_at      TEXT DEFAULT (datetime('now')),
        completed_at    TEXT DEFAULT NULL
    )`,
];

export const indexes: string[] = [
    `CREATE INDEX IF NOT EXISTS idx_agent_schedules_agent ON agent_schedules(agent_id)`,
    `CREATE INDEX IF NOT EXISTS idx_agent_schedules_next_run ON agent_schedules(next_run_at)`,
    `CREATE INDEX IF NOT EXISTS idx_agent_schedules_status ON agent_schedules(status)`,
    `CREATE INDEX IF NOT EXISTS idx_agent_schedules_tenant ON agent_schedules(tenant_id)`,
    `CREATE INDEX IF NOT EXISTS idx_repo_locks_expires ON repo_locks(expires_at)`,
    `CREATE INDEX IF NOT EXISTS idx_repo_locks_schedule ON repo_locks(schedule_id)`,
    `CREATE INDEX IF NOT EXISTS idx_schedule_executions_schedule ON schedule_executions(schedule_id)`,
    `CREATE INDEX IF NOT EXISTS idx_schedule_executions_schedule_status ON schedule_executions(schedule_id, status, started_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_schedule_executions_status ON schedule_executions(status)`,
    `CREATE INDEX IF NOT EXISTS idx_schedule_executions_tenant ON schedule_executions(tenant_id)`,
];

/** Workflow definitions, runs, and node execution. */

export const tables: string[] = [
    `CREATE TABLE IF NOT EXISTS workflow_node_runs (
        id           TEXT PRIMARY KEY,
        run_id       TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
        node_id      TEXT NOT NULL,
        node_type    TEXT NOT NULL,
        status       TEXT DEFAULT 'pending',
        input        TEXT DEFAULT '{}',
        output       TEXT DEFAULT NULL,
        session_id   TEXT DEFAULT NULL,
        work_task_id TEXT DEFAULT NULL,
        error        TEXT DEFAULT NULL,
        started_at   TEXT DEFAULT NULL,
        completed_at TEXT DEFAULT NULL
    )`,

    `CREATE TABLE IF NOT EXISTS workflow_runs (
        id               TEXT PRIMARY KEY,
        workflow_id      TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
        agent_id         TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        status           TEXT DEFAULT 'running',
        input            TEXT DEFAULT '{}',
        output           TEXT DEFAULT NULL,
        workflow_snapshot TEXT NOT NULL DEFAULT '{}',
        current_node_ids TEXT DEFAULT '[]',
        error            TEXT DEFAULT NULL,
        tenant_id        TEXT NOT NULL DEFAULT 'default',
        started_at       TEXT DEFAULT (datetime('now')),
        completed_at     TEXT DEFAULT NULL
    )`,

    `CREATE TABLE IF NOT EXISTS workflows (
        id                 TEXT PRIMARY KEY,
        agent_id           TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        name               TEXT NOT NULL,
        description        TEXT DEFAULT '',
        nodes              TEXT NOT NULL DEFAULT '[]',
        edges              TEXT NOT NULL DEFAULT '[]',
        status             TEXT DEFAULT 'draft',
        default_project_id TEXT DEFAULT NULL,
        max_concurrency    INTEGER DEFAULT 2,
        tenant_id          TEXT NOT NULL DEFAULT 'default',
        created_at         TEXT DEFAULT (datetime('now')),
        updated_at         TEXT DEFAULT (datetime('now'))
    )`,
];

export const indexes: string[] = [
    `CREATE INDEX IF NOT EXISTS idx_workflow_node_runs_run ON workflow_node_runs(run_id)`,
    `CREATE INDEX IF NOT EXISTS idx_workflow_node_runs_session ON workflow_node_runs(session_id)`,
    `CREATE INDEX IF NOT EXISTS idx_workflow_node_runs_status ON workflow_node_runs(status)`,
    `CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_runs(status)`,
    `CREATE INDEX IF NOT EXISTS idx_workflow_runs_tenant ON workflow_runs(tenant_id)`,
    `CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow ON workflow_runs(workflow_id)`,
    `CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow_started ON workflow_runs(workflow_id, started_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_workflows_agent ON workflows(agent_id)`,
    `CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows(status)`,
    `CREATE INDEX IF NOT EXISTS idx_workflows_tenant ON workflows(tenant_id)`,
];

/** Work tasks, PR outcomes, and repo blocklist. */

export const tables: string[] = [
  `CREATE TABLE IF NOT EXISTS pr_outcomes (
        id             TEXT PRIMARY KEY,
        work_task_id   TEXT NOT NULL,
        pr_url         TEXT NOT NULL,
        repo           TEXT NOT NULL,
        pr_number      INTEGER NOT NULL,
        pr_state       TEXT NOT NULL DEFAULT 'open',
        failure_reason TEXT DEFAULT NULL,
        checked_at     TEXT DEFAULT NULL,
        resolved_at    TEXT DEFAULT NULL,
        created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    )`,

  `CREATE TABLE IF NOT EXISTS repo_blocklist (
        repo       TEXT NOT NULL,
        reason     TEXT DEFAULT '',
        source     TEXT NOT NULL DEFAULT 'manual',
        pr_url     TEXT DEFAULT '',
        tenant_id  TEXT DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (repo, tenant_id)
    )`,

  `CREATE TABLE IF NOT EXISTS work_tasks (
        id              TEXT PRIMARY KEY,
        agent_id        TEXT NOT NULL REFERENCES agents(id),
        project_id      TEXT NOT NULL REFERENCES projects(id),
        session_id      TEXT DEFAULT NULL,
        source          TEXT DEFAULT 'web',
        source_id       TEXT DEFAULT NULL,
        requester_info  TEXT DEFAULT '{}',
        description     TEXT NOT NULL,
        branch_name     TEXT DEFAULT NULL,
        status          TEXT DEFAULT 'pending',
        pr_url          TEXT DEFAULT NULL,
        summary         TEXT DEFAULT NULL,
        error           TEXT DEFAULT NULL,
        original_branch TEXT DEFAULT NULL,
        iteration_count INTEGER DEFAULT 0,
        worktree_dir    TEXT DEFAULT NULL,
        priority        INTEGER NOT NULL DEFAULT 2,
        queued_at       TEXT DEFAULT NULL,
        tenant_id       TEXT NOT NULL DEFAULT 'default',
        created_at      TEXT DEFAULT (datetime('now')),
        completed_at    TEXT DEFAULT NULL
    )`,

  `CREATE TABLE IF NOT EXISTS work_task_attestations (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id     TEXT NOT NULL,
        agent_id    TEXT NOT NULL,
        outcome     TEXT NOT NULL CHECK (outcome IN ('completed', 'failed')),
        pr_url      TEXT,
        duration_ms INTEGER,
        hash        TEXT NOT NULL,
        payload     TEXT NOT NULL,
        txid        TEXT,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        published_at TEXT
    )`,
];

export const indexes: string[] = [
  `CREATE INDEX IF NOT EXISTS idx_pr_outcomes_repo ON pr_outcomes(repo)`,
  `CREATE INDEX IF NOT EXISTS idx_pr_outcomes_state ON pr_outcomes(pr_state)`,
  `CREATE INDEX IF NOT EXISTS idx_pr_outcomes_work_task ON pr_outcomes(work_task_id)`,
  `CREATE INDEX IF NOT EXISTS idx_repo_blocklist_tenant ON repo_blocklist(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_work_tasks_agent ON work_tasks(agent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_work_tasks_session ON work_tasks(session_id)`,
  `CREATE INDEX IF NOT EXISTS idx_work_tasks_status ON work_tasks(status)`,
  `CREATE INDEX IF NOT EXISTS idx_work_tasks_tenant ON work_tasks(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_work_tasks_pending_dispatch ON work_tasks(status, project_id, priority DESC, created_at ASC)`,
  `CREATE INDEX IF NOT EXISTS idx_work_task_attestations_task_id ON work_task_attestations(task_id)`,
  `CREATE INDEX IF NOT EXISTS idx_work_task_attestations_agent_id ON work_task_attestations(agent_id)`,
];

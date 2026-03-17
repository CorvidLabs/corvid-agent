/** Webhook registrations, deliveries, and mention polling configs. */

export const tables: string[] = [
    `CREATE TABLE IF NOT EXISTS mention_polling_configs (
        id               TEXT PRIMARY KEY,
        agent_id         TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        repo             TEXT NOT NULL,
        mention_username TEXT NOT NULL,
        project_id       TEXT NOT NULL REFERENCES projects(id),
        interval_seconds INTEGER NOT NULL DEFAULT 60,
        status           TEXT DEFAULT 'active',
        trigger_count    INTEGER DEFAULT 0,
        last_poll_at     TEXT DEFAULT NULL,
        last_seen_id     TEXT DEFAULT NULL,
        event_filter     TEXT NOT NULL DEFAULT '[]',
        allowed_users    TEXT NOT NULL DEFAULT '[]',
        processed_ids    TEXT NOT NULL DEFAULT '[]',
        tenant_id        TEXT NOT NULL DEFAULT 'default',
        created_at       TEXT DEFAULT (datetime('now')),
        updated_at       TEXT DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS webhook_deliveries (
        id              TEXT PRIMARY KEY,
        registration_id TEXT NOT NULL REFERENCES webhook_registrations(id) ON DELETE CASCADE,
        event           TEXT NOT NULL,
        action          TEXT NOT NULL DEFAULT '',
        repo            TEXT NOT NULL,
        sender          TEXT NOT NULL,
        body            TEXT DEFAULT '',
        html_url        TEXT DEFAULT '',
        session_id      TEXT DEFAULT NULL,
        work_task_id    TEXT DEFAULT NULL,
        status          TEXT DEFAULT 'processing',
        result          TEXT DEFAULT NULL,
        created_at      TEXT DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS webhook_registrations (
        id               TEXT PRIMARY KEY,
        agent_id         TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        repo             TEXT NOT NULL,
        events           TEXT NOT NULL DEFAULT '[]',
        mention_username TEXT NOT NULL,
        project_id       TEXT NOT NULL REFERENCES projects(id),
        status           TEXT DEFAULT 'active',
        trigger_count    INTEGER DEFAULT 0,
        tenant_id        TEXT NOT NULL DEFAULT 'default',
        created_at       TEXT DEFAULT (datetime('now')),
        updated_at       TEXT DEFAULT (datetime('now'))
    )`,
];

export const indexes: string[] = [
    `CREATE INDEX IF NOT EXISTS idx_mention_polling_configs_agent ON mention_polling_configs(agent_id)`,
    `CREATE INDEX IF NOT EXISTS idx_mention_polling_configs_repo ON mention_polling_configs(repo)`,
    `CREATE INDEX IF NOT EXISTS idx_mention_polling_configs_status ON mention_polling_configs(status)`,
    `CREATE INDEX IF NOT EXISTS idx_mention_polling_configs_tenant ON mention_polling_configs(tenant_id)`,
    `CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_registration ON webhook_deliveries(registration_id)`,
    `CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries(status)`,
    `CREATE INDEX IF NOT EXISTS idx_webhook_registrations_agent ON webhook_registrations(agent_id)`,
    `CREATE INDEX IF NOT EXISTS idx_webhook_registrations_repo ON webhook_registrations(repo)`,
    `CREATE INDEX IF NOT EXISTS idx_webhook_registrations_status ON webhook_registrations(status)`,
    `CREATE INDEX IF NOT EXISTS idx_webhook_registrations_tenant ON webhook_registrations(tenant_id)`,
];

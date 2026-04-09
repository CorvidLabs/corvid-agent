/** Notifications, owner questions, and escalation queue. */

export const tables: string[] = [
  `CREATE TABLE IF NOT EXISTS escalation_queue (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id  TEXT NOT NULL,
        tool_name   TEXT NOT NULL,
        tool_input  TEXT NOT NULL DEFAULT '{}',
        status      TEXT DEFAULT 'pending',
        created_at  TEXT DEFAULT (datetime('now')),
        resolved_at TEXT DEFAULT NULL
    )`,

  `CREATE TABLE IF NOT EXISTS notification_channels (
        id           TEXT PRIMARY KEY,
        agent_id     TEXT NOT NULL,
        channel_type TEXT NOT NULL,
        config       TEXT NOT NULL DEFAULT '{}',
        enabled      INTEGER NOT NULL DEFAULT 1,
        tenant_id    TEXT NOT NULL DEFAULT 'default',
        created_at   TEXT DEFAULT (datetime('now')),
        updated_at   TEXT DEFAULT (datetime('now'))
    )`,

  `CREATE TABLE IF NOT EXISTS notification_deliveries (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        notification_id TEXT NOT NULL REFERENCES owner_notifications(id) ON DELETE CASCADE,
        channel_type    TEXT NOT NULL,
        status          TEXT NOT NULL DEFAULT 'pending',
        attempts        INTEGER NOT NULL DEFAULT 0,
        last_attempt_at TEXT DEFAULT NULL,
        error           TEXT DEFAULT NULL,
        external_ref    TEXT DEFAULT NULL,
        created_at      TEXT DEFAULT (datetime('now'))
    )`,

  `CREATE TABLE IF NOT EXISTS owner_notifications (
        id         TEXT PRIMARY KEY,
        agent_id   TEXT NOT NULL,
        session_id TEXT DEFAULT NULL,
        title      TEXT DEFAULT NULL,
        message    TEXT NOT NULL,
        level      TEXT NOT NULL DEFAULT 'info',
        created_at TEXT DEFAULT (datetime('now'))
    )`,

  `CREATE TABLE IF NOT EXISTS owner_question_dispatches (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        question_id  TEXT NOT NULL,
        channel_type TEXT NOT NULL,
        external_ref TEXT,
        status       TEXT NOT NULL DEFAULT 'sent',
        answered_at  TEXT DEFAULT NULL,
        created_at   TEXT DEFAULT (datetime('now'))
    )`,

  `CREATE TABLE IF NOT EXISTS owner_questions (
        id          TEXT PRIMARY KEY,
        session_id  TEXT NOT NULL,
        agent_id    TEXT NOT NULL,
        question    TEXT NOT NULL,
        options     TEXT DEFAULT NULL,
        context     TEXT DEFAULT NULL,
        status      TEXT DEFAULT 'pending',
        answer      TEXT DEFAULT NULL,
        timeout_ms  INTEGER DEFAULT 120000,
        created_at  TEXT DEFAULT (datetime('now')),
        resolved_at TEXT DEFAULT NULL
    )`,
];

export const indexes: string[] = [
  `CREATE INDEX IF NOT EXISTS idx_escalation_queue_session ON escalation_queue(session_id)`,
  `CREATE INDEX IF NOT EXISTS idx_escalation_queue_status ON escalation_queue(status)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_channels_agent_type ON notification_channels(agent_id, channel_type)`,
  `CREATE INDEX IF NOT EXISTS idx_notification_channels_tenant ON notification_channels(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_notification_deliveries_notification ON notification_deliveries(notification_id)`,
  `CREATE INDEX IF NOT EXISTS idx_notification_deliveries_status ON notification_deliveries(status)`,
  `CREATE INDEX IF NOT EXISTS idx_owner_notifications_agent ON owner_notifications(agent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_owner_notifications_created ON owner_notifications(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_owner_questions_agent ON owner_questions(agent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_owner_questions_session ON owner_questions(session_id)`,
  `CREATE INDEX IF NOT EXISTS idx_question_dispatches_question ON owner_question_dispatches(question_id)`,
  `CREATE INDEX IF NOT EXISTS idx_question_dispatches_status ON owner_question_dispatches(status)`,
];

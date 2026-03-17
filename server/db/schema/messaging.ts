/**
 * Schema definitions for the messaging & notifications domain.
 *
 * Tables: agent_messages, notification_channels, notification_deliveries,
 *         owner_notifications, owner_question_dispatches, owner_questions
 */

export const tables: string[] = [
    `CREATE TABLE IF NOT EXISTS agent_messages (
        id               TEXT PRIMARY KEY,
        from_agent_id    TEXT NOT NULL,
        to_agent_id      TEXT NOT NULL,
        content          TEXT NOT NULL,
        payment_micro    INTEGER DEFAULT 0,
        txid             TEXT DEFAULT NULL,
        status           TEXT DEFAULT 'pending',
        response         TEXT DEFAULT NULL,
        response_txid    TEXT DEFAULT NULL,
        session_id       TEXT DEFAULT NULL,
        thread_id        TEXT DEFAULT NULL,
        provider         TEXT DEFAULT '',
        model            TEXT DEFAULT '',
        fire_and_forget  INTEGER DEFAULT 0,
        message_version  INTEGER DEFAULT 1,
        error_code       TEXT DEFAULT NULL,
        created_at       TEXT DEFAULT (datetime('now')),
        completed_at     TEXT DEFAULT NULL
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
    `CREATE INDEX IF NOT EXISTS idx_agent_messages_from ON agent_messages(from_agent_id)`,
    `CREATE INDEX IF NOT EXISTS idx_agent_messages_status ON agent_messages(status)`,
    `CREATE INDEX IF NOT EXISTS idx_agent_messages_thread ON agent_messages(thread_id)`,
    `CREATE INDEX IF NOT EXISTS idx_agent_messages_to ON agent_messages(to_agent_id)`,
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

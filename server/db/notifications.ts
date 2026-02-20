import type { Database } from 'bun:sqlite';
import type { NotificationChannelType } from '../../shared/types';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface NotificationChannel {
    id: string;
    agentId: string;
    channelType: NotificationChannelType;
    config: Record<string, unknown>;
    enabled: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface OwnerNotification {
    id: string;
    agentId: string;
    sessionId: string | null;
    title: string | null;
    message: string;
    level: string;
    createdAt: string;
}

export interface NotificationDelivery {
    id: number;
    notificationId: string;
    channelType: string;
    status: 'pending' | 'sent' | 'failed';
    attempts: number;
    lastAttemptAt: string | null;
    error: string | null;
    externalRef: string | null;
    createdAt: string;
}

export interface FailedDeliveryRow extends NotificationDelivery {
    notification: OwnerNotification;
    channelConfig: Record<string, unknown>;
}

export interface QuestionDispatchRow {
    id: number;
    questionId: string;
    channelType: string;
    externalRef: string | null;
    status: 'sent' | 'answered' | 'expired';
    answeredAt: string | null;
    createdAt: string;
}

// ─── Row Mappers ────────────────────────────────────────────────────────────

function rowToChannel(row: Record<string, unknown>): NotificationChannel {
    return {
        id: row.id as string,
        agentId: row.agent_id as string,
        channelType: row.channel_type as NotificationChannelType,
        config: JSON.parse((row.config as string) ?? '{}'),
        enabled: (row.enabled as number) === 1,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
    };
}

function rowToNotification(row: Record<string, unknown>): OwnerNotification {
    return {
        id: row.id as string,
        agentId: row.agent_id as string,
        sessionId: row.session_id as string | null,
        title: row.title as string | null,
        message: row.message as string,
        level: (row.level as string) ?? 'info',
        createdAt: row.created_at as string,
    };
}

function rowToDelivery(row: Record<string, unknown>): NotificationDelivery {
    return {
        id: row.id as number,
        notificationId: row.notification_id as string,
        channelType: row.channel_type as string,
        status: (row.status as 'pending' | 'sent' | 'failed') ?? 'pending',
        attempts: (row.attempts as number) ?? 0,
        lastAttemptAt: row.last_attempt_at as string | null,
        error: row.error as string | null,
        externalRef: row.external_ref as string | null,
        createdAt: row.created_at as string,
    };
}

// ─── Channel CRUD ───────────────────────────────────────────────────────────

export function listChannelsForAgent(db: Database, agentId: string): NotificationChannel[] {
    const rows = db.query(
        `SELECT * FROM notification_channels WHERE agent_id = ? ORDER BY channel_type`
    ).all(agentId) as Record<string, unknown>[];
    return rows.map(rowToChannel);
}

export function upsertChannel(
    db: Database,
    agentId: string,
    channelType: string,
    config: Record<string, unknown>,
    enabled: boolean = true,
): NotificationChannel {
    const id = crypto.randomUUID();
    db.query(
        `INSERT INTO notification_channels (id, agent_id, channel_type, config, enabled)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(agent_id, channel_type) DO UPDATE SET
            config = excluded.config,
            enabled = excluded.enabled,
            updated_at = datetime('now')`
    ).run(id, agentId, channelType, JSON.stringify(config), enabled ? 1 : 0);

    const row = db.query(
        `SELECT * FROM notification_channels WHERE agent_id = ? AND channel_type = ?`
    ).get(agentId, channelType) as Record<string, unknown>;
    return rowToChannel(row);
}

export function updateChannelEnabled(db: Database, id: string, enabled: boolean): boolean {
    const result = db.query(
        `UPDATE notification_channels SET enabled = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(enabled ? 1 : 0, id);
    return result.changes > 0;
}

export function deleteChannel(db: Database, id: string): boolean {
    const result = db.query(`DELETE FROM notification_channels WHERE id = ?`).run(id);
    return result.changes > 0;
}

export function getChannelByAgentAndType(
    db: Database,
    agentId: string,
    channelType: string,
): NotificationChannel | null {
    const row = db.query(
        `SELECT * FROM notification_channels WHERE agent_id = ? AND channel_type = ?`
    ).get(agentId, channelType) as Record<string, unknown> | null;
    return row ? rowToChannel(row) : null;
}

// ─── Notification CRUD ──────────────────────────────────────────────────────

export function createNotification(
    db: Database,
    params: { agentId: string; sessionId?: string; title?: string; message: string; level: string },
): OwnerNotification {
    const id = crypto.randomUUID();
    db.query(
        `INSERT INTO owner_notifications (id, agent_id, session_id, title, message, level)
         VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, params.agentId, params.sessionId ?? null, params.title ?? null, params.message, params.level);

    const row = db.query(`SELECT * FROM owner_notifications WHERE id = ?`).get(id) as Record<string, unknown>;
    return rowToNotification(row);
}

export function listNotifications(db: Database, agentId?: string, limit: number = 50): OwnerNotification[] {
    if (agentId) {
        const rows = db.query(
            `SELECT * FROM owner_notifications WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?`
        ).all(agentId, limit) as Record<string, unknown>[];
        return rows.map(rowToNotification);
    }
    const rows = db.query(
        `SELECT * FROM owner_notifications ORDER BY created_at DESC LIMIT ?`
    ).all(limit) as Record<string, unknown>[];
    return rows.map(rowToNotification);
}

// ─── Delivery Tracking ──────────────────────────────────────────────────────

export function createDelivery(
    db: Database,
    notificationId: string,
    channelType: string,
): NotificationDelivery {
    db.query(
        `INSERT INTO notification_deliveries (notification_id, channel_type)
         VALUES (?, ?)`
    ).run(notificationId, channelType);

    const row = db.query(
        `SELECT * FROM notification_deliveries WHERE notification_id = ? AND channel_type = ? ORDER BY id DESC LIMIT 1`
    ).get(notificationId, channelType) as Record<string, unknown>;
    return rowToDelivery(row);
}

export function updateDeliveryStatus(
    db: Database,
    deliveryId: number,
    status: 'pending' | 'sent' | 'failed',
    error?: string,
    externalRef?: string,
): void {
    db.query(
        `UPDATE notification_deliveries
         SET status = ?, error = ?, external_ref = COALESCE(?, external_ref),
             last_attempt_at = datetime('now'), attempts = attempts + 1
         WHERE id = ?`
    ).run(status, error ?? null, externalRef ?? null, deliveryId);
}

export function listFailedDeliveries(
    db: Database,
    maxAttempts: number = 3,
    limit: number = 50,
): FailedDeliveryRow[] {
    const rows = db.query(
        `SELECT
            d.*,
            n.agent_id AS n_agent_id, n.session_id AS n_session_id,
            n.title AS n_title, n.message AS n_message, n.level AS n_level,
            n.created_at AS n_created_at,
            c.config AS c_config
         FROM notification_deliveries d
         JOIN owner_notifications n ON n.id = d.notification_id
         JOIN notification_channels c ON c.agent_id = n.agent_id AND c.channel_type = d.channel_type AND c.enabled = 1
         WHERE d.status = 'failed' AND d.attempts < ?
         ORDER BY d.created_at ASC
         LIMIT ?`
    ).all(maxAttempts, limit) as Record<string, unknown>[];

    return rows.map((row) => ({
        ...rowToDelivery(row),
        notification: {
            id: row.notification_id as string,
            agentId: row.n_agent_id as string,
            sessionId: row.n_session_id as string | null,
            title: row.n_title as string | null,
            message: row.n_message as string,
            level: (row.n_level as string) ?? 'info',
            createdAt: row.n_created_at as string,
        },
        channelConfig: JSON.parse((row.c_config as string) ?? '{}'),
    }));
}

// ─── Question Dispatch Tracking ──────────────────────────────────────────

function rowToQuestionDispatch(row: Record<string, unknown>): QuestionDispatchRow {
    return {
        id: row.id as number,
        questionId: row.question_id as string,
        channelType: row.channel_type as string,
        externalRef: row.external_ref as string | null,
        status: (row.status as 'sent' | 'answered' | 'expired') ?? 'sent',
        answeredAt: (row.answered_at as string) ?? null,
        createdAt: row.created_at as string,
    };
}

export function createQuestionDispatch(
    db: Database,
    questionId: string,
    channelType: string,
    externalRef: string | null,
): QuestionDispatchRow {
    db.query(
        `INSERT INTO owner_question_dispatches (question_id, channel_type, external_ref)
         VALUES (?, ?, ?)`
    ).run(questionId, channelType, externalRef);

    const row = db.query(
        `SELECT * FROM owner_question_dispatches WHERE question_id = ? AND channel_type = ? ORDER BY id DESC LIMIT 1`
    ).get(questionId, channelType) as Record<string, unknown>;
    return rowToQuestionDispatch(row);
}

export function listActiveQuestionDispatches(db: Database): QuestionDispatchRow[] {
    const rows = db.query(
        `SELECT * FROM owner_question_dispatches WHERE status = 'sent' ORDER BY created_at ASC`
    ).all() as Record<string, unknown>[];
    return rows.map(rowToQuestionDispatch);
}

export function updateQuestionDispatchStatus(
    db: Database,
    id: number,
    status: 'sent' | 'answered' | 'expired',
): void {
    db.query(
        `UPDATE owner_question_dispatches SET status = ? WHERE id = ?`
    ).run(status, id);
}

/**
 * Atomically mark a dispatch as answered only if it's still in 'sent' status.
 * Returns true only if this call actually transitioned the status (idempotency guard).
 */
export function markDispatchAnswered(db: Database, id: number): boolean {
    const result = db.query(
        `UPDATE owner_question_dispatches SET status = 'answered', answered_at = datetime('now') WHERE id = ? AND status = 'sent'`
    ).run(id);
    return result.changes > 0;
}

export function getQuestionDispatchesByQuestionId(
    db: Database,
    questionId: string,
): QuestionDispatchRow[] {
    const rows = db.query(
        `SELECT * FROM owner_question_dispatches WHERE question_id = ? ORDER BY id ASC`
    ).all(questionId) as Record<string, unknown>[];
    return rows.map(rowToQuestionDispatch);
}

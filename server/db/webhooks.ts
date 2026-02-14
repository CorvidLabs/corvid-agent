/**
 * Database operations for GitHub webhook registrations and deliveries.
 */

import type { Database } from 'bun:sqlite';
import type {
    WebhookRegistration,
    WebhookDelivery,
    CreateWebhookRegistrationInput,
    UpdateWebhookRegistrationInput,
    WebhookEventType,
    WebhookRegistrationStatus,
} from '../../shared/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rowToRegistration(row: Record<string, unknown>): WebhookRegistration {
    return {
        id: row.id as string,
        agentId: row.agent_id as string,
        repo: row.repo as string,
        events: JSON.parse((row.events as string) ?? '[]') as WebhookEventType[],
        mentionUsername: row.mention_username as string,
        projectId: row.project_id as string,
        status: (row.status as WebhookRegistrationStatus) ?? 'active',
        triggerCount: (row.trigger_count as number) ?? 0,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
    };
}

function rowToDelivery(row: Record<string, unknown>): WebhookDelivery {
    return {
        id: row.id as string,
        registrationId: row.registration_id as string,
        event: row.event as string,
        action: (row.action as string) ?? '',
        repo: row.repo as string,
        sender: row.sender as string,
        body: (row.body as string) ?? '',
        htmlUrl: (row.html_url as string) ?? '',
        sessionId: row.session_id as string | null,
        workTaskId: row.work_task_id as string | null,
        status: (row.status as WebhookDelivery['status']) ?? 'processing',
        result: row.result as string | null,
        createdAt: row.created_at as string,
    };
}

// ─── Registration CRUD ──────────────────────────────────────────────────────

export function createWebhookRegistration(db: Database, input: CreateWebhookRegistrationInput): WebhookRegistration {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    db.query(`
        INSERT INTO webhook_registrations (id, agent_id, repo, events, mention_username, project_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id,
        input.agentId,
        input.repo,
        JSON.stringify(input.events),
        input.mentionUsername,
        input.projectId,
        now,
        now,
    );

    return getWebhookRegistration(db, id)!;
}

export function getWebhookRegistration(db: Database, id: string): WebhookRegistration | null {
    const row = db.query('SELECT * FROM webhook_registrations WHERE id = ?').get(id) as Record<string, unknown> | null;
    return row ? rowToRegistration(row) : null;
}

export function listWebhookRegistrations(db: Database, agentId?: string): WebhookRegistration[] {
    const rows = agentId
        ? db.query('SELECT * FROM webhook_registrations WHERE agent_id = ? ORDER BY created_at DESC').all(agentId)
        : db.query('SELECT * FROM webhook_registrations ORDER BY created_at DESC').all();
    return (rows as Record<string, unknown>[]).map(rowToRegistration);
}

/**
 * Find all active registrations matching a given repo.
 * Used when processing incoming webhook events.
 */
export function findRegistrationsForRepo(db: Database, repo: string): WebhookRegistration[] {
    const rows = db.query(
        `SELECT * FROM webhook_registrations WHERE repo = ? AND status = 'active' ORDER BY created_at ASC`
    ).all(repo);
    return (rows as Record<string, unknown>[]).map(rowToRegistration);
}

export function updateWebhookRegistration(db: Database, id: string, input: UpdateWebhookRegistrationInput): WebhookRegistration | null {
    const existing = getWebhookRegistration(db, id);
    if (!existing) return null;

    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    if (input.events !== undefined) { fields.push('events = ?'); values.push(JSON.stringify(input.events)); }
    if (input.mentionUsername !== undefined) { fields.push('mention_username = ?'); values.push(input.mentionUsername); }
    if (input.projectId !== undefined) { fields.push('project_id = ?'); values.push(input.projectId); }
    if (input.status !== undefined) { fields.push('status = ?'); values.push(input.status); }

    if (fields.length === 0) return existing;

    fields.push("updated_at = datetime('now')");
    values.push(id);

    db.query(`UPDATE webhook_registrations SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return getWebhookRegistration(db, id);
}

export function deleteWebhookRegistration(db: Database, id: string): boolean {
    const result = db.query('DELETE FROM webhook_registrations WHERE id = ?').run(id);
    return result.changes > 0;
}

export function incrementTriggerCount(db: Database, id: string): void {
    db.query(`UPDATE webhook_registrations SET trigger_count = trigger_count + 1, updated_at = datetime('now') WHERE id = ?`).run(id);
}

// ─── Delivery Log ────────────────────────────────────────────────────────────

export function createDelivery(
    db: Database,
    registrationId: string,
    event: string,
    action: string,
    repo: string,
    sender: string,
    body: string,
    htmlUrl: string,
): WebhookDelivery {
    const id = crypto.randomUUID();

    db.query(`
        INSERT INTO webhook_deliveries (id, registration_id, event, action, repo, sender, body, html_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, registrationId, event, action, repo, sender, body, htmlUrl);

    return getDelivery(db, id)!;
}

export function getDelivery(db: Database, id: string): WebhookDelivery | null {
    const row = db.query('SELECT * FROM webhook_deliveries WHERE id = ?').get(id) as Record<string, unknown> | null;
    return row ? rowToDelivery(row) : null;
}

export function listDeliveries(db: Database, registrationId?: string, limit: number = 50): WebhookDelivery[] {
    const rows = registrationId
        ? db.query('SELECT * FROM webhook_deliveries WHERE registration_id = ? ORDER BY created_at DESC LIMIT ?').all(registrationId, limit)
        : db.query('SELECT * FROM webhook_deliveries ORDER BY created_at DESC LIMIT ?').all(limit);
    return (rows as Record<string, unknown>[]).map(rowToDelivery);
}

export function updateDeliveryStatus(
    db: Database,
    id: string,
    status: WebhookDelivery['status'],
    extras?: { result?: string; sessionId?: string; workTaskId?: string },
): void {
    const fields = ['status = ?'];
    const values: (string | null)[] = [status];

    if (extras?.result !== undefined) { fields.push('result = ?'); values.push(extras.result); }
    if (extras?.sessionId !== undefined) { fields.push('session_id = ?'); values.push(extras.sessionId); }
    if (extras?.workTaskId !== undefined) { fields.push('work_task_id = ?'); values.push(extras.workTaskId); }

    values.push(id);
    db.query(`UPDATE webhook_deliveries SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

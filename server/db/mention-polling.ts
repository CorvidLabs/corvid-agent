/**
 * Database operations for GitHub mention polling configurations.
 */

import type { Database } from 'bun:sqlite';
import type {
    MentionPollingConfig,
    CreateMentionPollingInput,
    UpdateMentionPollingInput,
    MentionPollingStatus,
} from '../../shared/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rowToConfig(row: Record<string, unknown>): MentionPollingConfig {
    return {
        id: row.id as string,
        agentId: row.agent_id as string,
        repo: row.repo as string,
        mentionUsername: row.mention_username as string,
        projectId: row.project_id as string,
        intervalSeconds: (row.interval_seconds as number) ?? 60,
        status: (row.status as MentionPollingStatus) ?? 'active',
        triggerCount: (row.trigger_count as number) ?? 0,
        lastPollAt: row.last_poll_at as string | null,
        lastSeenId: row.last_seen_id as string | null,
        processedIds: JSON.parse((row.processed_ids as string) ?? '[]'),
        eventFilter: JSON.parse((row.event_filter as string) ?? '[]'),
        allowedUsers: JSON.parse((row.allowed_users as string) ?? '[]'),
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
    };
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export function createMentionPollingConfig(db: Database, input: CreateMentionPollingInput): MentionPollingConfig {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    db.query(`
        INSERT INTO mention_polling_configs (id, agent_id, repo, mention_username, project_id, interval_seconds, event_filter, allowed_users, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id,
        input.agentId,
        input.repo,
        input.mentionUsername,
        input.projectId ?? null,
        input.intervalSeconds ?? 60,
        JSON.stringify(input.eventFilter ?? []),
        JSON.stringify(input.allowedUsers ?? []),
        now,
        now,
    );

    return getMentionPollingConfig(db, id)!;
}

export function getMentionPollingConfig(db: Database, id: string): MentionPollingConfig | null {
    const row = db.query('SELECT * FROM mention_polling_configs WHERE id = ?').get(id) as Record<string, unknown> | null;
    return row ? rowToConfig(row) : null;
}

export function listMentionPollingConfigs(db: Database, agentId?: string): MentionPollingConfig[] {
    const rows = agentId
        ? db.query('SELECT * FROM mention_polling_configs WHERE agent_id = ? ORDER BY created_at DESC').all(agentId)
        : db.query('SELECT * FROM mention_polling_configs ORDER BY created_at DESC').all();
    return (rows as Record<string, unknown>[]).map(rowToConfig);
}

/**
 * Find all active polling configs that are due for a poll.
 * A config is "due" when last_poll_at is NULL or older than its interval_seconds.
 */
export function findDuePollingConfigs(db: Database): MentionPollingConfig[] {
    const rows = db.query(`
        SELECT * FROM mention_polling_configs
        WHERE status = 'active'
        AND (
            last_poll_at IS NULL
            OR datetime(last_poll_at, '+' || interval_seconds || ' seconds') <= datetime('now')
        )
        ORDER BY last_poll_at ASC NULLS FIRST
    `).all();
    return (rows as Record<string, unknown>[]).map(rowToConfig);
}

export function updateMentionPollingConfig(db: Database, id: string, input: UpdateMentionPollingInput): MentionPollingConfig | null {
    const existing = getMentionPollingConfig(db, id);
    if (!existing) return null;

    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    if (input.mentionUsername !== undefined) { fields.push('mention_username = ?'); values.push(input.mentionUsername); }
    if (input.projectId !== undefined) { fields.push('project_id = ?'); values.push(input.projectId); }
    if (input.intervalSeconds !== undefined) { fields.push('interval_seconds = ?'); values.push(input.intervalSeconds); }
    if (input.status !== undefined) { fields.push('status = ?'); values.push(input.status); }
    if (input.eventFilter !== undefined) { fields.push('event_filter = ?'); values.push(JSON.stringify(input.eventFilter)); }
    if (input.allowedUsers !== undefined) { fields.push('allowed_users = ?'); values.push(JSON.stringify(input.allowedUsers)); }

    if (fields.length === 0) return existing;

    fields.push("updated_at = datetime('now')");
    values.push(id);

    db.query(`UPDATE mention_polling_configs SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return getMentionPollingConfig(db, id);
}

export function deleteMentionPollingConfig(db: Database, id: string): boolean {
    const result = db.query('DELETE FROM mention_polling_configs WHERE id = ?').run(id);
    return result.changes > 0;
}

/**
 * Update the last poll timestamp and optionally the last seen ID.
 * Called after each successful poll cycle.
 */
export function updatePollState(db: Database, id: string, lastSeenId?: string): void {
    if (lastSeenId !== undefined) {
        db.query(`UPDATE mention_polling_configs SET last_poll_at = datetime('now'), last_seen_id = ?, updated_at = datetime('now') WHERE id = ?`).run(lastSeenId, id);
    } else {
        db.query(`UPDATE mention_polling_configs SET last_poll_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(id);
    }
}

export function incrementPollingTriggerCount(db: Database, id: string): void {
    db.query(`UPDATE mention_polling_configs SET trigger_count = trigger_count + 1, updated_at = datetime('now') WHERE id = ?`).run(id);
}

/**
 * Update the set of processed mention IDs for a config.
 * Capped at MAX_PROCESSED_IDS to prevent unbounded growth.
 */
const MAX_PROCESSED_IDS = 200;

export function updateProcessedIds(db: Database, id: string, processedIds: string[]): void {
    // Keep only the most recent entries if the set grows too large
    const capped = processedIds.length > MAX_PROCESSED_IDS
        ? processedIds.slice(-MAX_PROCESSED_IDS)
        : processedIds;
    db.query(`UPDATE mention_polling_configs SET processed_ids = ?, updated_at = datetime('now') WHERE id = ?`).run(
        JSON.stringify(capped),
        id,
    );
}

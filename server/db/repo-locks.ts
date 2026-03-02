/**
 * Repo lock registry — prevents concurrent schedule executions from
 * working on the same repository simultaneously.
 *
 * Locks are keyed on GitHub repo identifier (e.g. "CorvidLabs/corvid-agent")
 * or project ID. They auto-expire after a configurable TTL to prevent deadlocks.
 */

import type { Database } from 'bun:sqlite';
import { createLogger } from '../lib/logger';

const log = createLogger('RepoLocks');

/** Default lock TTL: 30 minutes */
const DEFAULT_LOCK_TTL_MS = 30 * 60 * 1000;

export interface RepoLock {
    repo: string;
    executionId: string;
    scheduleId: string;
    actionType: string;
    lockedAt: string;
    expiresAt: string;
}

/**
 * Attempt to acquire a lock on a repo. Returns true if acquired, false if already locked.
 * Expired locks are cleaned before attempting acquisition.
 */
export function acquireRepoLock(
    db: Database,
    repo: string,
    executionId: string,
    scheduleId: string,
    actionType: string,
    ttlMs: number = DEFAULT_LOCK_TTL_MS,
): boolean {
    // Clean expired locks first
    cleanExpiredLocks(db);

    const expiresAt = new Date(Date.now() + ttlMs).toISOString();

    // Atomic insert — fails silently if repo is already locked (PRIMARY KEY conflict)
    const result = db.query(
        `INSERT OR IGNORE INTO repo_locks (repo, execution_id, schedule_id, action_type, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
    ).run(repo, executionId, scheduleId, actionType, expiresAt);

    if (result.changes > 0) {
        log.info('Acquired repo lock', { repo, executionId, scheduleId, actionType });
        return true;
    }

    // Lock exists — log who holds it
    const existing = getRepoLock(db, repo);
    if (existing) {
        log.info('Repo already locked', {
            repo,
            blockedExecution: executionId,
            heldBy: existing.executionId,
            heldBySchedule: existing.scheduleId,
            expiresAt: existing.expiresAt,
        });
    }

    return false;
}

/**
 * Release a lock on a repo. Only the execution that acquired it can release it.
 */
export function releaseRepoLock(db: Database, repo: string, executionId: string): boolean {
    const result = db.query(
        `DELETE FROM repo_locks WHERE repo = ? AND execution_id = ?`,
    ).run(repo, executionId);

    if (result.changes > 0) {
        log.debug('Released repo lock', { repo, executionId });
        return true;
    }
    return false;
}

/**
 * Release all locks held by a specific execution.
 */
export function releaseAllLocks(db: Database, executionId: string): number {
    const result = db.query(
        `DELETE FROM repo_locks WHERE execution_id = ?`,
    ).run(executionId);

    if (result.changes > 0) {
        log.debug('Released all locks for execution', { executionId, count: result.changes });
    }
    return result.changes;
}

/**
 * Get the current lock on a repo, if any.
 */
export function getRepoLock(db: Database, repo: string): RepoLock | null {
    const row = db.query(
        `SELECT repo, execution_id, schedule_id, action_type, locked_at, expires_at
         FROM repo_locks WHERE repo = ?`,
    ).get(repo) as {
        repo: string;
        execution_id: string;
        schedule_id: string;
        action_type: string;
        locked_at: string;
        expires_at: string;
    } | null;

    if (!row) return null;

    return {
        repo: row.repo,
        executionId: row.execution_id,
        scheduleId: row.schedule_id,
        actionType: row.action_type,
        lockedAt: row.locked_at,
        expiresAt: row.expires_at,
    };
}

/**
 * List all active locks.
 */
export function listRepoLocks(db: Database): RepoLock[] {
    cleanExpiredLocks(db);

    const rows = db.query(
        `SELECT repo, execution_id, schedule_id, action_type, locked_at, expires_at
         FROM repo_locks ORDER BY locked_at ASC`,
    ).all() as Array<{
        repo: string;
        execution_id: string;
        schedule_id: string;
        action_type: string;
        locked_at: string;
        expires_at: string;
    }>;

    return rows.map(row => ({
        repo: row.repo,
        executionId: row.execution_id,
        scheduleId: row.schedule_id,
        actionType: row.action_type,
        lockedAt: row.locked_at,
        expiresAt: row.expires_at,
    }));
}

/**
 * Remove all expired locks.
 */
export function cleanExpiredLocks(db: Database): number {
    const result = db.query(
        `DELETE FROM repo_locks WHERE expires_at < datetime('now')`,
    ).run();

    if (result.changes > 0) {
        log.debug('Cleaned expired repo locks', { count: result.changes });
    }
    return result.changes;
}

/**
 * Query recent schedule executions and work tasks for a given repo/project.
 * Returns a summary of what was done recently so schedules can avoid duplicate work.
 */
export function getRecentRepoActivity(
    db: Database,
    repo: string,
    windowHours: number = 24,
): { executions: RecentExecution[]; workTasks: RecentWorkTask[] } {
    // Recent schedule executions that targeted this repo
    const executions = db.query(
        `SELECT se.id, se.schedule_id, se.action_type, se.status, se.result, se.started_at
         FROM schedule_executions se
         WHERE se.started_at >= datetime('now', '-' || ? || ' hours')
           AND (se.action_input LIKE '%' || ? || '%')
           AND se.status IN ('completed', 'running')
         ORDER BY se.started_at DESC
         LIMIT 20`,
    ).all(windowHours, repo) as RecentExecution[];

    // Recent work tasks with PRs on this repo
    const workTasks = db.query(
        `SELECT wt.id, wt.description, wt.status, wt.pr_url, wt.created_at
         FROM work_tasks wt
         WHERE wt.created_at >= datetime('now', '-' || ? || ' hours')
           AND wt.pr_url LIKE '%' || ? || '%'
         ORDER BY wt.created_at DESC
         LIMIT 20`,
    ).all(windowHours, repo) as RecentWorkTask[];

    return { executions, workTasks };
}

export interface RecentExecution {
    id: string;
    schedule_id: string;
    action_type: string;
    status: string;
    result: string | null;
    started_at: string;
}

export interface RecentWorkTask {
    id: string;
    description: string;
    status: string;
    pr_url: string | null;
    created_at: string;
}

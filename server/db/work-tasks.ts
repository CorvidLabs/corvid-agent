import type { Database } from 'bun:sqlite';
import type { WorkTask, WorkTaskStatus, WorkTaskDependency, RetryBackoff } from '../../shared/types';
import { DEFAULT_TENANT_ID } from '../tenant/types';
import { withTenantFilter, validateTenantOwnership } from '../tenant/db-filter';

interface WorkTaskRow {
    id: string;
    agent_id: string;
    project_id: string;
    session_id: string | null;
    source: string;
    source_id: string | null;
    requester_info: string;
    description: string;
    branch_name: string | null;
    status: string;
    pr_url: string | null;
    summary: string | null;
    error: string | null;
    original_branch: string | null;
    worktree_dir: string | null;
    iteration_count: number;
    max_retries: number;
    retry_count: number;
    retry_backoff: string;
    last_retry_at: string | null;
    created_at: string;
    completed_at: string | null;
}

function rowToWorkTask(row: WorkTaskRow): WorkTask {
    let requesterInfo: Record<string, unknown> = {};
    try {
        requesterInfo = JSON.parse(row.requester_info);
    } catch {
        // Default to empty object
    }

    return {
        id: row.id,
        agentId: row.agent_id,
        projectId: row.project_id,
        sessionId: row.session_id,
        source: row.source as WorkTask['source'],
        sourceId: row.source_id,
        requesterInfo,
        description: row.description,
        branchName: row.branch_name,
        status: row.status as WorkTaskStatus,
        prUrl: row.pr_url,
        summary: row.summary,
        error: row.error,
        originalBranch: row.original_branch,
        worktreeDir: row.worktree_dir,
        iterationCount: row.iteration_count ?? 0,
        maxRetries: row.max_retries ?? 0,
        retryCount: row.retry_count ?? 0,
        retryBackoff: (row.retry_backoff ?? 'fixed') as RetryBackoff,
        lastRetryAt: row.last_retry_at ?? null,
        createdAt: row.created_at,
        completedAt: row.completed_at,
    };
}

export function createWorkTask(
    db: Database,
    params: {
        agentId: string;
        projectId: string;
        description: string;
        source?: string;
        sourceId?: string;
        requesterInfo?: Record<string, unknown>;
        tenantId?: string;
        maxRetries?: number;
        retryBackoff?: RetryBackoff;
    },
): WorkTask {
    const id = crypto.randomUUID();
    const tenantId = params.tenantId ?? DEFAULT_TENANT_ID;
    db.query(
        `INSERT INTO work_tasks (id, agent_id, project_id, description, source, source_id, requester_info, tenant_id, max_retries, retry_backoff)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
        id,
        params.agentId,
        params.projectId,
        params.description,
        params.source ?? 'web',
        params.sourceId ?? null,
        JSON.stringify(params.requesterInfo ?? {}),
        tenantId,
        params.maxRetries ?? 0,
        params.retryBackoff ?? 'fixed',
    );

    return getWorkTask(db, id) as WorkTask;
}

/**
 * Atomically insert a work task only if the project's concurrency limit is not exceeded.
 * Returns the new WorkTask, or null if the concurrency limit blocked the insert.
 */
export function createWorkTaskAtomic(
    db: Database,
    params: {
        agentId: string;
        projectId: string;
        description: string;
        source?: string;
        sourceId?: string;
        requesterInfo?: Record<string, unknown>;
        tenantId?: string;
        maxRetries?: number;
        retryBackoff?: RetryBackoff;
    },
): WorkTask | null {
    const id = crypto.randomUUID();
    const source = params.source ?? 'web';
    const sourceId = params.sourceId ?? null;
    const requesterInfo = JSON.stringify(params.requesterInfo ?? {});
    const tenantId = params.tenantId ?? DEFAULT_TENANT_ID;
    const maxRetries = params.maxRetries ?? 0;
    const retryBackoff = params.retryBackoff ?? 'fixed';

    const result = db.query(
        `INSERT INTO work_tasks (id, agent_id, project_id, description, source, source_id, requester_info, tenant_id, max_retries, retry_backoff)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
         WHERE (
             SELECT COUNT(*) FROM work_tasks
             WHERE project_id = ? AND status IN ('branching', 'running', 'validating')
         ) < (
             SELECT COALESCE(max_concurrency, 1) FROM projects WHERE id = ?
         )`
    ).run(
        id,
        params.agentId,
        params.projectId,
        params.description,
        source,
        sourceId,
        requesterInfo,
        tenantId,
        maxRetries,
        retryBackoff,
        params.projectId,
        params.projectId,
    );

    if (result.changes === 0) {
        return null;
    }

    return getWorkTask(db, id) as WorkTask;
}

export function getWorkTask(db: Database, id: string, tenantId: string = DEFAULT_TENANT_ID): WorkTask | null {
    if (!validateTenantOwnership(db, 'work_tasks', id, tenantId)) return null;
    const row = db.query('SELECT * FROM work_tasks WHERE id = ?').get(id) as WorkTaskRow | null;
    return row ? rowToWorkTask(row) : null;
}

export function getWorkTaskBySessionId(db: Database, sessionId: string): WorkTask | null {
    const row = db.query(
        'SELECT * FROM work_tasks WHERE session_id = ?'
    ).get(sessionId) as WorkTaskRow | null;
    return row ? rowToWorkTask(row) : null;
}

export function updateWorkTaskStatus(
    db: Database,
    id: string,
    status: WorkTaskStatus,
    extra?: {
        sessionId?: string;
        branchName?: string;
        prUrl?: string;
        summary?: string;
        error?: string;
        originalBranch?: string;
        worktreeDir?: string;
        iterationCount?: number;
        retryCount?: number;
        lastRetryAt?: string;
    },
): void {
    const fields: string[] = ['status = ?'];
    const values: unknown[] = [status];

    if (extra?.sessionId !== undefined) {
        fields.push('session_id = ?');
        values.push(extra.sessionId);
    }
    if (extra?.branchName !== undefined) {
        fields.push('branch_name = ?');
        values.push(extra.branchName);
    }
    if (extra?.prUrl !== undefined) {
        fields.push('pr_url = ?');
        values.push(extra.prUrl);
    }
    if (extra?.summary !== undefined) {
        fields.push('summary = ?');
        values.push(extra.summary);
    }
    if (extra?.error !== undefined) {
        fields.push('error = ?');
        values.push(extra.error);
    }
    if (extra?.originalBranch !== undefined) {
        fields.push('original_branch = ?');
        values.push(extra.originalBranch);
    }
    if (extra?.worktreeDir !== undefined) {
        fields.push('worktree_dir = ?');
        values.push(extra.worktreeDir);
    }
    if (extra?.iterationCount !== undefined) {
        fields.push('iteration_count = ?');
        values.push(extra.iterationCount);
    }
    if (extra?.retryCount !== undefined) {
        fields.push('retry_count = ?');
        values.push(extra.retryCount);
    }
    if (extra?.lastRetryAt !== undefined) {
        fields.push('last_retry_at = ?');
        values.push(extra.lastRetryAt);
    }
    if (status === 'completed' || status === 'failed') {
        fields.push("completed_at = datetime('now')");
    }

    values.push(id);
    db.query(`UPDATE work_tasks SET ${fields.join(', ')} WHERE id = ?`).run(...(values as string[]));
}

/**
 * Mark all active (branching/running/validating) work tasks as failed.
 * Called at startup to recover from unclean shutdown.
 * Returns the list of affected tasks (for branch restoration).
 */
export function cleanupStaleWorkTasks(db: Database): WorkTask[] {
    // Wrap SELECT→UPDATE in a transaction to prevent a race where a task
    // starts between the read and the status update.
    const cleanup = db.transaction(() => {
        const staleRows = db.query(
            `SELECT * FROM work_tasks WHERE status IN ('branching', 'running', 'validating')`
        ).all() as WorkTaskRow[];

        if (staleRows.length === 0) return [];

        db.query(
            `UPDATE work_tasks
             SET status = 'failed', error = 'Interrupted by server restart', completed_at = datetime('now')
             WHERE status IN ('branching', 'running', 'validating')`
        ).run();

        return staleRows.map(rowToWorkTask);
    });

    return cleanup();
}

/**
 * Reset a failed work task back to pending for retry.
 * Clears transient fields so the task can be re-executed from scratch.
 * Increments retry_count and records last_retry_at.
 */
export function resetWorkTaskForRetry(db: Database, id: string): void {
    db.query(
        `UPDATE work_tasks
         SET status = 'pending',
             session_id = NULL,
             branch_name = NULL,
             worktree_dir = NULL,
             original_branch = NULL,
             error = NULL,
             completed_at = NULL,
             iteration_count = 0,
             retry_count = retry_count + 1,
             last_retry_at = datetime('now')
         WHERE id = ?`
    ).run(id);
}

/**
 * Return all work tasks currently in an active state (branching, running, validating).
 */
export function getActiveWorkTasks(db: Database): WorkTask[] {
    const rows = db.query(
        `SELECT * FROM work_tasks WHERE status IN ('branching', 'running', 'validating')`
    ).all() as WorkTaskRow[];
    return rows.map(rowToWorkTask);
}

/**
 * Count active work tasks for a specific project.
 */
export function countActiveWorkTasksForProject(db: Database, projectId: string): number {
    const row = db.query(
        `SELECT COUNT(*) as count FROM work_tasks WHERE project_id = ? AND status IN ('branching', 'running', 'validating')`
    ).get(projectId) as { count: number };
    return row.count;
}

export function listWorkTasks(db: Database, agentId?: string, tenantId: string = DEFAULT_TENANT_ID): WorkTask[] {
    if (agentId) {
        const { query, bindings } = withTenantFilter('SELECT * FROM work_tasks WHERE agent_id = ? ORDER BY created_at DESC', tenantId);
        const rows = db.query(query).all(agentId, ...bindings) as WorkTaskRow[];
        return rows.map(rowToWorkTask);
    }

    const { query, bindings } = withTenantFilter('SELECT * FROM work_tasks ORDER BY created_at DESC', tenantId);
    const rows = db.query(query).all(...bindings) as WorkTaskRow[];
    return rows.map(rowToWorkTask);
}

// ─── Dependencies ──────────────────────────────────────────────────────────────

interface WorkTaskDepRow {
    id: number;
    task_id: string;
    depends_on_task_id: string;
    created_at: string;
}

function rowToDependency(row: WorkTaskDepRow): WorkTaskDependency {
    return {
        id: row.id,
        taskId: row.task_id,
        dependsOnTaskId: row.depends_on_task_id,
        createdAt: row.created_at,
    };
}

/**
 * Add a dependency: taskId depends on dependsOnTaskId.
 */
export function addTaskDependency(db: Database, taskId: string, dependsOnTaskId: string): WorkTaskDependency {
    db.query(
        `INSERT OR IGNORE INTO work_task_dependencies (task_id, depends_on_task_id) VALUES (?, ?)`
    ).run(taskId, dependsOnTaskId);
    const row = db.query(
        `SELECT * FROM work_task_dependencies WHERE task_id = ? AND depends_on_task_id = ?`
    ).get(taskId, dependsOnTaskId) as WorkTaskDepRow;
    return rowToDependency(row);
}

/**
 * Remove a dependency.
 */
export function removeTaskDependency(db: Database, taskId: string, dependsOnTaskId: string): boolean {
    const result = db.query(
        `DELETE FROM work_task_dependencies WHERE task_id = ? AND depends_on_task_id = ?`
    ).run(taskId, dependsOnTaskId);
    return result.changes > 0;
}

/**
 * List all dependencies for a task (what it depends on).
 */
export function getTaskDependencies(db: Database, taskId: string): WorkTaskDependency[] {
    const rows = db.query(
        `SELECT * FROM work_task_dependencies WHERE task_id = ? ORDER BY created_at`
    ).all(taskId) as WorkTaskDepRow[];
    return rows.map(rowToDependency);
}

/**
 * List all tasks that depend on the given task (dependents/downstream).
 */
export function getTaskDependents(db: Database, taskId: string): WorkTaskDependency[] {
    const rows = db.query(
        `SELECT * FROM work_task_dependencies WHERE depends_on_task_id = ? ORDER BY created_at`
    ).all(taskId) as WorkTaskDepRow[];
    return rows.map(rowToDependency);
}

/**
 * Check whether all dependencies for a task are completed.
 * Returns true if the task has no unmet dependencies.
 */
export function areDependenciesMet(db: Database, taskId: string): boolean {
    const row = db.query(
        `SELECT COUNT(*) as count FROM work_task_dependencies d
         JOIN work_tasks t ON t.id = d.depends_on_task_id
         WHERE d.task_id = ? AND t.status != 'completed'`
    ).get(taskId) as { count: number };
    return row.count === 0;
}

/**
 * Find pending tasks whose dependencies are all met and that fit within
 * their project's concurrency limit. Used by the scheduler to start queued tasks.
 */
export function findReadyTasks(db: Database): WorkTask[] {
    const rows = db.query(
        `SELECT wt.* FROM work_tasks wt
         WHERE wt.status = 'pending'
           AND NOT EXISTS (
               SELECT 1 FROM work_task_dependencies d
               JOIN work_tasks dep ON dep.id = d.depends_on_task_id
               WHERE d.task_id = wt.id AND dep.status != 'completed'
           )
           AND (
               SELECT COUNT(*) FROM work_tasks active
               WHERE active.project_id = wt.project_id
                 AND active.status IN ('branching', 'running', 'validating')
           ) < (
               SELECT COALESCE(max_concurrency, 1) FROM projects WHERE id = wt.project_id
           )
         ORDER BY wt.created_at ASC`
    ).all() as WorkTaskRow[];
    return rows.map(rowToWorkTask);
}

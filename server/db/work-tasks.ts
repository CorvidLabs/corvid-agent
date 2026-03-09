import type { Database } from 'bun:sqlite';
import type { WorkTask, WorkTaskStatus, WorkTaskPriority } from '../../shared/types';
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
        priority: 2 as WorkTaskPriority,
        prUrl: row.pr_url,
        summary: row.summary,
        error: row.error,
        originalBranch: row.original_branch,
        worktreeDir: row.worktree_dir,
        iterationCount: row.iteration_count ?? 0,
        maxRetries: (row as unknown as Record<string, unknown>).max_retries as number ?? 0,
        retryCount: (row as unknown as Record<string, unknown>).retry_count as number ?? 0,
        retryBackoff: ((row as unknown as Record<string, unknown>).retry_backoff as string ?? 'fixed') as WorkTask['retryBackoff'],
        lastRetryAt: (row as unknown as Record<string, unknown>).last_retry_at as string ?? null,
        preemptedBy: null,
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
        priority?: WorkTaskPriority;
        tenantId?: string;
    },
): WorkTask {
    const id = crypto.randomUUID();
    const tenantId = params.tenantId ?? DEFAULT_TENANT_ID;
    db.query(
        `INSERT INTO work_tasks (id, agent_id, project_id, description, source, source_id, requester_info, tenant_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
        id,
        params.agentId,
        params.projectId,
        params.description,
        params.source ?? 'web',
        params.sourceId ?? null,
        JSON.stringify(params.requesterInfo ?? {}),
        tenantId,
    );

    const task = getWorkTask(db, id) as WorkTask;
    // Apply in-memory priority (not persisted to DB)
    task.priority = (params.priority ?? 2) as WorkTaskPriority;
    return task;
}

/**
 * Atomically insert a work task only if no concurrent active task exists on the same project.
 * Returns the new WorkTask, or null if another active task blocked the insert.
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
        priority?: WorkTaskPriority;
        tenantId?: string;
    },
): WorkTask | null {
    const id = crypto.randomUUID();
    const source = params.source ?? 'web';
    const sourceId = params.sourceId ?? null;
    const requesterInfo = JSON.stringify(params.requesterInfo ?? {});
    const tenantId = params.tenantId ?? DEFAULT_TENANT_ID;

    const result = db.query(
        `INSERT INTO work_tasks (id, agent_id, project_id, description, source, source_id, requester_info, tenant_id)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?
         WHERE NOT EXISTS (
             SELECT 1 FROM work_tasks
             WHERE project_id = ? AND status IN ('branching', 'running', 'validating')
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
        params.projectId,
    );

    if (result.changes === 0) {
        return null;
    }

    const task = getWorkTask(db, id) as WorkTask;
    // Apply in-memory priority (not persisted to DB)
    task.priority = (params.priority ?? 2) as WorkTaskPriority;
    return task;
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

        // Also resume any paused tasks — the preempting task is now gone
        db.query(
            `UPDATE work_tasks SET status = 'pending' WHERE status = 'paused'`
        ).run();

        return staleRows.map(rowToWorkTask);
    });

    return cleanup();
}

/**
 * Reset a failed work task back to pending for retry.
 * Clears transient fields so the task can be re-executed from scratch.
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
             iteration_count = 0
         WHERE id = ?`
    ).run(id);
}

/**
 * Return all work tasks currently in an active state (branching, running, validating, paused, queued).
 */
export function getActiveWorkTasks(db: Database): WorkTask[] {
    const rows = db.query(
        `SELECT * FROM work_tasks WHERE status IN ('branching', 'running', 'validating', 'paused', 'queued')`
    ).all() as WorkTaskRow[];
    return rows.map(rowToWorkTask);
}

/**
 * Get the next pending/queued task for a project, ordered by creation time (FIFO).
 * Priority-based ordering is handled at the service layer using in-memory state.
 */
export function dequeueNextTask(db: Database, projectId: string): WorkTask | null {
    const row = db.query(
        `SELECT * FROM work_tasks
         WHERE project_id = ? AND status IN ('pending', 'queued')
         ORDER BY created_at ASC
         LIMIT 1`
    ).get(projectId) as WorkTaskRow | null;
    return row ? rowToWorkTask(row) : null;
}

/**
 * Get all pending/queued tasks for a project, ordered by creation time.
 * The service layer re-sorts these by in-memory priority.
 */
export function getPendingTasksForProject(db: Database, projectId: string): WorkTask[] {
    const rows = db.query(
        `SELECT * FROM work_tasks
         WHERE project_id = ? AND status IN ('pending', 'queued')
         ORDER BY created_at ASC`
    ).all(projectId) as WorkTaskRow[];
    return rows.map(rowToWorkTask);
}

/**
 * Find the currently active (branching/running/validating) task on a project.
 */
export function getActiveTaskForProject(db: Database, projectId: string): WorkTask | null {
    const row = db.query(
        `SELECT * FROM work_tasks
         WHERE project_id = ? AND status IN ('branching', 'running', 'validating')
         LIMIT 1`
    ).get(projectId) as WorkTaskRow | null;
    return row ? rowToWorkTask(row) : null;
}

/**
 * Pause a running task so a higher-priority task can run.
 * Preemption tracking (who paused whom) is managed in-memory by the service.
 */
export function pauseWorkTask(db: Database, taskId: string): void {
    db.query(
        `UPDATE work_tasks SET status = 'paused' WHERE id = ?`
    ).run(taskId);
}

/**
 * Resume a paused task after the preempting task completes.
 */
export function resumePausedTask(db: Database, taskId: string): void {
    db.query(
        `UPDATE work_tasks SET status = 'pending' WHERE id = ? AND status = 'paused'`
    ).run(taskId);
}

/**
 * Get all paused tasks for a project.
 */
export function getPausedTasks(db: Database, projectId: string): WorkTask[] {
    const rows = db.query(
        `SELECT * FROM work_tasks WHERE project_id = ? AND status = 'paused' ORDER BY created_at ASC`
    ).all(projectId) as WorkTaskRow[];
    return rows.map(rowToWorkTask);
}

/**
 * Count pending/queued tasks for a project.
 */
export function countQueuedTasks(db: Database, projectId: string): number {
    const row = db.query(
        `SELECT COUNT(*) as cnt FROM work_tasks WHERE project_id = ? AND status IN ('pending', 'queued')`
    ).get(projectId) as { cnt: number };
    return row.cnt;
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

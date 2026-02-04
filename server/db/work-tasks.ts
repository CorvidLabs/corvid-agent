import type { Database } from 'bun:sqlite';
import type { WorkTask, WorkTaskStatus } from '../../shared/types';

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
        prUrl: row.pr_url,
        summary: row.summary,
        error: row.error,
        originalBranch: row.original_branch,
        worktreeDir: row.worktree_dir,
        iterationCount: row.iteration_count ?? 0,
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
    },
): WorkTask {
    const id = crypto.randomUUID();
    db.query(
        `INSERT INTO work_tasks (id, agent_id, project_id, description, source, source_id, requester_info)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
        id,
        params.agentId,
        params.projectId,
        params.description,
        params.source ?? 'web',
        params.sourceId ?? null,
        JSON.stringify(params.requesterInfo ?? {}),
    );

    return getWorkTask(db, id) as WorkTask;
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
    },
): WorkTask | null {
    const id = crypto.randomUUID();
    const source = params.source ?? 'web';
    const sourceId = params.sourceId ?? null;
    const requesterInfo = JSON.stringify(params.requesterInfo ?? {});

    const result = db.query(
        `INSERT INTO work_tasks (id, agent_id, project_id, description, source, source_id, requester_info)
         SELECT ?, ?, ?, ?, ?, ?, ?
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
        params.projectId,
    );

    if (result.changes === 0) {
        return null;
    }

    return getWorkTask(db, id) as WorkTask;
}

export function getWorkTask(db: Database, id: string): WorkTask | null {
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
    // First, fetch the stale tasks so we can return them
    const staleRows = db.query(
        `SELECT * FROM work_tasks WHERE status IN ('branching', 'running', 'validating')`
    ).all() as WorkTaskRow[];

    if (staleRows.length === 0) return [];

    // Mark them all as failed
    db.query(
        `UPDATE work_tasks
         SET status = 'failed', error = 'Interrupted by server restart', completed_at = datetime('now')
         WHERE status IN ('branching', 'running', 'validating')`
    ).run();

    return staleRows.map(rowToWorkTask);
}

export function listWorkTasks(db: Database, agentId?: string): WorkTask[] {
    if (agentId) {
        const rows = db.query(
            'SELECT * FROM work_tasks WHERE agent_id = ? ORDER BY created_at DESC'
        ).all(agentId) as WorkTaskRow[];
        return rows.map(rowToWorkTask);
    }

    const rows = db.query(
        'SELECT * FROM work_tasks ORDER BY created_at DESC'
    ).all() as WorkTaskRow[];
    return rows.map(rowToWorkTask);
}

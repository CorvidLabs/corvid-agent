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
    if (status === 'completed' || status === 'failed') {
        fields.push("completed_at = datetime('now')");
    }

    values.push(id);
    db.query(`UPDATE work_tasks SET ${fields.join(', ')} WHERE id = ?`).run(...(values as string[]));
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

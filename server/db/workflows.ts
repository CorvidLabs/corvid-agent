import type { Database } from 'bun:sqlite';
import type {
    Workflow,
    WorkflowRun,
    WorkflowNodeRun,
    WorkflowNode,
    WorkflowEdge,
    WorkflowStatus,
    WorkflowRunStatus,
    WorkflowNodeRunStatus,
    WorkflowNodeType,
    CreateWorkflowInput,
    UpdateWorkflowInput,
} from '../../shared/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rowToWorkflow(row: Record<string, unknown>): Workflow {
    return {
        id: row.id as string,
        agentId: row.agent_id as string,
        name: row.name as string,
        description: (row.description as string) ?? '',
        nodes: JSON.parse((row.nodes as string) ?? '[]') as WorkflowNode[],
        edges: JSON.parse((row.edges as string) ?? '[]') as WorkflowEdge[],
        status: (row.status as WorkflowStatus) ?? 'draft',
        defaultProjectId: row.default_project_id as string | null,
        maxConcurrency: (row.max_concurrency as number) ?? 2,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
    };
}

function rowToRun(row: Record<string, unknown>): WorkflowRun {
    const snapshotRaw = row.workflow_snapshot as string | null;
    const snapshot = snapshotRaw ? JSON.parse(snapshotRaw) : { nodes: [], edges: [] };
    return {
        id: row.id as string,
        workflowId: row.workflow_id as string,
        agentId: row.agent_id as string,
        status: (row.status as WorkflowRunStatus) ?? 'running',
        input: JSON.parse((row.input as string) ?? '{}'),
        output: row.output ? JSON.parse(row.output as string) : null,
        workflowSnapshot: snapshot,
        nodeRuns: [], // Populated separately
        currentNodeIds: JSON.parse((row.current_node_ids as string) ?? '[]'),
        error: row.error as string | null,
        startedAt: row.started_at as string,
        completedAt: row.completed_at as string | null,
    };
}

function rowToNodeRun(row: Record<string, unknown>): WorkflowNodeRun {
    return {
        id: row.id as string,
        runId: row.run_id as string,
        nodeId: row.node_id as string,
        nodeType: row.node_type as WorkflowNodeType,
        status: (row.status as WorkflowNodeRunStatus) ?? 'pending',
        input: JSON.parse((row.input as string) ?? '{}'),
        output: row.output ? JSON.parse(row.output as string) : null,
        sessionId: row.session_id as string | null,
        workTaskId: row.work_task_id as string | null,
        error: row.error as string | null,
        startedAt: row.started_at as string | null,
        completedAt: row.completed_at as string | null,
    };
}

// ─── Workflow CRUD ───────────────────────────────────────────────────────────

export function createWorkflow(db: Database, input: CreateWorkflowInput): Workflow {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    db.query(`
        INSERT INTO workflows (id, agent_id, name, description, nodes, edges,
            status, default_project_id, max_concurrency, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)
    `).run(
        id,
        input.agentId,
        input.name,
        input.description ?? '',
        JSON.stringify(input.nodes),
        JSON.stringify(input.edges),
        input.defaultProjectId ?? null,
        input.maxConcurrency ?? 2,
        now,
        now,
    );

    return getWorkflow(db, id)!;
}

export function getWorkflow(db: Database, id: string): Workflow | null {
    const row = db.query('SELECT * FROM workflows WHERE id = ?').get(id) as Record<string, unknown> | null;
    return row ? rowToWorkflow(row) : null;
}

export function listWorkflows(db: Database, agentId?: string): Workflow[] {
    const rows = agentId
        ? db.query('SELECT * FROM workflows WHERE agent_id = ? ORDER BY updated_at DESC').all(agentId)
        : db.query('SELECT * FROM workflows ORDER BY updated_at DESC').all();
    return (rows as Record<string, unknown>[]).map(rowToWorkflow);
}

export function updateWorkflow(db: Database, id: string, input: UpdateWorkflowInput): Workflow | null {
    const existing = getWorkflow(db, id);
    if (!existing) return null;

    const sets: string[] = [];
    const values: (string | number | null)[] = [];

    if (input.name !== undefined) { sets.push('name = ?'); values.push(input.name); }
    if (input.description !== undefined) { sets.push('description = ?'); values.push(input.description); }
    if (input.nodes !== undefined) { sets.push('nodes = ?'); values.push(JSON.stringify(input.nodes)); }
    if (input.edges !== undefined) { sets.push('edges = ?'); values.push(JSON.stringify(input.edges)); }
    if (input.status !== undefined) { sets.push('status = ?'); values.push(input.status); }
    if (input.defaultProjectId !== undefined) { sets.push('default_project_id = ?'); values.push(input.defaultProjectId); }
    if (input.maxConcurrency !== undefined) { sets.push('max_concurrency = ?'); values.push(input.maxConcurrency); }

    if (sets.length === 0) return existing;

    sets.push("updated_at = datetime('now')");
    values.push(id);

    db.query(`UPDATE workflows SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    return getWorkflow(db, id);
}

export function deleteWorkflow(db: Database, id: string): boolean {
    const result = db.query('DELETE FROM workflows WHERE id = ?').run(id);
    return result.changes > 0;
}

// ─── Workflow Runs ──────────────────────────────────────────────────────────

export function createWorkflowRun(
    db: Database,
    workflowId: string,
    agentId: string,
    input: Record<string, unknown>,
    workflowSnapshot: { nodes: WorkflowNode[]; edges: WorkflowEdge[] },
): WorkflowRun {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    db.query(`
        INSERT INTO workflow_runs (id, workflow_id, agent_id, status, input, workflow_snapshot, current_node_ids, started_at)
        VALUES (?, ?, ?, 'running', ?, ?, '[]', ?)
    `).run(
        id,
        workflowId,
        agentId,
        JSON.stringify(input),
        JSON.stringify(workflowSnapshot),
        now,
    );

    return getWorkflowRun(db, id)!;
}

export function getWorkflowRun(db: Database, id: string): WorkflowRun | null {
    const row = db.query('SELECT * FROM workflow_runs WHERE id = ?').get(id) as Record<string, unknown> | null;
    if (!row) return null;
    const run = rowToRun(row);
    run.nodeRuns = listNodeRuns(db, id);
    return run;
}

export function listWorkflowRuns(db: Database, workflowId?: string, limit = 50): WorkflowRun[] {
    const rows = workflowId
        ? db.query('SELECT * FROM workflow_runs WHERE workflow_id = ? ORDER BY started_at DESC LIMIT ?').all(workflowId, limit)
        : db.query('SELECT * FROM workflow_runs ORDER BY started_at DESC LIMIT ?').all(limit);
    return (rows as Record<string, unknown>[]).map((row) => {
        const run = rowToRun(row);
        // Don't load node runs for list queries (performance)
        return run;
    });
}

export function listActiveRuns(db: Database): WorkflowRun[] {
    const rows = db.query(
        `SELECT * FROM workflow_runs WHERE status IN ('running', 'paused') ORDER BY started_at ASC`
    ).all();
    return (rows as Record<string, unknown>[]).map((row) => {
        const run = rowToRun(row);
        run.nodeRuns = listNodeRuns(db, run.id);
        return run;
    });
}

export function updateWorkflowRunStatus(
    db: Database,
    id: string,
    status: WorkflowRunStatus,
    updates?: {
        output?: Record<string, unknown>;
        currentNodeIds?: string[];
        error?: string;
    },
): void {
    const sets = ['status = ?'];
    const values: (string | number | null)[] = [status];

    if (updates?.output !== undefined) {
        sets.push('output = ?');
        values.push(JSON.stringify(updates.output));
    }
    if (updates?.currentNodeIds !== undefined) {
        sets.push('current_node_ids = ?');
        values.push(JSON.stringify(updates.currentNodeIds));
    }
    if (updates?.error !== undefined) {
        sets.push('error = ?');
        values.push(updates.error);
    }
    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
        sets.push("completed_at = datetime('now')");
    }

    values.push(id);
    db.query(`UPDATE workflow_runs SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}

// ─── Workflow Node Runs ─────────────────────────────────────────────────────

export function createNodeRun(
    db: Database,
    runId: string,
    nodeId: string,
    nodeType: WorkflowNodeType,
    input: Record<string, unknown>,
): WorkflowNodeRun {
    const id = crypto.randomUUID();

    db.query(`
        INSERT INTO workflow_node_runs (id, run_id, node_id, node_type, status, input)
        VALUES (?, ?, ?, ?, 'pending', ?)
    `).run(id, runId, nodeId, nodeType, JSON.stringify(input));

    return getNodeRun(db, id)!;
}

export function getNodeRun(db: Database, id: string): WorkflowNodeRun | null {
    const row = db.query('SELECT * FROM workflow_node_runs WHERE id = ?').get(id) as Record<string, unknown> | null;
    return row ? rowToNodeRun(row) : null;
}

export function listNodeRuns(db: Database, runId: string): WorkflowNodeRun[] {
    const rows = db.query(
        'SELECT * FROM workflow_node_runs WHERE run_id = ? ORDER BY started_at ASC NULLS LAST'
    ).all(runId);
    return (rows as Record<string, unknown>[]).map(rowToNodeRun);
}

export function updateNodeRunStatus(
    db: Database,
    id: string,
    status: WorkflowNodeRunStatus,
    updates?: {
        output?: Record<string, unknown>;
        sessionId?: string;
        workTaskId?: string;
        error?: string;
    },
): void {
    const sets = ['status = ?'];
    const values: (string | number | null)[] = [status];

    if (status === 'running' || status === 'waiting') {
        sets.push("started_at = COALESCE(started_at, datetime('now'))");
    }
    if (updates?.output !== undefined) {
        sets.push('output = ?');
        values.push(JSON.stringify(updates.output));
    }
    if (updates?.sessionId !== undefined) {
        sets.push('session_id = ?');
        values.push(updates.sessionId);
    }
    if (updates?.workTaskId !== undefined) {
        sets.push('work_task_id = ?');
        values.push(updates.workTaskId);
    }
    if (updates?.error !== undefined) {
        sets.push('error = ?');
        values.push(updates.error);
    }
    if (status === 'completed' || status === 'failed' || status === 'skipped') {
        sets.push("completed_at = datetime('now')");
    }

    values.push(id);
    db.query(`UPDATE workflow_node_runs SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}

/** Find a node run by run_id + node_id (for checking if a node was already executed). */
export function getNodeRunByNodeId(db: Database, runId: string, nodeId: string): WorkflowNodeRun | null {
    const row = db.query(
        'SELECT * FROM workflow_node_runs WHERE run_id = ? AND node_id = ?'
    ).get(runId, nodeId) as Record<string, unknown> | null;
    return row ? rowToNodeRun(row) : null;
}

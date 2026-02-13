import type { Database } from 'bun:sqlite';
import type {
    AgentSchedule,
    ScheduleExecution,
    CreateScheduleInput,
    UpdateScheduleInput,
    ScheduleAction,
    ScheduleApprovalPolicy,
    ScheduleStatus,
    ScheduleExecutionStatus,
    ScheduleActionType,
} from '../../shared/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rowToSchedule(row: Record<string, unknown>): AgentSchedule {
    return {
        id: row.id as string,
        agentId: row.agent_id as string,
        name: row.name as string,
        description: (row.description as string) ?? '',
        cronExpression: (row.cron_expression as string) ?? '',
        intervalMs: row.interval_ms as number | null,
        actions: JSON.parse((row.actions as string) ?? '[]') as ScheduleAction[],
        approvalPolicy: (row.approval_policy as ScheduleApprovalPolicy) ?? 'owner_approve',
        status: (row.status as ScheduleStatus) ?? 'active',
        maxExecutions: row.max_executions as number | null,
        executionCount: (row.execution_count as number) ?? 0,
        maxBudgetPerRun: row.max_budget_per_run as number | null,
        notifyAddress: row.notify_address as string | null,
        lastRunAt: row.last_run_at as string | null,
        nextRunAt: row.next_run_at as string | null,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
    };
}

function rowToExecution(row: Record<string, unknown>): ScheduleExecution {
    const configSnapshotRaw = row.config_snapshot as string | null;
    return {
        id: row.id as string,
        scheduleId: row.schedule_id as string,
        agentId: row.agent_id as string,
        status: (row.status as ScheduleExecutionStatus) ?? 'running',
        actionType: row.action_type as ScheduleActionType,
        actionInput: JSON.parse((row.action_input as string) ?? '{}'),
        result: row.result as string | null,
        sessionId: row.session_id as string | null,
        workTaskId: row.work_task_id as string | null,
        costUsd: (row.cost_usd as number) ?? 0,
        configSnapshot: configSnapshotRaw ? JSON.parse(configSnapshotRaw) : undefined,
        startedAt: row.started_at as string,
        completedAt: row.completed_at as string | null,
    };
}

// ─── Schedule CRUD ───────────────────────────────────────────────────────────

export function createSchedule(db: Database, input: CreateScheduleInput): AgentSchedule {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    db.query(`
        INSERT INTO agent_schedules (id, agent_id, name, description, cron_expression, interval_ms,
            actions, approval_policy, max_executions, max_budget_per_run, notify_address, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id,
        input.agentId,
        input.name,
        input.description ?? '',
        input.cronExpression ?? null,
        input.intervalMs ?? null,
        JSON.stringify(input.actions),
        input.approvalPolicy ?? 'owner_approve',
        input.maxExecutions ?? null,
        input.maxBudgetPerRun ?? null,
        input.notifyAddress ?? null,
        now,
        now,
    );

    return getSchedule(db, id)!;
}

export function getSchedule(db: Database, id: string): AgentSchedule | null {
    const row = db.query('SELECT * FROM agent_schedules WHERE id = ?').get(id) as Record<string, unknown> | null;
    return row ? rowToSchedule(row) : null;
}

export function listSchedules(db: Database, agentId?: string): AgentSchedule[] {
    const rows = agentId
        ? db.query('SELECT * FROM agent_schedules WHERE agent_id = ? ORDER BY created_at DESC').all(agentId)
        : db.query('SELECT * FROM agent_schedules ORDER BY created_at DESC').all();
    return (rows as Record<string, unknown>[]).map(rowToSchedule);
}

export function listActiveSchedules(db: Database): AgentSchedule[] {
    const rows = db.query(
        `SELECT * FROM agent_schedules WHERE status = 'active' ORDER BY next_run_at ASC`
    ).all();
    return (rows as Record<string, unknown>[]).map(rowToSchedule);
}

export function listDueSchedules(db: Database): AgentSchedule[] {
    // next_run_at is stored as ISO 8601 (2026-02-12T14:45:00.000Z)
    // Use replace() to normalize to the same format for comparison
    const now = new Date().toISOString();
    const rows = db.query(
        `SELECT * FROM agent_schedules
         WHERE status = 'active'
           AND next_run_at IS NOT NULL
           AND next_run_at <= ?
         ORDER BY next_run_at ASC`
    ).all(now);
    return (rows as Record<string, unknown>[]).map(rowToSchedule);
}

export function updateSchedule(db: Database, id: string, input: UpdateScheduleInput): AgentSchedule | null {
    const existing = getSchedule(db, id);
    if (!existing) return null;

    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    if (input.name !== undefined) { fields.push('name = ?'); values.push(input.name); }
    if (input.description !== undefined) { fields.push('description = ?'); values.push(input.description); }
    if (input.cronExpression !== undefined) { fields.push('cron_expression = ?'); values.push(input.cronExpression); }
    if (input.intervalMs !== undefined) { fields.push('interval_ms = ?'); values.push(input.intervalMs); }
    if (input.actions !== undefined) { fields.push('actions = ?'); values.push(JSON.stringify(input.actions)); }
    if (input.approvalPolicy !== undefined) { fields.push('approval_policy = ?'); values.push(input.approvalPolicy); }
    if (input.status !== undefined) { fields.push('status = ?'); values.push(input.status); }
    if (input.maxExecutions !== undefined) { fields.push('max_executions = ?'); values.push(input.maxExecutions); }
    if (input.maxBudgetPerRun !== undefined) { fields.push('max_budget_per_run = ?'); values.push(input.maxBudgetPerRun); }
    if (input.notifyAddress !== undefined) { fields.push('notify_address = ?'); values.push(input.notifyAddress); }

    if (fields.length === 0) return existing;

    fields.push("updated_at = datetime('now')");
    values.push(id);

    db.query(`UPDATE agent_schedules SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return getSchedule(db, id);
}

export function updateScheduleNextRun(db: Database, id: string, nextRunAt: string | null): void {
    db.query(`UPDATE agent_schedules SET next_run_at = ?, updated_at = datetime('now') WHERE id = ?`).run(nextRunAt, id);
}

export function updateScheduleLastRun(db: Database, id: string): void {
    db.query(`
        UPDATE agent_schedules
        SET last_run_at = datetime('now'),
            execution_count = execution_count + 1,
            updated_at = datetime('now')
        WHERE id = ?
    `).run(id);
}

export function deleteSchedule(db: Database, id: string): boolean {
    const result = db.query('DELETE FROM agent_schedules WHERE id = ?').run(id);
    return result.changes > 0;
}

// ─── Schedule Executions ─────────────────────────────────────────────────────

export function createExecution(
    db: Database,
    scheduleId: string,
    agentId: string,
    actionType: ScheduleActionType,
    actionInput: Record<string, unknown>,
    configSnapshot?: Record<string, unknown>,
): ScheduleExecution {
    const id = crypto.randomUUID();
    db.query(`
        INSERT INTO schedule_executions (id, schedule_id, agent_id, action_type, action_input, config_snapshot)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, scheduleId, agentId, actionType, JSON.stringify(actionInput), configSnapshot ? JSON.stringify(configSnapshot) : null);
    return getExecution(db, id)!;
}

export function getExecution(db: Database, id: string): ScheduleExecution | null {
    const row = db.query('SELECT * FROM schedule_executions WHERE id = ?').get(id) as Record<string, unknown> | null;
    return row ? rowToExecution(row) : null;
}

export function listExecutions(db: Database, scheduleId?: string, limit: number = 50): ScheduleExecution[] {
    const rows = scheduleId
        ? db.query('SELECT * FROM schedule_executions WHERE schedule_id = ? ORDER BY started_at DESC LIMIT ?').all(scheduleId, limit)
        : db.query('SELECT * FROM schedule_executions ORDER BY started_at DESC LIMIT ?').all(limit);
    return (rows as Record<string, unknown>[]).map(rowToExecution);
}

export function updateExecutionStatus(
    db: Database,
    id: string,
    status: ScheduleExecutionStatus,
    extras?: { result?: string; sessionId?: string; workTaskId?: string; costUsd?: number },
): void {
    const fields = ['status = ?'];
    const values: (string | number | null)[] = [status];

    if (status === 'completed' || status === 'failed' || status === 'denied') {
        fields.push("completed_at = datetime('now')");
    }
    if (extras?.result !== undefined) { fields.push('result = ?'); values.push(extras.result); }
    if (extras?.sessionId !== undefined) { fields.push('session_id = ?'); values.push(extras.sessionId); }
    if (extras?.workTaskId !== undefined) { fields.push('work_task_id = ?'); values.push(extras.workTaskId); }
    if (extras?.costUsd !== undefined) { fields.push('cost_usd = ?'); values.push(extras.costUsd); }

    values.push(id);
    db.query(`UPDATE schedule_executions SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function resolveScheduleApproval(db: Database, executionId: string, approved: boolean): ScheduleExecution | null {
    const execution = getExecution(db, executionId);
    if (!execution || execution.status !== 'awaiting_approval') return null;

    updateExecutionStatus(db, executionId, approved ? 'approved' : 'denied', {
        result: approved ? 'Approved by owner' : 'Denied by owner',
    });

    return getExecution(db, executionId);
}

/**
 * Database CRUD operations for schedules and schedule_runs.
 */

import type { Database } from 'bun:sqlite';
import type { Schedule, ScheduleRun, CreateScheduleInput, UpdateScheduleInput, ActionConfig } from '../scheduler/types';

// ─── Row interfaces ──────────────────────────────────────────────────────────

interface ScheduleRow {
    id: string;
    name: string;
    action_type: string;
    cron_expression: string;
    agent_id: string | null;
    council_id: string | null;
    action_config: string;
    source: string;
    requires_approval: number;
    max_budget_usd: number;
    daily_budget_usd: number;
    approval_timeout_h: number;
    daily_runs: number;
    daily_cost_usd: number;
    daily_reset_date: string;
    status: string;
    consecutive_failures: number;
    next_run_at: string | null;
    total_runs: number;
    created_at: string;
    updated_at: string;
}

interface ScheduleRunRow {
    id: string;
    schedule_id: string;
    config_snapshot: string;
    status: string;
    session_id: string | null;
    work_task_id: string | null;
    cost_usd: number;
    output: string | null;
    error: string | null;
    pending_approvals: string | null;
    approval_decided_by: string | null;
    approval_decided_at: string | null;
    started_at: string | null;
    completed_at: string | null;
    created_at: string;
}

// ─── Row → Domain conversions ────────────────────────────────────────────────

function rowToSchedule(row: ScheduleRow): Schedule {
    return {
        id: row.id,
        name: row.name,
        actionType: row.action_type as Schedule['actionType'],
        cronExpression: row.cron_expression,
        agentId: row.agent_id,
        councilId: row.council_id,
        actionConfig: JSON.parse(row.action_config) as ActionConfig,
        source: row.source as Schedule['source'],
        requiresApproval: row.requires_approval === 1,
        maxBudgetUsd: row.max_budget_usd,
        dailyBudgetUsd: row.daily_budget_usd,
        approvalTimeoutH: row.approval_timeout_h,
        dailyRuns: row.daily_runs,
        dailyCostUsd: row.daily_cost_usd,
        dailyResetDate: row.daily_reset_date,
        status: row.status as Schedule['status'],
        consecutiveFailures: row.consecutive_failures,
        nextRunAt: row.next_run_at,
        totalRuns: row.total_runs,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function rowToScheduleRun(row: ScheduleRunRow): ScheduleRun {
    return {
        id: row.id,
        scheduleId: row.schedule_id,
        configSnapshot: JSON.parse(row.config_snapshot) as ActionConfig,
        status: row.status as ScheduleRun['status'],
        sessionId: row.session_id,
        workTaskId: row.work_task_id,
        costUsd: row.cost_usd,
        output: row.output ? JSON.parse(row.output) : null,
        error: row.error,
        pendingApprovals: row.pending_approvals ? JSON.parse(row.pending_approvals) : null,
        approvalDecidedBy: row.approval_decided_by,
        approvalDecidedAt: row.approval_decided_at,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        createdAt: row.created_at,
    };
}

// ─── Schedule CRUD ───────────────────────────────────────────────────────────

export function createSchedule(db: Database, input: CreateScheduleInput & { id: string; nextRunAt?: string | null }): Schedule {
    const now = new Date().toISOString();
    const today = now.slice(0, 10); // YYYY-MM-DD

    db.query(`
        INSERT INTO schedules (
            id, name, action_type, cron_expression, agent_id, council_id,
            action_config, source, requires_approval, max_budget_usd,
            daily_budget_usd, approval_timeout_h, daily_reset_date,
            status, next_run_at, created_at, updated_at
        ) VALUES (
            $id, $name, $actionType, $cronExpression, $agentId, $councilId,
            $actionConfig, $source, $requiresApproval, $maxBudgetUsd,
            $dailyBudgetUsd, $approvalTimeoutH, $dailyResetDate,
            'active', $nextRunAt, $now, $now
        )
    `).run({
        $id: input.id,
        $name: input.name,
        $actionType: input.actionType,
        $cronExpression: input.cronExpression,
        $agentId: input.agentId ?? null,
        $councilId: input.councilId ?? null,
        $actionConfig: JSON.stringify(input.actionConfig),
        $source: input.source ?? 'owner',
        $requiresApproval: (input.requiresApproval ?? false) ? 1 : 0,
        $maxBudgetUsd: input.maxBudgetUsd ?? 1.0,
        $dailyBudgetUsd: input.dailyBudgetUsd ?? 5.0,
        $approvalTimeoutH: input.approvalTimeoutH ?? 8,
        $dailyResetDate: today,
        $nextRunAt: input.nextRunAt ?? null,
        $now: now,
    });

    return getSchedule(db, input.id)!;
}

export function getSchedule(db: Database, id: string): Schedule | null {
    const row = db.query('SELECT * FROM schedules WHERE id = ?').get(id) as ScheduleRow | null;
    return row ? rowToSchedule(row) : null;
}

export function listSchedules(
    db: Database,
    filters?: { status?: string; agentId?: string; councilId?: string },
): Schedule[] {
    const conditions: string[] = [];
    const params: Record<string, string> = {};

    if (filters?.status) {
        conditions.push('status = $status');
        params.$status = filters.status;
    }
    if (filters?.agentId) {
        conditions.push('agent_id = $agentId');
        params.$agentId = filters.agentId;
    }
    if (filters?.councilId) {
        conditions.push('council_id = $councilId');
        params.$councilId = filters.councilId;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = db.query(`SELECT * FROM schedules ${where} ORDER BY created_at DESC`).all(params) as ScheduleRow[];
    return rows.map(rowToSchedule);
}

export function updateSchedule(
    db: Database,
    id: string,
    input: UpdateScheduleInput & { nextRunAt?: string | null; consecutiveFailures?: number; dailyRuns?: number; dailyCostUsd?: number; dailyResetDate?: string; totalRuns?: number },
): Schedule | null {
    const fields: string[] = ['updated_at = datetime(\'now\')'];
    const params: Record<string, unknown> = { $id: id };

    const fieldMap: Record<string, string> = {
        name: 'name',
        cronExpression: 'cron_expression',
        actionConfig: 'action_config',
        requiresApproval: 'requires_approval',
        maxBudgetUsd: 'max_budget_usd',
        dailyBudgetUsd: 'daily_budget_usd',
        approvalTimeoutH: 'approval_timeout_h',
        status: 'status',
        nextRunAt: 'next_run_at',
        consecutiveFailures: 'consecutive_failures',
        dailyRuns: 'daily_runs',
        dailyCostUsd: 'daily_cost_usd',
        dailyResetDate: 'daily_reset_date',
        totalRuns: 'total_runs',
    };

    for (const [key, col] of Object.entries(fieldMap)) {
        const value = (input as Record<string, unknown>)[key];
        if (value !== undefined) {
            let dbValue: string | number | null = value as string | number | null;
            if (key === 'actionConfig') dbValue = JSON.stringify(value);
            if (key === 'requiresApproval') dbValue = value ? 1 : 0;
            fields.push(`${col} = $${key}`);
            params[`$${key}`] = dbValue;
        }
    }

    if (fields.length === 1) return getSchedule(db, id); // only updated_at

    db.query(`UPDATE schedules SET ${fields.join(', ')} WHERE id = $id`).run(params as Record<string, string | number | null>);
    return getSchedule(db, id);
}

export function deleteSchedule(db: Database, id: string): boolean {
    // schedule_runs cascade via ON DELETE CASCADE
    const result = db.query('DELETE FROM schedules WHERE id = ?').run(id);
    return result.changes > 0;
}

// ─── Schedule Run CRUD ───────────────────────────────────────────────────────

export function createScheduleRun(
    db: Database,
    input: { id: string; scheduleId: string; configSnapshot: Record<string, unknown> },
): ScheduleRun {
    db.query(`
        INSERT INTO schedule_runs (id, schedule_id, config_snapshot, status, created_at)
        VALUES ($id, $scheduleId, $configSnapshot, 'pending', datetime('now'))
    `).run({
        $id: input.id,
        $scheduleId: input.scheduleId,
        $configSnapshot: JSON.stringify(input.configSnapshot),
    });

    return getScheduleRun(db, input.id)!;
}

export function getScheduleRun(db: Database, id: string): ScheduleRun | null {
    const row = db.query('SELECT * FROM schedule_runs WHERE id = ?').get(id) as ScheduleRunRow | null;
    return row ? rowToScheduleRun(row) : null;
}

export function listScheduleRuns(
    db: Database,
    scheduleId: string,
    opts?: { limit?: number; offset?: number },
): ScheduleRun[] {
    const limit = opts?.limit ?? 50;
    const offset = opts?.offset ?? 0;
    const rows = db.query(
        'SELECT * FROM schedule_runs WHERE schedule_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
    ).all(scheduleId, limit, offset) as ScheduleRunRow[];
    return rows.map(rowToScheduleRun);
}

export function updateScheduleRun(
    db: Database,
    id: string,
    input: Partial<{
        status: string;
        sessionId: string | null;
        workTaskId: string | null;
        costUsd: number;
        output: Record<string, unknown> | null;
        error: string | null;
        pendingApprovals: Record<string, unknown> | null;
        approvalDecidedBy: string | null;
        approvalDecidedAt: string | null;
        startedAt: string | null;
        completedAt: string | null;
    }>,
): ScheduleRun | null {
    const fields: string[] = [];
    const params: Record<string, string | number | null> = { $id: id };

    const fieldMap: Record<string, string> = {
        status: 'status',
        sessionId: 'session_id',
        workTaskId: 'work_task_id',
        costUsd: 'cost_usd',
        output: 'output',
        error: 'error',
        pendingApprovals: 'pending_approvals',
        approvalDecidedBy: 'approval_decided_by',
        approvalDecidedAt: 'approval_decided_at',
        startedAt: 'started_at',
        completedAt: 'completed_at',
    };

    for (const [key, col] of Object.entries(fieldMap)) {
        const value = (input as Record<string, unknown>)[key];
        if (value !== undefined) {
            let dbValue: string | number | null = value as string | number | null;
            if (key === 'output' || key === 'pendingApprovals') {
                dbValue = value !== null ? JSON.stringify(value) : null;
            }
            fields.push(`${col} = $${key}`);
            params[`$${key}`] = dbValue;
        }
    }

    if (fields.length === 0) return getScheduleRun(db, id);

    db.query(`UPDATE schedule_runs SET ${fields.join(', ')} WHERE id = $id`).run(params);
    return getScheduleRun(db, id);
}

// ─── Scheduler Queries ───────────────────────────────────────────────────────

/** Get all active schedules whose next_run_at has passed. */
export function getDueSchedules(db: Database, now: Date): Schedule[] {
    const rows = db.query(
        `SELECT * FROM schedules
         WHERE status = 'active'
           AND next_run_at IS NOT NULL
           AND next_run_at <= $now
         ORDER BY next_run_at ASC`,
    ).all({ $now: now.toISOString() }) as ScheduleRow[];
    return rows.map(rowToSchedule);
}

/** Count runs currently in an active state for a specific schedule. */
export function getActiveRunCount(db: Database, scheduleId: string): number {
    const row = db.query(
        `SELECT COUNT(*) as count FROM schedule_runs
         WHERE schedule_id = ? AND status IN ('pending', 'running', 'awaiting_approval')`,
    ).get(scheduleId) as { count: number };
    return row.count;
}

/** Count total runs currently 'running' across all schedules. */
export function getRunningRunCount(db: Database): number {
    const row = db.query(
        `SELECT COUNT(*) as count FROM schedule_runs WHERE status = 'running'`,
    ).get() as { count: number };
    return row.count;
}

/** Get all runs that are currently in 'running' state (for stale detection / startup recovery). */
export function getRunningRuns(db: Database): ScheduleRun[] {
    const rows = db.query(
        `SELECT * FROM schedule_runs WHERE status = 'running'`,
    ).all() as ScheduleRunRow[];
    return rows.map(rowToScheduleRun);
}

/** Get all active schedules (for recomputing next_run_at on startup). */
export function getActiveSchedules(db: Database): Schedule[] {
    const rows = db.query(
        `SELECT * FROM schedules WHERE status = 'active'`,
    ).all() as ScheduleRow[];
    return rows.map(rowToSchedule);
}

/** Count schedules owned by an agent. */
export function countSchedulesByAgent(db: Database, agentId: string): number {
    const row = db.query(
        `SELECT COUNT(*) as count FROM schedules WHERE agent_id = ?`,
    ).get(agentId) as { count: number };
    return row.count;
}

/** Sum today's cost for a specific schedule (for daily budget check). */
export function getTodayCostForSchedule(db: Database, scheduleId: string, today: string): number {
    const row = db.query(
        `SELECT COALESCE(SUM(cost_usd), 0) as total FROM schedule_runs
         WHERE schedule_id = ? AND date(created_at) = ?`,
    ).get(scheduleId, today) as { total: number };
    return row.total;
}

/** Get runs with 'awaiting_approval' status. */
export function getPendingApprovalRuns(db: Database): ScheduleRun[] {
    const rows = db.query(
        `SELECT * FROM schedule_runs WHERE status = 'awaiting_approval'`,
    ).all() as ScheduleRunRow[];
    return rows.map(rowToScheduleRun);
}

/** Get the next upcoming run time across all active schedules. */
export function getNextGlobalRunAt(db: Database): string | null {
    const row = db.query(
        `SELECT MIN(next_run_at) as next FROM schedules WHERE status = 'active' AND next_run_at IS NOT NULL`,
    ).get() as { next: string | null };
    return row.next;
}

/** Count active schedules. */
export function getActiveScheduleCount(db: Database): number {
    const row = db.query(
        `SELECT COUNT(*) as count FROM schedules WHERE status = 'active'`,
    ).get() as { count: number };
    return row.count;
}

/** Get today's aggregate stats across all schedule runs. */
export function getTodayStats(db: Database, today: string): { runs: number; costUsd: number } {
    const row = db.query(
        `SELECT COUNT(*) as runs, COALESCE(SUM(cost_usd), 0) as cost_usd
         FROM schedule_runs WHERE date(created_at) = ?`,
    ).get(today) as { runs: number; cost_usd: number };
    return { runs: row.runs, costUsd: row.cost_usd };
}

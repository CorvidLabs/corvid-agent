import { test, expect, beforeEach, afterEach, describe } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { createAgent } from '../db/agents';
import {
    createSchedule,
    getSchedule,
    listSchedules,
    listActiveSchedules,
    listDueSchedules,
    updateSchedule,
    updateScheduleNextRun,
    updateScheduleLastRun,
    deleteSchedule,
    createExecution,
    getExecution,
    listExecutions,
    listExecutionsFiltered,
    updateExecutionStatus,
    resolveScheduleApproval,
    findSchedulesForEvent,
} from '../db/schedules';

let db: Database;
let agentId: string;

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
    // Create an agent (required FK for schedules)
    const agent = createAgent(db, { name: 'Test Agent', model: 'sonnet' });
    agentId = agent.id;
});

afterEach(() => {
    db.close();
});

// ─── Schedule CRUD ───────────────────────────────────────────────────────────

describe('Schedule CRUD', () => {
    test('create schedule with required fields', () => {
        const schedule = createSchedule(db, {
            agentId,
            name: 'Daily Engagement',
            actions: [{ type: 'star_repo', repos: ['test/repo'] }],
        });

        expect(schedule.id).toBeTruthy();
        expect(schedule.agentId).toBe(agentId);
        expect(schedule.name).toBe('Daily Engagement');
        expect(schedule.actions).toHaveLength(1);
        expect(schedule.actions[0].type).toBe('star_repo');
        expect(schedule.status).toBe('active');
        expect(schedule.approvalPolicy).toBe('owner_approve');
        expect(schedule.executionCount).toBe(0);
        expect(schedule.description).toBe('');
        expect(schedule.cronExpression).toBe('');
        expect(schedule.intervalMs).toBeNull();
        expect(schedule.maxExecutions).toBeNull();
        expect(schedule.maxBudgetPerRun).toBeNull();
        expect(schedule.notifyAddress).toBeNull();
        expect(schedule.lastRunAt).toBeNull();
        expect(schedule.nextRunAt).toBeNull();
    });

    test('create schedule with all optional fields', () => {
        const schedule = createSchedule(db, {
            agentId,
            name: 'Full Schedule',
            description: 'A fully configured schedule',
            cronExpression: '0 9 * * 1-5',
            intervalMs: 3600000,
            actions: [{ type: 'send_message', message: 'hello' }],
            approvalPolicy: 'auto',
            maxExecutions: 100,
            maxBudgetPerRun: 0.5,
            notifyAddress: 'NOTIFYADDR123',
        });

        expect(schedule.description).toBe('A fully configured schedule');
        expect(schedule.cronExpression).toBe('0 9 * * 1-5');
        expect(schedule.intervalMs).toBe(3600000);
        expect(schedule.approvalPolicy).toBe('auto');
        expect(schedule.maxExecutions).toBe(100);
        expect(schedule.maxBudgetPerRun).toBe(0.5);
        expect(schedule.notifyAddress).toBe('NOTIFYADDR123');
    });

    test('get schedule by id', () => {
        const schedule = createSchedule(db, {
            agentId,
            name: 'Get Test',
            actions: [{ type: 'work_task', description: 'fix bug' }],
        });

        const found = getSchedule(db, schedule.id);
        expect(found).not.toBeNull();
        expect(found!.name).toBe('Get Test');
        expect(found!.actions[0].type).toBe('work_task');

        expect(getSchedule(db, 'nonexistent')).toBeNull();
    });

    test('list schedules all', () => {
        createSchedule(db, { agentId, name: 'S1', actions: [] });
        createSchedule(db, { agentId, name: 'S2', actions: [] });

        const all = listSchedules(db);
        expect(all).toHaveLength(2);
    });

    test('list schedules by agent', () => {
        const agent2 = createAgent(db, { name: 'Agent 2' });
        createSchedule(db, { agentId, name: 'S1', actions: [] });
        createSchedule(db, { agentId: agent2.id, name: 'S2', actions: [] });

        expect(listSchedules(db, agentId)).toHaveLength(1);
        expect(listSchedules(db, agent2.id)).toHaveLength(1);
    });

    test('list schedules returns all created', () => {
        createSchedule(db, { agentId, name: 'First', actions: [] });
        createSchedule(db, { agentId, name: 'Second', actions: [] });

        const all = listSchedules(db);
        expect(all).toHaveLength(2);
        const names = all.map(s => s.name);
        expect(names).toContain('First');
        expect(names).toContain('Second');
    });

    test('delete schedule', () => {
        const schedule = createSchedule(db, { agentId, name: 'Delete Me', actions: [] });
        expect(deleteSchedule(db, schedule.id)).toBe(true);
        expect(getSchedule(db, schedule.id)).toBeNull();
        expect(deleteSchedule(db, 'nonexistent')).toBe(false);
    });

    test('delete agent cascades to schedules', () => {
        const schedule = createSchedule(db, { agentId, name: 'Cascade Test', actions: [] });
        db.query('DELETE FROM agents WHERE id = ?').run(agentId);
        expect(getSchedule(db, schedule.id)).toBeNull();
    });
});

// ─── Active & Due Schedules ──────────────────────────────────────────────────

describe('Active and Due Schedules', () => {
    test('listActiveSchedules filters by status', () => {
        createSchedule(db, { agentId, name: 'Active', actions: [] });
        const pausedSchedule = createSchedule(db, { agentId, name: 'Paused', actions: [] });
        updateSchedule(db, pausedSchedule.id, { status: 'paused' });

        const active = listActiveSchedules(db);
        expect(active).toHaveLength(1);
        expect(active[0].name).toBe('Active');
    });

    test('listDueSchedules returns schedules with past next_run_at', () => {
        const s1 = createSchedule(db, { agentId, name: 'Due', actions: [] });
        const s2 = createSchedule(db, { agentId, name: 'Not Due', actions: [] });
        createSchedule(db, { agentId, name: 'No Next Run', actions: [] });

        // Set s1 to past time, s2 to future time, s3 has no next_run_at
        updateScheduleNextRun(db, s1.id, '2020-01-01T00:00:00.000Z');
        updateScheduleNextRun(db, s2.id, '2099-12-31T23:59:59.000Z');

        const due = listDueSchedules(db);
        expect(due).toHaveLength(1);
        expect(due[0].name).toBe('Due');
    });

    test('listDueSchedules ignores paused schedules', () => {
        const schedule = createSchedule(db, { agentId, name: 'Paused Due', actions: [] });
        updateScheduleNextRun(db, schedule.id, '2020-01-01T00:00:00.000Z');
        updateSchedule(db, schedule.id, { status: 'paused' });

        expect(listDueSchedules(db)).toHaveLength(0);
    });

    test('listActiveSchedules orders by next_run_at ASC', () => {
        const s1 = createSchedule(db, { agentId, name: 'Later', actions: [] });
        const s2 = createSchedule(db, { agentId, name: 'Sooner', actions: [] });
        updateScheduleNextRun(db, s1.id, '2099-12-31T00:00:00.000Z');
        updateScheduleNextRun(db, s2.id, '2099-01-01T00:00:00.000Z');

        const active = listActiveSchedules(db);
        expect(active[0].name).toBe('Sooner');
        expect(active[1].name).toBe('Later');
    });
});

// ─── Update Schedule ─────────────────────────────────────────────────────────

describe('Update Schedule', () => {
    test('partial update only changes specified fields', () => {
        const schedule = createSchedule(db, {
            agentId,
            name: 'Original',
            description: 'Original desc',
            actions: [{ type: 'star_repo' }],
        });

        const updated = updateSchedule(db, schedule.id, { name: 'Updated' });
        expect(updated!.name).toBe('Updated');
        expect(updated!.description).toBe('Original desc'); // unchanged
        expect(updated!.actions[0].type).toBe('star_repo'); // unchanged
    });

    test('update with no fields returns existing', () => {
        const schedule = createSchedule(db, { agentId, name: 'NoOp', actions: [] });
        const updated = updateSchedule(db, schedule.id, {});
        expect(updated!.name).toBe('NoOp');
    });

    test('update nonexistent schedule returns null', () => {
        expect(updateSchedule(db, 'nonexistent', { name: 'X' })).toBeNull();
    });

    test('update status to paused', () => {
        const schedule = createSchedule(db, { agentId, name: 'Pause Me', actions: [] });
        const updated = updateSchedule(db, schedule.id, { status: 'paused' });
        expect(updated!.status).toBe('paused');
    });

    test('update actions replaces JSON', () => {
        const schedule = createSchedule(db, {
            agentId,
            name: 'Actions Test',
            actions: [{ type: 'star_repo' }],
        });

        const updated = updateSchedule(db, schedule.id, {
            actions: [{ type: 'send_message', message: 'hi' }, { type: 'work_task', description: 'fix' }],
        });
        expect(updated!.actions).toHaveLength(2);
        expect(updated!.actions[0].type).toBe('send_message');
    });

    test('updateScheduleNextRun sets next run time', () => {
        const schedule = createSchedule(db, { agentId, name: 'Next Run', actions: [] });
        updateScheduleNextRun(db, schedule.id, '2026-03-01T12:00:00.000Z');
        const found = getSchedule(db, schedule.id);
        expect(found!.nextRunAt).toBe('2026-03-01T12:00:00.000Z');
    });

    test('updateScheduleNextRun can clear next run', () => {
        const schedule = createSchedule(db, { agentId, name: 'Clear Run', actions: [] });
        updateScheduleNextRun(db, schedule.id, '2026-03-01T12:00:00.000Z');
        updateScheduleNextRun(db, schedule.id, null);
        const found = getSchedule(db, schedule.id);
        expect(found!.nextRunAt).toBeNull();
    });

    test('updateScheduleLastRun increments execution count', () => {
        const schedule = createSchedule(db, { agentId, name: 'Count', actions: [] });
        expect(schedule.executionCount).toBe(0);

        updateScheduleLastRun(db, schedule.id);
        updateScheduleLastRun(db, schedule.id);

        const found = getSchedule(db, schedule.id);
        expect(found!.executionCount).toBe(2);
        expect(found!.lastRunAt).not.toBeNull();
    });
});

// ─── Executions ──────────────────────────────────────────────────────────────

describe('Schedule Executions', () => {
    let scheduleId: string;

    beforeEach(() => {
        const schedule = createSchedule(db, { agentId, name: 'Exec Test', actions: [] });
        scheduleId = schedule.id;
    });

    test('create execution with basic fields', () => {
        const exec = createExecution(db, scheduleId, agentId, 'star_repo', { repo: 'test/repo' });
        expect(exec.id).toBeTruthy();
        expect(exec.scheduleId).toBe(scheduleId);
        expect(exec.agentId).toBe(agentId);
        expect(exec.status).toBe('running');
        expect(exec.actionType).toBe('star_repo');
        expect(exec.actionInput).toEqual({ repo: 'test/repo' });
        expect(exec.result).toBeNull();
        expect(exec.sessionId).toBeNull();
        expect(exec.workTaskId).toBeNull();
        expect(exec.costUsd).toBe(0);
        expect(exec.configSnapshot).toBeUndefined();
        expect(exec.completedAt).toBeNull();
    });

    test('create execution with config snapshot', () => {
        const exec = createExecution(
            db, scheduleId, agentId, 'work_task',
            { description: 'fix tests' },
            { model: 'opus', maxTurns: 10 },
        );
        expect(exec.configSnapshot).toEqual({ model: 'opus', maxTurns: 10 });
    });

    test('get execution by id', () => {
        const exec = createExecution(db, scheduleId, agentId, 'star_repo', {});
        const found = getExecution(db, exec.id);
        expect(found).not.toBeNull();
        expect(found!.id).toBe(exec.id);

        expect(getExecution(db, 'nonexistent')).toBeNull();
    });

    test('list executions all', () => {
        createExecution(db, scheduleId, agentId, 'star_repo', {});
        createExecution(db, scheduleId, agentId, 'fork_repo', {});

        const all = listExecutions(db);
        expect(all).toHaveLength(2);
    });

    test('list executions by schedule', () => {
        const schedule2 = createSchedule(db, { agentId, name: 'Other', actions: [] });
        createExecution(db, scheduleId, agentId, 'star_repo', {});
        createExecution(db, schedule2.id, agentId, 'fork_repo', {});

        expect(listExecutions(db, scheduleId)).toHaveLength(1);
        expect(listExecutions(db, schedule2.id)).toHaveLength(1);
    });

    test('list executions respects limit', () => {
        for (let i = 0; i < 5; i++) {
            createExecution(db, scheduleId, agentId, 'star_repo', { i });
        }
        expect(listExecutions(db, scheduleId, 3)).toHaveLength(3);
    });

    test('list executions returns all created', () => {
        createExecution(db, scheduleId, agentId, 'star_repo', { order: 1 });
        createExecution(db, scheduleId, agentId, 'fork_repo', { order: 2 });

        const execs = listExecutions(db, scheduleId);
        expect(execs).toHaveLength(2);
        const types = execs.map(e => e.actionType);
        expect(types).toContain('star_repo');
        expect(types).toContain('fork_repo');
    });

    test('update execution status to completed', () => {
        const exec = createExecution(db, scheduleId, agentId, 'star_repo', {});
        updateExecutionStatus(db, exec.id, 'completed', {
            result: 'Starred successfully',
            costUsd: 0.02,
        });

        const found = getExecution(db, exec.id);
        expect(found!.status).toBe('completed');
        expect(found!.result).toBe('Starred successfully');
        expect(found!.costUsd).toBe(0.02);
        expect(found!.completedAt).not.toBeNull();
    });

    test('update execution status to failed', () => {
        const exec = createExecution(db, scheduleId, agentId, 'work_task', {});
        updateExecutionStatus(db, exec.id, 'failed', {
            result: 'Error: build failed',
        });

        const found = getExecution(db, exec.id);
        expect(found!.status).toBe('failed');
        expect(found!.completedAt).not.toBeNull();
    });

    test('update execution with session and work task ids', () => {
        const exec = createExecution(db, scheduleId, agentId, 'work_task', {});
        updateExecutionStatus(db, exec.id, 'completed', {
            sessionId: 'session-abc',
            workTaskId: 'wt-123',
        });

        const found = getExecution(db, exec.id);
        expect(found!.sessionId).toBe('session-abc');
        expect(found!.workTaskId).toBe('wt-123');
    });

    test('delete schedule cascades to executions', () => {
        const exec = createExecution(db, scheduleId, agentId, 'star_repo', {});
        deleteSchedule(db, scheduleId);
        expect(getExecution(db, exec.id)).toBeNull();
    });
});

// ─── Approval Workflow ───────────────────────────────────────────────────────

describe('Approval Workflow', () => {
    let scheduleId: string;

    beforeEach(() => {
        const schedule = createSchedule(db, { agentId, name: 'Approval Test', actions: [] });
        scheduleId = schedule.id;
    });

    test('approve awaiting execution', () => {
        const exec = createExecution(db, scheduleId, agentId, 'work_task', {});
        updateExecutionStatus(db, exec.id, 'awaiting_approval');

        const resolved = resolveScheduleApproval(db, exec.id, true);
        expect(resolved).not.toBeNull();
        expect(resolved!.status).toBe('approved');
        expect(resolved!.result).toBe('Approved by owner');
        expect(resolved!.completedAt).toBeNull(); // approved doesn't set completedAt
    });

    test('deny awaiting execution', () => {
        const exec = createExecution(db, scheduleId, agentId, 'work_task', {});
        updateExecutionStatus(db, exec.id, 'awaiting_approval');

        const resolved = resolveScheduleApproval(db, exec.id, false);
        expect(resolved).not.toBeNull();
        expect(resolved!.status).toBe('denied');
        expect(resolved!.result).toBe('Denied by owner');
        expect(resolved!.completedAt).not.toBeNull(); // denied sets completedAt
    });

    test('resolve returns null for non-awaiting execution', () => {
        const exec = createExecution(db, scheduleId, agentId, 'star_repo', {});
        // Status is 'running', not 'awaiting_approval'
        expect(resolveScheduleApproval(db, exec.id, true)).toBeNull();
    });

    test('resolve returns null for nonexistent execution', () => {
        expect(resolveScheduleApproval(db, 'nonexistent', true)).toBeNull();
    });
});

// ─── Filtered Executions ─────────────────────────────────────────────────────

describe('listExecutionsFiltered', () => {
    let scheduleId: string;

    beforeEach(() => {
        const schedule = createSchedule(db, { agentId, name: 'Filter Test', actions: [] });
        scheduleId = schedule.id;
    });

    test('filter by status', () => {
        const e1 = createExecution(db, scheduleId, agentId, 'star_repo', {});
        const e2 = createExecution(db, scheduleId, agentId, 'fork_repo', {});
        updateExecutionStatus(db, e1.id, 'completed', { result: 'done' });
        updateExecutionStatus(db, e2.id, 'failed', { result: 'err' });

        const { executions, total } = listExecutionsFiltered(db, { status: 'completed' });
        expect(total).toBe(1);
        expect(executions).toHaveLength(1);
        expect(executions[0].status).toBe('completed');
    });

    test('filter by actionType', () => {
        createExecution(db, scheduleId, agentId, 'star_repo', {});
        createExecution(db, scheduleId, agentId, 'fork_repo', {});
        createExecution(db, scheduleId, agentId, 'star_repo', {});

        const { executions, total } = listExecutionsFiltered(db, { actionType: 'star_repo' });
        expect(total).toBe(2);
        expect(executions).toHaveLength(2);
    });

    test('filter by date range', () => {
        createExecution(db, scheduleId, agentId, 'star_repo', {});

        const { total: future } = listExecutionsFiltered(db, { since: '2099-01-01T00:00:00.000Z' });
        expect(future).toBe(0);

        const { total: past } = listExecutionsFiltered(db, { since: '2000-01-01T00:00:00.000Z' });
        expect(past).toBe(1);
    });

    test('combined filters', () => {
        const e1 = createExecution(db, scheduleId, agentId, 'star_repo', {});
        createExecution(db, scheduleId, agentId, 'fork_repo', {});
        updateExecutionStatus(db, e1.id, 'completed', { result: 'ok' });

        const { total } = listExecutionsFiltered(db, { status: 'completed', actionType: 'star_repo' });
        expect(total).toBe(1);
    });

    test('pagination with limit and offset', () => {
        for (let i = 0; i < 5; i++) {
            createExecution(db, scheduleId, agentId, 'star_repo', { i });
        }

        const page1 = listExecutionsFiltered(db, { limit: 2, offset: 0 });
        expect(page1.executions).toHaveLength(2);
        expect(page1.total).toBe(5);

        const page2 = listExecutionsFiltered(db, { limit: 2, offset: 2 });
        expect(page2.executions).toHaveLength(2);
        expect(page2.total).toBe(5);

        const page3 = listExecutionsFiltered(db, { limit: 2, offset: 4 });
        expect(page3.executions).toHaveLength(1);
    });

    test('no filters returns all', () => {
        createExecution(db, scheduleId, agentId, 'star_repo', {});
        createExecution(db, scheduleId, agentId, 'fork_repo', {});

        const { total } = listExecutionsFiltered(db, {});
        expect(total).toBe(2);
    });

    test('cancelled status is filtered correctly', () => {
        const exec = createExecution(db, scheduleId, agentId, 'star_repo', {});
        updateExecutionStatus(db, exec.id, 'cancelled', { result: 'Cancelled by user' });

        const { executions } = listExecutionsFiltered(db, { status: 'cancelled' });
        expect(executions).toHaveLength(1);
        expect(executions[0].status).toBe('cancelled');
        expect(executions[0].completedAt).not.toBeNull();
    });
});

// ─── Event Trigger Queries ───────────────────────────────────────────────────

describe('findSchedulesForEvent', () => {
    test('matches by source and event', () => {
        createSchedule(db, {
            agentId,
            name: 'Webhook Trigger',
            actions: [{ type: 'star_repo' }],
            triggerEvents: [{ source: 'github_webhook', event: 'issue_comment' }],
        });

        const results = findSchedulesForEvent(db, 'github_webhook', 'issue_comment');
        expect(results).toHaveLength(1);
        expect(results[0].name).toBe('Webhook Trigger');
    });

    test('filters by repo when specified', () => {
        createSchedule(db, {
            agentId,
            name: 'Repo-specific',
            actions: [{ type: 'star_repo' }],
            triggerEvents: [{ source: 'github_webhook', event: 'issues', repo: 'owner/specific' }],
        });

        const match = findSchedulesForEvent(db, 'github_webhook', 'issues', 'owner/specific');
        expect(match).toHaveLength(1);

        const noMatch = findSchedulesForEvent(db, 'github_webhook', 'issues', 'owner/other');
        expect(noMatch).toHaveLength(0);
    });

    test('ignores paused schedules', () => {
        const schedule = createSchedule(db, {
            agentId,
            name: 'Paused',
            actions: [{ type: 'star_repo' }],
            triggerEvents: [{ source: 'github_poll', event: 'mention' }],
        });
        updateSchedule(db, schedule.id, { status: 'paused' });

        const results = findSchedulesForEvent(db, 'github_poll', 'mention');
        expect(results).toHaveLength(0);
    });

    test('handles null triggerEvents', () => {
        createSchedule(db, {
            agentId,
            name: 'No Triggers',
            actions: [{ type: 'star_repo' }],
        });

        const results = findSchedulesForEvent(db, 'github_webhook', 'issue_comment');
        expect(results).toHaveLength(0);
    });

    test('matches correct source only', () => {
        createSchedule(db, {
            agentId,
            name: 'Webhook Only',
            actions: [{ type: 'star_repo' }],
            triggerEvents: [{ source: 'github_webhook', event: 'issue_comment' }],
        });

        const webhook = findSchedulesForEvent(db, 'github_webhook', 'issue_comment');
        expect(webhook).toHaveLength(1);

        const poll = findSchedulesForEvent(db, 'github_poll', 'issue_comment');
        expect(poll).toHaveLength(0);
    });

    test('schedule with triggerEvents roundtrips correctly', () => {
        const events = [
            { source: 'github_webhook' as const, event: 'issue_comment', repo: 'owner/repo' },
            { source: 'github_poll' as const, event: 'mention' },
        ];
        const schedule = createSchedule(db, {
            agentId,
            name: 'Multi-trigger',
            actions: [{ type: 'star_repo' }],
            triggerEvents: events,
        });

        const found = getSchedule(db, schedule.id);
        expect(found!.triggerEvents).toHaveLength(2);
        expect(found!.triggerEvents![0].repo).toBe('owner/repo');
        expect(found!.triggerEvents![1].source).toBe('github_poll');
    });
});

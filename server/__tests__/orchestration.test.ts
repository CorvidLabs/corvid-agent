/**
 * Tests for scheduler/orchestration.ts — per-action orchestration checks:
 * needsApproval, resolveActionRepos, shouldSkipByHealthGate,
 * handleApprovalIfNeeded, handleRepoLocking.
 */
import { test, expect, describe, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import {
    needsApproval,
    resolveActionRepos,
    shouldSkipByHealthGate,
    handleApprovalIfNeeded,
    handleRepoLocking,
} from '../scheduler/orchestration';
import type { AgentSchedule, ScheduleAction, ScheduleExecution } from '../../shared/types';
import type { SystemStateResult } from '../scheduler/system-state';

// ─── Helpers ────────────────────────────────────────────────────────────────

let db: Database;

function setupDb(): Database {
    const d = new Database(':memory:');
    runMigrations(d);
    return d;
}

function makeSchedule(overrides: Partial<AgentSchedule> = {}): AgentSchedule {
    return {
        id: 'sched-1',
        agentId: 'agent-1',
        name: 'Test Schedule',
        description: 'test',
        cronExpression: '0 * * * *',
        intervalMs: null,
        actions: [],
        approvalPolicy: 'auto',
        status: 'active',
        maxExecutions: null,
        executionCount: 0,
        lastRunAt: null,
        nextRunAt: null,
        createdAt: '2026-01-01 00:00:00',
        tenantId: 'default',
        ...overrides,
    } as AgentSchedule;
}

function makeAction(overrides: Partial<ScheduleAction> = {}): ScheduleAction {
    return {
        type: 'review_prs',
        repos: [],
        ...overrides,
    };
}

function makeExecution(overrides: Partial<ScheduleExecution> = {}): ScheduleExecution {
    return {
        id: 'exec-1',
        scheduleId: 'sched-1',
        agentId: 'agent-1',
        status: 'running',
        actionType: 'review_prs',
        actionInput: {},
        result: null,
        sessionId: null,
        workTaskId: null,
        costUsd: 0,
        startedAt: '2026-01-01 00:00:00',
        completedAt: null,
        tenantId: 'default',
        ...overrides,
    } as ScheduleExecution;
}

function noopEmit(): void {}

// ─── needsApproval ──────────────────────────────────────────────────────────

describe('needsApproval', () => {
    test('auto policy never needs approval', () => {
        const schedule = makeSchedule({ approvalPolicy: 'auto' });
        expect(needsApproval(schedule, makeAction({ type: 'work_task' }))).toBe(false);
        expect(needsApproval(schedule, makeAction({ type: 'review_prs' }))).toBe(false);
    });

    test('owner_approve requires approval for destructive actions', () => {
        const schedule = makeSchedule({ approvalPolicy: 'owner_approve' });
        expect(needsApproval(schedule, makeAction({ type: 'work_task' }))).toBe(true);
        expect(needsApproval(schedule, makeAction({ type: 'fork_repo' }))).toBe(true);
        expect(needsApproval(schedule, makeAction({ type: 'codebase_review' }))).toBe(true);
        expect(needsApproval(schedule, makeAction({ type: 'dependency_audit' }))).toBe(true);
        expect(needsApproval(schedule, makeAction({ type: 'improvement_loop' }))).toBe(true);
        expect(needsApproval(schedule, makeAction({ type: 'github_suggest' }))).toBe(true);
    });

    test('owner_approve does not require approval for non-destructive actions', () => {
        const schedule = makeSchedule({ approvalPolicy: 'owner_approve' });
        expect(needsApproval(schedule, makeAction({ type: 'review_prs' }))).toBe(false);
        expect(needsApproval(schedule, makeAction({ type: 'star_repo' }))).toBe(false);
        expect(needsApproval(schedule, makeAction({ type: 'send_message' }))).toBe(false);
    });

    test('council_approve always requires approval', () => {
        const schedule = makeSchedule({ approvalPolicy: 'council_approve' });
        expect(needsApproval(schedule, makeAction({ type: 'review_prs' }))).toBe(true);
        expect(needsApproval(schedule, makeAction({ type: 'star_repo' }))).toBe(true);
        expect(needsApproval(schedule, makeAction({ type: 'work_task' }))).toBe(true);
    });
});

// ─── resolveActionRepos ─────────────────────────────────────────────────────

describe('resolveActionRepos', () => {
    test('returns repos array when present', () => {
        const action = makeAction({ repos: ['org/repo-a', 'org/repo-b'] });
        expect(resolveActionRepos(action)).toEqual(['org/repo-a', 'org/repo-b']);
    });

    test('returns empty array when no repos or projectId', () => {
        const action = makeAction({ repos: [] });
        expect(resolveActionRepos(action)).toEqual([]);
    });

    test('returns empty array when repos is undefined', () => {
        const action = makeAction({});
        delete action.repos;
        expect(resolveActionRepos(action)).toEqual([]);
    });

    test('falls back to project:id when repos is empty and projectId is set', () => {
        const action = makeAction({ repos: [], projectId: 'proj-42' });
        expect(resolveActionRepos(action)).toEqual(['project:proj-42']);
    });

    test('prefers repos over projectId when both are set', () => {
        const action = makeAction({ repos: ['org/repo'], projectId: 'proj-42' });
        expect(resolveActionRepos(action)).toEqual(['org/repo']);
    });
});

// ─── shouldSkipByHealthGate ────────────────────────────────────────────────

describe('shouldSkipByHealthGate', () => {
    beforeEach(() => { db = setupDb(); });

    function insertExecution(execId: string): void {
        db.query(`
            INSERT INTO schedule_executions (id, schedule_id, agent_id, status, action_type, action_input, started_at)
            VALUES (?, 'sched-1', 'agent-1', 'running', 'work_task', '{}', datetime('now'))
        `).run(execId);
    }

    test('returns false when no system state', () => {
        insertExecution('exec-1');
        const result = shouldSkipByHealthGate(
            db, makeSchedule(), makeExecution(), makeAction({ type: 'work_task' }), null, noopEmit,
        );
        expect(result).toBe(false);
    });

    test('returns false when system is healthy', () => {
        insertExecution('exec-1');
        const systemState: SystemStateResult = { states: ['healthy'], details: {}, evaluatedAt: new Date().toISOString(), cached: false };
        const result = shouldSkipByHealthGate(
            db, makeSchedule(), makeExecution(), makeAction({ type: 'work_task' }), systemState, noopEmit,
        );
        expect(result).toBe(false);
    });

    test('skips feature_work when CI is broken', () => {
        insertExecution('exec-1');
        const systemState: SystemStateResult = { states: ['ci_broken'], details: {}, evaluatedAt: new Date().toISOString(), cached: false };
        const emitted: { type: string }[] = [];
        const result = shouldSkipByHealthGate(
            db, makeSchedule(), makeExecution(), makeAction({ type: 'work_task' }),
            systemState, (e) => emitted.push(e as { type: string }),
        );
        expect(result).toBe(true);
        expect(emitted.length).toBeGreaterThan(0);

        // Execution should be cancelled
        const exec = db.query('SELECT status FROM schedule_executions WHERE id = ?').get('exec-1') as { status: string };
        expect(exec.status).toBe('cancelled');
    });

    test('allows lightweight actions when CI is broken', () => {
        insertExecution('exec-1');
        const systemState: SystemStateResult = { states: ['ci_broken'], details: {}, evaluatedAt: new Date().toISOString(), cached: false };
        const result = shouldSkipByHealthGate(
            db, makeSchedule(), makeExecution(), makeAction({ type: 'star_repo' }), systemState, noopEmit,
        );
        expect(result).toBe(false);
    });

    test('skips most actions when server is degraded', () => {
        insertExecution('exec-1');
        const systemState: SystemStateResult = { states: ['server_degraded'], details: {}, evaluatedAt: new Date().toISOString(), cached: false };
        const result = shouldSkipByHealthGate(
            db, makeSchedule(), makeExecution(), makeAction({ type: 'review_prs' }), systemState, noopEmit,
        );
        expect(result).toBe(true);
    });
});

// ─── handleApprovalIfNeeded ────────────────────────────────────────────────

describe('handleApprovalIfNeeded', () => {
    beforeEach(() => { db = setupDb(); });

    function insertExecution(execId: string): void {
        db.query(`
            INSERT INTO schedule_executions (id, schedule_id, agent_id, status, action_type, action_input, started_at)
            VALUES (?, 'sched-1', 'agent-1', 'running', 'work_task', '{}', datetime('now'))
        `).run(execId);
    }

    test('returns false for auto-approval schedules', () => {
        insertExecution('exec-1');
        const result = handleApprovalIfNeeded(
            db, makeSchedule({ approvalPolicy: 'auto' }), makeExecution(), makeAction({ type: 'work_task' }), null, noopEmit,
        );
        expect(result).toBe(false);
    });

    test('sets execution to awaiting_approval for owner_approve + destructive action', () => {
        insertExecution('exec-1');
        const emitted: { type: string; data: unknown }[] = [];
        const result = handleApprovalIfNeeded(
            db, makeSchedule({ approvalPolicy: 'owner_approve' }), makeExecution(), makeAction({ type: 'work_task' }),
            null, (e) => emitted.push(e as { type: string; data: unknown }),
        );
        expect(result).toBe(true);

        // Execution should be awaiting_approval
        const exec = db.query('SELECT status FROM schedule_executions WHERE id = ?').get('exec-1') as { status: string };
        expect(exec.status).toBe('awaiting_approval');

        // Should emit approval request event
        const approvalEvent = emitted.find(e => e.type === 'schedule_approval_request');
        expect(approvalEvent).toBeTruthy();
    });

    test('sends notification when notificationService is provided', () => {
        insertExecution('exec-1');
        let notified = false;
        const mockNotificationService = {
            notify: async () => { notified = true; },
        };
        handleApprovalIfNeeded(
            db, makeSchedule({ approvalPolicy: 'council_approve' }), makeExecution(),
            makeAction({ type: 'star_repo', description: 'Star a repo' }),
            mockNotificationService as any, noopEmit,
        );
        // Notification is async — give it a tick
        expect(notified).toBe(true);
    });
});

// ─── handleRepoLocking ─────────────────────────────────────────────────────

describe('handleRepoLocking', () => {
    beforeEach(() => { db = setupDb(); });

    function insertExecution(execId: string): void {
        db.query(`
            INSERT INTO schedule_executions (id, schedule_id, agent_id, status, action_type, action_input, started_at)
            VALUES (?, 'sched-1', 'agent-1', 'running', 'work_task', '{}', datetime('now'))
        `).run(execId);
    }

    test('returns false when action has no repos', () => {
        const result = handleRepoLocking(
            db, makeSchedule(), makeExecution(), makeAction({ repos: [] }), noopEmit,
        );
        expect(result).toBe(false);
    });

    test('acquires lock and returns false (not blocked)', () => {
        insertExecution('exec-1');
        const result = handleRepoLocking(
            db, makeSchedule(), makeExecution(), makeAction({ repos: ['org/repo'] }), noopEmit,
        );
        expect(result).toBe(false);

        // Lock should exist
        const lock = db.query('SELECT * FROM repo_locks WHERE repo = ?').get('org/repo');
        expect(lock).toBeTruthy();
    });

    test('blocks when repo is already locked by another execution', () => {
        insertExecution('exec-1');
        insertExecution('exec-2');

        // First execution acquires lock
        handleRepoLocking(
            db, makeSchedule(), makeExecution({ id: 'exec-1' }),
            makeAction({ repos: ['org/repo'] }), noopEmit,
        );

        // Second execution should be blocked
        const emitted: { type: string }[] = [];
        const result = handleRepoLocking(
            db, makeSchedule(), makeExecution({ id: 'exec-2' }),
            makeAction({ repos: ['org/repo'] }),
            (e) => emitted.push(e as { type: string }),
        );
        expect(result).toBe(true);

        // Second execution should be cancelled
        const exec = db.query('SELECT status FROM schedule_executions WHERE id = ?').get('exec-2') as { status: string };
        expect(exec.status).toBe('cancelled');
    });

    test('releases partially acquired locks on failure', () => {
        insertExecution('exec-1');
        insertExecution('exec-2');

        // Lock repo-b with exec-1
        handleRepoLocking(
            db, makeSchedule(), makeExecution({ id: 'exec-1' }),
            makeAction({ repos: ['org/repo-b'] }), noopEmit,
        );

        // exec-2 tries to lock repo-a AND repo-b — should fail on repo-b and release repo-a
        handleRepoLocking(
            db, makeSchedule(), makeExecution({ id: 'exec-2' }),
            makeAction({ repos: ['org/repo-a', 'org/repo-b'] }), noopEmit,
        );

        // repo-a should NOT be locked by exec-2
        const lockA = db.query('SELECT * FROM repo_locks WHERE repo = ? AND execution_id = ?').get('org/repo-a', 'exec-2');
        expect(lockA).toBeNull();
    });

    test('uses projectId fallback when repos is empty', () => {
        insertExecution('exec-1');
        const result = handleRepoLocking(
            db, makeSchedule(), makeExecution(),
            makeAction({ repos: [], projectId: 'proj-1' }), noopEmit,
        );
        expect(result).toBe(false);

        const lock = db.query('SELECT * FROM repo_locks WHERE repo = ?').get('project:proj-1');
        expect(lock).toBeTruthy();
    });
});

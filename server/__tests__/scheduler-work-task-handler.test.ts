/**
 * Tests for the scheduler work-task handler retry logic.
 */
import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { execWorkTask } from '../scheduler/handlers/work-task';
import { ConflictError } from '../lib/errors';
import type { AgentSchedule, ScheduleAction } from '../../shared/types';
import type { HandlerContext } from '../scheduler/handlers/types';

// ─── Mocks ─────────────────────────────────────────────────────────

// Mock updateExecutionStatus
const mockUpdateStatus = mock((_db: any, _id: string, _status: string, _extras?: any) => {});
mock.module('../db/schedules', () => ({
    updateExecutionStatus: mockUpdateStatus,
}));

// Mock Bun.sleep to avoid real delays
Bun.sleep = mock(() => Promise.resolve()) as any;

function makeSchedule(overrides?: Partial<AgentSchedule>): AgentSchedule {
    return {
        id: 'sched-1',
        agentId: 'agent-1',
        name: 'Test Schedule',
        cron: '0 9 * * *',
        action: { type: 'work_task', description: 'Do stuff', projectId: 'proj-1' },
        enabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...overrides,
    } as AgentSchedule;
}

function makeAction(overrides?: Partial<ScheduleAction>): ScheduleAction {
    return {
        type: 'work_task',
        description: 'Fix the bug',
        projectId: 'proj-1',
        ...overrides,
    } as ScheduleAction;
}

function makeCtx(workTaskService: any = null): HandlerContext {
    return {
        db: {} as any,
        processManager: {} as any,
        workTaskService,
        agentMessenger: null,
        improvementLoopService: null,
        reputationScorer: null,
        reputationAttestation: null,
        outcomeTrackerService: null,
        dailyReviewService: null,
        systemStateDetector: {} as any,
        runningExecutions: new Set(),
        resolveScheduleTenantId: () => 'default',
    };
}

// ─── Tests ─────────────────────────────────────────────────────────

beforeEach(() => {
    mockUpdateStatus.mockClear();
});

describe('execWorkTask', () => {
    it('fails when workTaskService is null', async () => {
        await execWorkTask(makeCtx(null), 'exec-1', makeSchedule(), makeAction());
        expect(mockUpdateStatus).toHaveBeenCalledTimes(1);
        expect(mockUpdateStatus.mock.calls[0][2]).toBe('failed');
        expect(mockUpdateStatus.mock.calls[0][3]?.result).toContain('not available');
    });

    it('fails when no description is provided', async () => {
        const svc = { create: mock(() => Promise.resolve({ id: 't1' })) };
        await execWorkTask(makeCtx(svc), 'exec-1', makeSchedule(), makeAction({ description: '' }));
        expect(mockUpdateStatus).toHaveBeenCalledTimes(1);
        expect(mockUpdateStatus.mock.calls[0][2]).toBe('failed');
        expect(mockUpdateStatus.mock.calls[0][3]?.result).toContain('No description');
    });

    it('completes on first attempt when create succeeds', async () => {
        const svc = {
            create: mock(() => Promise.resolve({
                id: 'task-1',
                status: 'running',
                branchName: 'fix/thing',
            })),
        };
        await execWorkTask(makeCtx(svc), 'exec-1', makeSchedule(), makeAction());
        expect(svc.create).toHaveBeenCalledTimes(1);
        expect(mockUpdateStatus).toHaveBeenCalledTimes(1);
        expect(mockUpdateStatus.mock.calls[0][2]).toBe('completed');
        expect(mockUpdateStatus.mock.calls[0][3]?.result).toContain('task-1');
        expect(mockUpdateStatus.mock.calls[0][3]?.result).toContain('branch: fix/thing');
    });

    it('shows queued status when task is queued', async () => {
        const svc = {
            create: mock(() => Promise.resolve({
                id: 'task-2',
                status: 'queued',
                branchName: null,
            })),
        };
        await execWorkTask(makeCtx(svc), 'exec-1', makeSchedule(), makeAction());
        expect(mockUpdateStatus.mock.calls[0][3]?.result).toContain('queued behind active task');
    });

    it('retries on ConflictError and succeeds on second attempt', async () => {
        const svc = {
            create: mock()
                .mockRejectedValueOnce(new ConflictError('Another task is already active on project'))
                .mockResolvedValueOnce({ id: 'task-3', status: 'running', branchName: 'fix/retry' }),
        };
        await execWorkTask(makeCtx(svc), 'exec-1', makeSchedule(), makeAction());
        expect(svc.create).toHaveBeenCalledTimes(2);
        expect(mockUpdateStatus).toHaveBeenCalledTimes(1);
        expect(mockUpdateStatus.mock.calls[0][2]).toBe('completed');
    });

    it('retries on "already active" error message', async () => {
        const svc = {
            create: mock()
                .mockRejectedValueOnce(new Error('Work task already active for project'))
                .mockResolvedValueOnce({ id: 'task-4', status: 'running', branchName: null }),
        };
        await execWorkTask(makeCtx(svc), 'exec-1', makeSchedule(), makeAction());
        expect(svc.create).toHaveBeenCalledTimes(2);
        expect(mockUpdateStatus.mock.calls[0][2]).toBe('completed');
    });

    it('fails after exhausting all retry attempts on conflict', async () => {
        const conflictErr = new ConflictError('Another task is already active on project');
        const svc = {
            create: mock()
                .mockRejectedValueOnce(conflictErr)
                .mockRejectedValueOnce(conflictErr)
                .mockRejectedValueOnce(conflictErr)
                .mockRejectedValueOnce(conflictErr),
        };
        await execWorkTask(makeCtx(svc), 'exec-1', makeSchedule(), makeAction());
        // MAX_ATTEMPTS = 4 (RETRY_DELAYS.length + 1)
        expect(svc.create).toHaveBeenCalledTimes(4);
        expect(mockUpdateStatus).toHaveBeenCalledTimes(1);
        expect(mockUpdateStatus.mock.calls[0][2]).toBe('failed');
    });

    it('does not retry on non-conflict errors', async () => {
        const svc = {
            create: mock().mockRejectedValueOnce(new Error('Database connection lost')),
        };
        await execWorkTask(makeCtx(svc), 'exec-1', makeSchedule(), makeAction());
        expect(svc.create).toHaveBeenCalledTimes(1);
        expect(mockUpdateStatus).toHaveBeenCalledTimes(1);
        expect(mockUpdateStatus.mock.calls[0][2]).toBe('failed');
        expect(mockUpdateStatus.mock.calls[0][3]?.result).toContain('Database connection lost');
    });

    it('shows pending when branchName is null', async () => {
        const svc = {
            create: mock(() => Promise.resolve({
                id: 'task-5',
                status: 'running',
                branchName: null,
            })),
        };
        await execWorkTask(makeCtx(svc), 'exec-1', makeSchedule(), makeAction());
        expect(mockUpdateStatus.mock.calls[0][3]?.result).toContain('branch: pending');
    });
});

/**
 * Tests for schedule output destination delivery logic.
 */
import { describe, test, expect, mock, beforeEach } from 'bun:test';
import {
    shouldDeliver,
    formatResult,
    deliverToOutputDestinations,
    type RunActionDeps,
} from '../scheduler/execution';
import type {
    AgentSchedule,
    ScheduleExecution,
    ScheduleOutputDestination,
} from '../../shared/types';

// ── shouldDeliver ────────────────────────────────────────────────────────────

describe('shouldDeliver', () => {
    test('returns true for non-error-only destinations regardless of status', () => {
        const dest: ScheduleOutputDestination = { type: 'discord_channel', target: '123' };
        expect(shouldDeliver(dest, 'completed')).toBe(true);
        expect(shouldDeliver(dest, 'failed')).toBe(true);
    });

    test('returns true for summary format', () => {
        const dest: ScheduleOutputDestination = { type: 'discord_channel', target: '123', format: 'summary' };
        expect(shouldDeliver(dest, 'completed')).toBe(true);
        expect(shouldDeliver(dest, 'failed')).toBe(true);
    });

    test('returns true for full format', () => {
        const dest: ScheduleOutputDestination = { type: 'algochat_agent', target: 'agent-1', format: 'full' };
        expect(shouldDeliver(dest, 'completed')).toBe(true);
    });

    test('on_error_only returns true only when failed', () => {
        const dest: ScheduleOutputDestination = { type: 'discord_channel', target: '123', format: 'on_error_only' };
        expect(shouldDeliver(dest, 'failed')).toBe(true);
        expect(shouldDeliver(dest, 'completed')).toBe(false);
    });
});

// ── formatResult ─────────────────────────────────────────────────────────────

describe('formatResult', () => {
    test('summary format truncates to 200 chars', () => {
        const dest: ScheduleOutputDestination = { type: 'discord_channel', target: '123', format: 'summary' };
        const longResult = 'x'.repeat(500);
        const formatted = formatResult(dest, longResult);
        expect(formatted.length).toBe(200);
    });

    test('summary format passes short strings unchanged', () => {
        const dest: ScheduleOutputDestination = { type: 'discord_channel', target: '123', format: 'summary' };
        expect(formatResult(dest, 'short')).toBe('short');
    });

    test('full format returns full result', () => {
        const dest: ScheduleOutputDestination = { type: 'discord_channel', target: '123', format: 'full' };
        const longResult = 'x'.repeat(500);
        expect(formatResult(dest, longResult)).toBe(longResult);
    });

    test('no format returns full result', () => {
        const dest: ScheduleOutputDestination = { type: 'algochat_address', target: 'ADDR' };
        const longResult = 'x'.repeat(500);
        expect(formatResult(dest, longResult)).toBe(longResult);
    });
});

// ── deliverToOutputDestinations ──────────────────────────────────────────────

function makeDeps(overrides?: Partial<RunActionDeps>): RunActionDeps {
    return {
        db: {} as RunActionDeps['db'],
        agentMessenger: null,
        runningExecutions: new Set(),
        consecutiveFailures: new Map(),
        emit: mock(() => {}),
        ...overrides,
    };
}

function makeSchedule(outputDestinations: ScheduleOutputDestination[] | null): AgentSchedule {
    return {
        id: 'sched-1',
        agentId: 'agent-1',
        name: 'Test Schedule',
        description: '',
        status: 'active',
        cronExpression: '0 * * * *',
        intervalMs: null,
        actions: [{ type: 'daily_review' }],
        approvalPolicy: 'auto',
        maxExecutions: null,
        maxBudgetPerRun: null,
        executionCount: 0,
        notifyAddress: null,
        triggerEvents: null,
        outputDestinations,
        lastRunAt: null,
        nextRunAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}

function makeExecution(status: string, result: string | null): ScheduleExecution {
    return {
        id: 'exec-1',
        scheduleId: 'sched-1',
        agentId: 'agent-1',
        actionType: 'daily_review',
        actionInput: {},
        status,
        result,
        sessionId: null,
        workTaskId: null,
        costUsd: 0,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
    } as ScheduleExecution;
}

describe('deliverToOutputDestinations', () => {
    beforeEach(() => {
        delete process.env.DISCORD_BOT_TOKEN;
    });

    test('no-op when outputDestinations is null', () => {
        const deps = makeDeps();
        const schedule = makeSchedule(null);
        const execution = makeExecution('completed', 'done');
        // Should not throw
        deliverToOutputDestinations(deps, schedule, execution);
    });

    test('no-op when outputDestinations is empty', () => {
        const deps = makeDeps();
        const schedule = makeSchedule([]);
        const execution = makeExecution('completed', 'done');
        deliverToOutputDestinations(deps, schedule, execution);
    });

    test('skips on_error_only destinations when completed', () => {
        const deps = makeDeps();
        const schedule = makeSchedule([
            { type: 'discord_channel', target: '123', format: 'on_error_only' },
        ]);
        const execution = makeExecution('completed', 'done');
        // Should skip delivery — no Discord token needed since it's filtered before send
        deliverToOutputDestinations(deps, schedule, execution);
    });

    test('discord delivery skipped without DISCORD_BOT_TOKEN', () => {
        const deps = makeDeps();
        const schedule = makeSchedule([
            { type: 'discord_channel', target: '123456789' },
        ]);
        const execution = makeExecution('completed', 'All good');
        // Should not throw — gracefully skips when no token
        deliverToOutputDestinations(deps, schedule, execution);
    });

    test('algochat_agent skipped when agentMessenger is null', () => {
        const deps = makeDeps({ agentMessenger: null });
        const schedule = makeSchedule([
            { type: 'algochat_agent', target: 'agent-xyz' },
        ]);
        const execution = makeExecution('completed', 'result');
        // Should not throw
        deliverToOutputDestinations(deps, schedule, execution);
    });

    test('algochat_address skipped when agentMessenger is null', () => {
        const deps = makeDeps({ agentMessenger: null });
        const schedule = makeSchedule([
            { type: 'algochat_address', target: 'ALGO_ADDR' },
        ]);
        const execution = makeExecution('failed', 'error msg');
        deliverToOutputDestinations(deps, schedule, execution);
    });

    test('algochat_agent calls sendOnChainToSelf when messenger available', async () => {
        const sendOnChainToSelf = mock(() => Promise.resolve());
        const messenger = { sendOnChainToSelf } as unknown as RunActionDeps['agentMessenger'];
        const deps = makeDeps({ agentMessenger: messenger });
        const schedule = makeSchedule([
            { type: 'algochat_agent', target: 'agent-target' },
        ]);
        const execution = makeExecution('completed', 'success result');
        deliverToOutputDestinations(deps, schedule, execution);
        // Wait for async delivery
        await new Promise((r) => setTimeout(r, 50));
        expect(sendOnChainToSelf).toHaveBeenCalledTimes(1);
    });

    test('algochat_address calls sendNotificationToAddress when messenger available', async () => {
        const sendNotificationToAddress = mock(() => Promise.resolve());
        const messenger = { sendNotificationToAddress } as unknown as RunActionDeps['agentMessenger'];
        const deps = makeDeps({ agentMessenger: messenger });
        const schedule = makeSchedule([
            { type: 'algochat_address', target: 'ALGO_ADDR_456' },
        ]);
        const execution = makeExecution('failed', 'it broke');
        deliverToOutputDestinations(deps, schedule, execution);
        await new Promise((r) => setTimeout(r, 50));
        expect(sendNotificationToAddress).toHaveBeenCalledTimes(1);
    });

    test('handles null result gracefully', () => {
        const deps = makeDeps();
        const schedule = makeSchedule([
            { type: 'discord_channel', target: '123' },
        ]);
        const execution = makeExecution('completed', null);
        deliverToOutputDestinations(deps, schedule, execution);
    });

    test('delivery errors are caught and do not throw', async () => {
        const sendOnChainToSelf = mock(() => Promise.reject(new Error('network fail')));
        const messenger = { sendOnChainToSelf } as unknown as RunActionDeps['agentMessenger'];
        const deps = makeDeps({ agentMessenger: messenger });
        const schedule = makeSchedule([
            { type: 'algochat_agent', target: 'agent-fail' },
        ]);
        const execution = makeExecution('completed', 'result');
        // Should not throw even when delivery fails
        deliverToOutputDestinations(deps, schedule, execution);
        await new Promise((r) => setTimeout(r, 50));
    });

    test('multiple destinations are all attempted', async () => {
        const sendOnChainToSelf = mock(() => Promise.resolve());
        const sendNotificationToAddress = mock(() => Promise.resolve());
        const messenger = {
            sendOnChainToSelf,
            sendNotificationToAddress,
        } as unknown as RunActionDeps['agentMessenger'];
        const deps = makeDeps({ agentMessenger: messenger });
        const schedule = makeSchedule([
            { type: 'algochat_agent', target: 'agent-1' },
            { type: 'algochat_address', target: 'ADDR_1' },
        ]);
        const execution = makeExecution('completed', 'multi result');
        deliverToOutputDestinations(deps, schedule, execution);
        await new Promise((r) => setTimeout(r, 50));
        expect(sendOnChainToSelf).toHaveBeenCalledTimes(1);
        expect(sendNotificationToAddress).toHaveBeenCalledTimes(1);
    });
});

/**
 * Tests for the flock_testing schedule handler.
 */
import { test, expect, describe, beforeEach, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { execFlockTesting } from '../scheduler/handlers/flock-testing';
import type { HandlerContext } from '../scheduler/handlers/types';
import type { AgentSchedule } from '../../shared/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createMockCtx(db: Database, overrides: Partial<HandlerContext> = {}): HandlerContext {
    return {
        db,
        processManager: {} as any,
        workTaskService: null,
        agentMessenger: null,
        improvementLoopService: null,
        reputationScorer: null,
        reputationAttestation: null,
        outcomeTrackerService: null,
        dailyReviewService: null,
        systemStateDetector: {} as any,
        runningExecutions: new Set(),
        resolveScheduleTenantId: () => 'default',
        ...overrides,
    };
}

function createMockSchedule(overrides: Partial<AgentSchedule> = {}): AgentSchedule {
    return {
        id: 'sched-1',
        agentId: 'agent-self',
        name: 'Flock Testing',
        description: 'Automated agent testing',
        cronExpression: '0 0 * * *',
        intervalMs: null,
        actions: [{ type: 'flock_testing' }],
        approvalPolicy: 'auto',
        status: 'active',
        maxExecutions: null,
        executionCount: 0,
        maxBudgetPerRun: null,
        notifyAddress: null,
        triggerEvents: null,
        outputDestinations: null,
        executionMode: 'independent',
        pipelineSteps: null,
        lastRunAt: null,
        nextRunAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...overrides,
    };
}

function insertExecution(db: Database, id: string): void {
    db.query(`
        INSERT INTO schedule_executions (id, schedule_id, agent_id, status, action_type, action_input, cost_usd, started_at)
        VALUES (?, 'sched-1', 'agent-self', 'running', 'flock_testing', '{}', 0, datetime('now'))
    `).run(id);
}

function getExecutionResult(db: Database, id: string): { status: string; result: string | null } {
    return db.query(`SELECT status, result FROM schedule_executions WHERE id = ?`).get(id) as any;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

let db: Database;

beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
});

describe('execFlockTesting', () => {
    test('fails when agentMessenger is null', async () => {
        const ctx = createMockCtx(db, { agentMessenger: null });
        const execId = 'exec-1';
        insertExecution(db, execId);

        await execFlockTesting(ctx, execId, createMockSchedule());

        const result = getExecutionResult(db, execId);
        expect(result.status).toBe('failed');
        expect(result.result).toContain('Agent messenger not configured');
    });

    test('completes with no active agents message', async () => {
        const mockMessenger = {
            invokeAndWait: mock(async () => ({ response: 'ok', threadId: 't1' })),
        };
        const ctx = createMockCtx(db, { agentMessenger: mockMessenger as any });
        const execId = 'exec-2';
        insertExecution(db, execId);

        await execFlockTesting(ctx, execId, createMockSchedule());

        const result = getExecutionResult(db, execId);
        expect(result.status).toBe('completed');
        expect(result.result).toContain('No active agents');
    });

    test('tests active agents and reports results', async () => {
        // Register an agent in the agents table (for wallet address resolution)
        db.query(`
            INSERT INTO agents (id, name, wallet_address, tenant_id, created_at, updated_at)
            VALUES ('agent-target-uuid', 'TestAgent', 'ALGO_TARGET_ADDR', 'default', datetime('now'), datetime('now'))
        `).run();
        // Register the same agent in the flock directory
        db.query(`
            INSERT INTO flock_agents (id, address, name, description, instance_url, capabilities, status, reputation_score, attestation_count, council_participations, uptime_pct, registered_at, updated_at)
            VALUES ('agent-target', 'ALGO_TARGET_ADDR', 'TestAgent', 'A test agent', 'http://test', '[]', 'active', 50, 0, 0, 100, datetime('now'), datetime('now'))
        `).run();

        const mockMessenger = {
            invokeAndWait: mock(async () => ({ response: 'pong', threadId: 't1' })),
        };
        const ctx = createMockCtx(db, { agentMessenger: mockMessenger as any });
        const execId = 'exec-3';
        insertExecution(db, execId);

        await execFlockTesting(ctx, execId, createMockSchedule());

        const result = getExecutionResult(db, execId);
        expect(result.status).toBe('completed');
        expect(result.result).toContain('Tested 1 agents');
        expect(result.result).toContain('TestAgent');
    });

    test('skips self-testing', async () => {
        // Register self as an agent in both the agents table and flock directory
        db.query(`
            INSERT INTO agents (id, name, wallet_address, tenant_id, created_at, updated_at)
            VALUES ('agent-self', 'SelfAgent', 'agent-self-wallet', 'default', datetime('now'), datetime('now'))
        `).run();
        db.query(`
            INSERT INTO flock_agents (id, address, name, description, instance_url, capabilities, status, reputation_score, attestation_count, council_participations, uptime_pct, registered_at, updated_at)
            VALUES ('self', 'agent-self-wallet', 'SelfAgent', 'Self agent', 'http://self', '[]', 'active', 50, 0, 0, 100, datetime('now'), datetime('now'))
        `).run();

        const mockMessenger = {
            invokeAndWait: mock(async () => ({ response: 'ok', threadId: 't1' })),
        };
        const ctx = createMockCtx(db, { agentMessenger: mockMessenger as any });
        const execId = 'exec-4';
        insertExecution(db, execId);

        await execFlockTesting(ctx, execId, createMockSchedule());

        const result = getExecutionResult(db, execId);
        expect(result.status).toBe('completed');
        // Self was skipped, so 0 agents tested
        expect(result.result).toContain('Tested 0 agents');
    });

    test('handles agent test failure gracefully', async () => {
        // Register an agent in the agents table (for wallet address resolution)
        db.query(`
            INSERT INTO agents (id, name, wallet_address, tenant_id, created_at, updated_at)
            VALUES ('agent-fail-uuid', 'FailAgent', 'ALGO_FAIL_ADDR', 'default', datetime('now'), datetime('now'))
        `).run();
        // Register the same agent in the flock directory
        db.query(`
            INSERT INTO flock_agents (id, address, name, description, instance_url, capabilities, status, reputation_score, attestation_count, council_participations, uptime_pct, registered_at, updated_at)
            VALUES ('agent-fail', 'ALGO_FAIL_ADDR', 'FailAgent', 'Agent that fails', 'http://fail', '[]', 'active', 50, 0, 0, 100, datetime('now'), datetime('now'))
        `).run();

        const mockMessenger = {
            invokeAndWait: mock(async () => { throw new Error('Connection refused'); }),
        };
        const ctx = createMockCtx(db, { agentMessenger: mockMessenger as any });
        const execId = 'exec-5';
        insertExecution(db, execId);

        await execFlockTesting(ctx, execId, createMockSchedule());

        const result = getExecutionResult(db, execId);
        expect(result.status).toBe('completed');
        expect(result.result).toContain('Tested 1 agents');
        expect(result.result).toContain('FailAgent: 0/100');
    });
});

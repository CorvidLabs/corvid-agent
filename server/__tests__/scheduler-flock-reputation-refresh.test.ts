/**
 * Tests for the flock_reputation_refresh schedule handler.
 */

import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, test } from 'bun:test';
import type { AgentSchedule } from '../../shared/types';
import { runMigrations } from '../db/schema';
import { execFlockReputationRefresh } from '../scheduler/handlers/maintenance';
import type { HandlerContext } from '../scheduler/handlers/types';

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

function createMockSchedule(): AgentSchedule {
  return {
    id: 'sched-frr-1',
    agentId: 'agent-self',
    name: 'Flock Reputation Refresh',
    description: 'Refresh flock directory reputation scores',
    cronExpression: '0 */6 * * *',
    intervalMs: null,
    actions: [{ type: 'flock_reputation_refresh' }],
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
  };
}

function insertExecution(db: Database, id: string): void {
  db.query(`
        INSERT INTO schedule_executions (id, schedule_id, agent_id, status, action_type, action_input, cost_usd, started_at)
        VALUES (?, 'sched-frr-1', 'agent-self', 'running', 'flock_reputation_refresh', '{}', 0, datetime('now'))
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
  db.query(`
        INSERT INTO agent_schedules (id, agent_id, name, cron_expression, actions, status, approval_policy, execution_mode)
        VALUES ('sched-frr-1', 'agent-self', 'Flock Reputation Refresh', '0 */6 * * *', '[]', 'active', 'auto', 'independent')
    `).run();
});

describe('execFlockReputationRefresh', () => {
  test('completes with zero agents when flock directory is empty', async () => {
    const ctx = createMockCtx(db);
    const execId = 'exec-frr-1';
    insertExecution(db, execId);

    await execFlockReputationRefresh(ctx, execId, createMockSchedule());

    const result = getExecutionResult(db, execId);
    expect(result.status).toBe('completed');
    expect(result.result).toContain('Flock reputation refresh completed');
    expect(result.result).toContain('0 agents updated');
  });

  test('reports count of updated agents', async () => {
    // Register a couple of agents in the flock directory
    db.query(`
            INSERT INTO flock_agents (id, address, name, description, instance_url, capabilities, status, reputation_score, attestation_count, council_participations, uptime_pct, registered_at, updated_at)
            VALUES ('flock-a1', 'ADDR1', 'AgentOne', 'First agent', 'http://one', '[]', 'active', 50, 2, 1, 95, datetime('now'), datetime('now'))
        `).run();
    db.query(`
            INSERT INTO flock_agents (id, address, name, description, instance_url, capabilities, status, reputation_score, attestation_count, council_participations, uptime_pct, registered_at, updated_at)
            VALUES ('flock-a2', 'ADDR2', 'AgentTwo', 'Second agent', 'http://two', '[]', 'active', 60, 5, 3, 99, datetime('now'), datetime('now'))
        `).run();

    const ctx = createMockCtx(db);
    const execId = 'exec-frr-2';
    insertExecution(db, execId);

    await execFlockReputationRefresh(ctx, execId, createMockSchedule());

    const result = getExecutionResult(db, execId);
    expect(result.status).toBe('completed');
    expect(result.result).toContain('Flock reputation refresh completed');
    expect(result.result).toContain('2 agents updated');
  });

  test('sets execution to failed when an error is thrown', async () => {
    // Break the DB by closing it to trigger an error inside the handler
    const brokenDb = new Database(':memory:');
    runMigrations(brokenDb);
    brokenDb
      .query(`
            INSERT INTO agent_schedules (id, agent_id, name, cron_expression, actions, status, approval_policy, execution_mode)
            VALUES ('sched-frr-1', 'agent-self', 'FRR', '0 */6 * * *', '[]', 'active', 'auto', 'independent')
        `)
      .run();
    insertExecution(brokenDb, 'exec-frr-err');
    brokenDb.close();

    // Re-open so updateExecutionStatus can write but flock queries will fail
    // Instead, monkey-patch by passing a context whose db is the closed one
    const ctx = createMockCtx(db); // healthy db for status update
    // We simulate a throw by passing a ctx whose db would cause FlockDirectoryService to fail.
    // The simplest way: close db mid-flight is unreliable, so instead verify error path
    // by temporarily dropping the flock_agents table.
    db.query(`DROP TABLE IF EXISTS flock_agents`).run();

    insertExecution(db, 'exec-frr-err');
    await execFlockReputationRefresh(ctx, 'exec-frr-err', createMockSchedule());

    const result = getExecutionResult(db, 'exec-frr-err');
    expect(result.status).toBe('failed');
    expect(result.result).toBeTruthy();
  });
});

/**
 * Tests for the evaluate_established schedule handler.
 */

import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, test } from 'bun:test';
import type { AgentSchedule } from '../../shared/types';
import { runMigrations } from '../db/schema';
import { execEstablishedEvaluation } from '../scheduler/handlers/maintenance';
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
    id: 'sched-ee-1',
    agentId: 'agent-self',
    name: 'Evaluate Established',
    description: 'Daily ESTABLISHED tier evaluation',
    cronExpression: '0 2 * * *',
    intervalMs: null,
    actions: [{ type: 'evaluate_established' }],
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
    VALUES (?, 'sched-ee-1', 'agent-self', 'running', 'evaluate_established', '{}', 0, datetime('now'))
  `).run(id);
}

function getExecutionResult(db: Database, id: string): { status: string; result: string | null } {
  return db.query(`SELECT status, result FROM schedule_executions WHERE id = ?`).get(id) as any;
}

/** Insert an agent that meets ALL ESTABLISHED thresholds. */
function insertEstablishedAgent(db: Database, agentId: string): void {
  // Agent created 31 days ago
  const createdAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
  db.query(`
    INSERT INTO agents (id, name, model, created_at, updated_at)
    VALUES (?, ?, 'claude-sonnet-4-6', ?, ?)
  `).run(agentId, agentId, createdAt, createdAt);

  // 10 completed work tasks (SQLite does not enforce FK by default)
  for (let i = 0; i < 10; i++) {
    db.query(`
      INSERT INTO work_tasks (id, agent_id, project_id, description, status)
      VALUES (?, ?, 'proj-test', 'task', 'completed')
    `).run(`task-${agentId}-${i}`, agentId);
  }

  // Reputation score >= 70
  db.query(`
    INSERT INTO agent_reputation (agent_id, overall_score, task_completion, peer_rating, credit_pattern, security_compliance, activity_level)
    VALUES (?, 75, 80, 70, 70, 75, 70)
  `).run(agentId);
}

/** Insert an agent that does NOT meet all thresholds (too new). */
function insertNewAgent(db: Database, agentId: string): void {
  db.query(`
    INSERT INTO agents (id, name, model, created_at, updated_at)
    VALUES (?, ?, 'claude-sonnet-4-6', datetime('now'), datetime('now'))
  `).run(agentId, agentId);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

let db: Database;

beforeEach(() => {
  db = new Database(':memory:');
  runMigrations(db);
  db.query(`
    INSERT INTO agent_schedules (id, agent_id, name, cron_expression, actions, status, approval_policy, execution_mode)
    VALUES ('sched-ee-1', 'agent-self', 'Evaluate Established', '0 2 * * *', '[]', 'active', 'auto', 'independent')
  `).run();
});

describe('execEstablishedEvaluation', () => {
  test('completes with zero agents when no agents exist', async () => {
    const ctx = createMockCtx(db);
    const execId = 'exec-ee-empty';
    insertExecution(db, execId);

    await execEstablishedEvaluation(ctx, execId, createMockSchedule());

    const result = getExecutionResult(db, execId);
    expect(result.status).toBe('completed');
    expect(result.result).toContain('Evaluated 0 agent(s)');
    expect(result.result).toContain('0 upgraded to ESTABLISHED');
  });

  test('upgrades agent meeting all thresholds', async () => {
    insertEstablishedAgent(db, 'agent-ready');
    const ctx = createMockCtx(db);
    const execId = 'exec-ee-upgrade';
    insertExecution(db, execId);

    await execEstablishedEvaluation(ctx, execId, createMockSchedule());

    const result = getExecutionResult(db, execId);
    expect(result.status).toBe('completed');
    expect(result.result).toContain('1 upgraded to ESTABLISHED');
    expect(result.result).toContain('agent-ready');

    // Verify tier was persisted
    const tierRow = db.query('SELECT tier FROM agent_identity WHERE agent_id = ?').get('agent-ready') as any;
    expect(tierRow?.tier).toBe('ESTABLISHED');
  });

  test('skips agent that does not meet age threshold', async () => {
    insertNewAgent(db, 'agent-new');
    const ctx = createMockCtx(db);
    const execId = 'exec-ee-skip';
    insertExecution(db, execId);

    await execEstablishedEvaluation(ctx, execId, createMockSchedule());

    const result = getExecutionResult(db, execId);
    expect(result.status).toBe('completed');
    expect(result.result).toContain('0 upgraded to ESTABLISHED');
  });

  test('does not double-upgrade an already ESTABLISHED agent', async () => {
    insertEstablishedAgent(db, 'agent-est');
    // Pre-set to ESTABLISHED
    db.query(`
      INSERT INTO agent_identity (agent_id, tier, verified_at, updated_at)
      VALUES ('agent-est', 'ESTABLISHED', datetime('now'), datetime('now'))
    `).run();

    const ctx = createMockCtx(db);
    const execId = 'exec-ee-nodup';
    insertExecution(db, execId);

    await execEstablishedEvaluation(ctx, execId, createMockSchedule());

    const result = getExecutionResult(db, execId);
    expect(result.status).toBe('completed');
    expect(result.result).toContain('0 upgraded to ESTABLISHED');
  });

  test('evaluates multiple agents and reports all upgrades', async () => {
    insertEstablishedAgent(db, 'agent-a');
    insertEstablishedAgent(db, 'agent-b');
    insertNewAgent(db, 'agent-c');

    const ctx = createMockCtx(db);
    const execId = 'exec-ee-multi';
    insertExecution(db, execId);

    await execEstablishedEvaluation(ctx, execId, createMockSchedule());

    const result = getExecutionResult(db, execId);
    expect(result.status).toBe('completed');
    expect(result.result).toContain('Evaluated 3 agent(s)');
    expect(result.result).toContain('2 upgraded to ESTABLISHED');
  });

  test('marks execution failed when db throws', async () => {
    // Drop the agents table to cause an error inside the handler
    db.query('DROP TABLE IF EXISTS agents').run();

    const ctx = createMockCtx(db);
    const execId = 'exec-ee-err';
    insertExecution(db, execId);

    await execEstablishedEvaluation(ctx, execId, createMockSchedule());

    const result = getExecutionResult(db, execId);
    expect(result.status).toBe('failed');
    expect(result.result).toBeTruthy();
  });
});

import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { AgentSchedule } from '../../shared/types';
import { getExecution } from '../db/schedules';
import { runMigrations } from '../db/schema';
import { DailyReviewService } from '../improvement/daily-review';
import { MemoryManager } from '../memory/index';
import { execDailyReview } from '../scheduler/handlers/maintenance';
import type { HandlerContext } from '../scheduler/handlers/types';

let db: Database;

beforeEach(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);

  db.query(
    `INSERT INTO agents (id, name, model, system_prompt) VALUES ('agent-1', 'Test Agent', 'test', 'test')`,
  ).run();
  db.query(`INSERT INTO agent_schedules (id, agent_id, name, description, cron_expression, actions, approval_policy, status)
        VALUES ('sched-1', 'agent-1', 'Daily Review', 'Test', '0 0 * * *', '[]', 'auto', 'active')`).run();
});

afterEach(() => {
  db.close();
});

function createExecution(): string {
  const id = crypto.randomUUID();
  db.query(`INSERT INTO schedule_executions (id, schedule_id, agent_id, status, action_type, started_at)
        VALUES (?, 'sched-1', 'agent-1', 'running', 'daily_review', ?)`).run(id, new Date().toISOString());
  return id;
}

const schedule: AgentSchedule = {
  id: 'sched-1',
  agentId: 'agent-1',
  name: 'Daily Review',
  description: 'Test',
  cronExpression: '0 0 * * *',
  intervalMs: null,
  actions: [],
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

describe('execDailyReview attestation', () => {
  test('publishes on-chain attestation when agentMessenger is available', async () => {
    const memoryManager = new MemoryManager(db);
    const dailyReviewService = new DailyReviewService(db, memoryManager);
    const executionId = createExecution();

    let sentNote = '';
    const mockMessenger = {
      sendOnChainToSelf: mock(async (_agentId: string, note: string) => {
        sentNote = note;
        return 'mock-txid-123';
      }),
    };

    const ctx = {
      db,
      dailyReviewService,
      agentMessenger: mockMessenger as any,
    } as unknown as HandlerContext;

    await execDailyReview(ctx, executionId, schedule);

    const execution = getExecution(db, executionId);
    expect(execution?.status).toBe('completed');
    expect(execution?.result).toContain('attestation=');
    expect(execution?.result).toContain('txid=mock-txid-123');
    expect(sentNote).toMatch(/^corvid-daily-review:agent-1:\d{4}-\d{2}-\d{2}:[a-f0-9]{64}$/);
  });

  test('completes without attestation when agentMessenger is null', async () => {
    const memoryManager = new MemoryManager(db);
    const dailyReviewService = new DailyReviewService(db, memoryManager);
    const executionId = createExecution();

    const ctx = {
      db,
      dailyReviewService,
      agentMessenger: null,
    } as unknown as HandlerContext;

    await execDailyReview(ctx, executionId, schedule);

    const execution = getExecution(db, executionId);
    expect(execution?.status).toBe('completed');
    expect(execution?.result).not.toContain('attestation=');
  });

  test('completes even if on-chain publish fails', async () => {
    const memoryManager = new MemoryManager(db);
    const dailyReviewService = new DailyReviewService(db, memoryManager);
    const executionId = createExecution();

    const mockMessenger = {
      sendOnChainToSelf: mock(async () => {
        throw new Error('network error');
      }),
    };

    const ctx = {
      db,
      dailyReviewService,
      agentMessenger: mockMessenger as any,
    } as unknown as HandlerContext;

    await execDailyReview(ctx, executionId, schedule);

    const execution = getExecution(db, executionId);
    expect(execution?.status).toBe('completed');
    // Should still complete, just without attestation info
    expect(execution?.result).not.toContain('attestation=');
  });

  test('fails when dailyReviewService is not configured', async () => {
    const executionId = createExecution();

    const ctx = {
      db,
      dailyReviewService: null,
      agentMessenger: null,
    } as unknown as HandlerContext;

    await execDailyReview(ctx, executionId, schedule);

    const execution = getExecution(db, executionId);
    expect(execution?.status).toBe('failed');
    expect(execution?.result).toContain('not configured');
  });
});

/**
 * Tests for executePipeline() — sequential multi-action pipeline execution
 * with context threading, conditional steps, and variable interpolation.
 *
 * Uses dependency injection (runActionFn parameter) instead of mock.module
 * to avoid polluting the global module cache for other test files.
 */

import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { AgentSchedule, PipelineStep, ScheduleAction } from '../../shared/types';
import { runMigrations } from '../db/schema';
import type { RunActionDeps } from '../scheduler/execution';
import type { HandlerContext } from '../scheduler/handlers/types';
import { executePipeline, type RunActionFn } from '../scheduler/pipeline';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createMockCtx(db: Database): HandlerContext {
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
  };
}

function createMockSchedule(): AgentSchedule {
  return {
    id: 'sched-pipe-1',
    agentId: 'agent-1',
    name: 'Pipeline Test',
    description: 'Pipeline test schedule',
    cronExpression: '0 0 * * *',
    intervalMs: null,
    actions: [{ type: 'review_prs' }],
    approvalPolicy: 'auto',
    status: 'active',
    maxExecutions: null,
    executionCount: 0,
    maxBudgetPerRun: null,
    notifyAddress: null,
    triggerEvents: null,
    outputDestinations: null,
    executionMode: 'pipeline',
    pipelineSteps: null,
    lastRunAt: null,
    nextRunAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeDeps(db: Database, emitFn: ReturnType<typeof mock>): RunActionDeps {
  return {
    db,
    agentMessenger: null,
    runningExecutions: new Set(),
    consecutiveFailures: new Map(),
    emit: emitFn,
  };
}

/**
 * Create a mock runAction that simulates completion by updating the DB row.
 * Each call to the returned function adds a step result to the queue.
 */
function createMockRunAction(db: Database) {
  const outcomes: Array<{ result: string; status: 'completed' | 'failed' }> = [];
  const fn = mock(async (_deps: RunActionDeps, _hctx: HandlerContext, executionId: string) => {
    const outcome = outcomes.shift() ?? { result: 'default', status: 'completed' as const };
    db.query(`UPDATE schedule_executions SET status = ?, result = ? WHERE id = ?`).run(
      outcome.status,
      outcome.result,
      executionId,
    );
  }) as ReturnType<typeof mock> & { enqueue: (result: string, status?: 'completed' | 'failed') => void };

  fn.enqueue = (result: string, status: 'completed' | 'failed' = 'completed') => {
    outcomes.push({ result, status });
  };

  return fn;
}

let db: Database;
let hctx: HandlerContext;
let schedule: AgentSchedule;
const emitFn = mock(() => {});

beforeEach(() => {
  db = new Database(':memory:');
  runMigrations(db);
  db.query(`INSERT INTO agents (id, name, wallet_address) VALUES ('agent-1', 'test', 'addr1')`).run();
  db.query(`
        INSERT INTO agent_schedules (id, agent_id, name, cron_expression, actions, status, approval_policy, execution_mode)
        VALUES ('sched-pipe-1', 'agent-1', 'Pipeline Test', '0 0 * * *', '[]', 'active', 'auto', 'pipeline')
    `).run();
  hctx = createMockCtx(db);
  schedule = createMockSchedule();
  emitFn.mockReset();
});

afterEach(() => {
  db.close();
});

// ─── executePipeline ─────────────────────────────────────────────────────────

describe('executePipeline', () => {
  it('executes all steps sequentially and returns context with results', async () => {
    const mockRun = createMockRunAction(db);
    mockRun.enqueue('Reviewed 3 PRs');
    mockRun.enqueue('Posted to Discord');

    const steps: PipelineStep[] = [
      { label: 'review', action: { type: 'review_prs', repos: ['CorvidLabs/corvid-agent'] } },
      { label: 'notify', action: { type: 'discord_post', channelId: '123', message: 'Done' } },
    ];

    const ctx = await executePipeline(
      makeDeps(db, emitFn),
      hctx,
      schedule,
      steps,
      emitFn,
      mockRun as unknown as RunActionFn,
    );

    expect(mockRun).toHaveBeenCalledTimes(2);
    expect(ctx.hasFailure).toBe(false);
    expect(ctx.stepResults.review.status).toBe('completed');
    expect(ctx.stepResults.review.result).toBe('Reviewed 3 PRs');
    expect(ctx.stepResults.notify.status).toBe('completed');
    expect(ctx.stepResults.notify.result).toBe('Posted to Discord');
    expect(ctx.summary).toContain('[OK] review');
    expect(ctx.summary).toContain('[OK] notify');
  });

  it('sets hasFailure when a step fails', async () => {
    const mockRun = createMockRunAction(db);
    mockRun.enqueue('Audit failed: timeout', 'failed');
    mockRun.enqueue('Posted failure report');

    const steps: PipelineStep[] = [
      { label: 'audit', action: { type: 'dependency_audit' } },
      {
        label: 'report',
        action: { type: 'discord_post', channelId: '123', message: 'audit done' },
        condition: 'always',
      },
    ];

    const ctx = await executePipeline(
      makeDeps(db, emitFn),
      hctx,
      schedule,
      steps,
      emitFn,
      mockRun as unknown as RunActionFn,
    );

    expect(ctx.hasFailure).toBe(true);
    expect(ctx.stepResults.audit.status).toBe('failed');
    expect(ctx.stepResults.audit.result).toBe('Audit failed: timeout');
    expect(ctx.stepResults.report.status).toBe('completed');
    expect(ctx.summary).toContain('[FAIL] audit');
    expect(ctx.summary).toContain('[OK] report');
  });

  it('skips on_success steps when prior step fails', async () => {
    const mockRun = createMockRunAction(db);
    mockRun.enqueue('Step 1 failed', 'failed');

    const steps: PipelineStep[] = [
      { label: 'step1', action: { type: 'review_prs' } },
      { label: 'step2', action: { type: 'discord_post', channelId: '1', message: 'ok' }, condition: 'on_success' },
    ];

    const ctx = await executePipeline(
      makeDeps(db, emitFn),
      hctx,
      schedule,
      steps,
      emitFn,
      mockRun as unknown as RunActionFn,
    );

    expect(mockRun).toHaveBeenCalledTimes(1);
    expect(ctx.stepResults.step2.status).toBe('skipped');
    expect(ctx.stepResults.step2.result).toBeNull();
    expect(ctx.summary).toContain('[SKIP] step2');
  });

  it('runs on_failure steps only when prior step fails', async () => {
    const mockRun = createMockRunAction(db);
    mockRun.enqueue('Build broke', 'failed');
    mockRun.enqueue('Alert sent');

    const steps: PipelineStep[] = [
      { label: 'build', action: { type: 'custom', prompt: 'Build project' } },
      {
        label: 'alert',
        action: { type: 'discord_post', channelId: '1', message: 'Build broke!' },
        condition: 'on_failure',
      },
    ];

    const ctx = await executePipeline(
      makeDeps(db, emitFn),
      hctx,
      schedule,
      steps,
      emitFn,
      mockRun as unknown as RunActionFn,
    );

    expect(mockRun).toHaveBeenCalledTimes(2);
    expect(ctx.stepResults.alert.status).toBe('completed');
  });

  it('skips on_failure steps when prior steps succeed', async () => {
    const mockRun = createMockRunAction(db);
    mockRun.enqueue('Build succeeded');

    const steps: PipelineStep[] = [
      { label: 'build', action: { type: 'custom', prompt: 'Build project' } },
      {
        label: 'alert',
        action: { type: 'discord_post', channelId: '1', message: 'Build broke!' },
        condition: 'on_failure',
      },
    ];

    const ctx = await executePipeline(
      makeDeps(db, emitFn),
      hctx,
      schedule,
      steps,
      emitFn,
      mockRun as unknown as RunActionFn,
    );

    expect(mockRun).toHaveBeenCalledTimes(1);
    expect(ctx.stepResults.alert.status).toBe('skipped');
  });

  it('interpolates {{pipeline.steps.<label>.result}} in message', async () => {
    const mockRun = createMockRunAction(db);
    mockRun.enqueue('All systems nominal');
    mockRun.enqueue('Posted summary');

    const steps: PipelineStep[] = [
      { label: 'review', action: { type: 'daily_review' } },
      {
        label: 'post',
        action: { type: 'discord_post', channelId: '1', message: 'Summary: {{pipeline.steps.review.result}}' },
      },
    ];

    const ctx = await executePipeline(
      makeDeps(db, emitFn),
      hctx,
      schedule,
      steps,
      emitFn,
      mockRun as unknown as RunActionFn,
    );

    // Verify the action passed to runAction had interpolated message
    const secondCall = mockRun.mock.calls[1];
    const actionArg = secondCall[4] as ScheduleAction;
    expect(actionArg.message).toBe('Summary: All systems nominal');
    expect(ctx.stepResults.post.status).toBe('completed');
  });

  it('interpolates {{pipeline.hasFailure}} in prompt', async () => {
    const mockRun = createMockRunAction(db);
    mockRun.enqueue('Check passed');
    mockRun.enqueue('Report generated');

    const steps: PipelineStep[] = [
      { label: 'check', action: { type: 'status_checkin' } },
      { label: 'report', action: { type: 'custom', prompt: 'Failed: {{pipeline.hasFailure}}' }, condition: 'always' },
    ];

    await executePipeline(makeDeps(db, emitFn), hctx, schedule, steps, emitFn, mockRun as unknown as RunActionFn);

    const secondCall = mockRun.mock.calls[1];
    const actionArg = secondCall[4] as ScheduleAction;
    expect(actionArg.prompt).toBe('Failed: false');
  });

  it('creates execution records for each step', async () => {
    const mockRun = createMockRunAction(db);
    mockRun.enqueue('Review done');
    mockRun.enqueue('Status OK');

    const steps: PipelineStep[] = [
      { label: 'step1', action: { type: 'daily_review' } },
      { label: 'step2', action: { type: 'status_checkin' } },
    ];

    const ctx = await executePipeline(
      makeDeps(db, emitFn),
      hctx,
      schedule,
      steps,
      emitFn,
      mockRun as unknown as RunActionFn,
    );

    expect(ctx.stepResults.step1.executionId).toBeTruthy();
    expect(ctx.stepResults.step2.executionId).toBeTruthy();
    expect(ctx.stepResults.step1.executionId).not.toBe(ctx.stepResults.step2.executionId);

    const rows = db.query('SELECT * FROM schedule_executions ORDER BY started_at').all() as any[];
    expect(rows.length).toBe(2);
  });

  it('emits events for each step execution', async () => {
    const mockRun = createMockRunAction(db);
    mockRun.enqueue('Done');

    const steps: PipelineStep[] = [{ label: 'only', action: { type: 'daily_review' } }];

    await executePipeline(makeDeps(db, emitFn), hctx, schedule, steps, emitFn, mockRun as unknown as RunActionFn);

    expect(emitFn).toHaveBeenCalled();
    const calls = emitFn.mock.calls;
    const execUpdateCalls = calls.filter((c: any) => c[0]?.type === 'schedule_execution_update');
    expect(execUpdateCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('handles empty pipeline (no steps)', async () => {
    const mockRun = createMockRunAction(db);

    const ctx = await executePipeline(
      makeDeps(db, emitFn),
      hctx,
      schedule,
      [],
      emitFn,
      mockRun as unknown as RunActionFn,
    );

    expect(mockRun).not.toHaveBeenCalled();
    expect(ctx.hasFailure).toBe(false);
    expect(Object.keys(ctx.stepResults)).toHaveLength(0);
    expect(ctx.summary).toBe('');
  });

  it('tracks durationMs for each step', async () => {
    const mockRun = mock(async (_deps: RunActionDeps, _hctx: HandlerContext, executionId: string) => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      db.query(`UPDATE schedule_executions SET status = 'completed', result = 'done' WHERE id = ?`).run(executionId);
    });

    const steps: PipelineStep[] = [{ label: 'slow', action: { type: 'daily_review' } }];

    const ctx = await executePipeline(
      makeDeps(db, emitFn),
      hctx,
      schedule,
      steps,
      emitFn,
      mockRun as unknown as RunActionFn,
    );

    expect(ctx.stepResults.slow.durationMs).toBeGreaterThanOrEqual(40);
  });

  it('three-step pipeline with mixed conditions', async () => {
    const mockRun = createMockRunAction(db);
    mockRun.enqueue('All healthy');
    mockRun.enqueue('Report sent');

    const steps: PipelineStep[] = [
      { label: 'check', action: { type: 'status_checkin' } },
      { label: 'fix', action: { type: 'improvement_loop' }, condition: 'on_failure' },
      {
        label: 'report',
        action: { type: 'discord_post', channelId: '1', message: '{{pipeline.summary}}' },
        condition: 'always',
      },
    ];

    const ctx = await executePipeline(
      makeDeps(db, emitFn),
      hctx,
      schedule,
      steps,
      emitFn,
      mockRun as unknown as RunActionFn,
    );

    expect(mockRun).toHaveBeenCalledTimes(2); // check + report (fix skipped)
    expect(ctx.stepResults.check.status).toBe('completed');
    expect(ctx.stepResults.fix.status).toBe('skipped');
    expect(ctx.stepResults.report.status).toBe('completed');
  });

  it('records audit entries for each executed step', async () => {
    const mockRun = createMockRunAction(db);
    mockRun.enqueue('Audit complete');

    const steps: PipelineStep[] = [{ label: 'audit-step', action: { type: 'dependency_audit' } }];

    await executePipeline(makeDeps(db, emitFn), hctx, schedule, steps, emitFn, mockRun as unknown as RunActionFn);

    const audits = db.query(`SELECT * FROM audit_log WHERE action = 'schedule_execute'`).all() as any[];
    expect(audits.length).toBeGreaterThanOrEqual(1);
    const entry = audits[0];
    expect(entry.detail).toContain('audit-step');
    expect(entry.detail).toContain('dependency_audit');
  });
});

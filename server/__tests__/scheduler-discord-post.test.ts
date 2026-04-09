/**
 * Tests for the discord_post schedule handler.
 */

import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { AgentSchedule, ScheduleAction } from '../../shared/types';
import { runMigrations } from '../db/schema';
import { execDiscordPost } from '../scheduler/handlers/discord-post';
import type { HandlerContext } from '../scheduler/handlers/types';

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
    id: 'sched-1',
    agentId: 'agent-1',
    name: 'Discord Post Test',
    description: 'Test schedule',
    cronExpression: '0 0 * * *',
    intervalMs: null,
    actions: [{ type: 'discord_post' }],
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
        VALUES (?, 'sched-1', 'agent-1', 'running', 'discord_post', '{}', 0, datetime('now'))
    `).run(id);
}

function getExecutionResult(db: Database, id: string): { status: string; result: string | null } {
  return db.query('SELECT status, result FROM schedule_executions WHERE id = ?').get(id) as any;
}

let db: Database;
let originalToken: string | undefined;
let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  db = new Database(':memory:');
  runMigrations(db);
  originalToken = process.env.DISCORD_BOT_TOKEN;
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  if (originalToken !== undefined) {
    process.env.DISCORD_BOT_TOKEN = originalToken;
  } else {
    delete process.env.DISCORD_BOT_TOKEN;
  }
  globalThis.fetch = originalFetch;
  db.close();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('execDiscordPost', () => {
  test('fails when no channelId provided', async () => {
    process.env.DISCORD_BOT_TOKEN = 'test-token';
    const ctx = createMockCtx(db);
    const schedule = createMockSchedule();
    const action: ScheduleAction = { type: 'discord_post' };
    const execId = crypto.randomUUID();
    insertExecution(db, execId);

    await execDiscordPost(ctx, execId, schedule, action);

    const result = getExecutionResult(db, execId);
    expect(result?.status).toBe('failed');
    expect(result?.result).toContain('No channelId');
  });

  test('fails when DISCORD_BOT_TOKEN not set', async () => {
    delete process.env.DISCORD_BOT_TOKEN;
    const ctx = createMockCtx(db);
    const schedule = createMockSchedule();
    const action: ScheduleAction = { type: 'discord_post', channelId: '123456' };
    const execId = crypto.randomUUID();
    insertExecution(db, execId);

    await execDiscordPost(ctx, execId, schedule, action);

    const result = getExecutionResult(db, execId);
    expect(result?.status).toBe('failed');
    expect(result?.result).toContain('DISCORD_BOT_TOKEN');
  });

  test('fails when no message or embedTitle provided', async () => {
    process.env.DISCORD_BOT_TOKEN = 'test-token';
    const ctx = createMockCtx(db);
    const schedule = createMockSchedule();
    const action: ScheduleAction = { type: 'discord_post', channelId: '123456' };
    const execId = crypto.randomUUID();
    insertExecution(db, execId);

    await execDiscordPost(ctx, execId, schedule, action);

    const result = getExecutionResult(db, execId);
    expect(result?.status).toBe('failed');
    expect(result?.result).toContain('nothing to post');
  });

  test('sends plain text message when no embedTitle', async () => {
    process.env.DISCORD_BOT_TOKEN = 'test-token';
    let capturedBody: any = null;
    globalThis.fetch = mock(async (_url: any, init: any) => {
      capturedBody = JSON.parse(init.body);
      return new Response(JSON.stringify({ id: 'msg-123' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any;

    const ctx = createMockCtx(db);
    const schedule = createMockSchedule();
    const action: ScheduleAction = { type: 'discord_post', channelId: '123456', message: 'Hello Discord!' };
    const execId = crypto.randomUUID();
    insertExecution(db, execId);

    await execDiscordPost(ctx, execId, schedule, action);

    const result = getExecutionResult(db, execId);
    expect(result?.status).toBe('completed');
    expect(result?.result).toContain('msg-123');
    expect(capturedBody.content).toBe('Hello Discord!');
    expect(capturedBody.embeds).toBeUndefined();
  });

  test('sends embed when embedTitle is provided', async () => {
    process.env.DISCORD_BOT_TOKEN = 'test-token';
    let capturedBody: any = null;
    globalThis.fetch = mock(async (_url: any, init: any) => {
      capturedBody = JSON.parse(init.body);
      return new Response(JSON.stringify({ id: 'msg-456' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any;

    const ctx = createMockCtx(db);
    const schedule = createMockSchedule();
    const action: ScheduleAction = {
      type: 'discord_post',
      channelId: '123456',
      embedTitle: 'Daily Digest',
      message: 'Summary of activity',
      embedColor: 0x2ecc71,
    };
    const execId = crypto.randomUUID();
    insertExecution(db, execId);

    await execDiscordPost(ctx, execId, schedule, action);

    const result = getExecutionResult(db, execId);
    expect(result?.status).toBe('completed');
    expect(capturedBody.embeds).toHaveLength(1);
    expect(capturedBody.embeds[0].title).toBe('Daily Digest');
    expect(capturedBody.embeds[0].description).toBe('Summary of activity');
    expect(capturedBody.embeds[0].color).toBe(0x2ecc71);
    expect(capturedBody.embeds[0].footer.text).toContain('Discord Post Test');
  });

  test('handles Discord API error', async () => {
    process.env.DISCORD_BOT_TOKEN = 'test-token';
    globalThis.fetch = mock(async () => {
      return new Response('{"message": "Unknown Channel"}', {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any;

    const ctx = createMockCtx(db);
    const schedule = createMockSchedule();
    const action: ScheduleAction = { type: 'discord_post', channelId: 'bad-channel', message: 'Test' };
    const execId = crypto.randomUUID();
    insertExecution(db, execId);

    await execDiscordPost(ctx, execId, schedule, action);

    const result = getExecutionResult(db, execId);
    expect(result?.status).toBe('failed');
    expect(result?.result).toContain('404');
  });

  test('handles fetch exception', async () => {
    process.env.DISCORD_BOT_TOKEN = 'test-token';
    globalThis.fetch = mock(async () => {
      throw new Error('Network timeout');
    }) as any;

    const ctx = createMockCtx(db);
    const schedule = createMockSchedule();
    const action: ScheduleAction = { type: 'discord_post', channelId: '123456', message: 'Test' };
    const execId = crypto.randomUUID();
    insertExecution(db, execId);

    await execDiscordPost(ctx, execId, schedule, action);

    const result = getExecutionResult(db, execId);
    expect(result?.status).toBe('failed');
    expect(result?.result).toContain('Network timeout');
  });

  test('uses default blurple color when no embedColor specified', async () => {
    process.env.DISCORD_BOT_TOKEN = 'test-token';
    let capturedBody: any = null;
    globalThis.fetch = mock(async (_url: any, init: any) => {
      capturedBody = JSON.parse(init.body);
      return new Response(JSON.stringify({ id: 'msg-789' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any;

    const ctx = createMockCtx(db);
    const schedule = createMockSchedule();
    const action: ScheduleAction = {
      type: 'discord_post',
      channelId: '123456',
      embedTitle: 'Test',
      message: 'Content',
    };
    const execId = crypto.randomUUID();
    insertExecution(db, execId);

    await execDiscordPost(ctx, execId, schedule, action);

    expect(capturedBody.embeds[0].color).toBe(0x5865f2); // Discord blurple
  });
});

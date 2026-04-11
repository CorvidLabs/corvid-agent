/**
 * Tests for the github_comment_monitor schedule handler.
 */

import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { AgentSchedule, ScheduleAction } from '../../shared/types';
import { addToGitHubAllowlist } from '../db/github-allowlist';
import { runMigrations } from '../db/schema';
import { execGitHubCommentMonitor } from '../scheduler/handlers/github-comment-monitor';
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
    name: 'GitHub Comment Monitor Test',
    description: 'Test schedule',
    cronExpression: '0 0 * * *',
    intervalMs: null,
    actions: [{ type: 'github_comment_monitor' }],
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
        VALUES (?, 'sched-1', 'agent-1', 'running', 'github_comment_monitor', '{}', 0, datetime('now'))
    `).run(id);
}

function getExecutionResult(db: Database, id: string): { status: string; result: string | null } {
  return db.query('SELECT status, result FROM schedule_executions WHERE id = ?').get(id) as any;
}

function makeComment(
  overrides: Partial<{
    id: number;
    login: string;
    body: string;
    issue_url: string;
    pull_request_url: string;
    html_url: string;
    created_at: string;
    updated_at: string;
  }> = {},
): any {
  return {
    id: overrides.id ?? 1,
    html_url: overrides.html_url ?? 'https://github.com/CorvidLabs/corvid-agent/issues/1#issuecomment-1',
    body: overrides.body ?? 'Great work!',
    created_at: overrides.created_at ?? '2026-04-09T10:00:00Z',
    updated_at: overrides.updated_at ?? '2026-04-09T10:00:00Z',
    user: { login: overrides.login ?? 'external-user' },
    issue_url: overrides.issue_url,
    pull_request_url: overrides.pull_request_url,
  };
}

let db: Database;
let originalGhToken: string | undefined;
let originalDiscordToken: string | undefined;
let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  db = new Database(':memory:');
  runMigrations(db);
  originalGhToken = process.env.GITHUB_TOKEN;
  originalDiscordToken = process.env.DISCORD_BOT_TOKEN;
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  if (originalGhToken !== undefined) {
    process.env.GITHUB_TOKEN = originalGhToken;
  } else {
    delete process.env.GITHUB_TOKEN;
  }
  if (originalDiscordToken !== undefined) {
    process.env.DISCORD_BOT_TOKEN = originalDiscordToken;
  } else {
    delete process.env.DISCORD_BOT_TOKEN;
  }
  globalThis.fetch = originalFetch;
  db.close();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('execGitHubCommentMonitor', () => {
  test('fails when GITHUB_TOKEN not set', async () => {
    delete process.env.GITHUB_TOKEN;
    const ctx = createMockCtx(db);
    const schedule = createMockSchedule();
    const action: ScheduleAction = { type: 'github_comment_monitor', repos: ['CorvidLabs/corvid-agent'] };
    const execId = crypto.randomUUID();
    insertExecution(db, execId);

    await execGitHubCommentMonitor(ctx, execId, schedule, action);

    const result = getExecutionResult(db, execId);
    expect(result?.status).toBe('failed');
    expect(result?.result).toContain('GITHUB_TOKEN not configured');
  });

  test('fails with invalid repo format', async () => {
    process.env.GITHUB_TOKEN = 'test-token';
    const ctx = createMockCtx(db);
    const schedule = createMockSchedule();
    const action: ScheduleAction = { type: 'github_comment_monitor', repos: ['bad-repo-no-slash'] };
    const execId = crypto.randomUUID();
    insertExecution(db, execId);

    await execGitHubCommentMonitor(ctx, execId, schedule, action);

    const result = getExecutionResult(db, execId);
    expect(result?.status).toBe('failed');
    expect(result?.result).toContain('Invalid repo format');
  });

  test('completes with no external comments', async () => {
    process.env.GITHUB_TOKEN = 'test-token';
    // Add a team member to the allowlist
    addToGitHubAllowlist(db, 'team-member', 'Team');

    // Mock GitHub API — only team member comments
    globalThis.fetch = mock(async () => {
      const teamComment = makeComment({
        login: 'team-member',
        issue_url: 'https://api.github.com/repos/CorvidLabs/corvid-agent/issues/1',
      });
      return new Response(JSON.stringify([teamComment]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any;

    const ctx = createMockCtx(db);
    const schedule = createMockSchedule();
    const action: ScheduleAction = { type: 'github_comment_monitor', repos: ['CorvidLabs/corvid-agent'] };
    const execId = crypto.randomUUID();
    insertExecution(db, execId);

    await execGitHubCommentMonitor(ctx, execId, schedule, action);

    const result = getExecutionResult(db, execId);
    expect(result?.status).toBe('completed');
    expect(result?.result).toContain('No external comments');
  });

  test('filters out bot accounts', async () => {
    process.env.GITHUB_TOKEN = 'test-token';

    globalThis.fetch = mock(async () => {
      const botComment = makeComment({
        login: 'dependabot[bot]',
        issue_url: 'https://api.github.com/repos/CorvidLabs/corvid-agent/issues/1',
      });
      return new Response(JSON.stringify([botComment]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any;

    const ctx = createMockCtx(db);
    const schedule = createMockSchedule();
    const action: ScheduleAction = { type: 'github_comment_monitor', repos: ['CorvidLabs/corvid-agent'] };
    const execId = crypto.randomUUID();
    insertExecution(db, execId);

    await execGitHubCommentMonitor(ctx, execId, schedule, action);

    const result = getExecutionResult(db, execId);
    expect(result?.status).toBe('completed');
    expect(result?.result).toContain('No external comments');
  });

  test('detects external comments and posts Discord digest', async () => {
    process.env.GITHUB_TOKEN = 'test-token';
    process.env.DISCORD_BOT_TOKEN = 'discord-token';
    addToGitHubAllowlist(db, 'team-member', 'Team');

    let discordCalled = false;
    let discordBody: any = null;

    globalThis.fetch = mock(async (url: any, init?: any) => {
      const urlStr = typeof url === 'string' ? url : url.toString();

      // GitHub API calls
      if (urlStr.includes('api.github.com')) {
        const externalComment = makeComment({
          id: 10,
          login: 'external-contributor',
          body: 'Found a bug in the scheduler',
          issue_url: 'https://api.github.com/repos/CorvidLabs/corvid-agent/issues/42',
          html_url: 'https://github.com/CorvidLabs/corvid-agent/issues/42#issuecomment-10',
        });
        const teamComment = makeComment({
          login: 'team-member',
          issue_url: 'https://api.github.com/repos/CorvidLabs/corvid-agent/issues/1',
        });
        return new Response(JSON.stringify([externalComment, teamComment]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Discord API call
      if (urlStr.includes('discord.com')) {
        discordCalled = true;
        discordBody = JSON.parse(init.body);
        return new Response(JSON.stringify({ id: 'msg-1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response('Not found', { status: 404 });
    }) as any;

    const ctx = createMockCtx(db);
    const schedule = createMockSchedule();
    const action: ScheduleAction = {
      type: 'github_comment_monitor',
      repos: ['CorvidLabs/corvid-agent'],
      channelId: '123456',
    };
    const execId = crypto.randomUUID();
    insertExecution(db, execId);

    await execGitHubCommentMonitor(ctx, execId, schedule, action);

    const result = getExecutionResult(db, execId);
    expect(result?.status).toBe('completed');
    expect(result?.result).toContain('2 external comment');
    expect(discordCalled).toBe(true);
    expect(discordBody.embeds).toHaveLength(1);
    expect(discordBody.embeds[0].title).toContain('External Comment');
    expect(discordBody.embeds[0].description).toContain('external-contributor');
  });

  test('skips Discord notification when no channelId', async () => {
    process.env.GITHUB_TOKEN = 'test-token';
    process.env.DISCORD_BOT_TOKEN = 'discord-token';

    let discordCalled = false;

    globalThis.fetch = mock(async (url: any) => {
      const fetchUrl = typeof url === 'string' ? url : url.toString();
      if (fetchUrl.includes('discord.com')) {
        discordCalled = true;
      }
      const externalComment = makeComment({
        login: 'outsider',
        issue_url: 'https://api.github.com/repos/CorvidLabs/corvid-agent/issues/5',
      });
      return new Response(JSON.stringify([externalComment]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any;

    const ctx = createMockCtx(db);
    const schedule = createMockSchedule();
    const action: ScheduleAction = { type: 'github_comment_monitor', repos: ['CorvidLabs/corvid-agent'] };
    const execId = crypto.randomUUID();
    insertExecution(db, execId);

    await execGitHubCommentMonitor(ctx, execId, schedule, action);

    const result = getExecutionResult(db, execId);
    expect(result?.status).toBe('completed');
    expect(discordCalled).toBe(false);
  });

  test('uses default repo when none specified', async () => {
    process.env.GITHUB_TOKEN = 'test-token';

    const capturedUrls: string[] = [];
    globalThis.fetch = mock(async (url: any) => {
      capturedUrls.push(typeof url === 'string' ? url : url.toString());
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any;

    const ctx = createMockCtx(db);
    const schedule = createMockSchedule();
    const action: ScheduleAction = { type: 'github_comment_monitor' };
    const execId = crypto.randomUUID();
    insertExecution(db, execId);

    await execGitHubCommentMonitor(ctx, execId, schedule, action);

    expect(capturedUrls.some((u) => u.includes('CorvidLabs/corvid-agent'))).toBe(true);
    const result = getExecutionResult(db, execId);
    expect(result?.status).toBe('completed');
  });

  test('handles GitHub API error', async () => {
    process.env.GITHUB_TOKEN = 'test-token';

    globalThis.fetch = mock(async () => {
      return new Response('{"message": "rate limit exceeded"}', {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any;

    const ctx = createMockCtx(db);
    const schedule = createMockSchedule();
    const action: ScheduleAction = { type: 'github_comment_monitor', repos: ['CorvidLabs/corvid-agent'] };
    const execId = crypto.randomUUID();
    insertExecution(db, execId);

    await execGitHubCommentMonitor(ctx, execId, schedule, action);

    const result = getExecutionResult(db, execId);
    expect(result?.status).toBe('failed');
    expect(result?.result).toContain('403');
  });

  test('handles fetch exception', async () => {
    process.env.GITHUB_TOKEN = 'test-token';

    globalThis.fetch = mock(async () => {
      throw new Error('Network timeout');
    }) as any;

    const ctx = createMockCtx(db);
    const schedule = createMockSchedule();
    const action: ScheduleAction = { type: 'github_comment_monitor', repos: ['CorvidLabs/corvid-agent'] };
    const execId = crypto.randomUUID();
    insertExecution(db, execId);

    await execGitHubCommentMonitor(ctx, execId, schedule, action);

    const result = getExecutionResult(db, execId);
    expect(result?.status).toBe('failed');
    expect(result?.result).toContain('Network timeout');
  });

  test('uses since from action.description for continuity', async () => {
    process.env.GITHUB_TOKEN = 'test-token';
    const customSince = '2026-04-08T12:00:00Z';

    const capturedUrls: string[] = [];
    globalThis.fetch = mock(async (url: any) => {
      capturedUrls.push(typeof url === 'string' ? url : url.toString());
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any;

    const ctx = createMockCtx(db);
    const schedule = createMockSchedule();
    const action: ScheduleAction = {
      type: 'github_comment_monitor',
      repos: ['CorvidLabs/corvid-agent'],
      description: customSince,
    };
    const execId = crypto.randomUUID();
    insertExecution(db, execId);

    await execGitHubCommentMonitor(ctx, execId, schedule, action);

    expect(capturedUrls.some((u) => u.includes(encodeURIComponent(customSince)))).toBe(true);
  });
});

/**
 * Tests for Discord /schedule command handlers.
 *
 * Covers list, create, pause, resume, delete, and templates subcommands.
 */

import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { createSchedule, getSchedule, listSchedules } from '../db/schedules';
import { runMigrations } from '../db/schema';
import { handleScheduleCommand } from '../discord/command-handlers/schedule-commands';
import type { InteractionContext } from '../discord/commands';
import type { DiscordInteractionData } from '../discord/types';

// ─── Mock Discord API calls ─────────────────────────────────────────────────

const capturedResponses: Array<{ type: number; data: { embeds?: any[]; content?: string } }> = [];
const originalFetch = globalThis.fetch;

/** Extract the response data from captured Discord API calls. */
function lastResponse(): { embeds?: any[]; content?: string } {
  const last = capturedResponses[capturedResponses.length - 1];
  return last?.data ?? {};
}

function mockFetch() {
  globalThis.fetch = mock(async (_input: any, init?: any) => {
    const body = init?.body ? JSON.parse(init.body) : {};
    capturedResponses.push(body);
    return new Response(JSON.stringify({ id: 'msg-1' }), { status: 200 });
  }) as any;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

let db: Database;

function makeCtx(): InteractionContext {
  return {
    db,
    config: {} as any,
    threadSessions: new Map(),
    mentionSessions: new Map(),
    threadCallbacks: new Map(),
    mutedUsers: new Set(),
    guildCache: null as any,
    syncGuildData: async () => {},
    processManager: {} as any,
    workTaskService: null,
    delivery: {} as any,
    threadLastActivity: new Map(),
    createStandaloneThread: async () => null,
    subscribeForResponseWithEmbed: () => {},
    sendTaskResult: async () => {},
    muteUser: () => {},
    unmuteUser: () => {},
    subscribeForInlineResponse: () => {},
    userMessageTimestamps: new Map(),
    rateLimitWindowMs: 60_000,
    rateLimitMaxMessages: 10,
  };
}

function makeInteraction(options: any[] = []): DiscordInteractionData {
  return {
    id: '400000000000000001',
    type: 2,
    token: 'test-interaction-token',
    application_id: '400000000000000002',
    channel_id: '100000000000000001',
    member: {
      user: { id: '200000000000000001', username: 'testuser' },
      roles: [],
    },
    data: {
      id: '400000000000000003',
      name: 'schedule',
      options,
    },
  } as unknown as DiscordInteractionData;
}

function seedAgent() {
  db.query(`INSERT INTO agents (id, name, wallet_address) VALUES ('agent-1', 'TestAgent', 'addr1')`).run();
}

function seedSchedule(name: string = 'Test Schedule', _status: string = 'active') {
  return createSchedule(db, {
    agentId: 'agent-1',
    name,
    cronExpression: '0 9 * * *',
    actions: [{ type: 'daily_review' }],
    approvalPolicy: 'auto',
  });
}

const ADMIN = 3;
const USER = 1;

beforeEach(() => {
  db = new Database(':memory:');
  runMigrations(db);
  capturedResponses.length = 0;
  mockFetch();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  db.close();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('/schedule list', () => {
  it('shows empty state when no schedules exist', async () => {
    await handleScheduleCommand(makeCtx(), makeInteraction([{ name: 'list', type: 1 }]), USER);

    expect(capturedResponses.length).toBe(1);
    expect(lastResponse().content).toContain('No schedules');
  });

  it('lists schedules with status and metadata', async () => {
    seedAgent();
    seedSchedule('Morning Digest');
    seedSchedule('Nightly Review');

    await handleScheduleCommand(makeCtx(), makeInteraction([{ name: 'list', type: 1 }]), USER);

    const embed = lastResponse().embeds?.[0];
    expect(embed.title).toBe('Schedules');
    expect(embed.description).toContain('Morning Digest');
    expect(embed.description).toContain('Nightly Review');
    expect(embed.footer.text).toContain('2 schedules');
  });

  it('works with no subcommand (backwards compat)', async () => {
    seedAgent();
    seedSchedule('Test');

    await handleScheduleCommand(makeCtx(), makeInteraction(), USER);

    const embed = lastResponse().embeds?.[0];
    expect(embed.title).toBe('Schedules');
    expect(embed.description).toContain('Test');
  });
});

describe('/schedule create', () => {
  it('requires admin permissions', async () => {
    await handleScheduleCommand(
      makeCtx(),
      makeInteraction([{ name: 'create', type: 1, options: [{ name: 'name', value: 'Test', type: 3 }] }]),
      USER,
    );

    expect(lastResponse().content).toContain('admin permissions');
  });

  it('creates a simple schedule', async () => {
    seedAgent();

    await handleScheduleCommand(
      makeCtx(),
      makeInteraction([
        {
          name: 'create',
          type: 1,
          options: [
            { name: 'name', value: 'Daily Digest', type: 3 },
            { name: 'cron', value: '0 9 * * *', type: 3 },
            { name: 'action_type', value: 'daily_review', type: 3 },
          ],
        },
      ]),
      ADMIN,
    );

    const embed = lastResponse().embeds?.[0];
    expect(embed.title).toBe('Schedule Created');
    expect(embed.description).toContain('Daily Digest');
    expect(embed.description).toContain('daily_review');

    const schedules = listSchedules(db);
    expect(schedules.length).toBe(1);
    expect(schedules[0].name).toBe('Daily Digest');
  });

  it('creates schedule from template', async () => {
    seedAgent();

    await handleScheduleCommand(
      makeCtx(),
      makeInteraction([
        {
          name: 'create',
          type: 1,
          options: [
            { name: 'name', value: 'PR Digest', type: 3 },
            { name: 'template', value: 'github-digest-discord', type: 3 },
            { name: 'channel', value: '12345', type: 3 },
          ],
        },
      ]),
      ADMIN,
    );

    const embed = lastResponse().embeds?.[0];
    expect(embed.title).toBe('Schedule Created');
    expect(embed.description).toContain('github-digest-discord');

    const schedules = listSchedules(db);
    expect(schedules[0].executionMode).toBe('pipeline');
  });

  it('rejects unknown template', async () => {
    seedAgent();

    await handleScheduleCommand(
      makeCtx(),
      makeInteraction([
        {
          name: 'create',
          type: 1,
          options: [
            { name: 'name', value: 'Bad', type: 3 },
            { name: 'template', value: 'nonexistent', type: 3 },
          ],
        },
      ]),
      ADMIN,
    );

    expect(lastResponse().content).toContain('Unknown template');
  });

  it('requires cron when not using template', async () => {
    seedAgent();

    await handleScheduleCommand(
      makeCtx(),
      makeInteraction([{ name: 'create', type: 1, options: [{ name: 'name', value: 'No Cron', type: 3 }] }]),
      ADMIN,
    );

    expect(lastResponse().content).toContain('cron expression');
  });

  it('requires name', async () => {
    await handleScheduleCommand(makeCtx(), makeInteraction([{ name: 'create', type: 1, options: [] }]), ADMIN);

    expect(lastResponse().content).toContain('name');
  });
});

describe('/schedule pause', () => {
  it('requires admin permissions', async () => {
    await handleScheduleCommand(
      makeCtx(),
      makeInteraction([{ name: 'pause', type: 1, options: [{ name: 'schedule', value: 'xxx', type: 3 }] }]),
      USER,
    );

    expect(lastResponse().content).toContain('admin permissions');
  });

  it('pauses an active schedule', async () => {
    seedAgent();
    const sched = seedSchedule();

    await handleScheduleCommand(
      makeCtx(),
      makeInteraction([{ name: 'pause', type: 1, options: [{ name: 'schedule', value: sched.id, type: 3 }] }]),
      ADMIN,
    );

    const embed = lastResponse().embeds?.[0];
    expect(embed.title).toBe('Schedule Paused');

    const updated = getSchedule(db, sched.id);
    expect(updated!.status).toBe('paused');
  });

  it('reports if already paused', async () => {
    seedAgent();
    const sched = seedSchedule();
    db.query(`UPDATE agent_schedules SET status = 'paused' WHERE id = ?`).run(sched.id);

    await handleScheduleCommand(
      makeCtx(),
      makeInteraction([{ name: 'pause', type: 1, options: [{ name: 'schedule', value: sched.id, type: 3 }] }]),
      ADMIN,
    );

    expect(lastResponse().content).toContain('already paused');
  });

  it('handles not-found schedule', async () => {
    await handleScheduleCommand(
      makeCtx(),
      makeInteraction([{ name: 'pause', type: 1, options: [{ name: 'schedule', value: 'bad-id', type: 3 }] }]),
      ADMIN,
    );

    expect(lastResponse().content).toContain('not found');
  });
});

describe('/schedule resume', () => {
  it('resumes a paused schedule', async () => {
    seedAgent();
    const sched = seedSchedule();
    db.query(`UPDATE agent_schedules SET status = 'paused' WHERE id = ?`).run(sched.id);

    await handleScheduleCommand(
      makeCtx(),
      makeInteraction([{ name: 'resume', type: 1, options: [{ name: 'schedule', value: sched.id, type: 3 }] }]),
      ADMIN,
    );

    const embed = lastResponse().embeds?.[0];
    expect(embed.title).toBe('Schedule Resumed');

    const updated = getSchedule(db, sched.id);
    expect(updated!.status).toBe('active');
  });

  it('reports if already active', async () => {
    seedAgent();
    const sched = seedSchedule();

    await handleScheduleCommand(
      makeCtx(),
      makeInteraction([{ name: 'resume', type: 1, options: [{ name: 'schedule', value: sched.id, type: 3 }] }]),
      ADMIN,
    );

    expect(lastResponse().content).toContain('already active');
  });
});

describe('/schedule delete', () => {
  it('deletes a schedule', async () => {
    seedAgent();
    const sched = seedSchedule();

    await handleScheduleCommand(
      makeCtx(),
      makeInteraction([{ name: 'delete', type: 1, options: [{ name: 'schedule', value: sched.id, type: 3 }] }]),
      ADMIN,
    );

    const embed = lastResponse().embeds?.[0];
    expect(embed.title).toBe('Schedule Deleted');

    const deleted = getSchedule(db, sched.id);
    expect(deleted).toBeNull();
  });

  it('requires admin permissions', async () => {
    await handleScheduleCommand(
      makeCtx(),
      makeInteraction([{ name: 'delete', type: 1, options: [{ name: 'schedule', value: 'xxx', type: 3 }] }]),
      USER,
    );

    expect(lastResponse().content).toContain('admin permissions');
  });
});

describe('/schedule templates', () => {
  it('lists available pipeline templates', async () => {
    await handleScheduleCommand(makeCtx(), makeInteraction([{ name: 'templates', type: 1 }]), USER);

    const embed = lastResponse().embeds?.[0];
    expect(embed.title).toBe('Pipeline Templates');
    expect(embed.description).toContain('github-digest-discord');
    expect(embed.description).toContain('daily-digest-discord');
    expect(embed.description).toContain('release-announcement');
  });
});

describe('/schedule prefix resolution', () => {
  it('resolves schedule by ID prefix', async () => {
    seedAgent();
    const sched = seedSchedule();
    const prefix = sched.id.slice(0, 8);

    await handleScheduleCommand(
      makeCtx(),
      makeInteraction([{ name: 'pause', type: 1, options: [{ name: 'schedule', value: prefix, type: 3 }] }]),
      ADMIN,
    );

    const embed = lastResponse().embeds?.[0];
    expect(embed.title).toBe('Schedule Paused');
  });
});

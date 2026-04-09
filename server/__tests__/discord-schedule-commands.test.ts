/**
 * Tests for Discord /schedule command handlers.
 *
 * Covers list, create, pause, resume, delete, and templates subcommands.
 */

import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createSchedule, getSchedule, listSchedules } from '../db/schedules';
import { runMigrations } from '../db/schema';
import { handleScheduleCommand } from '../discord/command-handlers/schedule-commands';
import type { InteractionContext } from '../discord/commands';
import { makeMockChatInteraction } from './helpers/mock-discord-interaction';

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
});

afterEach(() => {
  db.close();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('/schedule list', () => {
  it('shows empty state when no schedules exist', async () => {
    const interaction = makeMockChatInteraction('schedule', { subcommand: 'list' });
    await handleScheduleCommand(makeCtx(), interaction as any, USER);

    expect(interaction._responses.length).toBe(1);
    expect(interaction.getContent()).toContain('No schedules');
  });

  it('lists schedules with status and metadata', async () => {
    seedAgent();
    seedSchedule('Morning Digest');
    seedSchedule('Nightly Review');

    const interaction = makeMockChatInteraction('schedule', { subcommand: 'list' });
    await handleScheduleCommand(makeCtx(), interaction as any, USER);

    const embed = interaction.getEmbed();
    expect(embed!.title).toBe('Schedules');
    expect(embed!.description).toContain('Morning Digest');
    expect(embed!.description).toContain('Nightly Review');
    expect((embed!.footer as any).text).toContain('2 schedules');
  });

  it('works with no subcommand (backwards compat)', async () => {
    seedAgent();
    seedSchedule('Test');

    const interaction = makeMockChatInteraction('schedule', {});
    await handleScheduleCommand(makeCtx(), interaction as any, USER);

    const embed = interaction.getEmbed();
    expect(embed!.title).toBe('Schedules');
    expect(embed!.description).toContain('Test');
  });
});

describe('/schedule create', () => {
  it('requires admin permissions', async () => {
    const interaction = makeMockChatInteraction('schedule', {
      subcommand: 'create',
      strings: { name: 'Test' },
    });
    await handleScheduleCommand(makeCtx(), interaction as any, USER);

    expect(interaction.getContent()).toContain('admin permissions');
  });

  it('creates a simple schedule', async () => {
    seedAgent();

    const interaction = makeMockChatInteraction('schedule', {
      subcommand: 'create',
      strings: { name: 'Daily Digest', cron: '0 9 * * *', action_type: 'daily_review' },
    });
    await handleScheduleCommand(makeCtx(), interaction as any, ADMIN);

    const embed = interaction.getEmbed();
    expect(embed!.title).toBe('Schedule Created');
    expect(embed!.description).toContain('Daily Digest');
    expect(embed!.description).toContain('daily_review');

    const schedules = listSchedules(db);
    expect(schedules.length).toBe(1);
    expect(schedules[0].name).toBe('Daily Digest');
  });

  it('creates schedule from template', async () => {
    seedAgent();

    const interaction = makeMockChatInteraction('schedule', {
      subcommand: 'create',
      strings: { name: 'PR Digest', template: 'github-digest-discord', channel: '12345' },
    });
    await handleScheduleCommand(makeCtx(), interaction as any, ADMIN);

    const embed = interaction.getEmbed();
    expect(embed!.title).toBe('Schedule Created');
    expect(embed!.description).toContain('github-digest-discord');

    const schedules = listSchedules(db);
    expect(schedules[0].executionMode).toBe('pipeline');
  });

  it('rejects unknown template', async () => {
    seedAgent();

    const interaction = makeMockChatInteraction('schedule', {
      subcommand: 'create',
      strings: { name: 'Bad', template: 'nonexistent' },
    });
    await handleScheduleCommand(makeCtx(), interaction as any, ADMIN);

    expect(interaction.getContent()).toContain('Unknown template');
  });

  it('requires cron when not using template', async () => {
    seedAgent();

    const interaction = makeMockChatInteraction('schedule', {
      subcommand: 'create',
      strings: { name: 'No Cron' },
    });
    await handleScheduleCommand(makeCtx(), interaction as any, ADMIN);

    expect(interaction.getContent()).toContain('cron expression');
  });

  it('requires name', async () => {
    const interaction = makeMockChatInteraction('schedule', { subcommand: 'create' });
    await handleScheduleCommand(makeCtx(), interaction as any, ADMIN);

    expect(interaction.getContent()).toContain('name');
  });
});

describe('/schedule pause', () => {
  it('requires admin permissions', async () => {
    const interaction = makeMockChatInteraction('schedule', {
      subcommand: 'pause',
      strings: { schedule: 'xxx' },
    });
    await handleScheduleCommand(makeCtx(), interaction as any, USER);

    expect(interaction.getContent()).toContain('admin permissions');
  });

  it('pauses an active schedule', async () => {
    seedAgent();
    const sched = seedSchedule();

    const interaction = makeMockChatInteraction('schedule', {
      subcommand: 'pause',
      strings: { schedule: sched.id },
    });
    await handleScheduleCommand(makeCtx(), interaction as any, ADMIN);

    const embed = interaction.getEmbed();
    expect(embed!.title).toBe('Schedule Paused');

    const updated = getSchedule(db, sched.id);
    expect(updated!.status).toBe('paused');
  });

  it('reports if already paused', async () => {
    seedAgent();
    const sched = seedSchedule();
    db.query(`UPDATE agent_schedules SET status = 'paused' WHERE id = ?`).run(sched.id);

    const interaction = makeMockChatInteraction('schedule', {
      subcommand: 'pause',
      strings: { schedule: sched.id },
    });
    await handleScheduleCommand(makeCtx(), interaction as any, ADMIN);

    expect(interaction.getContent()).toContain('already paused');
  });

  it('handles not-found schedule', async () => {
    const interaction = makeMockChatInteraction('schedule', {
      subcommand: 'pause',
      strings: { schedule: 'bad-id' },
    });
    await handleScheduleCommand(makeCtx(), interaction as any, ADMIN);

    expect(interaction.getContent()).toContain('not found');
  });
});

describe('/schedule resume', () => {
  it('resumes a paused schedule', async () => {
    seedAgent();
    const sched = seedSchedule();
    db.query(`UPDATE agent_schedules SET status = 'paused' WHERE id = ?`).run(sched.id);

    const interaction = makeMockChatInteraction('schedule', {
      subcommand: 'resume',
      strings: { schedule: sched.id },
    });
    await handleScheduleCommand(makeCtx(), interaction as any, ADMIN);

    const embed = interaction.getEmbed();
    expect(embed!.title).toBe('Schedule Resumed');

    const updated = getSchedule(db, sched.id);
    expect(updated!.status).toBe('active');
  });

  it('reports if already active', async () => {
    seedAgent();
    const sched = seedSchedule();

    const interaction = makeMockChatInteraction('schedule', {
      subcommand: 'resume',
      strings: { schedule: sched.id },
    });
    await handleScheduleCommand(makeCtx(), interaction as any, ADMIN);

    expect(interaction.getContent()).toContain('already active');
  });
});

describe('/schedule delete', () => {
  it('deletes a schedule', async () => {
    seedAgent();
    const sched = seedSchedule();

    const interaction = makeMockChatInteraction('schedule', {
      subcommand: 'delete',
      strings: { schedule: sched.id },
    });
    await handleScheduleCommand(makeCtx(), interaction as any, ADMIN);

    const embed = interaction.getEmbed();
    expect(embed!.title).toBe('Schedule Deleted');

    const deleted = getSchedule(db, sched.id);
    expect(deleted).toBeNull();
  });

  it('requires admin permissions', async () => {
    const interaction = makeMockChatInteraction('schedule', {
      subcommand: 'delete',
      strings: { schedule: 'xxx' },
    });
    await handleScheduleCommand(makeCtx(), interaction as any, USER);

    expect(interaction.getContent()).toContain('admin permissions');
  });
});

describe('/schedule templates', () => {
  it('lists available pipeline templates', async () => {
    const interaction = makeMockChatInteraction('schedule', { subcommand: 'templates' });
    await handleScheduleCommand(makeCtx(), interaction as any, USER);

    const embed = interaction.getEmbed();
    expect(embed!.title).toBe('Pipeline Templates');
    expect(embed!.description).toContain('github-digest-discord');
    expect(embed!.description).toContain('daily-digest-discord');
    expect(embed!.description).toContain('release-announcement');
  });
});

describe('/schedule prefix resolution', () => {
  it('resolves schedule by ID prefix', async () => {
    seedAgent();
    const sched = seedSchedule();
    const prefix = sched.id.slice(0, 8);

    const interaction = makeMockChatInteraction('schedule', {
      subcommand: 'pause',
      strings: { schedule: prefix },
    });
    await handleScheduleCommand(makeCtx(), interaction as any, ADMIN);

    const embed = interaction.getEmbed();
    expect(embed!.title).toBe('Schedule Paused');
  });
});

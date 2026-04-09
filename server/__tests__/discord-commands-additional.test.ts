import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

// Mock worktree creation — git is not available in CI / test environments.
mock.module('../lib/worktree', () => ({
  createWorktree: async () => ({ success: true, worktreeDir: '/tmp/mock-worktree' }),
  resolveAndCreateWorktree: async () => ({ success: true, workDir: '/tmp/mock-worktree' }),
  generateChatBranchName: (agent: string, id: string) => `chat/${agent}/${id.slice(0, 8)}`,
  getWorktreeBaseDir: (dir: string) => `${dir}/.worktrees`,
  removeWorktree: async () => ({ success: true }),
}));

import { Database } from 'bun:sqlite';
import { createAgent } from '../db/agents';
import { createProject } from '../db/projects';
import { runMigrations } from '../db/schema';
import { handleInteraction, type InteractionContext } from '../discord/commands';
import type { DiscordBridgeConfig } from '../discord/types';
import { makeMockChatInteraction } from './helpers/mock-discord-interaction';
import { mockDiscordRest } from './helpers/mock-discord-rest';

let db: Database;
let cleanup: () => void;
const originalAppId = process.env.DISCORD_APP_ID;

function createTestConfig(): DiscordBridgeConfig {
  return {
    botToken: 'test-token',
    channelId: '100000000000000001',
    allowedUserIds: ['200000000000000001'],
    publicMode: true,
    defaultPermissionLevel: 2,
    mode: 'chat',
  };
}

function createTestContext(config?: Partial<DiscordBridgeConfig>): InteractionContext {
  return {
    db,
    config: { ...createTestConfig(), ...config },
    processManager: {
      startProcess: mock(() => {}),
      stopProcess: mock(() => {}),
      subscribe: mock(() => {}),
      unsubscribe: mock(() => {}),
    } as unknown as InteractionContext['processManager'],
    workTaskService: null,
    delivery: { track: mock(() => {}) } as unknown as InteractionContext['delivery'],
    mutedUsers: new Set<string>(),
    threadSessions: new Map(),
    threadCallbacks: new Map(),
    threadLastActivity: new Map(),
    createStandaloneThread: mock(async () => '300000000000000001'),
    subscribeForResponseWithEmbed: mock(() => {}),
    sendTaskResult: mock(async () => {}),
    muteUser: mock(() => {}),
    unmuteUser: mock(() => {}),
    mentionSessions: new Map(),
    subscribeForInlineResponse: mock(() => {}),
    guildCache: { info: null, roles: [], channels: [] },
    syncGuildData: mock(() => {}),
    userMessageTimestamps: new Map(),
    rateLimitWindowMs: 60_000,
    rateLimitMaxMessages: 10,
  };
}

beforeEach(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
  process.env.DISCORD_APP_ID = 'test-app-id';

  ({ cleanup } = mockDiscordRest());
});

afterEach(() => {
  db.close();
  cleanup();
  if (originalAppId !== undefined) process.env.DISCORD_APP_ID = originalAppId;
  else delete process.env.DISCORD_APP_ID;
});

describe('Discord /tasks command', () => {
  test('shows empty state when no tasks', async () => {
    const ctx = createTestContext();
    const interaction = makeMockChatInteraction('tasks');
    await handleInteraction(ctx, interaction as any);

    expect(interaction.getContent()).toContain('No active or pending work tasks');
  });

  test('shows active tasks as embed', async () => {
    const ctx = createTestContext();
    const project = createProject(db, { name: 'test-project', workingDir: '/tmp/test' });
    const agent = createAgent(db, { name: 'TestAgent', systemPrompt: 'test', model: 'test-model' });

    db.query(`
            INSERT INTO work_tasks (id, agent_id, project_id, description, status, source, requester_info, created_at)
            VALUES (?, ?, ?, ?, 'running', 'web', '{}', datetime('now'))
        `).run('task-1', agent.id, project.id, 'Fix the bug in authentication');

    const interaction = makeMockChatInteraction('tasks');
    await handleInteraction(ctx, interaction as any);

    const embeds = interaction.getEmbeds() as Array<{ title: string; fields: Array<{ name: string; value: string }> }>;
    expect(embeds).toBeDefined();
    expect(embeds[0].title).toBe('Work Tasks');
    const activeField = embeds[0].fields.find((f: { name: string }) => f.name === 'Active');
    expect(activeField).toBeDefined();
  });
});

describe('Discord /schedule command', () => {
  test('shows empty state when no schedules', async () => {
    const ctx = createTestContext();
    const interaction = makeMockChatInteraction('schedule');
    await handleInteraction(ctx, interaction as any);

    expect(interaction.getContent()).toContain('No schedules');
  });

  test('shows active schedules', async () => {
    const ctx = createTestContext();
    const agent = createAgent(db, { name: 'TestAgent', systemPrompt: 'test', model: 'test-model' });

    db.query(`
            INSERT INTO agent_schedules (id, agent_id, name, description, cron_expression, actions, approval_policy, status, execution_count, next_run_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'auto', 'active', 3, ?, datetime('now'), datetime('now'))
        `).run(
      'sched-1',
      agent.id,
      'Nightly Review',
      'Reviews code nightly',
      '0 2 * * *',
      '[]',
      new Date(Date.now() + 3600000).toISOString(),
    );

    const interaction = makeMockChatInteraction('schedule');
    await handleInteraction(ctx, interaction as any);

    const embeds = interaction.getEmbeds() as Array<{ title: string; description: string }>;
    expect(embeds).toBeDefined();
    expect(embeds[0].title).toBe('Schedules');
    expect(embeds[0].description).toContain('Nightly Review');
  });
});

describe('Discord /config command', () => {
  test('shows config for admin users', async () => {
    const ctx = createTestContext({ defaultPermissionLevel: 3 });
    const interaction = makeMockChatInteraction('config');
    await handleInteraction(ctx, interaction as any);

    const embeds = interaction.getEmbeds() as Array<{ title: string; fields: Array<{ name: string; value: string }> }>;
    expect(embeds).toBeDefined();
    expect(embeds[0].title).toBe('Bot Configuration');

    const modeField = embeds[0].fields.find((f: { name: string }) => f.name === 'Mode');
    expect(modeField?.value).toBe('chat');
  });

  test('denies non-admin users', async () => {
    const ctx = createTestContext({ defaultPermissionLevel: 2 });
    const interaction = makeMockChatInteraction('config');
    await handleInteraction(ctx, interaction as any);

    expect(interaction.getContent()).toContain('do not have permission');
  });
});

describe('Discord /session model suffix stripping', () => {
  test('finds agent when name includes model suffix like "(claude-opus-4-6)"', async () => {
    const ctx = createTestContext();
    createAgent(db, { name: 'TestAgent', systemPrompt: 'test', model: 'claude-opus-4-6' });
    createProject(db, { name: 'test-project', workingDir: '/tmp/test' });

    const interaction = makeMockChatInteraction('session', {
      strings: { agent: 'TestAgent (claude-opus-4-6)', topic: 'Test topic' },
    });
    await handleInteraction(ctx, interaction as any);

    const content = interaction.getContent();
    // Should succeed and mention the agent, not show "Agent not found"
    expect(content).toContain('TestAgent');
    expect(content).not.toContain('Agent not found');
  });

  test('finds agent when name includes arbitrary model suffix', async () => {
    const ctx = createTestContext();
    createAgent(db, { name: 'MyAssistant', systemPrompt: 'test', model: 'some-model' });
    createProject(db, { name: 'test-project', workingDir: '/tmp/test' });

    const interaction = makeMockChatInteraction('session', {
      strings: { agent: 'MyAssistant (some-model)', topic: 'Debug issue' },
    });
    await handleInteraction(ctx, interaction as any);

    const content = interaction.getContent();
    expect(content).toContain('MyAssistant');
    expect(content).not.toContain('Agent not found');
  });

  test('still rejects truly unknown agent names with suffix', async () => {
    const ctx = createTestContext();
    createAgent(db, { name: 'RealAgent', systemPrompt: 'test', model: 'test-model' });

    const interaction = makeMockChatInteraction('session', {
      strings: { agent: 'FakeAgent (claude-opus-4-6)', topic: 'Test topic' },
    });
    await handleInteraction(ctx, interaction as any);

    const content = interaction.getContent();
    expect(content).toContain('Agent not found');
    expect(content).toContain('FakeAgent');
  });
});

describe('Discord /work model suffix stripping', () => {
  test('finds agent when name includes model suffix', async () => {
    const ctx = createTestContext();
    const agent = createAgent(db, { name: 'WorkerBot', systemPrompt: 'test', model: 'claude-opus-4-6' });
    createProject(db, { name: 'test-project', workingDir: '/tmp/test' });

    // Provide a workTaskService mock so the /work command proceeds
    ctx.workTaskService = {
      create: mock(async (params: Record<string, unknown>) => ({
        id: 'task-123',
        agentId: agent.id,
        description: params.description,
        status: 'running',
        branchName: null,
      })),
    } as unknown as InteractionContext['workTaskService'];

    const interaction = makeMockChatInteraction('work', {
      strings: { description: 'Fix the tests', agent: 'WorkerBot (claude-opus-4-6)' },
    });
    await handleInteraction(ctx, interaction as any);

    const content = interaction.getContent();
    // Should succeed — mentions the agent name, not "Agent not found"
    expect(content).toContain('WorkerBot');
    expect(content).not.toContain('Agent not found');
  });

  test('still rejects unknown agent names with suffix in /work', async () => {
    const ctx = createTestContext();
    createAgent(db, { name: 'RealWorker', systemPrompt: 'test', model: 'test-model' });

    ctx.workTaskService = {
      create: mock(async () => ({})),
    } as unknown as InteractionContext['workTaskService'];

    const interaction = makeMockChatInteraction('work', {
      strings: { description: 'Do something', agent: 'GhostAgent (claude-opus-4-6)' },
    });
    await handleInteraction(ctx, interaction as any);

    const content = interaction.getContent();
    expect(content).toContain('Agent not found');
    expect(content).toContain('GhostAgent');
  });
});

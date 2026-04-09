/**
 * Tests for discord session and work commands.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { _setRestClientForTesting } from '../discord/rest-client';

// Mock worktree creation — git is not available in test environments.
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
import { handleSessionCommand, handleWorkCommand } from '../discord/command-handlers/session-commands';
import type { InteractionContext } from '../discord/commands';
import type { DiscordBridgeConfig } from '../discord/types';
import { PermissionLevel } from '../discord/types';
import { makeMockChatInteraction } from './helpers/mock-discord-interaction';

let db: Database;
const originalFetch = globalThis.fetch;
const originalAppId = process.env.DISCORD_APP_ID;

function createTestConfig(overrides: Partial<DiscordBridgeConfig> = {}): DiscordBridgeConfig {
  return {
    botToken: 'test-token',
    channelId: '100000000000000001',
    allowedUserIds: ['200000000000000001'],
    publicMode: true,
    defaultPermissionLevel: 2,
    mode: 'chat',
    ...overrides,
  };
}

function createTestContext(config?: Partial<DiscordBridgeConfig>): InteractionContext {
  return {
    db,
    config: createTestConfig(config),
    processManager: {
      startProcess: mock(() => {}),
      stopProcess: mock(() => {}),
      subscribe: mock(() => {}),
      unsubscribe: mock(() => {}),
      isRunning: mock(() => true),
    } as unknown as InteractionContext['processManager'],
    workTaskService: null,
    delivery: {
      track: mock(() => {}),
      sendWithReceipt: mock(async (_channel: string, fn: () => Promise<unknown>) => ({ result: await fn() })),
    } as unknown as InteractionContext['delivery'],
    mutedUsers: new Set<string>(),
    threadSessions: new Map(),
    threadCallbacks: new Map(),
    threadLastActivity: new Map(),
    createStandaloneThread: mock(async () => '300000000000000001'),
    subscribeForResponseWithEmbed: mock(() => {}),
    sendTaskResult: mock(async () => {}),
    muteUser: mock((_userId: string) => {}),
    unmuteUser: mock((_userId: string) => {}),
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

  globalThis.fetch = mock(async (_url: string | URL | Request) => {
    return new Response(JSON.stringify({ id: '500000000000000001' }), { status: 200 });
  }) as unknown as typeof fetch;

  _setRestClientForTesting({
    respondToInteraction: async () => ({}) as never,
    deferInteraction: async () => {},
    editDeferredResponse: async () => ({}) as never,
    sendMessage: async (_channelId: string, _data: unknown) => {
      return { id: 'mock-msg-1' } as never;
    },
    editMessage: async (_channelId: string, _messageId: string, _data: unknown) => {
      return { id: 'mock-msg-1' } as never;
    },
    deleteMessage: async () => {},
    addReaction: async () => {},
    sendTypingIndicator: async () => {},
  } as unknown as import('../discord/rest-client').DiscordRestClient);
});

afterEach(() => {
  db.close();
  globalThis.fetch = originalFetch;
  _setRestClientForTesting(null);
  if (originalAppId !== undefined) process.env.DISCORD_APP_ID = originalAppId;
  else delete process.env.DISCORD_APP_ID;
});

// ── Session Commands ────────────────────────────────────────────────

describe('handleSessionCommand', () => {
  test('requires both agent and topic', async () => {
    const ctx = createTestContext();
    const interaction = makeMockChatInteraction('session', { strings: { agent: 'TestAgent' } });

    await handleSessionCommand(ctx, interaction as any, PermissionLevel.STANDARD, '200000000000000001');

    expect(interaction.getContent()).toContain('both an agent and a topic');
  });

  test('handles no agents configured', async () => {
    const ctx = createTestContext();
    const interaction = makeMockChatInteraction('session', {
      strings: { agent: 'TestAgent', topic: 'Hello' },
    });

    await handleSessionCommand(ctx, interaction as any, PermissionLevel.STANDARD, '200000000000000001');

    expect(interaction.getContent()).toContain('No agents configured');
  });

  test('handles agent not found', async () => {
    const ctx = createTestContext();
    createAgent(db, { name: 'RealAgent', model: 'test-model' });

    const interaction = makeMockChatInteraction('session', {
      strings: { agent: 'FakeAgent', topic: 'Hello' },
    });

    await handleSessionCommand(ctx, interaction as any, PermissionLevel.STANDARD, '200000000000000001');

    expect(interaction.getContent()).toContain('Agent not found');
  });

  test('handles project not found', async () => {
    const ctx = createTestContext();
    createAgent(db, { name: 'TestAgent', model: 'test-model' });
    createProject(db, { name: 'real-project', workingDir: '/tmp/test' });

    const interaction = makeMockChatInteraction('session', {
      strings: { agent: 'TestAgent', topic: 'Hello', project: 'fake-project' },
    });

    await handleSessionCommand(ctx, interaction as any, PermissionLevel.STANDARD, '200000000000000001');

    expect(interaction.getContent()).toContain('Project not found');
  });

  test('handles no projects configured', async () => {
    const ctx = createTestContext();
    createAgent(db, { name: 'TestAgent', model: 'test-model' });

    const interaction = makeMockChatInteraction('session', {
      strings: { agent: 'TestAgent', topic: 'Hello' },
    });

    await handleSessionCommand(ctx, interaction as any, PermissionLevel.STANDARD, '200000000000000001');

    expect(interaction.getContent()).toContain('No projects configured');
  });

  test('handles thread creation failure', async () => {
    const ctx = createTestContext();
    ctx.createStandaloneThread = mock(async () => null);
    createAgent(db, { name: 'TestAgent', model: 'test-model' });
    createProject(db, { name: 'test-project', workingDir: '/tmp/test' });

    const interaction = makeMockChatInteraction('session', {
      strings: { agent: 'TestAgent', topic: 'Hello' },
    });

    await handleSessionCommand(ctx, interaction as any, PermissionLevel.STANDARD, '200000000000000001');

    const content = interaction.getContent() || (interaction._responses[0]?.content as string) || '';
    expect(content).toContain('Failed to create');
  });

  test('creates session successfully', async () => {
    const ctx = createTestContext();
    createAgent(db, { name: 'TestAgent', model: 'test-model' });
    createProject(db, { name: 'test-project', workingDir: '' });

    const interaction = makeMockChatInteraction('session', {
      strings: { agent: 'TestAgent', topic: 'Hello world' },
    });

    await handleSessionCommand(ctx, interaction as any, PermissionLevel.STANDARD, '200000000000000001');

    const content = interaction.getContent() || (interaction._responses[0]?.content as string) || '';
    expect(content).toContain('Session started');
    expect(content).toContain('TestAgent');
    expect(ctx.processManager.startProcess).toHaveBeenCalled();
    expect(ctx.subscribeForResponseWithEmbed).toHaveBeenCalled();
    expect(ctx.threadSessions.has('300000000000000001')).toBe(true);
  });

  test('strips model suffix from agent name', async () => {
    const ctx = createTestContext();
    createAgent(db, { name: 'TestAgent', model: 'claude-opus-4-6' });
    createProject(db, { name: 'test-project', workingDir: '' });

    const interaction = makeMockChatInteraction('session', {
      strings: { agent: 'TestAgent (claude-opus-4-6)', topic: 'Hello' },
    });

    await handleSessionCommand(ctx, interaction as any, PermissionLevel.STANDARD, '200000000000000001');

    const content = interaction.getContent() || (interaction._responses[0]?.content as string) || '';
    expect(content).toContain('TestAgent');
    expect(content).not.toContain('Agent not found');
  });
});

describe('handleWorkCommand', () => {
  test('handles no work task service', async () => {
    const ctx = createTestContext();
    ctx.workTaskService = null;
    const interaction = makeMockChatInteraction('work', { strings: { description: 'Fix bug' } });

    await handleWorkCommand(ctx, interaction as any, PermissionLevel.STANDARD, '200000000000000001');

    expect(interaction.getContent()).toContain('not available');
  });

  test('requires description', async () => {
    const ctx = createTestContext();
    ctx.workTaskService = { create: mock(async () => ({})) } as unknown as InteractionContext['workTaskService'];
    const interaction = makeMockChatInteraction('work');

    await handleWorkCommand(ctx, interaction as any, PermissionLevel.STANDARD, '200000000000000001');

    expect(interaction.getContent()).toContain('task description');
  });

  test('handles agent not found', async () => {
    const ctx = createTestContext();
    ctx.workTaskService = { create: mock(async () => ({})) } as unknown as InteractionContext['workTaskService'];
    createAgent(db, { name: 'RealAgent', model: 'test-model' });

    const interaction = makeMockChatInteraction('work', {
      strings: { description: 'Fix bug', agent: 'FakeAgent' },
    });

    await handleWorkCommand(ctx, interaction as any, PermissionLevel.STANDARD, '200000000000000001');

    expect(interaction.getContent()).toContain('Agent not found');
  });

  test('handles no agents configured', async () => {
    const ctx = createTestContext();
    ctx.workTaskService = { create: mock(async () => ({})) } as unknown as InteractionContext['workTaskService'];

    const interaction = makeMockChatInteraction('work', { strings: { description: 'Fix bug' } });

    await handleWorkCommand(ctx, interaction as any, PermissionLevel.STANDARD, '200000000000000001');

    expect(interaction.getContent()).toContain('No agents configured');
  });

  test('handles project not found', async () => {
    const ctx = createTestContext();
    createAgent(db, { name: 'TestAgent', model: 'test-model' });
    createProject(db, { name: 'real-project', workingDir: '/tmp/test' });
    ctx.workTaskService = { create: mock(async () => ({})) } as unknown as InteractionContext['workTaskService'];

    const interaction = makeMockChatInteraction('work', {
      strings: { description: 'Fix bug', project: 'fake-project' },
    });

    await handleWorkCommand(ctx, interaction as any, PermissionLevel.STANDARD, '200000000000000001');

    expect(interaction.getContent()).toContain('Project not found');
  });

  test('creates work task successfully', async () => {
    const ctx = createTestContext();
    const agent = createAgent(db, { name: 'WorkerBot', model: 'test-model' });
    createProject(db, { name: 'test-project', workingDir: '/tmp/test' });

    ctx.workTaskService = {
      create: mock(async () => ({
        id: 'task-123',
        agentId: agent.id,
        description: 'Fix the tests',
        status: 'running',
        branchName: 'fix/tests',
      })),
      onComplete: mock(() => {}),
    } as unknown as InteractionContext['workTaskService'];

    const interaction = makeMockChatInteraction('work', { strings: { description: 'Fix the tests' } });

    await handleWorkCommand(ctx, interaction as any, PermissionLevel.STANDARD, '200000000000000001');

    expect(ctx.workTaskService!.create).toHaveBeenCalled();
  });

  test('handles work task creation error', async () => {
    const ctx = createTestContext();
    createAgent(db, { name: 'WorkerBot', model: 'test-model' });

    ctx.workTaskService = {
      create: mock(async () => {
        throw new Error('Queue full');
      }),
      onComplete: mock(() => {}),
    } as unknown as InteractionContext['workTaskService'];

    const interaction = makeMockChatInteraction('work', { strings: { description: 'Fix the tests' } });

    await handleWorkCommand(ctx, interaction as any, PermissionLevel.STANDARD, '200000000000000001');

    // Should not throw — error is handled gracefully
  });

  test('strips model suffix from agent name in /work', async () => {
    const ctx = createTestContext();
    const agent = createAgent(db, { name: 'WorkerBot', model: 'claude-opus-4-6' });
    createProject(db, { name: 'test-project', workingDir: '/tmp/test' });

    ctx.workTaskService = {
      create: mock(async () => ({
        id: 'task-123',
        agentId: agent.id,
        description: 'Fix',
        status: 'running',
        branchName: null,
      })),
      onComplete: mock(() => {}),
    } as unknown as InteractionContext['workTaskService'];

    const interaction = makeMockChatInteraction('work', {
      strings: { description: 'Fix', agent: 'WorkerBot (claude-opus-4-6)' },
    });

    await handleWorkCommand(ctx, interaction as any, PermissionLevel.STANDARD, '200000000000000001');

    expect(ctx.workTaskService!.create).toHaveBeenCalled();
  });

  test('defaults to configured default agent when no agent specified', async () => {
    const ctx = createTestContext();
    const agent = createAgent(db, { name: 'DefaultAgent', model: 'test-model' });
    ctx.config.defaultAgentId = agent.id;

    ctx.workTaskService = {
      create: mock(async () => ({
        id: 'task-123',
        agentId: agent.id,
        description: 'Fix',
        status: 'running',
        branchName: null,
      })),
      onComplete: mock(() => {}),
    } as unknown as InteractionContext['workTaskService'];

    const interaction = makeMockChatInteraction('work', { strings: { description: 'Fix something' } });

    await handleWorkCommand(ctx, interaction as any, PermissionLevel.STANDARD, '200000000000000001');

    expect(ctx.workTaskService!.create).toHaveBeenCalled();
  });
});

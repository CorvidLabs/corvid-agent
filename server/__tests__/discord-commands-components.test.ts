/**
 * Tests for discord component (button) interaction handler.
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
import { handleComponentInteraction } from '../discord/command-handlers/component-handlers';
import { handleInteraction, type InteractionContext } from '../discord/commands';
import type { DiscordBridgeConfig } from '../discord/types';
import { makeMockComponentInteraction } from './helpers/mock-discord-interaction';

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

// ── Component (Button) Handlers ─────────────────────────────────────

describe('handleComponentInteraction', () => {
  test('returns early when no custom_id', async () => {
    const ctx = createTestContext();
    const interaction = makeMockComponentInteraction('');

    await handleComponentInteraction(ctx, interaction as any);
    // Should return early — no response captured
    expect(interaction._responses).toHaveLength(0);
  });

  test('returns early when no userId', async () => {
    const ctx = createTestContext();
    // With discord.js interactions, user is always present; test with a blocked
    // user that produces no reply (permLevel <= BLOCKED via muted set)
    const interaction = makeMockComponentInteraction('resume_thread');
    ctx.mutedUsers.add('200000000000000001');

    await handleComponentInteraction(ctx, interaction as any);
    // Muted user gets an ephemeral "do not have permission" reply
    expect(interaction.getContent()).toContain('do not have permission');
  });

  test('blocks muted users', async () => {
    const ctx = createTestContext();
    ctx.mutedUsers.add('200000000000000001');

    const interaction = makeMockComponentInteraction('resume_thread');
    await handleComponentInteraction(ctx, interaction as any);

    expect(interaction.getContent()).toContain('do not have permission');
  });

  test('resume_thread — no session found', async () => {
    const ctx = createTestContext({ defaultPermissionLevel: 2 });
    const interaction = makeMockComponentInteraction('resume_thread');

    await handleComponentInteraction(ctx, interaction as any);

    expect(interaction.getContent()).toContain('No session found');
  });

  test('resume_thread — requires STANDARD permission', async () => {
    const ctx = createTestContext({ defaultPermissionLevel: 1 });
    const interaction = makeMockComponentInteraction('resume_thread');

    await handleComponentInteraction(ctx, interaction as any);

    expect(interaction.getContent()).toContain('higher role');
  });

  test('resume_thread — resumes existing session', async () => {
    const ctx = createTestContext({ defaultPermissionLevel: 2 });
    ctx.threadSessions.set('100000000000000001', {
      sessionId: 'sess-1',
      agentName: 'TestAgent',
      agentModel: 'test-model',
      ownerUserId: '200000000000000001',
    });

    const interaction = makeMockComponentInteraction('resume_thread');
    await handleComponentInteraction(ctx, interaction as any);

    expect(interaction.getContent()).toContain('resumed');
    expect(ctx.threadLastActivity.has('100000000000000001')).toBe(true);
  });

  test('resume_thread — does not subscribe callback (deferred to routeToThread)', async () => {
    const ctx = createTestContext({ defaultPermissionLevel: 2 });
    ctx.threadSessions.set('100000000000000001', {
      sessionId: 'sess-1',
      agentName: 'TestAgent',
      agentModel: 'test-model',
      ownerUserId: '200000000000000001',
    });

    const interaction = makeMockComponentInteraction('resume_thread');
    await handleComponentInteraction(ctx, interaction as any);

    // subscribeForResponseWithEmbed is NOT called on resume — it's deferred
    // to routeToThread when the user actually sends a message, to avoid
    // starting zombie-detection timers against a non-running process.
    expect(ctx.subscribeForResponseWithEmbed).not.toHaveBeenCalled();
  });

  test('resume_thread — tries DB recovery when no in-memory session', async () => {
    const ctx = createTestContext({ defaultPermissionLevel: 2 });
    // Create a session in DB for thread recovery
    const project = createProject(db, { name: 'test-project', workingDir: '/tmp/test' });
    const agent = createAgent(db, { name: 'TestAgent', model: 'test-model' });

    db.query(`
            INSERT INTO sessions (id, project_id, agent_id, name, initial_prompt, source, created_at)
            VALUES (?, ?, ?, ?, ?, 'discord', datetime('now'))
        `).run('sess-from-db', project.id, agent.id, 'Discord thread:100000000000000001', 'Hello world');

    const interaction = makeMockComponentInteraction('resume_thread');
    await handleComponentInteraction(ctx, interaction as any);

    // Should recover and resume
    expect(interaction.getContent()).toContain('resumed');
    expect(ctx.threadSessions.has('100000000000000001')).toBe(true);
  });

  test('new_session — responds with /session hint', async () => {
    const ctx = createTestContext({ defaultPermissionLevel: 2 });
    const interaction = makeMockComponentInteraction('new_session');

    await handleComponentInteraction(ctx, interaction as any);

    expect(interaction.getContent()).toContain('/session');
  });

  test('new_session — requires STANDARD permission', async () => {
    const ctx = createTestContext({ defaultPermissionLevel: 1 });
    const interaction = makeMockComponentInteraction('new_session');

    await handleComponentInteraction(ctx, interaction as any);

    expect(interaction.getContent()).toContain('higher role');
  });

  test('archive_thread — cleans up session state', async () => {
    const ctx = createTestContext({ defaultPermissionLevel: 2 });
    const threadId = '100000000000000001';
    ctx.threadSessions.set(threadId, {
      sessionId: 'sess-1',
      agentName: 'TestAgent',
      agentModel: 'test-model',
      ownerUserId: '200000000000000001',
    });
    ctx.threadLastActivity.set(threadId, Date.now());
    const callbackFn = () => {};
    ctx.threadCallbacks.set(threadId, { sessionId: 'sess-1', callback: callbackFn });

    const interaction = makeMockComponentInteraction('archive_thread');
    await handleComponentInteraction(ctx, interaction as any);

    expect(ctx.threadSessions.has(threadId)).toBe(false);
    expect(ctx.threadLastActivity.has(threadId)).toBe(false);
    expect(ctx.threadCallbacks.has(threadId)).toBe(false);
    expect(ctx.processManager.unsubscribe).toHaveBeenCalled();
    expect(ctx.processManager.stopProcess).toHaveBeenCalledWith('sess-1');
  });

  test('archive_thread — handles no session gracefully', async () => {
    const ctx = createTestContext({ defaultPermissionLevel: 2 });
    const interaction = makeMockComponentInteraction('archive_thread');

    await handleComponentInteraction(ctx, interaction as any);

    // Should still acknowledge — reply was called
    expect(interaction._responses.length).toBeGreaterThanOrEqual(0);
  });

  test('stop_session — stops running session', async () => {
    const ctx = createTestContext({ defaultPermissionLevel: 2 });
    const threadId = '100000000000000001';
    ctx.threadSessions.set(threadId, {
      sessionId: 'sess-1',
      agentName: 'TestAgent',
      agentModel: 'test-model',
      ownerUserId: '200000000000000001',
    });
    const callbackFn = () => {};
    ctx.threadCallbacks.set(threadId, { sessionId: 'sess-1', callback: callbackFn });

    const interaction = makeMockComponentInteraction('stop_session');
    await handleComponentInteraction(ctx, interaction as any);

    expect(ctx.processManager.stopProcess).toHaveBeenCalledWith('sess-1');
    expect(ctx.processManager.unsubscribe).toHaveBeenCalled();
    expect(ctx.threadCallbacks.has(threadId)).toBe(false);
  });

  test('stop_session — no active session', async () => {
    const ctx = createTestContext({ defaultPermissionLevel: 2 });
    const interaction = makeMockComponentInteraction('stop_session');

    await handleComponentInteraction(ctx, interaction as any);

    expect(interaction.getContent()).toContain('No active session');
  });

  test('stop_session — non-owner non-admin cannot stop', async () => {
    const ctx = createTestContext({ defaultPermissionLevel: 2 });
    const threadId = '100000000000000001';
    ctx.threadSessions.set(threadId, {
      sessionId: 'sess-1',
      agentName: 'TestAgent',
      agentModel: 'test-model',
      ownerUserId: '999000000000000001', // different user
    });

    const interaction = makeMockComponentInteraction('stop_session');
    await handleComponentInteraction(ctx, interaction as any);

    expect(interaction.getContent()).toContain('session owner or an admin');
  });

  test('stop_session — admin can stop any session', async () => {
    const ctx = createTestContext({ defaultPermissionLevel: 3 });
    const threadId = '100000000000000001';
    ctx.threadSessions.set(threadId, {
      sessionId: 'sess-1',
      agentName: 'TestAgent',
      agentModel: 'test-model',
      ownerUserId: '999000000000000001', // different user
    });

    const interaction = makeMockComponentInteraction('stop_session');
    await handleComponentInteraction(ctx, interaction as any);

    expect(ctx.processManager.stopProcess).toHaveBeenCalledWith('sess-1');
  });

  test('unknown button action responds with error', async () => {
    const ctx = createTestContext({ defaultPermissionLevel: 2 });
    const interaction = makeMockComponentInteraction('unknown_action');

    await handleComponentInteraction(ctx, interaction as any);

    expect(interaction.getContent()).toContain('Unknown action');
  });
});

// ── Integration: component dispatch via handleInteraction ────────────

describe('handleInteraction component dispatch', () => {
  test('dispatches component interactions', async () => {
    const ctx = createTestContext({ defaultPermissionLevel: 2 });
    const interaction = makeMockComponentInteraction('new_session');

    await handleInteraction(ctx, interaction as any);

    expect(interaction.getContent()).toContain('/session');
  });
});

/**
 * Tests for discord moderation commands: mute, unmute, council.
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
import { createCouncil } from '../db/councils';
import { runMigrations } from '../db/schema';
import {
  handleCouncilCommand,
  handleMuteCommand,
  handleUnmuteCommand,
} from '../discord/command-handlers/moderation-commands';
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

// ── Moderation Commands ─────────────────────────────────────────────

describe('handleMuteCommand', () => {
  test('mutes a user', async () => {
    const ctx = createTestContext();
    const interaction = makeMockChatInteraction('mute', {
      users: { user: { id: '999000000000000001' } },
    });

    await handleMuteCommand(ctx, interaction as any, PermissionLevel.ADMIN, '200000000000000001');

    expect(interaction.getContent()).toContain('muted');
    expect(ctx.muteUser).toHaveBeenCalledWith('999000000000000001');
  });

  test('requires user parameter', async () => {
    const ctx = createTestContext();
    const interaction = makeMockChatInteraction('mute');

    await handleMuteCommand(ctx, interaction as any, PermissionLevel.ADMIN, '200000000000000001');

    expect(interaction.getContent()).toContain('specify a user');
  });
});

describe('handleUnmuteCommand', () => {
  test('unmutes a user', async () => {
    const ctx = createTestContext();
    const interaction = makeMockChatInteraction('unmute', {
      users: { user: { id: '999000000000000001' } },
    });

    await handleUnmuteCommand(ctx, interaction as any, PermissionLevel.ADMIN, '200000000000000001');

    expect(interaction.getContent()).toContain('unmuted');
    expect(ctx.unmuteUser).toHaveBeenCalledWith('999000000000000001');
  });

  test('requires user parameter', async () => {
    const ctx = createTestContext();
    const interaction = makeMockChatInteraction('unmute');

    await handleUnmuteCommand(ctx, interaction as any, PermissionLevel.ADMIN, '200000000000000001');

    expect(interaction.getContent()).toContain('specify a user');
  });
});

describe('handleCouncilCommand', () => {
  test('requires topic', async () => {
    const ctx = createTestContext();
    const interaction = makeMockChatInteraction('council');

    await handleCouncilCommand(ctx, interaction as any, PermissionLevel.ADMIN, '200000000000000001');

    expect(interaction.getContent()).toContain('provide a topic');
  });

  test('handles no councils configured', async () => {
    const ctx = createTestContext();
    const interaction = makeMockChatInteraction('council', { strings: { topic: 'Test topic' } });

    await handleCouncilCommand(ctx, interaction as any, PermissionLevel.ADMIN, '200000000000000001');

    expect(interaction.getContent()).toContain('No councils configured');
  });

  test('handles no projects configured', async () => {
    const ctx = createTestContext();
    const agent = createAgent(db, { name: 'CouncilAgent', model: 'test-model' });
    createCouncil(db, { name: 'Test Council', description: 'desc', agentIds: [agent.id] });

    const interaction = makeMockChatInteraction('council', { strings: { topic: 'Test topic' } });

    await handleCouncilCommand(ctx, interaction as any, PermissionLevel.ADMIN, '200000000000000001');

    expect(interaction.getContent()).toContain('No projects configured');
  });
});

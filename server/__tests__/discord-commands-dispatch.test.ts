/**
 * Tests for discord handleInteraction dispatch routing and permission middleware.
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
import { runMigrations } from '../db/schema';
import { clearAutocompleteCache } from '../discord/command-handlers/autocomplete-handler';
import { handleInteraction, type InteractionContext } from '../discord/commands';
import type { DiscordBridgeConfig } from '../discord/types';
import {
  makeMockAutocompleteInteraction,
  makeMockChatInteraction,
  makeMockComponentInteraction,
} from './helpers/mock-discord-interaction';

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
  clearAutocompleteCache();
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

// ── Integration: handleInteraction dispatches to handlers ───────────

describe('handleInteraction dispatch', () => {
  test('dispatches component interactions', async () => {
    const ctx = createTestContext({ defaultPermissionLevel: 2 });
    const interaction = makeMockComponentInteraction('new_session');

    await handleInteraction(ctx, interaction as any);

    expect(interaction.getContent()).toContain('/session');
  });

  test('dispatches autocomplete interactions', async () => {
    const ctx = createTestContext();
    createAgent(db, { name: 'TestAgent', model: 'test-model' });

    const interaction = makeMockAutocompleteInteraction('session', 'agent', 'test');

    await handleInteraction(ctx, interaction as any);

    // Autocomplete respond() was called — choices captured on the interaction
    expect(interaction._responded).toHaveLength(1);
  });

  test('blocks muted users for commands', async () => {
    const ctx = createTestContext();
    ctx.mutedUsers.add('200000000000000001');

    const interaction = makeMockChatInteraction('agents');
    await handleInteraction(ctx, interaction as any);

    expect(interaction.getContent()).toContain('do not have permission');
  });

  test('handles unknown command', async () => {
    const ctx = createTestContext();
    const interaction = makeMockChatInteraction('nonexistent');

    await handleInteraction(ctx, interaction as any);

    expect(interaction.getContent()).toContain('Unknown command');
  });

  test('dispatches /dashboard command', async () => {
    const ctx = createTestContext();
    const interaction = makeMockChatInteraction('dashboard');

    await handleInteraction(ctx, interaction as any);

    const embeds = interaction.getEmbeds() as Array<{ title: string }>;
    expect(embeds).toHaveLength(4);
    expect(embeds[0].title).toContain('System Overview');
  });

  test('dispatches /status command with rich embed', async () => {
    const ctx = createTestContext();
    const interaction = makeMockChatInteraction('status');

    await handleInteraction(ctx, interaction as any);

    const embed = interaction.getEmbed() as { title: string };
    expect(embed.title).toBe('System Status');
  });

  test('ignores non-command interactions', async () => {
    const ctx = createTestContext();
    // Create an interaction where all type guards return false
    const interaction = {
      isChatInputCommand: () => false as const,
      isAutocomplete: () => false as const,
      isMessageComponent: () => false as const,
    };

    await handleInteraction(ctx, interaction as Parameters<typeof handleInteraction>[1]);
    // No replies should be issued — nothing to assert except no throw
  });
});

// ── Permission middleware ────────────────────────────────────────────
// Verifies that minPermission declared in COMMAND_HANDLERS is enforced
// by the dispatcher before calling any handler.

describe('handleInteraction permission middleware', () => {
  test('rejects BASIC user from /session (requires STANDARD)', async () => {
    const ctx = createTestContext({ defaultPermissionLevel: 1 }); // BASIC
    const interaction = makeMockChatInteraction('session', {
      strings: { agent: 'TestAgent', topic: 'Hello' },
    });

    await handleInteraction(ctx, interaction as any);

    expect(interaction.getContent()).toContain('do not have permission');
  });

  test('rejects BASIC user from /work (requires STANDARD)', async () => {
    const ctx = createTestContext({ defaultPermissionLevel: 1 }); // BASIC
    const interaction = makeMockChatInteraction('work', { strings: { description: 'task' } });

    await handleInteraction(ctx, interaction as any);

    expect(interaction.getContent()).toContain('do not have permission');
  });

  test('rejects STANDARD user from /config (requires ADMIN)', async () => {
    const ctx = createTestContext({ defaultPermissionLevel: 2 }); // STANDARD
    const interaction = makeMockChatInteraction('config');

    await handleInteraction(ctx, interaction as any);

    expect(interaction.getContent()).toContain('do not have permission');
  });

  test('rejects STANDARD user from /council (requires ADMIN)', async () => {
    const ctx = createTestContext({ defaultPermissionLevel: 2 }); // STANDARD
    const interaction = makeMockChatInteraction('council', { strings: { topic: 'Test' } });

    await handleInteraction(ctx, interaction as any);

    expect(interaction.getContent()).toContain('do not have permission');
  });

  test('rejects STANDARD user from /mute (requires ADMIN)', async () => {
    const ctx = createTestContext({ defaultPermissionLevel: 2 }); // STANDARD
    const interaction = makeMockChatInteraction('mute', {
      users: { user: { id: '999000000000000001' } },
    });

    await handleInteraction(ctx, interaction as any);

    expect(interaction.getContent()).toContain('do not have permission');
  });

  test('rejects STANDARD user from /unmute (requires ADMIN)', async () => {
    const ctx = createTestContext({ defaultPermissionLevel: 2 }); // STANDARD
    const interaction = makeMockChatInteraction('unmute', {
      users: { user: { id: '999000000000000001' } },
    });

    await handleInteraction(ctx, interaction as any);

    expect(interaction.getContent()).toContain('do not have permission');
  });

  test('rejects STANDARD user from /admin (requires ADMIN)', async () => {
    const ctx = createTestContext({ defaultPermissionLevel: 2 }); // STANDARD
    const interaction = makeMockChatInteraction('admin');

    await handleInteraction(ctx, interaction as any);

    expect(interaction.getContent()).toContain('do not have permission');
  });

  test('rejects STANDARD user from /agent-skill (requires ADMIN)', async () => {
    const ctx = createTestContext({ defaultPermissionLevel: 2 }); // STANDARD
    const interaction = makeMockChatInteraction('agent-skill');

    await handleInteraction(ctx, interaction as any);

    expect(interaction.getContent()).toContain('do not have permission');
  });

  test('allows ADMIN user to reach /config', async () => {
    const ctx = createTestContext({ defaultPermissionLevel: 3 }); // ADMIN
    const interaction = makeMockChatInteraction('config');

    await handleInteraction(ctx, interaction as any);

    const embeds = interaction.getEmbeds() as Array<{ title: string }>;
    expect(embeds[0].title).toBe('Bot Configuration');
  });

  test('allows STANDARD user to reach /session (partial — no agents)', async () => {
    const ctx = createTestContext({ defaultPermissionLevel: 2 }); // STANDARD
    const interaction = makeMockChatInteraction('session', {
      strings: { agent: 'TestAgent', topic: 'Hello' },
    });

    await handleInteraction(ctx, interaction as any);

    // Permission passed, handler runs and rejects because no agents are configured
    expect(interaction.getContent()).toContain('No agents configured');
  });
});

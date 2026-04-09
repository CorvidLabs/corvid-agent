/**
 * Tests for discord autocomplete handler.
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
import { createPersona } from '../db/personas';
import { createProject } from '../db/projects';
import { runMigrations } from '../db/schema';
import { createBundle } from '../db/skill-bundles';
import { clearAutocompleteCache, handleAutocomplete } from '../discord/command-handlers/autocomplete-handler';
import { handleInteraction, type InteractionContext } from '../discord/commands';
import type { DiscordBridgeConfig } from '../discord/types';
import { makeMockAutocompleteInteraction } from './helpers/mock-discord-interaction';

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

// ── Autocomplete Handler ────────────────────────────────────────────

describe('handleAutocomplete', () => {
  test('returns agent choices filtered by query', async () => {
    const ctx = createTestContext();
    createAgent(db, { name: 'AlphaBot', model: 'test-model' });
    createAgent(db, { name: 'BetaBot', model: 'other-model' });

    const interaction = makeMockAutocompleteInteraction('session', 'agent', 'alpha');

    await handleAutocomplete(ctx, interaction as any);

    const choices = interaction.getChoices();
    expect(choices).toHaveLength(1);
    expect(choices[0].value).toBe('AlphaBot');
  });

  test('returns all agents when query is empty', async () => {
    const ctx = createTestContext();
    createAgent(db, { name: 'AlphaBot', model: 'test-model' });
    createAgent(db, { name: 'BetaBot', model: 'other-model' });

    const interaction = makeMockAutocompleteInteraction('session', 'agent', '');

    await handleAutocomplete(ctx, interaction as any);

    const choices = interaction.getChoices();
    expect(choices).toHaveLength(2);
  });

  test('returns project choices filtered by query', async () => {
    const ctx = createTestContext();
    createProject(db, { name: 'corvid-agent', workingDir: '/tmp/test', description: 'Main project' });
    createProject(db, { name: 'other-project', workingDir: '/tmp/other', description: 'Other project' });

    const interaction = makeMockAutocompleteInteraction('session', 'project', 'corvid');

    await handleAutocomplete(ctx, interaction as any);

    const choices = interaction.getChoices();
    expect(choices).toHaveLength(1);
    expect(choices[0].value).toBe('corvid-agent');
  });

  test('responds with empty choices when no focused option found', async () => {
    const ctx = createTestContext();
    const interaction = makeMockAutocompleteInteraction('session', 'agent', 'test');
    // Override getFocused to return null — simulates discord.js throwing or no focused field
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (interaction.options as any).getFocused = (_full?: boolean) => null;

    await handleAutocomplete(ctx, interaction as any);
    const choices = interaction.getChoices();
    expect(choices).toEqual([]);
  });

  test('limits agent choices to 25', async () => {
    const ctx = createTestContext();
    for (let i = 0; i < 30; i++) {
      createAgent(db, { name: `Agent${i}`, model: 'test-model' });
    }

    const interaction = makeMockAutocompleteInteraction('session', 'agent', '');

    await handleAutocomplete(ctx, interaction as any);

    const choices = interaction.getChoices();
    expect(choices).toHaveLength(25);
  });

  test('handles subcommand-group depth (three levels) for focused agent option', async () => {
    const ctx = createTestContext();
    createAgent(db, { name: 'DeepAgent', model: 'test-model' });

    // discord.js surfaces the focused option directly regardless of nesting depth
    const interaction = makeMockAutocompleteInteraction('synthetic', 'agent', 'deep');

    await handleAutocomplete(ctx, interaction as any);

    const choices = interaction.getChoices();
    expect(choices).toHaveLength(1);
    expect(choices[0].value).toBe('DeepAgent');
  });

  test('handles nested options for subcommands', async () => {
    const ctx = createTestContext();
    createAgent(db, { name: 'TestAgent', model: 'test-model' });

    // discord.js surfaces the focused option directly regardless of nesting depth
    const interaction = makeMockAutocompleteInteraction('work', 'agent', 'test');

    await handleAutocomplete(ctx, interaction as any);

    const choices = interaction.getChoices();
    expect(choices).toHaveLength(1);
    expect(choices[0].value).toBe('TestAgent');
  });

  test('handles failed Discord API response', async () => {
    const ctx = createTestContext();
    createAgent(db, { name: 'TestAgent', model: 'test-model' });

    globalThis.fetch = mock(async () => {
      return new Response('Bad Request', { status: 400 });
    }) as unknown as typeof fetch;

    const interaction = makeMockAutocompleteInteraction('session', 'agent', '');

    // Should not throw
    await handleAutocomplete(ctx, interaction as any);
  });

  test('project autocomplete matches by description', async () => {
    const ctx = createTestContext();
    createProject(db, { name: 'my-project', workingDir: '/tmp/test', description: 'Discord bot integration' });

    const interaction = makeMockAutocompleteInteraction('session', 'project', 'discord');

    await handleAutocomplete(ctx, interaction as any);

    const choices = interaction.getChoices();
    expect(choices).toHaveLength(1);
    expect(choices[0].value).toBe('my-project');
  });

  test('returns skill choices filtered by query', async () => {
    const ctx = createTestContext();
    createBundle(db, { name: 'xyzzy-review', description: 'Xyzzy review skill' });
    createBundle(db, { name: 'deploy-helper', description: 'Deployment automation' });

    const interaction = makeMockAutocompleteInteraction('session', 'skill', 'xyzzy');

    await handleAutocomplete(ctx, interaction as any);

    const choices = interaction.getChoices();
    expect(choices).toHaveLength(1);
    expect(choices[0].value).toBe('xyzzy-review');
  });

  test('returns buddy choices filtered by query', async () => {
    const ctx = createTestContext();
    createAgent(db, { name: 'ReviewBot', model: 'test-model' });
    createAgent(db, { name: 'CodeBot', model: 'other-model' });

    const interaction = makeMockAutocompleteInteraction('session', 'buddy', 'review');

    await handleAutocomplete(ctx, interaction as any);

    const choices = interaction.getChoices();
    expect(choices).toHaveLength(1);
    expect(choices[0].value).toBe('ReviewBot');
  });

  test('returns council choices filtered by query', async () => {
    const ctx = createTestContext();
    const a1 = createAgent(db, { name: 'CouncilAgent1', model: 'test-model' });
    createCouncil(db, { name: 'security-review', description: 'Security review council', agentIds: [a1.id] });
    createCouncil(db, { name: 'architecture', description: 'Architecture council', agentIds: [a1.id] });

    const interaction = makeMockAutocompleteInteraction('session', 'council_name', 'security');

    await handleAutocomplete(ctx, interaction as any);

    const choices = interaction.getChoices();
    expect(choices).toHaveLength(1);
    expect(choices[0].value).toBe('security-review');
  });

  test('returns persona choices filtered by query', async () => {
    const ctx = createTestContext();
    createPersona(db, { name: 'Friendly Helper', archetype: 'friendly' });
    createPersona(db, { name: 'Code Reviewer', archetype: 'custom' });

    const interaction = makeMockAutocompleteInteraction('session', 'persona', 'friendly');

    await handleAutocomplete(ctx, interaction as any);

    const choices = interaction.getChoices();
    expect(choices).toHaveLength(1);
    expect(choices[0].value).toBe('Friendly Helper');
  });

  // ── Timing guard (deadline exceeded) ───────────────────────────────────

  test('skips response when createdTimestamp exceeds 2500ms deadline', async () => {
    const ctx = createTestContext();
    createAgent(db, { name: 'LateBotAgent', model: 'test-model' });

    // createdTimestamp 3 seconds ago — past the 2500ms deadline
    const interaction = makeMockAutocompleteInteraction('session', 'agent', '', Date.now() - 3000);

    await handleAutocomplete(ctx, interaction as any);

    // Response should NOT have been sent
    expect(interaction.getChoices()).toHaveLength(0);
    expect(interaction._responded).toHaveLength(0);
  });

  test('sends response when createdTimestamp is within 2500ms deadline', async () => {
    const ctx = createTestContext();
    createAgent(db, { name: 'FastBotAgent', model: 'test-model' });

    // createdTimestamp 100ms ago — well within deadline
    const interaction = makeMockAutocompleteInteraction('session', 'agent', '', Date.now() - 100);

    await handleAutocomplete(ctx, interaction as any);

    // Response should have been sent normally
    const choices = interaction.getChoices();
    expect(choices.some((c) => c.value === 'FastBotAgent')).toBe(true);
  });

  test('sends response when createdTimestamp is recent (guard passes)', async () => {
    const ctx = createTestContext();
    createAgent(db, { name: 'NoTimestampAgent', model: 'test-model' });

    // Default createdTimestamp (now) — well within deadline
    const interaction = makeMockAutocompleteInteraction('session', 'agent', '');

    await handleAutocomplete(ctx, interaction as any);

    const choices = interaction.getChoices();
    expect(choices.some((c) => c.value === 'NoTimestampAgent')).toBe(true);
  });
});

// ── Integration: autocomplete via handleInteraction ─────────────────

describe('handleInteraction autocomplete dispatch', () => {
  test('dispatches autocomplete interactions', async () => {
    const ctx = createTestContext();
    createAgent(db, { name: 'TestAgent', model: 'test-model' });

    const interaction = makeMockAutocompleteInteraction('session', 'agent', 'test');

    await handleInteraction(ctx, interaction as any);

    // Autocomplete respond() was called — choices captured on the interaction
    expect(interaction._responded).toHaveLength(1);
  });
});

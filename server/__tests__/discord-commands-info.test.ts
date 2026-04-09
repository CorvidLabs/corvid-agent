/**
 * Tests for discord info commands:
 * agents, status, dashboard, quickstart, help, tools, config.
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
import {
  formatUptime,
  handleAgentsCommand,
  handleConfigCommand,
  handleDashboardCommand,
  handleHelpCommand,
  handleQuickstartCommand,
  handleStatusCommand,
  handleToolsCommand,
  measureDbLatency,
} from '../discord/command-handlers/info-commands';
import { handleInteraction, type InteractionContext } from '../discord/commands';
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

// ── Info Commands ───────────────────────────────────────────────────

describe('handleAgentsCommand', () => {
  test('shows empty state when no agents', async () => {
    const ctx = createTestContext();
    const interaction = makeMockChatInteraction('agents');
    await handleAgentsCommand(ctx, interaction as any);

    expect(interaction.getContent()).toContain('No agents configured');
  });

  test('lists agents with models', async () => {
    const ctx = createTestContext();
    createAgent(db, { name: 'AlphaBot', model: 'claude-opus-4-6' });
    createAgent(db, { name: 'BetaBot', model: 'claude-sonnet-4' });

    const interaction = makeMockChatInteraction('agents');
    await handleAgentsCommand(ctx, interaction as any);

    const content = interaction.getContent();
    expect(content).toContain('AlphaBot');
    expect(content).toContain('BetaBot');
    expect(content).toContain('claude-opus-4-6');
  });

  test('shows "no model" when agent has no model', async () => {
    const ctx = createTestContext();
    createAgent(db, { name: 'Bare', model: '' });

    const interaction = makeMockChatInteraction('agents');
    await handleAgentsCommand(ctx, interaction as any);

    expect(interaction.getContent()).toContain('no model');
  });
});

describe('handleStatusCommand', () => {
  test('shows rich status embed with key metrics', async () => {
    const ctx = createTestContext();
    ctx.threadSessions.set('thread-1', { sessionId: 's1', agentName: 'A', agentModel: 'm', ownerUserId: 'u' });
    ctx.threadSessions.set('thread-2', { sessionId: 's2', agentName: 'B', agentModel: 'm', ownerUserId: 'u' });
    createAgent(db, { name: 'TestAgent', model: 'test-model' });

    const interaction = makeMockChatInteraction('status');
    await handleStatusCommand(ctx, interaction as any);

    const embed = interaction.getEmbed() as {
      title: string;
      fields: Array<{ name: string; value: string }>;
      timestamp: string;
    };
    expect(embed.title).toBe('System Status');
    const fieldNames = embed.fields.map((f) => f.name);
    expect(fieldNames).toContain('Version');
    expect(fieldNames).toContain('Uptime');
    expect(fieldNames).toContain('DB Latency');
    expect(fieldNames).toContain('Agents');
    expect(fieldNames).toContain('Active Sessions');
    expect(fieldNames).toContain('Tasks');
    expect(fieldNames).toContain('Schedules');

    const sessionsField = embed.fields.find((f) => f.name === 'Active Sessions');
    expect(sessionsField!.value).toBe('2');

    const agentsField = embed.fields.find((f) => f.name === 'Agents');
    expect(agentsField!.value).toBe('1');

    expect(embed.timestamp).toBeDefined();
  });
});

describe('handleDashboardCommand', () => {
  test('returns multi-embed dashboard', async () => {
    const ctx = createTestContext();
    createAgent(db, { name: 'AlphaBot', model: 'claude-opus-4-6' });
    createAgent(db, { name: 'BetaBot', model: 'claude-sonnet-4' });

    const interaction = makeMockChatInteraction('dashboard');
    await handleDashboardCommand(ctx, interaction as any);

    const embeds = interaction.getEmbeds() as Array<{ title: string }>;
    expect(embeds).toHaveLength(4);
    expect(embeds[0].title).toContain('System Overview');
    expect(embeds[1].title).toBe('Agents');
    expect(embeds[2].title).toBe('Work Pipeline');
    expect(embeds[3].title).toBe('Schedules');
  });

  test('shows agents with active session indicators', async () => {
    const ctx = createTestContext();
    createAgent(db, { name: 'ActiveBot', model: 'test-model' });
    createAgent(db, { name: 'IdleBot', model: 'test-model' });
    ctx.threadSessions.set('thread-1', {
      sessionId: 's1',
      agentName: 'ActiveBot',
      agentModel: 'test-model',
      ownerUserId: 'u',
    });

    const interaction = makeMockChatInteraction('dashboard');
    await handleDashboardCommand(ctx, interaction as any);

    const embeds = interaction.getEmbeds() as Array<{ title: string; description: string }>;
    const agentEmbed = embeds.find((e) => e.title === 'Agents')!;
    // ActiveBot should have green indicator, IdleBot should have grey
    expect(agentEmbed.description).toContain('ActiveBot');
    expect(agentEmbed.description).toContain('IdleBot');
  });

  test('shows empty states gracefully', async () => {
    const ctx = createTestContext();
    const interaction = makeMockChatInteraction('dashboard');
    await handleDashboardCommand(ctx, interaction as any);

    const embeds = interaction.getEmbeds() as Array<{ title: string; description: string }>;
    const agentEmbed = embeds.find((e) => e.title === 'Agents')!;
    expect(agentEmbed.description).toContain('No agents configured');

    const workEmbed = embeds.find((e) => e.title === 'Work Pipeline')!;
    expect(workEmbed.description).toContain('No active tasks');

    const schedEmbed = embeds.find((e) => e.title === 'Schedules')!;
    expect(schedEmbed.description).toContain('No active schedules');
  });
});

describe('formatUptime', () => {
  test('formats minutes only', () => {
    expect(formatUptime(300)).toBe('5m');
  });

  test('formats hours and minutes', () => {
    expect(formatUptime(3660)).toBe('1h 1m');
  });

  test('formats days, hours, and minutes', () => {
    expect(formatUptime(90060)).toBe('1d 1h 1m');
  });

  test('formats zero', () => {
    expect(formatUptime(0)).toBe('0m');
  });
});

describe('measureDbLatency', () => {
  test('returns non-negative number', () => {
    const latency = measureDbLatency(db);
    expect(latency).toBeGreaterThanOrEqual(0);
  });
});

describe('handleQuickstartCommand', () => {
  test('shows quickstart guide with agents', async () => {
    const ctx = createTestContext();
    createAgent(db, { name: 'HelperBot', model: 'test-model' });

    const interaction = makeMockChatInteraction('quickstart');
    await handleQuickstartCommand(ctx, interaction as any);

    const embeds = interaction.getEmbeds() as Array<{ title: string; description: string }>;
    expect(embeds[0].title).toBe('Welcome to CorvidAgent!');
    expect(embeds[0].description).toContain('Start a session');
  });

  test('shows quickstart with no agents', async () => {
    const ctx = createTestContext();
    const interaction = makeMockChatInteraction('quickstart');
    await handleQuickstartCommand(ctx, interaction as any);

    const embeds = interaction.getEmbeds() as Array<{ title: string; fields: Array<{ value: string }> }>;
    expect(embeds[0].fields[0].value).toContain('No agents configured');
  });

  test('shows quickstart with more than 5 agents', async () => {
    const ctx = createTestContext();
    for (let i = 0; i < 7; i++) {
      createAgent(db, { name: `Agent${i}`, model: 'test-model' });
    }

    const interaction = makeMockChatInteraction('quickstart');
    await handleQuickstartCommand(ctx, interaction as any);

    const embeds = interaction.getEmbeds() as Array<{ title: string; fields: Array<{ value: string }> }>;
    expect(embeds[0].fields[0].value).toContain('and 2 more');
  });
});

describe('handleHelpCommand', () => {
  test('returns help embed with all sections', async () => {
    const interaction = makeMockChatInteraction('help');
    await handleHelpCommand(interaction as any);

    const embeds = interaction.getEmbeds() as Array<{ title: string; fields: Array<{ name: string }> }>;
    expect(embeds[0].title).toBe('CorvidAgent Commands');
    const fieldNames = embeds[0].fields.map((f: { name: string }) => f.name);
    expect(fieldNames).toContain('Conversations');
    expect(fieldNames).toContain('Information');
    expect(fieldNames).toContain('Advanced');
    expect(fieldNames).toContain('Admin Configuration');
  });
});

describe('handleToolsCommand', () => {
  test('returns overview with all categories when no filter', async () => {
    const interaction = makeMockChatInteraction('tools');

    await handleToolsCommand(interaction as any);

    const embeds = interaction.getEmbeds() as Array<{
      title: string;
      description: string;
      fields: Array<{ name: string }>;
    }>;
    expect(embeds[0].title).toBe('MCP Tool Catalog');
    expect(embeds[0].description).toContain('tools');
    expect(embeds[0].fields.length).toBeGreaterThanOrEqual(7);
  });

  test('filters by category', async () => {
    const interaction = makeMockChatInteraction('tools', { strings: { category: 'github' } });

    await handleToolsCommand(interaction as any);

    const embeds = interaction.getEmbeds() as Array<{
      title: string;
      fields: Array<{ name: string; value: string }>;
    }>;
    expect(embeds[0].title).toContain('GitHub');
    expect(embeds[0].fields[0].value).toContain('corvid_github_star_repo');
  });

  test('handles unknown category', async () => {
    const interaction = makeMockChatInteraction('tools', { strings: { category: 'nonexistent' } });

    await handleToolsCommand(interaction as any);

    expect(interaction.getContent()).toContain('No tools found');
  });

  test('shows conditional and restricted flags', async () => {
    const interaction = makeMockChatInteraction('tools', { strings: { category: 'code' } });

    await handleToolsCommand(interaction as any);

    const embeds = interaction.getEmbeds() as Array<{ footer: { text: string } }>;
    expect(embeds[0].footer.text).toContain('requires special service');
  });

  test('dispatches via handleInteraction', async () => {
    const ctx = createTestContext();
    const interaction = makeMockChatInteraction('tools');

    await handleInteraction(ctx, interaction as any);

    const embeds = interaction.getEmbeds() as Array<{ title: string }>;
    expect(embeds[0].title).toBe('MCP Tool Catalog');
  });
});

describe('handleConfigCommand', () => {
  test('shows config with additional channels', async () => {
    const ctx = createTestContext({
      defaultPermissionLevel: 3,
      additionalChannelIds: ['500000000000000001', '500000000000000002'],
    });

    const interaction = makeMockChatInteraction('config');
    await handleConfigCommand(ctx, interaction as any, PermissionLevel.ADMIN);

    const embeds = interaction.getEmbeds() as Array<{ fields: Array<{ name: string; value: string }> }>;
    const channelField = embeds[0].fields.find((f: { name: string }) => f.name === 'Additional Channels');
    expect(channelField).toBeDefined();
    expect(channelField!.value).toContain('500000000000000001');
  });
});

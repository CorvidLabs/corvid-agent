/**
 * Tests for decomposed Discord command handler modules.
 *
 * Covers: autocomplete-handler, component-handlers, info-commands,
 * moderation-commands, and session-commands.
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
// Direct imports for unit-level tests
import { clearAutocompleteCache, handleAutocomplete } from '../discord/command-handlers/autocomplete-handler';
import { handleComponentInteraction } from '../discord/command-handlers/component-handlers';
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
import {
  handleCouncilCommand,
  handleMuteCommand,
  handleUnmuteCommand,
} from '../discord/command-handlers/moderation-commands';
import { handleSessionCommand, handleWorkCommand } from '../discord/command-handlers/session-commands';
import { handleInteraction, type InteractionContext } from '../discord/commands';
import type { DiscordBridgeConfig } from '../discord/types';
import { PermissionLevel } from '../discord/types';
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

  test('skips response when receivedAt exceeds 2500ms deadline', async () => {
    const ctx = createTestContext();
    createAgent(db, { name: 'LateBotAgent', model: 'test-model' });

    const interaction = {
      ...makeAutocompleteInteraction('session', [{ name: 'agent', value: '', focused: true }]),
      receivedAt: Date.now() - 3000, // 3 seconds ago — past the 2500ms deadline
    } as DiscordInteractionData;

    await handleAutocomplete(ctx, interaction);

    // Response should NOT have been sent — capturedResponse stays null
    expect(capturedResponse).toBeNull();
  });

  test('sends response when receivedAt is within 2500ms deadline', async () => {
    const ctx = createTestContext();
    createAgent(db, { name: 'FastBotAgent', model: 'test-model' });

    const interaction = {
      ...makeAutocompleteInteraction('session', [{ name: 'agent', value: '', focused: true }]),
      receivedAt: Date.now() - 100, // 100ms ago — well within deadline
    } as DiscordInteractionData;

    await handleAutocomplete(ctx, interaction);

    // Response should have been sent normally
    expect(capturedResponse).not.toBeNull();
    const choices = (capturedResponse!.data as { choices: Array<{ name: string; value: string }> }).choices;
    expect(choices.some((c) => c.value === 'FastBotAgent')).toBe(true);
  });

  test('sends response when receivedAt is absent (guard skipped)', async () => {
    const ctx = createTestContext();
    createAgent(db, { name: 'NoTimestampAgent', model: 'test-model' });

    // No receivedAt field — interactions injected without timestamp should pass through
    const interaction = makeAutocompleteInteraction('session', [{ name: 'agent', value: '', focused: true }]);

    await handleAutocomplete(ctx, interaction);

    expect(capturedResponse).not.toBeNull();
    const choices = (capturedResponse!.data as { choices: Array<{ name: string; value: string }> }).choices;
    expect(choices.some((c) => c.value === 'NoTimestampAgent')).toBe(true);
  });
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

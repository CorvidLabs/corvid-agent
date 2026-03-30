/**
 * Tests for decomposed Discord command handler modules.
 *
 * Covers: autocomplete-handler, component-handlers, info-commands,
 * moderation-commands, and session-commands.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

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
import type { DiscordBridgeConfig, DiscordInteractionData } from '../discord/types';
import { InteractionType, PermissionLevel } from '../discord/types';

let db: Database;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let capturedResponse: Record<string, any> | null = null;
const originalFetch = globalThis.fetch;
const originalAppId = process.env.DISCORD_APP_ID;

/** Extract content from either respondToInteraction ({type,data:{content}}) or editDeferredResponse ({content}) */
function getResponseContent(): string {
  return (capturedResponse?.data?.content ?? capturedResponse?.content) as string;
}

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

function makeInteraction(
  commandName: string,
  options: Array<{ name: string; value: string | number; focused?: boolean }> = [],
  overrides: Partial<DiscordInteractionData> = {},
): DiscordInteractionData {
  return {
    id: '400000000000000001',
    type: InteractionType.APPLICATION_COMMAND,
    token: 'test-interaction-token-long-enough-to-pass',
    channel_id: '100000000000000001',
    member: {
      user: { id: '200000000000000001', username: 'testuser' },
      roles: [],
    },
    data: {
      name: commandName,
      options: options.map((o) => ({
        ...o,
        type: typeof o.value === 'number' ? 4 : 3,
      })),
    },
    ...overrides,
  } as unknown as DiscordInteractionData;
}

function makeComponentInteraction(
  customId: string,
  overrides: Partial<DiscordInteractionData> = {},
): DiscordInteractionData {
  return {
    id: '400000000000000001',
    type: InteractionType.MESSAGE_COMPONENT,
    token: 'test-interaction-token-long-enough-to-pass',
    channel_id: '100000000000000001',
    member: {
      user: { id: '200000000000000001', username: 'testuser' },
      roles: [],
    },
    data: {
      custom_id: customId,
    },
    ...overrides,
  } as unknown as DiscordInteractionData;
}

function makeAutocompleteInteraction(
  commandName: string,
  options: Array<{ name: string; value: string; focused?: boolean }>,
): DiscordInteractionData {
  return {
    id: '400000000000000001',
    type: InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE,
    token: 'test-interaction-token-long-enough-to-pass',
    channel_id: '100000000000000001',
    member: {
      user: { id: '200000000000000001', username: 'testuser' },
      roles: [],
    },
    data: {
      name: commandName,
      options: options.map((o) => ({
        ...o,
        type: 3,
      })),
    },
  } as unknown as DiscordInteractionData;
}

beforeEach(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
  capturedResponse = null;
  clearAutocompleteCache();
  process.env.DISCORD_APP_ID = 'test-app-id';

  globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
    if (init?.body) {
      try {
        capturedResponse = JSON.parse(String(init.body));
      } catch {
        /* non-json body */
      }
    }
    return new Response(JSON.stringify({ id: '500000000000000001' }), { status: 200 });
  }) as unknown as typeof fetch;
});

afterEach(() => {
  db.close();
  globalThis.fetch = originalFetch;
  if (originalAppId !== undefined) process.env.DISCORD_APP_ID = originalAppId;
  else delete process.env.DISCORD_APP_ID;
});

// ── Autocomplete Handler ────────────────────────────────────────────

describe('handleAutocomplete', () => {
  test('returns agent choices filtered by query', async () => {
    const ctx = createTestContext();
    createAgent(db, { name: 'AlphaBot', model: 'test-model' });
    createAgent(db, { name: 'BetaBot', model: 'other-model' });

    const interaction = makeAutocompleteInteraction('session', [{ name: 'agent', value: 'alpha', focused: true }]);

    await handleAutocomplete(ctx, interaction);

    expect(capturedResponse).not.toBeNull();
    const choices = (capturedResponse!.data as { choices: Array<{ name: string; value: string }> }).choices;
    expect(choices).toHaveLength(1);
    expect(choices[0].value).toBe('AlphaBot');
  });

  test('returns all agents when query is empty', async () => {
    const ctx = createTestContext();
    createAgent(db, { name: 'AlphaBot', model: 'test-model' });
    createAgent(db, { name: 'BetaBot', model: 'other-model' });

    const interaction = makeAutocompleteInteraction('session', [{ name: 'agent', value: '', focused: true }]);

    await handleAutocomplete(ctx, interaction);

    expect(capturedResponse).not.toBeNull();
    const choices = (capturedResponse!.data as { choices: Array<{ name: string; value: string }> }).choices;
    expect(choices).toHaveLength(2);
  });

  test('returns project choices filtered by query', async () => {
    const ctx = createTestContext();
    createProject(db, { name: 'corvid-agent', workingDir: '/tmp/test', description: 'Main project' });
    createProject(db, { name: 'other-project', workingDir: '/tmp/other', description: 'Other project' });

    const interaction = makeAutocompleteInteraction('session', [{ name: 'project', value: 'corvid', focused: true }]);

    await handleAutocomplete(ctx, interaction);

    expect(capturedResponse).not.toBeNull();
    const choices = (capturedResponse!.data as { choices: Array<{ name: string; value: string }> }).choices;
    expect(choices).toHaveLength(1);
    expect(choices[0].value).toBe('corvid-agent');
  });

  test('responds with empty choices when no focused option found', async () => {
    const ctx = createTestContext();
    const interaction = makeAutocompleteInteraction('session', [{ name: 'agent', value: 'test' }]);

    await handleAutocomplete(ctx, interaction);
    expect(capturedResponse).not.toBeNull();
    const choices = (capturedResponse!.data as { choices: Array<{ name: string; value: string }> }).choices;
    expect(choices).toEqual([]);
  });

  test('limits agent choices to 25', async () => {
    const ctx = createTestContext();
    for (let i = 0; i < 30; i++) {
      createAgent(db, { name: `Agent${i}`, model: 'test-model' });
    }

    const interaction = makeAutocompleteInteraction('session', [{ name: 'agent', value: '', focused: true }]);

    await handleAutocomplete(ctx, interaction);

    const choices = (capturedResponse!.data as { choices: Array<{ name: string; value: string }> }).choices;
    expect(choices).toHaveLength(25);
  });

  test('handles subcommand-group depth (three levels) for focused agent option', async () => {
    const ctx = createTestContext();
    createAgent(db, { name: 'DeepAgent', model: 'test-model' });

    const interaction: DiscordInteractionData = {
      id: '400000000000000001',
      type: InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE,
      token: 'test-interaction-token-long-enough-to-pass',
      channel_id: '100000000000000001',
      member: {
        user: { id: '200000000000000001', username: 'testuser' },
        roles: [],
      },
      data: {
        name: 'synthetic',
        options: [
          {
            name: 'outer_group',
            type: 2,
            options: [
              {
                name: 'middle_sub',
                type: 1,
                options: [{ name: 'agent', value: 'deep', type: 3, focused: true }],
              },
            ],
          },
        ],
      },
    } as unknown as DiscordInteractionData;

    await handleAutocomplete(ctx, interaction);

    expect(capturedResponse).not.toBeNull();
    const choices = (capturedResponse!.data as { choices: Array<{ name: string; value: string }> }).choices;
    expect(choices).toHaveLength(1);
    expect(choices[0].value).toBe('DeepAgent');
  });

  test('handles nested options for subcommands', async () => {
    const ctx = createTestContext();
    createAgent(db, { name: 'TestAgent', model: 'test-model' });

    // Simulate a subcommand where focused option is nested
    const interaction: DiscordInteractionData = {
      id: '400000000000000001',
      type: InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE,
      token: 'test-interaction-token-long-enough-to-pass',
      channel_id: '100000000000000001',
      member: {
        user: { id: '200000000000000001', username: 'testuser' },
        roles: [],
      },
      data: {
        name: 'work',
        options: [
          {
            name: 'subcommand',
            type: 1,
            options: [{ name: 'agent', value: 'test', type: 3, focused: true }],
          },
        ],
      },
    } as unknown as DiscordInteractionData;

    await handleAutocomplete(ctx, interaction);

    expect(capturedResponse).not.toBeNull();
    const choices = (capturedResponse!.data as { choices: Array<{ name: string; value: string }> }).choices;
    expect(choices).toHaveLength(1);
    expect(choices[0].value).toBe('TestAgent');
  });

  test('handles failed Discord API response', async () => {
    const ctx = createTestContext();
    createAgent(db, { name: 'TestAgent', model: 'test-model' });

    globalThis.fetch = mock(async () => {
      return new Response('Bad Request', { status: 400 });
    }) as unknown as typeof fetch;

    const interaction = makeAutocompleteInteraction('session', [{ name: 'agent', value: '', focused: true }]);

    // Should not throw
    await handleAutocomplete(ctx, interaction);
  });

  test('project autocomplete matches by description', async () => {
    const ctx = createTestContext();
    createProject(db, { name: 'my-project', workingDir: '/tmp/test', description: 'Discord bot integration' });

    const interaction = makeAutocompleteInteraction('session', [{ name: 'project', value: 'discord', focused: true }]);

    await handleAutocomplete(ctx, interaction);

    const choices = (capturedResponse!.data as { choices: Array<{ name: string; value: string }> }).choices;
    expect(choices).toHaveLength(1);
    expect(choices[0].value).toBe('my-project');
  });

  test('returns skill choices filtered by query', async () => {
    const ctx = createTestContext();
    createBundle(db, { name: 'xyzzy-review', description: 'Xyzzy review skill' });
    createBundle(db, { name: 'deploy-helper', description: 'Deployment automation' });

    const interaction = makeAutocompleteInteraction('session', [{ name: 'skill', value: 'xyzzy', focused: true }]);

    await handleAutocomplete(ctx, interaction);

    const choices = (capturedResponse!.data as { choices: Array<{ name: string; value: string }> }).choices;
    expect(choices).toHaveLength(1);
    expect(choices[0].value).toBe('xyzzy-review');
  });

  test('returns buddy choices filtered by query', async () => {
    const ctx = createTestContext();
    createAgent(db, { name: 'ReviewBot', model: 'test-model' });
    createAgent(db, { name: 'CodeBot', model: 'other-model' });

    const interaction = makeAutocompleteInteraction('session', [{ name: 'buddy', value: 'review', focused: true }]);

    await handleAutocomplete(ctx, interaction);

    const choices = (capturedResponse!.data as { choices: Array<{ name: string; value: string }> }).choices;
    expect(choices).toHaveLength(1);
    expect(choices[0].value).toBe('ReviewBot');
  });

  test('returns council choices filtered by query', async () => {
    const ctx = createTestContext();
    const a1 = createAgent(db, { name: 'CouncilAgent1', model: 'test-model' });
    createCouncil(db, { name: 'security-review', description: 'Security review council', agentIds: [a1.id] });
    createCouncil(db, { name: 'architecture', description: 'Architecture council', agentIds: [a1.id] });

    const interaction = makeAutocompleteInteraction('session', [
      { name: 'council_name', value: 'security', focused: true },
    ]);

    await handleAutocomplete(ctx, interaction);

    const choices = (capturedResponse!.data as { choices: Array<{ name: string; value: string }> }).choices;
    expect(choices).toHaveLength(1);
    expect(choices[0].value).toBe('security-review');
  });

  test('returns persona choices filtered by query', async () => {
    const ctx = createTestContext();
    createPersona(db, { name: 'Friendly Helper', archetype: 'friendly' });
    createPersona(db, { name: 'Code Reviewer', archetype: 'custom' });

    const interaction = makeAutocompleteInteraction('session', [{ name: 'persona', value: 'friendly', focused: true }]);

    await handleAutocomplete(ctx, interaction);

    const choices = (capturedResponse!.data as { choices: Array<{ name: string; value: string }> }).choices;
    expect(choices).toHaveLength(1);
    expect(choices[0].value).toBe('Friendly Helper');
  });
});

// ── Component (Button) Handlers ─────────────────────────────────────

describe('handleComponentInteraction', () => {
  test('returns early when no custom_id', async () => {
    const ctx = createTestContext();
    const interaction = makeComponentInteraction('');
    interaction.data = { name: 'test' };

    await handleComponentInteraction(ctx, interaction);
    // Should return early — capturedResponse stays null
    expect(capturedResponse).toBeNull();
  });

  test('returns early when no userId', async () => {
    const ctx = createTestContext();
    const interaction = makeComponentInteraction('resume_thread');
    delete (interaction as unknown as Record<string, unknown>).member;
    delete (interaction as unknown as Record<string, unknown>).user;

    await handleComponentInteraction(ctx, interaction);
    expect(capturedResponse).toBeNull();
  });

  test('blocks muted users', async () => {
    const ctx = createTestContext();
    ctx.mutedUsers.add('200000000000000001');

    const interaction = makeComponentInteraction('resume_thread');
    await handleComponentInteraction(ctx, interaction);

    expect(capturedResponse).not.toBeNull();
    const content = capturedResponse!.data?.content as string;
    expect(content).toContain('do not have permission');
  });

  test('resume_thread — no session found', async () => {
    const ctx = createTestContext({ defaultPermissionLevel: 2 });
    const interaction = makeComponentInteraction('resume_thread');

    await handleComponentInteraction(ctx, interaction);

    expect(capturedResponse).not.toBeNull();
    const content = capturedResponse!.data?.content as string;
    expect(content).toContain('No session found');
  });

  test('resume_thread — requires STANDARD permission', async () => {
    const ctx = createTestContext({ defaultPermissionLevel: 1 });
    const interaction = makeComponentInteraction('resume_thread');

    await handleComponentInteraction(ctx, interaction);

    expect(capturedResponse).not.toBeNull();
    const content = capturedResponse!.data?.content as string;
    expect(content).toContain('higher role');
  });

  test('resume_thread — resumes existing session', async () => {
    const ctx = createTestContext({ defaultPermissionLevel: 2 });
    ctx.threadSessions.set('100000000000000001', {
      sessionId: 'sess-1',
      agentName: 'TestAgent',
      agentModel: 'test-model',
      ownerUserId: '200000000000000001',
    });

    const interaction = makeComponentInteraction('resume_thread');
    await handleComponentInteraction(ctx, interaction);

    expect(capturedResponse).not.toBeNull();
    const content = capturedResponse!.data?.content as string;
    expect(content).toContain('resumed');
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

    const interaction = makeComponentInteraction('resume_thread');
    await handleComponentInteraction(ctx, interaction);

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

    const interaction = makeComponentInteraction('resume_thread');
    await handleComponentInteraction(ctx, interaction);

    // Should recover and resume
    expect(capturedResponse).not.toBeNull();
    const content = capturedResponse!.data?.content as string;
    expect(content).toContain('resumed');
    expect(ctx.threadSessions.has('100000000000000001')).toBe(true);
  });

  test('new_session — responds with /session hint', async () => {
    const ctx = createTestContext({ defaultPermissionLevel: 2 });
    const interaction = makeComponentInteraction('new_session');

    await handleComponentInteraction(ctx, interaction);

    expect(capturedResponse).not.toBeNull();
    const content = capturedResponse!.data?.content as string;
    expect(content).toContain('/session');
  });

  test('new_session — requires STANDARD permission', async () => {
    const ctx = createTestContext({ defaultPermissionLevel: 1 });
    const interaction = makeComponentInteraction('new_session');

    await handleComponentInteraction(ctx, interaction);

    expect(capturedResponse).not.toBeNull();
    const content = capturedResponse!.data?.content as string;
    expect(content).toContain('higher role');
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

    const interaction = makeComponentInteraction('archive_thread');
    await handleComponentInteraction(ctx, interaction);

    expect(ctx.threadSessions.has(threadId)).toBe(false);
    expect(ctx.threadLastActivity.has(threadId)).toBe(false);
    expect(ctx.threadCallbacks.has(threadId)).toBe(false);
    expect(ctx.processManager.unsubscribe).toHaveBeenCalled();
    expect(ctx.processManager.stopProcess).toHaveBeenCalledWith('sess-1');
  });

  test('archive_thread — handles no session gracefully', async () => {
    const ctx = createTestContext({ defaultPermissionLevel: 2 });
    const interaction = makeComponentInteraction('archive_thread');

    await handleComponentInteraction(ctx, interaction);

    // Should still acknowledge
    expect(capturedResponse).not.toBeNull();
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

    const interaction = makeComponentInteraction('stop_session');
    await handleComponentInteraction(ctx, interaction);

    expect(ctx.processManager.stopProcess).toHaveBeenCalledWith('sess-1');
    expect(ctx.processManager.unsubscribe).toHaveBeenCalled();
    expect(ctx.threadCallbacks.has(threadId)).toBe(false);
  });

  test('stop_session — no active session', async () => {
    const ctx = createTestContext({ defaultPermissionLevel: 2 });
    const interaction = makeComponentInteraction('stop_session');

    await handleComponentInteraction(ctx, interaction);

    expect(capturedResponse).not.toBeNull();
    const content = capturedResponse!.data?.content as string;
    expect(content).toContain('No active session');
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

    const interaction = makeComponentInteraction('stop_session');
    await handleComponentInteraction(ctx, interaction);

    expect(capturedResponse).not.toBeNull();
    const content = capturedResponse!.data?.content as string;
    expect(content).toContain('session owner or an admin');
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

    const interaction = makeComponentInteraction('stop_session');
    await handleComponentInteraction(ctx, interaction);

    expect(ctx.processManager.stopProcess).toHaveBeenCalledWith('sess-1');
  });

  test('unknown button action responds with error', async () => {
    const ctx = createTestContext({ defaultPermissionLevel: 2 });
    const interaction = makeComponentInteraction('unknown_action');

    await handleComponentInteraction(ctx, interaction);

    expect(capturedResponse).not.toBeNull();
    const content = capturedResponse!.data?.content as string;
    expect(content).toContain('Unknown action');
  });
});

// ── Info Commands ───────────────────────────────────────────────────

describe('handleAgentsCommand', () => {
  test('shows empty state when no agents', async () => {
    const ctx = createTestContext();
    const interaction = makeInteraction('agents');
    await handleAgentsCommand(ctx, interaction);

    expect(capturedResponse).not.toBeNull();
    const content = capturedResponse!.data?.content as string;
    expect(content).toContain('No agents configured');
  });

  test('lists agents with models', async () => {
    const ctx = createTestContext();
    createAgent(db, { name: 'AlphaBot', model: 'claude-opus-4-6' });
    createAgent(db, { name: 'BetaBot', model: 'claude-sonnet-4' });

    const interaction = makeInteraction('agents');
    await handleAgentsCommand(ctx, interaction);

    const content = capturedResponse!.data?.content as string;
    expect(content).toContain('AlphaBot');
    expect(content).toContain('BetaBot');
    expect(content).toContain('claude-opus-4-6');
  });

  test('shows "no model" when agent has no model', async () => {
    const ctx = createTestContext();
    createAgent(db, { name: 'Bare', model: '' });

    const interaction = makeInteraction('agents');
    await handleAgentsCommand(ctx, interaction);

    const content = capturedResponse!.data?.content as string;
    expect(content).toContain('no model');
  });
});

describe('handleStatusCommand', () => {
  test('shows rich status embed with key metrics', async () => {
    const ctx = createTestContext();
    ctx.threadSessions.set('thread-1', { sessionId: 's1', agentName: 'A', agentModel: 'm', ownerUserId: 'u' });
    ctx.threadSessions.set('thread-2', { sessionId: 's2', agentName: 'B', agentModel: 'm', ownerUserId: 'u' });
    createAgent(db, { name: 'TestAgent', model: 'test-model' });

    const interaction = makeInteraction('status');
    await handleStatusCommand(ctx, interaction);

    const embeds = capturedResponse!.data?.embeds as Array<{
      title: string;
      fields: Array<{ name: string; value: string }>;
      timestamp: string;
    }>;
    expect(embeds[0].title).toBe('System Status');
    const fieldNames = embeds[0].fields.map((f) => f.name);
    expect(fieldNames).toContain('Version');
    expect(fieldNames).toContain('Uptime');
    expect(fieldNames).toContain('DB Latency');
    expect(fieldNames).toContain('Agents');
    expect(fieldNames).toContain('Active Sessions');
    expect(fieldNames).toContain('Tasks');
    expect(fieldNames).toContain('Schedules');

    const sessionsField = embeds[0].fields.find((f) => f.name === 'Active Sessions');
    expect(sessionsField!.value).toBe('2');

    const agentsField = embeds[0].fields.find((f) => f.name === 'Agents');
    expect(agentsField!.value).toBe('1');

    expect(embeds[0].timestamp).toBeDefined();
  });
});

describe('handleDashboardCommand', () => {
  test('returns multi-embed dashboard', async () => {
    const ctx = createTestContext();
    createAgent(db, { name: 'AlphaBot', model: 'claude-opus-4-6' });
    createAgent(db, { name: 'BetaBot', model: 'claude-sonnet-4' });

    const interaction = makeInteraction('dashboard');
    await handleDashboardCommand(ctx, interaction);

    const embeds = capturedResponse!.data?.embeds as Array<{ title: string }>;
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

    const interaction = makeInteraction('dashboard');
    await handleDashboardCommand(ctx, interaction);

    const embeds = capturedResponse!.data?.embeds as Array<{ title: string; description: string }>;
    const agentEmbed = embeds.find((e) => e.title === 'Agents')!;
    // ActiveBot should have green indicator, IdleBot should have grey
    expect(agentEmbed.description).toContain('ActiveBot');
    expect(agentEmbed.description).toContain('IdleBot');
  });

  test('shows empty states gracefully', async () => {
    const ctx = createTestContext();
    const interaction = makeInteraction('dashboard');
    await handleDashboardCommand(ctx, interaction);

    const embeds = capturedResponse!.data?.embeds as Array<{ title: string; description: string }>;
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

    const interaction = makeInteraction('quickstart');
    await handleQuickstartCommand(ctx, interaction);

    const embeds = capturedResponse!.data?.embeds as Array<{ title: string; description: string }>;
    expect(embeds[0].title).toBe('Welcome to CorvidAgent!');
    expect(embeds[0].description).toContain('Start a session');
  });

  test('shows quickstart with no agents', async () => {
    const ctx = createTestContext();
    const interaction = makeInteraction('quickstart');
    await handleQuickstartCommand(ctx, interaction);

    const embeds = capturedResponse!.data?.embeds as Array<{ title: string; fields: Array<{ value: string }> }>;
    expect(embeds[0].fields[0].value).toContain('No agents configured');
  });

  test('shows quickstart with more than 5 agents', async () => {
    const ctx = createTestContext();
    for (let i = 0; i < 7; i++) {
      createAgent(db, { name: `Agent${i}`, model: 'test-model' });
    }

    const interaction = makeInteraction('quickstart');
    await handleQuickstartCommand(ctx, interaction);

    const embeds = capturedResponse!.data?.embeds as Array<{ title: string; fields: Array<{ value: string }> }>;
    expect(embeds[0].fields[0].value).toContain('and 2 more');
  });
});

describe('handleHelpCommand', () => {
  test('returns help embed with all sections', async () => {
    const interaction = makeInteraction('help');
    await handleHelpCommand(interaction);

    const embeds = capturedResponse!.data?.embeds as Array<{ title: string; fields: Array<{ name: string }> }>;
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
    const interaction = makeInteraction('tools');
    const getOption = () => undefined;

    await handleToolsCommand(interaction, getOption);

    const embeds = capturedResponse!.data?.embeds as Array<{
      title: string;
      description: string;
      fields: Array<{ name: string }>;
    }>;
    expect(embeds[0].title).toBe('MCP Tool Catalog');
    expect(embeds[0].description).toContain('tools');
    expect(embeds[0].fields.length).toBeGreaterThanOrEqual(7);
  });

  test('filters by category', async () => {
    const interaction = makeInteraction('tools', [{ name: 'category', value: 'github' }]);
    const getOption = (name: string) => (name === 'category' ? 'github' : undefined);

    await handleToolsCommand(interaction, getOption);

    const embeds = capturedResponse!.data?.embeds as Array<{
      title: string;
      fields: Array<{ name: string; value: string }>;
    }>;
    expect(embeds[0].title).toContain('GitHub');
    expect(embeds[0].fields[0].value).toContain('corvid_github_star_repo');
  });

  test('handles unknown category', async () => {
    const interaction = makeInteraction('tools', [{ name: 'category', value: 'nonexistent' }]);
    const getOption = (name: string) => (name === 'category' ? 'nonexistent' : undefined);

    await handleToolsCommand(interaction, getOption);

    const content = capturedResponse!.data?.content as string;
    expect(content).toContain('No tools found');
  });

  test('shows conditional and restricted flags', async () => {
    const interaction = makeInteraction('tools', [{ name: 'category', value: 'code' }]);
    const getOption = (name: string) => (name === 'category' ? 'code' : undefined);

    await handleToolsCommand(interaction, getOption);

    const embeds = capturedResponse!.data?.embeds as Array<{ footer: { text: string } }>;
    expect(embeds[0].footer.text).toContain('requires special service');
  });

  test('dispatches via handleInteraction', async () => {
    const ctx = createTestContext();
    const interaction = makeInteraction('tools');

    await handleInteraction(ctx, interaction);

    const embeds = capturedResponse!.data?.embeds as Array<{ title: string }>;
    expect(embeds[0].title).toBe('MCP Tool Catalog');
  });
});

describe('handleConfigCommand', () => {
  test('shows config with additional channels', async () => {
    const ctx = createTestContext({
      defaultPermissionLevel: 3,
      additionalChannelIds: ['500000000000000001', '500000000000000002'],
    });

    const interaction = makeInteraction('config');
    await handleConfigCommand(ctx, interaction, PermissionLevel.ADMIN);

    const embeds = capturedResponse!.data?.embeds as Array<{ fields: Array<{ name: string; value: string }> }>;
    const channelField = embeds[0].fields.find((f: { name: string }) => f.name === 'Additional Channels');
    expect(channelField).toBeDefined();
    expect(channelField!.value).toContain('500000000000000001');
  });

  test('denies non-admin', async () => {
    const ctx = createTestContext();
    const interaction = makeInteraction('config');
    await handleConfigCommand(ctx, interaction, PermissionLevel.STANDARD);

    const content = capturedResponse!.data?.content as string;
    expect(content).toContain('Only admins');
  });
});

// ── Moderation Commands ─────────────────────────────────────────────

describe('handleMuteCommand', () => {
  test('mutes a user', async () => {
    const ctx = createTestContext();
    const interaction = makeInteraction('mute');
    const getOption = (name: string) => (name === 'user' ? '999000000000000001' : undefined);

    await handleMuteCommand(ctx, interaction, PermissionLevel.ADMIN, getOption);

    const content = capturedResponse!.data?.content as string;
    expect(content).toContain('muted');
    expect(ctx.muteUser).toHaveBeenCalledWith('999000000000000001');
  });

  test('denies non-admin', async () => {
    const ctx = createTestContext();
    const interaction = makeInteraction('mute');
    const getOption = (name: string) => (name === 'user' ? '999000000000000001' : undefined);

    await handleMuteCommand(ctx, interaction, PermissionLevel.STANDARD, getOption);

    const content = capturedResponse!.data?.content as string;
    expect(content).toContain('Only admins');
  });

  test('requires user parameter', async () => {
    const ctx = createTestContext();
    const interaction = makeInteraction('mute');
    const getOption = () => undefined;

    await handleMuteCommand(ctx, interaction, PermissionLevel.ADMIN, getOption);

    const content = capturedResponse!.data?.content as string;
    expect(content).toContain('specify a user');
  });
});

describe('handleUnmuteCommand', () => {
  test('unmutes a user', async () => {
    const ctx = createTestContext();
    const interaction = makeInteraction('unmute');
    const getOption = (name: string) => (name === 'user' ? '999000000000000001' : undefined);

    await handleUnmuteCommand(ctx, interaction, PermissionLevel.ADMIN, getOption);

    const content = capturedResponse!.data?.content as string;
    expect(content).toContain('unmuted');
    expect(ctx.unmuteUser).toHaveBeenCalledWith('999000000000000001');
  });

  test('denies non-admin', async () => {
    const ctx = createTestContext();
    const interaction = makeInteraction('unmute');
    const getOption = (name: string) => (name === 'user' ? '999000000000000001' : undefined);

    await handleUnmuteCommand(ctx, interaction, PermissionLevel.STANDARD, getOption);

    const content = capturedResponse!.data?.content as string;
    expect(content).toContain('Only admins');
  });

  test('requires user parameter', async () => {
    const ctx = createTestContext();
    const interaction = makeInteraction('unmute');
    const getOption = () => undefined;

    await handleUnmuteCommand(ctx, interaction, PermissionLevel.ADMIN, getOption);

    const content = capturedResponse!.data?.content as string;
    expect(content).toContain('specify a user');
  });
});

describe('handleCouncilCommand', () => {
  test('denies non-admin', async () => {
    const ctx = createTestContext();
    const interaction = makeInteraction('council');
    const getOption = (name: string) => (name === 'topic' ? 'Test topic' : undefined);

    await handleCouncilCommand(ctx, interaction, PermissionLevel.STANDARD, getOption);

    const content = capturedResponse!.data?.content as string;
    expect(content).toContain('admin permissions');
  });

  test('requires topic', async () => {
    const ctx = createTestContext();
    const interaction = makeInteraction('council');
    const getOption = () => undefined;

    await handleCouncilCommand(ctx, interaction, PermissionLevel.ADMIN, getOption);

    const content = capturedResponse!.data?.content as string;
    expect(content).toContain('provide a topic');
  });

  test('handles no councils configured', async () => {
    const ctx = createTestContext();
    const interaction = makeInteraction('council');
    const getOption = (name: string) => (name === 'topic' ? 'Test topic' : undefined);

    await handleCouncilCommand(ctx, interaction, PermissionLevel.ADMIN, getOption);

    const content = capturedResponse!.data?.content as string;
    expect(content).toContain('No councils configured');
  });

  test('handles no projects configured', async () => {
    const ctx = createTestContext();
    const agent = createAgent(db, { name: 'CouncilAgent', model: 'test-model' });
    createCouncil(db, { name: 'Test Council', description: 'desc', agentIds: [agent.id] });

    const interaction = makeInteraction('council');
    const getOption = (name: string) => (name === 'topic' ? 'Test topic' : undefined);

    await handleCouncilCommand(ctx, interaction, PermissionLevel.ADMIN, getOption);

    const content = capturedResponse!.data?.content as string;
    expect(content).toContain('No projects configured');
  });
});

// ── Session Commands ────────────────────────────────────────────────

describe('handleSessionCommand', () => {
  test('denies low permission users', async () => {
    const ctx = createTestContext();
    const interaction = makeInteraction('session');
    const getOption = (name: string) => {
      if (name === 'agent') return 'TestAgent';
      if (name === 'topic') return 'Hello';
      return undefined;
    };

    await handleSessionCommand(ctx, interaction, PermissionLevel.BASIC, getOption, '200000000000000001');

    const content = capturedResponse!.data?.content as string;
    expect(content).toContain('higher role');
  });

  test('requires both agent and topic', async () => {
    const ctx = createTestContext();
    const interaction = makeInteraction('session');
    const getOption = (name: string) => (name === 'agent' ? 'TestAgent' : undefined);

    await handleSessionCommand(ctx, interaction, PermissionLevel.STANDARD, getOption, '200000000000000001');

    const content = capturedResponse!.data?.content as string;
    expect(content).toContain('both an agent and a topic');
  });

  test('handles no agents configured', async () => {
    const ctx = createTestContext();
    const interaction = makeInteraction('session');
    const getOption = (name: string) => {
      if (name === 'agent') return 'TestAgent';
      if (name === 'topic') return 'Hello';
      return undefined;
    };

    await handleSessionCommand(ctx, interaction, PermissionLevel.STANDARD, getOption, '200000000000000001');

    const content = capturedResponse!.data?.content as string;
    expect(content).toContain('No agents configured');
  });

  test('handles agent not found', async () => {
    const ctx = createTestContext();
    createAgent(db, { name: 'RealAgent', model: 'test-model' });

    const interaction = makeInteraction('session');
    const getOption = (name: string) => {
      if (name === 'agent') return 'FakeAgent';
      if (name === 'topic') return 'Hello';
      return undefined;
    };

    await handleSessionCommand(ctx, interaction, PermissionLevel.STANDARD, getOption, '200000000000000001');

    const content = capturedResponse!.data?.content as string;
    expect(content).toContain('Agent not found');
  });

  test('handles project not found', async () => {
    const ctx = createTestContext();
    createAgent(db, { name: 'TestAgent', model: 'test-model' });
    createProject(db, { name: 'real-project', workingDir: '/tmp/test' });

    const interaction = makeInteraction('session');
    const getOption = (name: string) => {
      if (name === 'agent') return 'TestAgent';
      if (name === 'topic') return 'Hello';
      if (name === 'project') return 'fake-project';
      return undefined;
    };

    await handleSessionCommand(ctx, interaction, PermissionLevel.STANDARD, getOption, '200000000000000001');

    const content = capturedResponse!.data?.content as string;
    expect(content).toContain('Project not found');
  });

  test('handles no projects configured', async () => {
    const ctx = createTestContext();
    createAgent(db, { name: 'TestAgent', model: 'test-model' });

    const interaction = makeInteraction('session');
    const getOption = (name: string) => {
      if (name === 'agent') return 'TestAgent';
      if (name === 'topic') return 'Hello';
      return undefined;
    };

    await handleSessionCommand(ctx, interaction, PermissionLevel.STANDARD, getOption, '200000000000000001');

    const content = capturedResponse!.data?.content as string;
    expect(content).toContain('No projects configured');
  });

  test('handles thread creation failure', async () => {
    const ctx = createTestContext();
    ctx.createStandaloneThread = mock(async () => null);
    createAgent(db, { name: 'TestAgent', model: 'test-model' });
    createProject(db, { name: 'test-project', workingDir: '/tmp/test' });

    const interaction = makeInteraction('session');
    const getOption = (name: string) => {
      if (name === 'agent') return 'TestAgent';
      if (name === 'topic') return 'Hello';
      return undefined;
    };

    await handleSessionCommand(ctx, interaction, PermissionLevel.STANDARD, getOption, '200000000000000001');

    const content = getResponseContent();
    expect(content).toContain('Failed to create');
  });

  test('creates session successfully', async () => {
    const ctx = createTestContext();
    createAgent(db, { name: 'TestAgent', model: 'test-model' });
    createProject(db, { name: 'test-project', workingDir: '' });

    const interaction = makeInteraction('session');
    const getOption = (name: string) => {
      if (name === 'agent') return 'TestAgent';
      if (name === 'topic') return 'Hello world';
      return undefined;
    };

    await handleSessionCommand(ctx, interaction, PermissionLevel.STANDARD, getOption, '200000000000000001');

    const content = getResponseContent();
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

    const interaction = makeInteraction('session');
    const getOption = (name: string) => {
      if (name === 'agent') return 'TestAgent (claude-opus-4-6)';
      if (name === 'topic') return 'Hello';
      return undefined;
    };

    await handleSessionCommand(ctx, interaction, PermissionLevel.STANDARD, getOption, '200000000000000001');

    const content = getResponseContent();
    expect(content).toContain('TestAgent');
    expect(content).not.toContain('Agent not found');
  });
});

describe('handleWorkCommand', () => {
  test('denies low permission users', async () => {
    const ctx = createTestContext();
    const interaction = makeInteraction('work');
    const getOption = (name: string) => (name === 'description' ? 'Fix bug' : undefined);

    await handleWorkCommand(ctx, interaction, PermissionLevel.BASIC, getOption, '200000000000000001');

    const content = capturedResponse!.data?.content as string;
    expect(content).toContain('higher role');
  });

  test('handles no work task service', async () => {
    const ctx = createTestContext();
    ctx.workTaskService = null;
    const interaction = makeInteraction('work');
    const getOption = (name: string) => (name === 'description' ? 'Fix bug' : undefined);

    await handleWorkCommand(ctx, interaction, PermissionLevel.STANDARD, getOption, '200000000000000001');

    const content = capturedResponse!.data?.content as string;
    expect(content).toContain('not available');
  });

  test('requires description', async () => {
    const ctx = createTestContext();
    ctx.workTaskService = { create: mock(async () => ({})) } as unknown as InteractionContext['workTaskService'];
    const interaction = makeInteraction('work');
    const getOption = () => undefined;

    await handleWorkCommand(ctx, interaction, PermissionLevel.STANDARD, getOption, '200000000000000001');

    const content = capturedResponse!.data?.content as string;
    expect(content).toContain('task description');
  });

  test('handles agent not found', async () => {
    const ctx = createTestContext();
    ctx.workTaskService = { create: mock(async () => ({})) } as unknown as InteractionContext['workTaskService'];
    createAgent(db, { name: 'RealAgent', model: 'test-model' });

    const interaction = makeInteraction('work');
    const getOption = (name: string) => {
      if (name === 'description') return 'Fix bug';
      if (name === 'agent') return 'FakeAgent';
      return undefined;
    };

    await handleWorkCommand(ctx, interaction, PermissionLevel.STANDARD, getOption, '200000000000000001');

    const content = capturedResponse!.data?.content as string;
    expect(content).toContain('Agent not found');
  });

  test('handles no agents configured', async () => {
    const ctx = createTestContext();
    ctx.workTaskService = { create: mock(async () => ({})) } as unknown as InteractionContext['workTaskService'];

    const interaction = makeInteraction('work');
    const getOption = (name: string) => (name === 'description' ? 'Fix bug' : undefined);

    await handleWorkCommand(ctx, interaction, PermissionLevel.STANDARD, getOption, '200000000000000001');

    const content = capturedResponse!.data?.content as string;
    expect(content).toContain('No agents configured');
  });

  test('handles project not found', async () => {
    const ctx = createTestContext();
    createAgent(db, { name: 'TestAgent', model: 'test-model' });
    createProject(db, { name: 'real-project', workingDir: '/tmp/test' });
    ctx.workTaskService = { create: mock(async () => ({})) } as unknown as InteractionContext['workTaskService'];

    const interaction = makeInteraction('work');
    const getOption = (name: string) => {
      if (name === 'description') return 'Fix bug';
      if (name === 'project') return 'fake-project';
      return undefined;
    };

    await handleWorkCommand(ctx, interaction, PermissionLevel.STANDARD, getOption, '200000000000000001');

    const content = capturedResponse!.data?.content as string;
    expect(content).toContain('Project not found');
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

    const interaction = makeInteraction('work');
    const getOption = (name: string) => {
      if (name === 'description') return 'Fix the tests';
      return undefined;
    };

    await handleWorkCommand(ctx, interaction, PermissionLevel.STANDARD, getOption, '200000000000000001');

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

    const interaction = makeInteraction('work');
    const getOption = (name: string) => {
      if (name === 'description') return 'Fix the tests';
      return undefined;
    };

    await handleWorkCommand(ctx, interaction, PermissionLevel.STANDARD, getOption, '200000000000000001');

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

    const interaction = makeInteraction('work');
    const getOption = (name: string) => {
      if (name === 'description') return 'Fix';
      if (name === 'agent') return 'WorkerBot (claude-opus-4-6)';
      return undefined;
    };

    await handleWorkCommand(ctx, interaction, PermissionLevel.STANDARD, getOption, '200000000000000001');

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

    const interaction = makeInteraction('work');
    const getOption = (name: string) => {
      if (name === 'description') return 'Fix something';
      return undefined;
    };

    await handleWorkCommand(ctx, interaction, PermissionLevel.STANDARD, getOption, '200000000000000001');

    expect(ctx.workTaskService!.create).toHaveBeenCalled();
  });
});

// ── Integration: handleInteraction dispatches to handlers ───────────

describe('handleInteraction dispatch', () => {
  test('dispatches component interactions', async () => {
    const ctx = createTestContext({ defaultPermissionLevel: 2 });
    const interaction = makeComponentInteraction('new_session');

    await handleInteraction(ctx, interaction);

    const content = capturedResponse!.data?.content as string;
    expect(content).toContain('/session');
  });

  test('dispatches autocomplete interactions', async () => {
    const ctx = createTestContext();
    createAgent(db, { name: 'TestAgent', model: 'test-model' });

    const interaction = makeAutocompleteInteraction('session', [{ name: 'agent', value: 'test', focused: true }]);

    await handleInteraction(ctx, interaction);

    expect(capturedResponse).not.toBeNull();
  });

  test('blocks muted users for commands', async () => {
    const ctx = createTestContext();
    ctx.mutedUsers.add('200000000000000001');

    const interaction = makeInteraction('agents');
    await handleInteraction(ctx, interaction);

    const content = capturedResponse!.data?.content as string;
    expect(content).toContain('do not have permission');
  });

  test('handles unknown command', async () => {
    const ctx = createTestContext();
    const interaction = makeInteraction('nonexistent');

    await handleInteraction(ctx, interaction);

    const content = capturedResponse!.data?.content as string;
    expect(content).toContain('Unknown command');
  });

  test('dispatches /dashboard command', async () => {
    const ctx = createTestContext();
    const interaction = makeInteraction('dashboard');

    await handleInteraction(ctx, interaction);

    const embeds = capturedResponse!.data?.embeds as Array<{ title: string }>;
    expect(embeds).toHaveLength(4);
    expect(embeds[0].title).toContain('System Overview');
  });

  test('dispatches /status command with rich embed', async () => {
    const ctx = createTestContext();
    const interaction = makeInteraction('status');

    await handleInteraction(ctx, interaction);

    const embeds = capturedResponse!.data?.embeds as Array<{ title: string }>;
    expect(embeds[0].title).toBe('System Status');
  });

  test('ignores non-command interactions', async () => {
    const ctx = createTestContext();
    const interaction = makeInteraction('agents');
    interaction.type = 999; // Not a recognized type

    await handleInteraction(ctx, interaction);
    expect(capturedResponse).toBeNull();
  });
});

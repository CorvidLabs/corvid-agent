import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { createAgent } from '../db/agents';
import { runMigrations } from '../db/schema';
import { DiscordBridge } from '../discord/bridge';
import { _setRestClientForTesting } from '../discord/rest-client';
import type { DiscordBridgeConfig } from '../discord/types';

/**
 * Tests for the DiscordBridge.updateSlashCommands() debounce behaviour.
 *
 * Uses a real in-memory database with agents inserted, and mocks the
 * DiscordRestClient to track slash command registration calls without
 * hitting the real Discord API.
 *
 * Previously used globalThis.fetch interception; updated in Phase 3 (#1793)
 * because @discordjs/rest does not route through globalThis.fetch.
 */

// Track putCommands calls
const putCommandsCalls: Array<{ appId: string; guildId: string | undefined }> = [];

function createMockRestClient() {
  return {
    putCommands: mock(async (appId: string, guildId: string | undefined) => {
      putCommandsCalls.push({ appId, guildId });
      return [{ name: 'session' }];
    }),
    // Stub the other methods to avoid errors
    respondToInteraction: mock(async () => ({}) as any),
    deferInteraction: mock(async () => {}),
    editDeferredResponse: mock(async () => ({}) as any),
    deleteMessage: mock(async () => {}),
    sendMessage: mock(async () => ({}) as any),
    addReaction: mock(async () => {}),
    sendTypingIndicator: mock(async () => {}),
  };
}

function createMockProcessManager() {
  return {
    getActiveSessionIds: () => [] as string[],
    startProcess: mock(() => {}),
    sendMessage: mock(() => true),
    subscribe: mock(() => {}),
    unsubscribe: mock(() => {}),
    resumeProcess: mock(() => {}),
    isRunning: mock(() => true),
  } as unknown as import('../process/manager').ProcessManager;
}

const defaultConfig: DiscordBridgeConfig = {
  botToken: 'fake-token',
  channelId: '1234567890123456789',
  appId: '9876543210987654321',
  guildId: '',
  allowedUserIds: [],
};

function makeBridge(db: Database, config?: Partial<DiscordBridgeConfig>): DiscordBridge {
  const bridge = new DiscordBridge(db, createMockProcessManager(), { ...defaultConfig, ...config });
  // DiscordBridge constructor calls initializeRestClient(), which overwrites any previously
  // set test client. Re-inject the mock after construction so putCommands is intercepted.
  _setRestClientForTesting(createMockRestClient() as any);
  return bridge;
}

/** Return putCommands calls (these represent slash-command registration). */
function slashCommandCalls() {
  return putCommandsCalls;
}

// ── Tests ────────────────────────────────────────────────────────────

describe('DiscordBridge.updateSlashCommands', () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    // Seed two agents so registerSlashCommands has data to work with
    createAgent(db, { name: 'Agent1', model: 'claude-3', systemPrompt: 'You are agent 1' });
    createAgent(db, { name: 'Agent2', model: 'gpt-4', systemPrompt: 'You are agent 2' });

    putCommandsCalls.length = 0;
  });

  afterEach(() => {
    _setRestClientForTesting(null);
    db.close();
  });

  test('is callable as a public method', () => {
    const bridge = makeBridge(db);
    expect(typeof bridge.updateSlashCommands).toBe('function');
    bridge.updateSlashCommands();
    bridge.stop();
  });

  test('debounces rapid calls into a single API request', async () => {
    const bridge = makeBridge(db);
    (bridge as any).running = true;

    // Fire three rapid calls
    bridge.updateSlashCommands();
    bridge.updateSlashCommands();
    bridge.updateSlashCommands();

    // No slash-command fetch should have happened yet (still within debounce window)
    expect(slashCommandCalls().length).toBe(0);

    // Wait for the debounce timer (2 s) + a small buffer
    await new Promise((resolve) => setTimeout(resolve, 2200));

    // Only one slash-command registration call should have been made
    const calls = slashCommandCalls();
    expect(calls.length).toBe(1);
    expect(calls[0].appId).toBe(defaultConfig.appId ?? '');

    bridge.stop();
  });

  test('does nothing when bridge is not running', async () => {
    const bridge = makeBridge(db);
    // running defaults to false — updateSlashCommands should bail out
    bridge.updateSlashCommands();

    await new Promise((resolve) => setTimeout(resolve, 2500));
    expect(slashCommandCalls().length).toBe(0);

    bridge.stop();
  });

  test('does nothing when appId is not configured', async () => {
    const bridge = makeBridge(db, { appId: '' });
    (bridge as any).running = true;

    bridge.updateSlashCommands();

    await new Promise((resolve) => setTimeout(resolve, 2500));
    expect(slashCommandCalls().length).toBe(0);

    bridge.stop();
  });
});

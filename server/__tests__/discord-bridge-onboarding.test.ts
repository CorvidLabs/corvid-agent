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
import { runMigrations } from '../db/schema';
import { DiscordBridge } from '../discord/bridge';
import type { DiscordBridgeConfig } from '../discord/types';
import { makeMockChatInteraction } from './helpers/mock-discord-interaction';
import { mockDiscordRest } from './helpers/mock-discord-rest';

// Track subscribe callbacks so we can drain embed-response timers in afterEach.
type SubscribeCallback = (sessionId: string, event: { type: string; [key: string]: unknown }) => void;
const pendingSubscribers: Array<{ sessionId: string; callback: SubscribeCallback }> = [];

function createMockProcessManager() {
  return {
    getActiveSessionIds: () => [] as string[],
    startProcess: mock(() => {}),
    sendMessage: mock(() => true),
    subscribe: mock((sessionId: string, callback: SubscribeCallback) => {
      pendingSubscribers.push({ sessionId, callback });
    }),
    unsubscribe: mock(() => {}),
    subscribeAll: mock(() => {}),
    unsubscribeAll: mock(() => {}),
    resumeProcess: mock(() => {}),
    stopProcess: mock(() => {}),
    isRunning: mock(() => true),
  } as unknown as import('../process/manager').ProcessManager;
}

/** Set the bot's user ID on the bridge (simulates READY event). */
function setBotUserId(bridge: DiscordBridge, botUserId: string): void {
  (bridge as unknown as { botUserId: string }).botUserId = botUserId;
}

let db: Database;

beforeEach(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
});

afterEach(() => {
  for (const { sessionId, callback } of pendingSubscribers) {
    try {
      callback(sessionId, { type: 'result', result: '' });
    } catch {}
  }
  pendingSubscribers.length = 0;
  db.close();
});

describe('DiscordBridge onboarding', () => {
  test('/help responds with embed containing command fields', async () => {
    const pm = createMockProcessManager();
    createAgent(db, { name: 'TestAgent' });
    const config: DiscordBridgeConfig = {
      botToken: 'test-token',
      channelId: '100000000000000001',
      allowedUserIds: [],
      appId: '800000000000000001',
    };
    const bridge = new DiscordBridge(db, pm, config);
    const interaction = makeMockChatInteraction('help', {}, 'user-1');

    await (bridge as unknown as { handleInteraction: (i: unknown) => Promise<void> }).handleInteraction(interaction);

    const embeds = interaction.getEmbeds() as Array<{ title: string; fields: Array<{ name: string }> }>;
    expect(embeds).toBeDefined();
    expect(embeds[0].title).toBe('CorvidAgent Commands');
    const fieldNames = embeds[0].fields.map((f: { name: string }) => f.name);
    expect(fieldNames).toContain('Conversations');
    expect(fieldNames).toContain('Information');
    expect(fieldNames).toContain('Advanced');
  });

  test('/quickstart responds with welcome embed listing agents', async () => {
    const pm = createMockProcessManager();
    createAgent(db, { name: 'AlphaAgent' });
    createAgent(db, { name: 'BetaAgent' });
    const config: DiscordBridgeConfig = {
      botToken: 'test-token',
      channelId: '100000000000000001',
      allowedUserIds: [],
      appId: '800000000000000001',
    };
    const bridge = new DiscordBridge(db, pm, config);
    const interaction = makeMockChatInteraction('quickstart', {}, 'user-1');

    await (bridge as unknown as { handleInteraction: (i: unknown) => Promise<void> }).handleInteraction(interaction);

    const embeds = interaction.getEmbeds() as Array<{
      title: string;
      description: string;
      fields: Array<{ value: string }>;
    }>;
    expect(embeds[0].title).toBe('Welcome to CorvidAgent!');
    expect(embeds[0].description).toContain('/session');
    // Should list agents in the field
    expect(embeds[0].fields[0].value).toContain('AlphaAgent');
    expect(embeds[0].fields[0].value).toContain('BetaAgent');
  });

  test('first-interaction tip is sent once on @mention', async () => {
    const pm = createMockProcessManager();
    createAgent(db, { name: 'TestAgent' });
    const config: DiscordBridgeConfig = {
      botToken: 'test-token',
      channelId: '100000000000000001',
      allowedUserIds: [],
    };
    const bridge = new DiscordBridge(db, pm, config);
    setBotUserId(bridge, '999000000000000001');

    const { fetchBodies, cleanup } = mockDiscordRest();

    try {
      const msg = {
        id: '200000000000000010',
        channel_id: '100000000000000001',
        author: { id: 'new-user-1', username: 'NewUser' },
        content: '<@999000000000000001> Hello!',
        timestamp: new Date().toISOString(),
        mentions: [{ id: '999000000000000001', username: 'CorvidBot' }],
      };

      // First interaction — should send welcome tip
      await (bridge as unknown as { handleMessage: (m: unknown) => Promise<void> }).handleMessage(msg);
      const welcomeEmbed = fetchBodies.find((b: unknown) => {
        const embeds = (b as { embeds?: Array<{ footer?: { text: string } }> }).embeds;
        return embeds?.some((e) => e.footer?.text === 'This tip only appears once');
      });
      expect(welcomeEmbed).toBeDefined();

      // Second interaction — no welcome tip
      fetchBodies.length = 0;
      await (bridge as unknown as { handleMessage: (m: unknown) => Promise<void> }).handleMessage({
        ...msg,
        id: '200000000000000011',
      });
      const secondWelcome = fetchBodies.find((b: unknown) => {
        const embeds = (b as { embeds?: Array<{ footer?: { text: string } }> }).embeds;
        return embeds?.some((e) => e.footer?.text === 'This tip only appears once');
      });
      expect(secondWelcome).toBeUndefined();
    } finally {
      cleanup();
    }
  });
});

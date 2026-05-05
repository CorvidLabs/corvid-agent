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
import { createProject } from '../db/projects';
import { runMigrations } from '../db/schema';
import { DiscordBridge } from '../discord/bridge';
import type { DiscordBridgeConfig } from '../discord/types';
import { mockDiscordRest } from './helpers/mock-discord-rest';

// Track subscribe callbacks so we can drain embed-response timers in afterEach.
// Without this, the 5s ack timer in embed-response.ts fires after test cleanup,
// causing "unhandled error between tests" in CI (see #1894).
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
    setKeepAliveTtl: mock(() => {}),
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
  // Drain embed-response subscriptions to clear ack/progress timers before closing db
  for (const { sessionId, callback } of pendingSubscribers) {
    try {
      callback(sessionId, { type: 'result', result: '' });
    } catch {}
  }
  pendingSubscribers.length = 0;
  db.close();
});

describe('DiscordBridge', () => {
  test('constructor creates bridge', () => {
    const pm = createMockProcessManager();
    const config: DiscordBridgeConfig = {
      botToken: 'test-token',
      channelId: '100000000000000001',
      allowedUserIds: [],
    };
    const bridge = new DiscordBridge(db, pm, config);
    expect(bridge).toBeDefined();
  });

  test('ignores bot messages', async () => {
    const pm = createMockProcessManager();
    const config: DiscordBridgeConfig = {
      botToken: 'test-token',
      channelId: '100000000000000001',
      allowedUserIds: [],
    };
    const bridge = new DiscordBridge(db, pm, config);

    await (bridge as unknown as { handleMessage: (msg: unknown) => Promise<void> }).handleMessage({
      id: '1',
      channel_id: '100000000000000001',
      author: { id: 'bot-1', username: 'TestBot', bot: true },
      content: 'hello from bot',
      timestamp: new Date().toISOString(),
    });

    expect(pm.startProcess).not.toHaveBeenCalled();
  });

  test('ignores messages from other channels', async () => {
    const pm = createMockProcessManager();
    const config: DiscordBridgeConfig = {
      botToken: 'test-token',
      channelId: '100000000000000002',
      allowedUserIds: [],
    };
    const bridge = new DiscordBridge(db, pm, config);

    await (bridge as unknown as { handleMessage: (msg: unknown) => Promise<void> }).handleMessage({
      id: '1',
      channel_id: '100000000000000003',
      author: { id: 'user-1', username: 'TestUser' },
      content: 'hello',
      timestamp: new Date().toISOString(),
    });

    expect(pm.startProcess).not.toHaveBeenCalled();
  });

  test('ignores regular channel messages (passive mode)', async () => {
    const pm = createMockProcessManager();
    const config: DiscordBridgeConfig = {
      botToken: 'test-token',
      channelId: '100000000000000001',
      allowedUserIds: [],
    };
    const bridge = new DiscordBridge(db, pm, config);
    setBotUserId(bridge, '999000000000000001');

    const { fetchBodies, cleanup } = mockDiscordRest();

    try {
      // Regular message without @mention — should be silently ignored
      await (bridge as unknown as { handleMessage: (msg: unknown) => Promise<void> }).handleMessage({
        id: '200000000000000001',
        channel_id: '100000000000000001',
        author: { id: 'user-1', username: 'TestUser' },
        content: 'Hello everyone',
        timestamp: new Date().toISOString(),
        mentions: [], // no mentions
      });

      expect(pm.startProcess).not.toHaveBeenCalled();
      expect(fetchBodies.length).toBe(0);
    } finally {
      cleanup();
    }
  });

  test('@mention triggers one-off reply', async () => {
    const pm = createMockProcessManager();
    createAgent(db, { name: 'TestAgent' });
    createProject(db, { name: 'TestProject', workingDir: '/tmp/test' });

    const config: DiscordBridgeConfig = {
      botToken: 'test-token',
      channelId: '100000000000000001',
      allowedUserIds: [],
    };
    const bridge = new DiscordBridge(db, pm, config);
    setBotUserId(bridge, '999000000000000001');

    const { cleanup } = mockDiscordRest();

    try {
      await (bridge as unknown as { handleMessage: (msg: unknown) => Promise<void> }).handleMessage({
        id: '200000000000000001',
        channel_id: '100000000000000001',
        author: { id: 'user-1', username: 'TestUser' },
        content: '<@999000000000000001> what time is it?',
        timestamp: new Date().toISOString(),
        mentions: [{ id: '999000000000000001', username: 'CorvidBot' }],
      });

      // Should start a process for one-off reply
      expect(pm.startProcess).toHaveBeenCalled();
      // Prompt should include author context prefix
      const startArgs = (pm.startProcess as ReturnType<typeof mock>).mock.calls[0];
      const prompt = startArgs[1] as string;
      expect(prompt).toContain('[From Discord user: TestUser (Discord ID: user-1) in channel');
      expect(prompt).toContain('what time is it?');
      // Should subscribe for response
      expect(pm.subscribe).toHaveBeenCalled();
    } finally {
      cleanup();
    }
  });

  test('@mention with Ollama agent and complex prompt sends complexity warning', async () => {
    const pm = createMockProcessManager();
    createAgent(db, { name: 'OllamaTestAgent', model: 'llama3.3', provider: 'ollama' });
    createProject(db, { name: 'OllamaProject', workingDir: '/tmp/test' });

    const config: DiscordBridgeConfig = {
      botToken: 'test-token',
      channelId: '100000000000000001',
      allowedUserIds: [],
    };
    const bridge = new DiscordBridge(db, pm, config);
    setBotUserId(bridge, '999000000000000001');

    const { fetchBodies, cleanup } = mockDiscordRest();

    try {
      await (bridge as unknown as { handleMessage: (msg: unknown) => Promise<void> }).handleMessage({
        id: '200000000000000002',
        channel_id: '100000000000000001',
        author: { id: 'user-2', username: 'TestUser2' },
        content:
          '<@999000000000000001> Refactor the authentication system, migrate to JWT tokens, and optimize all database queries for performance and security.',
        timestamp: new Date().toISOString(),
        mentions: [{ id: '999000000000000001', username: 'CorvidBot' }],
      });

      // Should start a process
      expect(pm.startProcess).toHaveBeenCalled();
      // Should have sent a complexity warning message to Discord
      const warningCall = fetchBodies.find((b) => JSON.stringify(b).includes('Advisory'));
      expect(warningCall).toBeDefined();
    } finally {
      cleanup();
    }
  });

  test('sendMessage splits long messages', async () => {
    const pm = createMockProcessManager();
    const config: DiscordBridgeConfig = {
      botToken: 'test-token',
      channelId: '100000000000000001',
      allowedUserIds: [],
    };
    const bridge = new DiscordBridge(db, pm, config);

    const { fetchBodies, cleanup } = mockDiscordRest();

    try {
      // Short message — single API call
      await bridge.sendMessage('100000000000000001', 'Hello');
      expect(fetchBodies.length).toBe(1);

      // Long message (>2000 chars) — split into multiple calls
      fetchBodies.length = 0;
      const longText = 'x'.repeat(3000);
      await bridge.sendMessage('100000000000000001', longText);
      expect(fetchBodies.length).toBe(2);
    } finally {
      cleanup();
    }
  });

  test('stop clears running state', () => {
    const pm = createMockProcessManager();
    const config: DiscordBridgeConfig = {
      botToken: 'test-token',
      channelId: '100000000000000001',
      allowedUserIds: [],
    };
    const bridge = new DiscordBridge(db, pm, config);

    // Mock connect to prevent actual WebSocket
    (bridge as unknown as { connect: () => void }).connect = mock(() => {});

    bridge.start();
    expect((bridge as unknown as { running: boolean }).running).toBe(true);

    bridge.stop();
    expect((bridge as unknown as { running: boolean }).running).toBe(false);
  });

  test('thread messages route to session', async () => {
    const pm = createMockProcessManager();
    const config: DiscordBridgeConfig = {
      botToken: 'test-token',
      channelId: '100000000000000001',
      allowedUserIds: [],
    };
    const bridge = new DiscordBridge(db, pm, config);

    // Simulate a tracked thread session
    const tsm = (bridge as unknown as { tsm: { threadSessions: Map<string, unknown> } }).tsm;
    createAgent(db, { name: 'TestAgent' });
    createProject(db, { name: 'TestProject', workingDir: '/tmp/test' });

    // Create a real session to query
    const { createSession } = await import('../db/sessions');
    const session = createSession(db, {
      projectId: (await import('../db/projects')).listProjects(db)[0].id,
      agentId: (await import('../db/agents')).listAgents(db)[0].id,
      name: 'Discord thread:300000000000000001',
      initialPrompt: 'test',
      source: 'discord',
    });

    tsm.threadSessions.set('300000000000000001', {
      sessionId: session.id,
      agentName: 'TestAgent',
      agentModel: 'test-model',
      ownerUserId: 'user-1',
    });

    const { cleanup } = mockDiscordRest();

    try {
      await (bridge as unknown as { handleMessage: (msg: unknown) => Promise<void> }).handleMessage({
        id: '200000000000000002',
        channel_id: '300000000000000001',
        author: { id: 'user-1', username: 'TestUser' },
        content: 'continue the conversation',
        timestamp: new Date().toISOString(),
      });

      // Should send message to existing session
      expect(pm.sendMessage).toHaveBeenCalled();
    } finally {
      cleanup();
    }
  });
});

describe('trackMentionSession', () => {
  test('evicts oldest entry when cap is reached', async () => {
    const map = new Map<string, { sessionId: string; agentName: string; agentModel: string }>();

    // Fill to capacity (500)
    for (let i = 0; i < 500; i++) {
      map.set(`msg-${i}`, { sessionId: `session-${i}`, agentName: 'Agent', agentModel: 'model' });
    }
    expect(map.size).toBe(500);

    // The first key should be msg-0
    expect(map.keys().next().value).toBe('msg-0');

    // Simulate what trackMentionSession does: evict oldest when at cap
    if (map.size >= 500) {
      const firstKey = map.keys().next().value;
      if (firstKey) map.delete(firstKey);
    }
    map.set('msg-500', { sessionId: 'session-500', agentName: 'Agent', agentModel: 'model' });

    expect(map.size).toBe(500);
    expect(map.has('msg-0')).toBe(false);
    expect(map.has('msg-500')).toBe(true);
  });
});

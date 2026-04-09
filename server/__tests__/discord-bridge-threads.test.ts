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

describe('DiscordBridge thread subscription dedup', () => {
  test('unsubscribes previous callback before re-subscribing for same thread', async () => {
    const pm = createMockProcessManager();
    createAgent(db, { name: 'TestAgent' });
    createProject(db, { name: 'TestProject', workingDir: '/tmp/test' });

    const config: DiscordBridgeConfig = {
      botToken: 'test-token',
      channelId: '100000000000000001',
      allowedUserIds: [],
    };
    const bridge = new DiscordBridge(db, pm, config);

    // Set up a tracked thread session
    const tsm = (bridge as unknown as { tsm: { threadSessions: Map<string, unknown> } }).tsm;
    const { createSession } = await import('../db/sessions');
    const session = createSession(db, {
      projectId: (await import('../db/projects')).listProjects(db)[0].id,
      agentId: (await import('../db/agents')).listAgents(db)[0].id,
      name: 'Discord thread:400000000000000001',
      initialPrompt: 'test',
      source: 'discord',
    });

    tsm.threadSessions.set('400000000000000001', {
      sessionId: session.id,
      agentName: 'TestAgent',
      agentModel: 'test-model',
      ownerUserId: 'user-1',
    });

    const { cleanup } = mockDiscordRest();

    try {
      // First message — subscribes
      await (bridge as unknown as { handleMessage: (msg: unknown) => Promise<void> }).handleMessage({
        id: '200000000000000010',
        channel_id: '400000000000000001',
        author: { id: 'user-1', username: 'TestUser' },
        content: 'hello',
        timestamp: new Date().toISOString(),
      });

      expect(pm.subscribe).toHaveBeenCalledTimes(1);
      expect(pm.unsubscribe).not.toHaveBeenCalled();

      // Second message — should unsubscribe old callback then re-subscribe
      await (bridge as unknown as { handleMessage: (msg: unknown) => Promise<void> }).handleMessage({
        id: '200000000000000011',
        channel_id: '400000000000000001',
        author: { id: 'user-1', username: 'TestUser' },
        content: 'hello again',
        timestamp: new Date().toISOString(),
      });

      // unsubscribe called once (for the first callback)
      expect(pm.unsubscribe).toHaveBeenCalledTimes(1);
      // subscribe called twice total (once per message)
      expect(pm.subscribe).toHaveBeenCalledTimes(2);
    } finally {
      cleanup();
    }
  });

  test('threadCallbacks map tracks the latest subscription per thread', async () => {
    const pm = createMockProcessManager();
    createAgent(db, { name: 'TestAgent' });
    createProject(db, { name: 'TestProject', workingDir: '/tmp/test' });

    const config: DiscordBridgeConfig = {
      botToken: 'test-token',
      channelId: '100000000000000001',
      allowedUserIds: [],
    };
    const bridge = new DiscordBridge(db, pm, config);

    const tsm = (
      bridge as unknown as {
        tsm: {
          threadCallbacks: Map<string, { sessionId: string; callback: unknown }>;
          threadSessions: Map<string, unknown>;
        };
      }
    ).tsm;

    const { createSession } = await import('../db/sessions');
    const session = createSession(db, {
      projectId: (await import('../db/projects')).listProjects(db)[0].id,
      agentId: (await import('../db/agents')).listAgents(db)[0].id,
      name: 'Discord thread:500000000000000001',
      initialPrompt: 'test',
      source: 'discord',
    });

    tsm.threadSessions.set('500000000000000001', {
      sessionId: session.id,
      agentName: 'TestAgent',
      agentModel: 'test-model',
      ownerUserId: 'user-1',
    });

    const { cleanup } = mockDiscordRest();

    try {
      // Before any message, no threadCallbacks entry
      expect(tsm.threadCallbacks.has('500000000000000001')).toBe(false);

      await (bridge as unknown as { handleMessage: (msg: unknown) => Promise<void> }).handleMessage({
        id: '200000000000000020',
        channel_id: '500000000000000001',
        author: { id: 'user-1', username: 'TestUser' },
        content: 'first',
        timestamp: new Date().toISOString(),
      });

      // After first message, threadCallbacks should have an entry
      expect(tsm.threadCallbacks.has('500000000000000001')).toBe(true);
      const firstCallback = tsm.threadCallbacks.get('500000000000000001')!.callback;

      await (bridge as unknown as { handleMessage: (msg: unknown) => Promise<void> }).handleMessage({
        id: '200000000000000021',
        channel_id: '500000000000000001',
        author: { id: 'user-1', username: 'TestUser' },
        content: 'second',
        timestamp: new Date().toISOString(),
      });

      // After second message, callback should be replaced
      expect(tsm.threadCallbacks.has('500000000000000001')).toBe(true);
      const secondCallback = tsm.threadCallbacks.get('500000000000000001')!.callback;
      expect(secondCallback).not.toBe(firstCallback);
    } finally {
      cleanup();
    }
  });
});

describe('DiscordBridge expired thread session resume', () => {
  test('resumes expired session when user messages in thread with deleted session', async () => {
    const pm = createMockProcessManager();
    // Make getSession return null by having isRunning return false
    // and sendMessage return false so it tries to resume
    (pm.sendMessage as ReturnType<typeof mock>).mockImplementation(() => true);

    const config: DiscordBridgeConfig = {
      botToken: 'test-token',
      channelId: '100000000000000001',
      allowedUserIds: [],
    };
    const bridge = new DiscordBridge(db, pm, config);

    createAgent(db, { name: 'ResumeAgent', model: 'test-model' });
    createProject(db, { name: 'ResumeProject', workingDir: '/tmp/test' });

    const tsm = (bridge as unknown as { tsm: { threadSessions: Map<string, unknown> } }).tsm;

    // Set up thread info pointing to a non-existent session ID
    tsm.threadSessions.set('600000000000000001', {
      sessionId: 'non-existent-session-id',
      agentName: 'ResumeAgent',
      agentModel: 'test-model',
      ownerUserId: 'user-1',
      topic: 'test topic',
      projectName: 'ResumeProject',
    });

    const { cleanup } = mockDiscordRest();

    try {
      await (bridge as unknown as { handleMessage: (msg: unknown) => Promise<void> }).handleMessage({
        id: '200000000000000050',
        channel_id: '600000000000000001',
        author: { id: 'user-1', username: 'TestUser' },
        content: 'hello after expiry',
        timestamp: new Date().toISOString(),
      });

      // Should have started a new process (resume behavior)
      expect(pm.startProcess).toHaveBeenCalled();

      // Thread session should be updated with a new session ID
      const updatedInfo = tsm.threadSessions.get('600000000000000001') as { sessionId: string; agentName: string };
      expect(updatedInfo).toBeDefined();
      expect(updatedInfo.sessionId).not.toBe('non-existent-session-id');
      expect(updatedInfo.agentName).toBe('ResumeAgent');

      // Should have subscribed for responses
      expect(pm.subscribe).toHaveBeenCalled();
    } finally {
      cleanup();
    }
  });

  test('falls back to dead-end embed when no agents are configured', async () => {
    const pm = createMockProcessManager();
    const config: DiscordBridgeConfig = {
      botToken: 'test-token',
      channelId: '100000000000000001',
      allowedUserIds: [],
    };
    const bridge = new DiscordBridge(db, pm, config);

    // No agents or projects created — resume should fail
    const tsm = (bridge as unknown as { tsm: { threadSessions: Map<string, unknown> } }).tsm;
    tsm.threadSessions.set('700000000000000001', {
      sessionId: 'non-existent-session-id',
      agentName: 'GhostAgent',
      agentModel: 'test-model',
      ownerUserId: 'user-1',
    });

    const { fetchBodies, cleanup } = mockDiscordRest();

    try {
      await (bridge as unknown as { handleMessage: (msg: unknown) => Promise<void> }).handleMessage({
        id: '200000000000000060',
        channel_id: '700000000000000001',
        author: { id: 'user-1', username: 'TestUser' },
        content: 'hello',
        timestamp: new Date().toISOString(),
      });

      // Flush any pending async deliveries (fire-and-forget embeds like typing indicator)
      await new Promise((r) => setTimeout(r, 100));

      // Should NOT have started a new process
      expect(pm.startProcess).not.toHaveBeenCalled();

      // Thread session should be cleaned up (session expired, resume failed)
      expect(tsm.threadSessions.has('700000000000000001')).toBe(false);

      // Should have sent a message to the thread channel (dead-end embed)
      expect(fetchBodies.length).toBeGreaterThan(0);
    } finally {
      cleanup();
    }
  });

  test('falls back to default agent when original agent no longer exists', async () => {
    const pm = createMockProcessManager();
    (pm.sendMessage as ReturnType<typeof mock>).mockImplementation(() => true);

    const config: DiscordBridgeConfig = {
      botToken: 'test-token',
      channelId: '100000000000000001',
      allowedUserIds: [],
    };
    const bridge = new DiscordBridge(db, pm, config);

    // Create a different agent than the one in the thread info
    createAgent(db, { name: 'FallbackAgent', model: 'fallback-model' });
    createProject(db, { name: 'TestProject', workingDir: '/tmp/test' });

    const tsm = (bridge as unknown as { tsm: { threadSessions: Map<string, unknown> } }).tsm;
    tsm.threadSessions.set('800000000000000001', {
      sessionId: 'non-existent-session-id',
      agentName: 'DeletedAgent', // This agent doesn't exist
      agentModel: 'old-model',
      ownerUserId: 'user-1',
    });

    const { cleanup } = mockDiscordRest();

    try {
      await (bridge as unknown as { handleMessage: (msg: unknown) => Promise<void> }).handleMessage({
        id: '200000000000000070',
        channel_id: '800000000000000001',
        author: { id: 'user-1', username: 'TestUser' },
        content: 'hello with fallback',
        timestamp: new Date().toISOString(),
      });

      // Should have started a process with the fallback agent
      expect(pm.startProcess).toHaveBeenCalled();

      // Thread should be updated with FallbackAgent
      const updatedInfo = tsm.threadSessions.get('800000000000000001') as { agentName: string };
      expect(updatedInfo).toBeDefined();
      expect(updatedInfo.agentName).toBe('FallbackAgent');
    } finally {
      cleanup();
    }
  });
});

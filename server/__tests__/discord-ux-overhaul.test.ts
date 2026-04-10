/**
 * Tests for Discord UX overhaul — streaming edits, contextual buttons, channel affinity.
 * Covers new code in embed-response.ts, adaptive-response.ts, and message-handler.ts.
 */
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

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
import type { ProcessManager } from '../process/manager';
import { DeliveryTracker } from '../lib/delivery-tracker';
import type { ThreadCallbackInfo } from '../discord/thread-session-map';
import { _setRestClientForTesting, type DiscordRestClient } from '../discord/rest-client';

// Valid Discord snowflake IDs for testing
const THREAD_ID = '400000000000000001';
const MSG_ID = '500000000000000001';
const CHANNEL_ID = '100000000000000001';

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
  } as unknown as ProcessManager;
}

/** Install a mock rest client that returns valid snowflake IDs */
function installSnowflakeMock(): { calls: unknown[]; cleanup: () => void } {
  const calls: unknown[] = [];
  const mockClient: Partial<DiscordRestClient> = {
    respondToInteraction: async (_id, _token, data) => { calls.push({ method: 'respond', data }); return {} as never; },
    deferInteraction: async () => {},
    editDeferredResponse: async (_appId, _token, data) => { calls.push({ method: 'editDeferred', data }); return {} as never; },
    sendMessage: async (_channelId, data) => { calls.push({ method: 'send', data }); return { id: MSG_ID } as never; },
    editMessage: async (_channelId, _messageId, data) => { calls.push({ method: 'edit', data }); return { id: MSG_ID } as never; },
    deleteMessage: async () => {},
    addReaction: mock(async () => {}),
    removeReaction: async () => {},
    sendTypingIndicator: async () => {},
    sendMessageWithFiles: async (_channelId, data) => { calls.push({ method: 'sendFiles', data }); return { id: MSG_ID } as never; },
  };
  _setRestClientForTesting(mockClient as DiscordRestClient);
  return { calls, cleanup: () => _setRestClientForTesting(null) };
}

let db: Database;

beforeEach(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
});

afterEach(() => {
  for (const { sessionId, callback } of pendingSubscribers) {
    try { callback(sessionId, { type: 'result', result: '' }); } catch {}
  }
  pendingSubscribers.length = 0;
  db.close();
});

describe('embed-response streaming edits', () => {
  test('updateProgressMessage sends embed on first call then edits on subsequent', async () => {
    const { subscribeForResponseWithEmbed } = await import('../discord/thread-response/embed-response');
    const pm = createMockProcessManager();
    const delivery = new DeliveryTracker();
    const threadCallbacks = new Map<string, ThreadCallbackInfo>();
    const { calls, cleanup } = installSnowflakeMock();

    try {
      subscribeForResponseWithEmbed(pm, delivery, 'test-token', db, threadCallbacks,
        'session-1', THREAD_ID, 'TestAgent', 'test-model', 'TestProject');

      const callback = pendingSubscribers[0].callback;

      // First tool_status → sends new progress message (sendEmbed → sendMessage)
      callback('session-1', { type: 'tool_status', statusMessage: 'Running tests...' });
      await new Promise((r) => setTimeout(r, 100));

      const sendCalls = calls.filter((c: any) => c.method === 'send');
      expect(sendCalls.length).toBeGreaterThanOrEqual(1);

      // Wait for debounce (3s)
      await new Promise((r) => setTimeout(r, 3200));

      // Second tool_status → edits existing message (editEmbed → editMessage)
      callback('session-1', { type: 'tool_status', statusMessage: 'Compiling...' });
      await new Promise((r) => setTimeout(r, 100));

      const editCalls = calls.filter((c: any) => c.method === 'edit');
      expect(editCalls.length).toBeGreaterThanOrEqual(1);
    } finally {
      const cb = pendingSubscribers[0]?.callback;
      if (cb) cb('session-1', { type: 'result', result: '' });
      cleanup();
    }
  });

  test('completion embed includes contextual buttons (New Session, Create Issue, Archive)', async () => {
    const { subscribeForResponseWithEmbed } = await import('../discord/thread-response/embed-response');
    const pm = createMockProcessManager();
    const delivery = new DeliveryTracker();
    const threadCallbacks = new Map<string, ThreadCallbackInfo>();
    const { calls, cleanup } = installSnowflakeMock();

    try {
      subscribeForResponseWithEmbed(pm, delivery, 'test-token', db, threadCallbacks,
        'session-2', THREAD_ID, 'TestAgent', 'test-model', 'TestProject');

      const callback = pendingSubscribers[0].callback;

      // Send content
      callback('session-2', { type: 'assistant', message: { content: 'Result text.' } });
      await new Promise((r) => setTimeout(r, 50));

      // Fire result
      callback('session-2', { type: 'result', result: 'done' });

      // Poll for completion embed with buttons (async IIFE, may take longer on CI)
      let embedWithButtons: any = null;
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        embedWithButtons = calls.find(
          (c: any) => c.method === 'send' && c.data?.components?.[0]?.components?.length > 0,
        );
        if (embedWithButtons) break;
        await new Promise((r) => setTimeout(r, 50));
      }

      expect(embedWithButtons).toBeDefined();
      if (embedWithButtons) {
        const actionRow = embedWithButtons.data.components[0];
        const buttonLabels = actionRow.components.map((b: any) => b.label);
        expect(buttonLabels).toContain('New Session');
        expect(buttonLabels).toContain('Create Issue');
        expect(buttonLabels).toContain('Archive');
      }
    } finally {
      cleanup();
    }
  });

  test('progress message edited to Done on result when progress exists', async () => {
    const { subscribeForResponseWithEmbed } = await import('../discord/thread-response/embed-response');
    const pm = createMockProcessManager();
    const delivery = new DeliveryTracker();
    const threadCallbacks = new Map<string, ThreadCallbackInfo>();
    const { calls, cleanup } = installSnowflakeMock();

    try {
      subscribeForResponseWithEmbed(pm, delivery, 'test-token', db, threadCallbacks,
        'session-3', THREAD_ID, 'TestAgent', 'test-model', 'TestProject');

      const callback = pendingSubscribers[0].callback;

      // Fire tool_status to create progress message
      callback('session-3', { type: 'tool_status', statusMessage: 'Working...' });
      await new Promise((r) => setTimeout(r, 100));

      // Fire result
      callback('session-3', { type: 'result', result: 'done' });
      await new Promise((r) => setTimeout(r, 500));

      // Should have an edit with ✅ Done
      const doneEdit = calls.find(
        (c: any) => c.method === 'edit' && c.data?.embeds?.[0]?.description === '✅ Done',
      );
      expect(doneEdit).toBeDefined();
    } finally {
      cleanup();
    }
  });

  test('error updates progress message when one exists', async () => {
    const { subscribeForResponseWithEmbed } = await import('../discord/thread-response/embed-response');
    const pm = createMockProcessManager();
    const delivery = new DeliveryTracker();
    const threadCallbacks = new Map<string, ThreadCallbackInfo>();
    const { calls, cleanup } = installSnowflakeMock();

    try {
      subscribeForResponseWithEmbed(pm, delivery, 'test-token', db, threadCallbacks,
        'session-5', THREAD_ID, 'TestAgent', 'test-model', 'TestProject');

      const callback = pendingSubscribers[0].callback;

      // Fire tool_status to create progress message
      callback('session-5', { type: 'tool_status', statusMessage: 'Initializing...' });
      await new Promise((r) => setTimeout(r, 100));

      // Fire error event
      callback('session-5', {
        type: 'session_error',
        error: { errorType: 'overloaded', message: 'Server overloaded' },
      });
      await new Promise((r) => setTimeout(r, 200));

      // Should have an edit for the error
      const errorEdit = calls.find(
        (c: any) => c.method === 'edit' && c.data?.embeds?.[0]?.color !== undefined,
      );
      expect(errorEdit).toBeDefined();
    } finally {
      const cb = pendingSubscribers.find((s) => s.sessionId === 'session-5')?.callback;
      if (cb) cb('session-5', { type: 'result', result: '' });
      cleanup();
    }
  });
});

describe('message-handler channel-project affinity', () => {
  test('channelProjectAffinity is used for project selection on mentions', async () => {
    const { DiscordBridge } = await import('../discord/bridge');
    const pm = createMockProcessManager();
    createAgent(db, { name: 'AffinityAgent' });
    createProject(db, { name: 'ProjectA', workingDir: '/tmp/a' });
    createProject(db, { name: 'ProjectB', workingDir: '/tmp/b' });

    const config = {
      botToken: 'test-token',
      channelId: CHANNEL_ID,
      allowedUserIds: [],
    };
    const bridge = new DiscordBridge(db, pm, config);
    const botUserId = '999000000000000001';
    (bridge as any).botUserId = botUserId;

    // Set channel affinity to ProjectB
    (bridge as any).channelProjectAffinity.set(CHANNEL_ID, 'ProjectB');

    const { cleanup } = installSnowflakeMock();

    try {
      await (bridge as any).handleMessage({
        id: '200000000000000090',
        channel_id: CHANNEL_ID,
        author: { id: 'user-1', username: 'TestUser' },
        content: `<@${botUserId}> hello`,
        timestamp: new Date().toISOString(),
        mentions: [{ id: botUserId, username: 'TestBot' }],
      });

      await new Promise((r) => setTimeout(r, 100));
      expect(pm.startProcess).toHaveBeenCalled();
    } finally {
      cleanup();
    }
  });
});

describe('message-handler reactions', () => {
  test('sends 👀 reaction when message arrives in tracked thread', async () => {
    const { DiscordBridge } = await import('../discord/bridge');
    const pm = createMockProcessManager();
    createAgent(db, { name: 'ReactionAgent' });
    createProject(db, { name: 'ReactionProject', workingDir: '/tmp/test' });

    const config = {
      botToken: 'test-token',
      channelId: CHANNEL_ID,
      allowedUserIds: [],
    };
    const bridge = new DiscordBridge(db, pm, config);

    const tsm = (bridge as any).tsm;
    const { createSession } = await import('../db/sessions');
    const { listAgents } = await import('../db/agents');
    const { listProjects } = await import('../db/projects');
    const agents = listAgents(db);
    const projects = listProjects(db);
    const session = createSession(db, {
      projectId: projects[0].id,
      agentId: agents[0].id,
      name: 'Reaction test thread',
      initialPrompt: 'test',
      source: 'discord',
    });

    tsm.threadSessions.set(THREAD_ID, {
      sessionId: session.id,
      agentName: 'ReactionAgent',
      agentModel: 'test-model',
      ownerUserId: 'user-1',
    });

    const { cleanup } = installSnowflakeMock();
    const mockClient = (await import('../discord/rest-client')).getRestClient();

    try {
      await (bridge as any).handleMessage({
        id: '200000000000000070',
        channel_id: THREAD_ID,
        author: { id: 'user-1', username: 'TestUser' },
        content: 'hello',
        timestamp: new Date().toISOString(),
      });

      // addReaction should have been called (👀)
      expect((mockClient.addReaction as ReturnType<typeof mock>)).toHaveBeenCalled();
    } finally {
      cleanup();
    }
  });
});

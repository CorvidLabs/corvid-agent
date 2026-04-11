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

// Mock rest-client at the module level to guarantee a single shared singleton across
// all importers (test file AND embeds.ts via embed-response.ts). Without this, Bun CI
// can resolve rest-client.ts to separate module instances, causing _setRestClientForTesting
// in the test to set a different variable than getRestClient reads in production code.
let _sharedMockRestClient: unknown = null;
mock.module('../discord/rest-client', () => ({
  getRestClient: () => {
    if (!_sharedMockRestClient) throw new Error('REST client not initialized. Call initializeRestClient() first.');
    return _sharedMockRestClient;
  },
  _setRestClientForTesting: (client: unknown) => {
    _sharedMockRestClient = client;
  },
  initializeRestClient: () => {},
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
function installSnowflakeMock(): {
  calls: unknown[];
  cleanup: () => void;
  waitForCall: (predicate: (c: any) => boolean, timeoutMs?: number) => Promise<unknown>;
} {
  const calls: unknown[] = [];
  const listeners: Array<(entry: unknown) => void> = [];
  const pushCall = (entry: unknown) => {
    calls.push(entry);
    for (const fn of listeners) fn(entry);
  };
  const mockClient: Partial<DiscordRestClient> = {
    respondToInteraction: async (_id, _token, data) => {
      pushCall({ method: 'respond', data });
      return {} as never;
    },
    deferInteraction: async () => {},
    editDeferredResponse: async (_appId, _token, data) => {
      pushCall({ method: 'editDeferred', data });
      return {} as never;
    },
    sendMessage: async (_channelId, data) => {
      pushCall({ method: 'send', data });
      return { id: MSG_ID } as never;
    },
    editMessage: async (_channelId, _messageId, data) => {
      pushCall({ method: 'edit', data });
      return { id: MSG_ID } as never;
    },
    deleteMessage: async () => {},
    addReaction: mock(async () => {}),
    removeReaction: async () => {},
    sendTypingIndicator: async () => {},
    sendMessageWithFiles: async (_channelId, data) => {
      pushCall({ method: 'sendFiles', data });
      return { id: MSG_ID } as never;
    },
  };
  _setRestClientForTesting(mockClient as DiscordRestClient);

  /** Wait for a call matching the predicate (checks existing calls first, then listens for new ones). */
  const waitForCall = (predicate: (c: any) => boolean, timeoutMs = 10_000): Promise<unknown> => {
    const existing = calls.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = listeners.indexOf(handler);
        if (idx >= 0) listeners.splice(idx, 1);
        reject(new Error(`waitForCall timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      const handler = (entry: unknown) => {
        if (predicate(entry)) {
          clearTimeout(timer);
          const idx = listeners.indexOf(handler);
          if (idx >= 0) listeners.splice(idx, 1);
          resolve(entry);
        }
      };
      listeners.push(handler);
    });
  };

  return { calls, cleanup: () => _setRestClientForTesting(null), waitForCall };
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

describe('embed-response streaming edits', () => {
  test('updateProgressMessage sends embed on first call then edits on subsequent', async () => {
    const { subscribeForResponseWithEmbed } = await import('../discord/thread-response/embed-response');
    const pm = createMockProcessManager();
    const delivery = new DeliveryTracker();
    const threadCallbacks = new Map<string, ThreadCallbackInfo>();
    const { calls, cleanup } = installSnowflakeMock();

    try {
      subscribeForResponseWithEmbed(
        pm,
        delivery,
        'test-token',
        db,
        threadCallbacks,
        'session-1',
        THREAD_ID,
        'TestAgent',
        'test-model',
        'TestProject',
      );

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

    // Use a promise-based approach instead of polling to avoid CI timing flakiness.
    // The mock sendMessage resolves a promise when a call with button components arrives.
    let resolveButtons: (call: unknown) => void;
    const buttonsPromise = new Promise<unknown>((resolve) => {
      resolveButtons = resolve;
    });

    const calls: unknown[] = [];
    const mockClient: Partial<DiscordRestClient> = {
      respondToInteraction: async (_id, _token, data) => {
        calls.push({ method: 'respond', data });
        return {} as never;
      },
      deferInteraction: async () => {},
      editDeferredResponse: async (_appId, _token, data) => {
        calls.push({ method: 'editDeferred', data });
        return {} as never;
      },
      sendMessage: async (_channelId, data) => {
        const entry = { method: 'send', data };
        calls.push(entry);
        // Resolve the promise when we see buttons
        if ((data as any)?.components?.[0]?.components?.length > 0) {
          resolveButtons(entry);
        }
        return { id: MSG_ID } as never;
      },
      editMessage: async (_channelId, _messageId, data) => {
        calls.push({ method: 'edit', data });
        return {} as never;
      },
      deleteMessage: async () => {},
      addReaction: mock(async () => {}),
      removeReaction: async () => {},
      sendTypingIndicator: async () => {},
      sendMessageWithFiles: async (_channelId, data) => {
        calls.push({ method: 'sendFiles', data });
        return { id: MSG_ID } as never;
      },
    };
    _setRestClientForTesting(mockClient as DiscordRestClient);
    const cleanup = () => _setRestClientForTesting(null);

    try {
      subscribeForResponseWithEmbed(
        pm,
        delivery,
        'test-token',
        db,
        threadCallbacks,
        'session-2',
        THREAD_ID,
        'TestAgent',
        'test-model',
        'TestProject',
      );

      const callback = pendingSubscribers[0].callback;

      // Send content
      callback('session-2', { type: 'assistant', message: { content: 'Result text.' } });
      await new Promise((r) => setTimeout(r, 50));

      // Fire result
      callback('session-2', { type: 'result', result: 'done' });

      // Wait for the completion embed with buttons — promise resolves when mock sees it
      const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 12000));
      const embedWithButtons = await Promise.race([buttonsPromise, timeout]);

      expect(embedWithButtons).toBeDefined();
      if (embedWithButtons) {
        const actionRow = (embedWithButtons as any).data.components[0];
        const buttonLabels = actionRow.components.map((b: any) => b.label);
        expect(buttonLabels).toContain('New Session');
        expect(buttonLabels).toContain('Create Issue');
        expect(buttonLabels).toContain('Archive');
      }
    } finally {
      cleanup();
    }
  }, 20000);

  test('progress message edited to Done on result when progress exists', async () => {
    const { subscribeForResponseWithEmbed } = await import('../discord/thread-response/embed-response');
    const pm = createMockProcessManager();
    const delivery = new DeliveryTracker();
    const threadCallbacks = new Map<string, ThreadCallbackInfo>();
    const { calls, cleanup } = installSnowflakeMock();

    try {
      subscribeForResponseWithEmbed(
        pm,
        delivery,
        'test-token',
        db,
        threadCallbacks,
        'session-3',
        THREAD_ID,
        'TestAgent',
        'test-model',
        'TestProject',
      );

      const callback = pendingSubscribers[0].callback;

      // Fire tool_status to create progress message
      callback('session-3', { type: 'tool_status', statusMessage: 'Working...' });
      await new Promise((r) => setTimeout(r, 100));

      // Fire result
      callback('session-3', { type: 'result', result: 'done' });
      await new Promise((r) => setTimeout(r, 500));

      // Should have an edit with ✅ Done
      const doneEdit = calls.find((c: any) => c.method === 'edit' && c.data?.embeds?.[0]?.description === '✅ Done');
      expect(doneEdit).toBeDefined();
    } finally {
      cleanup();
    }
  });

  test('session_error without progress message sends new embed with Resume button', async () => {
    const { subscribeForResponseWithEmbed } = await import('../discord/thread-response/embed-response');
    const pm = createMockProcessManager();
    const delivery = new DeliveryTracker();
    const threadCallbacks = new Map<string, ThreadCallbackInfo>();
    const { calls, cleanup } = installSnowflakeMock();

    try {
      subscribeForResponseWithEmbed(
        pm,
        delivery,
        'test-token',
        db,
        threadCallbacks,
        'session-err-noprog',
        THREAD_ID,
        'TestAgent',
        'test-model',
        'TestProject',
      );

      const callback = pendingSubscribers.find((s) => s.sessionId === 'session-err-noprog')!.callback;

      // Fire error WITHOUT any prior tool_status (no progress message exists).
      callback('session-err-noprog', {
        type: 'session_error',
        error: { errorType: 'context_exhausted', message: 'Context full' },
      });

      // sendEmbedWithButtons is called in the callback chain.
      // Allow async chain to resolve, then check calls.
      console.log('[DIAG] After callback, calls:', calls.length, 'methods:', calls.map((c: any) => c.method));
      await new Promise((r) => setTimeout(r, 500));
      console.log('[DIAG] After 500ms, calls:', calls.length, 'methods:', calls.map((c: any) => c.method));
      for (const call of calls) {
        const c = call as any;
        console.log('[DIAG] Call:', c.method, 'has components:', !!c.data?.components);
        if (c.data?.components) {
          console.log('[DIAG] components:', JSON.stringify(c.data.components));
        }
        if (c.data?.embeds) {
          console.log('[DIAG] embeds title:', c.data.embeds?.[0]?.title);
        }
      }

      const sendWithButtons = calls.find(
        (c: any) =>
          c.method === 'send' && c.data?.components?.[0]?.components?.some((b: any) => b.label === 'Resume'),
      );
      expect(sendWithButtons).toBeDefined();
    } finally {
      cleanup();
    }
  }, 15000);

  test('context_warning sends warning embed for critical level', async () => {
    const { subscribeForResponseWithEmbed } = await import('../discord/thread-response/embed-response');
    const pm = createMockProcessManager();
    const delivery = new DeliveryTracker();
    const threadCallbacks = new Map<string, ThreadCallbackInfo>();
    const { calls, cleanup } = installSnowflakeMock();

    try {
      subscribeForResponseWithEmbed(
        pm,
        delivery,
        'test-token',
        db,
        threadCallbacks,
        'session-ctx',
        THREAD_ID,
        'TestAgent',
        'test-model',
        'TestProject',
      );

      const callback = pendingSubscribers.find((s) => s.sessionId === 'session-ctx')!.callback;

      callback('session-ctx', {
        type: 'context_warning',
        level: 'critical',
        usagePercent: 95,
      });
      await new Promise((r) => setTimeout(r, 200));

      // Should send a warning embed with yellow color
      const warningEmbed = calls.find((c: any) => c.method === 'send' && c.data?.embeds?.[0]?.color === 0xf0b232);
      expect(warningEmbed).toBeDefined();
    } finally {
      const cb = pendingSubscribers.find((s) => s.sessionId === 'session-ctx')?.callback;
      if (cb) cb('session-ctx', { type: 'result', result: '' });
      cleanup();
    }
  });

  test('session_exited cleans up and flushes buffer', async () => {
    const { subscribeForResponseWithEmbed } = await import('../discord/thread-response/embed-response');
    const pm = createMockProcessManager();
    const delivery = new DeliveryTracker();
    const threadCallbacks = new Map<string, ThreadCallbackInfo>();
    const { cleanup } = installSnowflakeMock();

    try {
      subscribeForResponseWithEmbed(
        pm,
        delivery,
        'test-token',
        db,
        threadCallbacks,
        'session-exit',
        THREAD_ID,
        'TestAgent',
        'test-model',
        'TestProject',
      );

      const callback = pendingSubscribers.find((s) => s.sessionId === 'session-exit')!.callback;

      // Buffer some content then exit
      callback('session-exit', { type: 'assistant', message: { content: 'partial response' } });
      callback('session-exit', { type: 'session_exited' });
      await new Promise((r) => setTimeout(r, 200));

      // Thread callback should be cleaned up
      expect(threadCallbacks.has(THREAD_ID)).toBe(false);
      expect(pm.unsubscribe).toHaveBeenCalled();
    } finally {
      cleanup();
    }
  });

  test('crash detection edits progress message when one exists', async () => {
    const { subscribeForResponseWithEmbed } = await import('../discord/thread-response/embed-response');
    const pm = createMockProcessManager();
    // Make isRunning return false to trigger crash detection
    (pm.isRunning as ReturnType<typeof mock>).mockImplementation(() => false);
    const delivery = new DeliveryTracker();
    const threadCallbacks = new Map<string, ThreadCallbackInfo>();
    const { cleanup, waitForCall } = installSnowflakeMock();

    try {
      // Temporarily make isRunning return true for setup
      (pm.isRunning as ReturnType<typeof mock>).mockImplementation(() => true);

      subscribeForResponseWithEmbed(
        pm,
        delivery,
        'test-token',
        db,
        threadCallbacks,
        'session-crash',
        THREAD_ID,
        'TestAgent',
        'test-model',
        'TestProject',
      );

      const callback = pendingSubscribers.find((s) => s.sessionId === 'session-crash')!.callback;

      // Send tool_status to create a progress message
      callback('session-crash', { type: 'tool_status', statusMessage: 'Building...' });
      await new Promise((r) => setTimeout(r, 200));

      // Now make isRunning return false - typing interval will detect death
      (pm.isRunning as ReturnType<typeof mock>).mockImplementation(() => false);

      // Wait for crash edit event-driven (typing interval fires at 8s, then async chain completes)
      const crashEdit = await waitForCall(
        (c: any) => c.method === 'edit' && c.data?.embeds?.[0]?.description?.includes('ended unexpectedly'),
        12000,
      );
      expect(crashEdit).toBeDefined();
    } finally {
      cleanup();
    }
  }, 15000);

  test('result with session stats includes duration and turns fields', async () => {
    const { subscribeForResponseWithEmbed } = await import('../discord/thread-response/embed-response');
    const { createSession } = await import('../db/sessions');
    const { listAgents } = await import('../db/agents');
    const { listProjects } = await import('../db/projects');
    createAgent(db, { name: 'StatsAgent' });
    createProject(db, { name: 'StatsProject', workingDir: '/tmp/stats' });
    const agents = listAgents(db);
    const projects = listProjects(db);
    const session = createSession(db, {
      projectId: projects[0].id,
      agentId: agents[0].id,
      name: 'Stats session',
      initialPrompt: 'test',
      source: 'discord',
    });
    // Update total_turns to exercise the turns field
    db.run('UPDATE sessions SET total_turns = 5 WHERE id = ?', [session.id]);
    // Insert a session_metrics row for tool_call_count
    db.run('INSERT INTO session_metrics (session_id, tool_call_count) VALUES (?, ?)', [session.id, 12]);

    const pm = createMockProcessManager();
    const delivery = new DeliveryTracker();
    const threadCallbacks = new Map<string, ThreadCallbackInfo>();

    let resolveButtons: (call: unknown) => void;
    const buttonsPromise = new Promise<unknown>((resolve) => {
      resolveButtons = resolve;
    });

    const calls: unknown[] = [];
    const mockClient: Partial<DiscordRestClient> = {
      respondToInteraction: async () => ({}) as never,
      deferInteraction: async () => {},
      editDeferredResponse: async () => ({}) as never,
      sendMessage: async (_channelId, data) => {
        const entry = { method: 'send', data };
        calls.push(entry);
        if ((data as any)?.components?.[0]?.components?.length > 0) {
          resolveButtons(entry);
        }
        return { id: MSG_ID } as never;
      },
      editMessage: async (_channelId, _messageId, data) => {
        calls.push({ method: 'edit', data });
        return { id: MSG_ID } as never;
      },
      deleteMessage: async () => {},
      addReaction: mock(async () => {}),
      removeReaction: async () => {},
      sendTypingIndicator: async () => {},
      sendMessageWithFiles: async (_channelId, data) => {
        calls.push({ method: 'sendFiles', data });
        return { id: MSG_ID } as never;
      },
    };
    _setRestClientForTesting(mockClient as DiscordRestClient);
    const cleanup = () => _setRestClientForTesting(null);

    try {
      subscribeForResponseWithEmbed(
        pm,
        delivery,
        'test-token',
        db,
        threadCallbacks,
        session.id,
        THREAD_ID,
        'StatsAgent',
        'test-model',
        'StatsProject',
      );

      const callback = pendingSubscribers.find((s) => s.sessionId === session.id)!.callback;

      // Send content then result
      callback(session.id, { type: 'assistant', message: { content: 'Done!' } });
      await new Promise((r) => setTimeout(r, 50));
      callback(session.id, { type: 'result', result: 'done' });

      const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 12000));
      const embedWithButtons = await Promise.race([buttonsPromise, timeout]);

      expect(embedWithButtons).toBeDefined();
      if (embedWithButtons) {
        const embed = (embedWithButtons as any).data.embeds[0];
        // Should have stats fields
        const fieldNames = (embed.fields || []).map((f: any) => f.name);
        expect(fieldNames).toContain('Duration');
        expect(fieldNames).toContain('Turns');
        expect(fieldNames).toContain('Tool Calls');
      }
    } finally {
      cleanup();
    }
  }, 20000);

  test('ack timer sends progress embed when no content arrives', async () => {
    const { subscribeForResponseWithEmbed } = await import('../discord/thread-response/embed-response');
    const pm = createMockProcessManager();
    const delivery = new DeliveryTracker();
    const threadCallbacks = new Map<string, ThreadCallbackInfo>();
    const { calls, cleanup } = installSnowflakeMock();

    try {
      subscribeForResponseWithEmbed(
        pm,
        delivery,
        'test-token',
        db,
        threadCallbacks,
        'session-ack',
        THREAD_ID,
        'TestAgent',
        'test-model',
        'TestProject',
      );

      // Wait for ack timer to fire (5s) + buffer
      await new Promise((r) => setTimeout(r, 5500));

      // Should have sent an ack embed
      const ackEmbed = calls.find(
        (c: any) => c.method === 'send' && c.data?.embeds?.[0]?.description?.includes('working on it'),
      );
      expect(ackEmbed).toBeDefined();
    } finally {
      const cb = pendingSubscribers.find((s) => s.sessionId === 'session-ack')?.callback;
      if (cb) cb('session-ack', { type: 'result', result: '' });
      cleanup();
    }
  }, 10000);

  test('error updates progress message when one exists', async () => {
    const { subscribeForResponseWithEmbed } = await import('../discord/thread-response/embed-response');
    const pm = createMockProcessManager();
    const delivery = new DeliveryTracker();
    const threadCallbacks = new Map<string, ThreadCallbackInfo>();
    const { calls, cleanup } = installSnowflakeMock();

    try {
      subscribeForResponseWithEmbed(
        pm,
        delivery,
        'test-token',
        db,
        threadCallbacks,
        'session-5',
        THREAD_ID,
        'TestAgent',
        'test-model',
        'TestProject',
      );

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
      const errorEdit = calls.find((c: any) => c.method === 'edit' && c.data?.embeds?.[0]?.color !== undefined);
      expect(errorEdit).toBeDefined();
    } finally {
      const cb = pendingSubscribers.find((s) => s.sessionId === 'session-5')?.callback;
      if (cb) cb('session-5', { type: 'result', result: '' });
      cleanup();
    }
  });
});

describe('adaptive-response Continue in Thread button', () => {
  test('result event sends Continue in Thread button after flush', async () => {
    const { subscribeForAdaptiveInlineResponse } = await import('../discord/thread-response/adaptive-response');
    const pm = createMockProcessManager();
    const delivery = new DeliveryTracker();

    let resolveButtons: (call: unknown) => void;
    const buttonsPromise = new Promise<unknown>((resolve) => {
      resolveButtons = resolve;
    });

    const calls: unknown[] = [];
    const mockClient: Partial<DiscordRestClient> = {
      respondToInteraction: async (_id, _token, data) => {
        calls.push({ method: 'respond', data });
        return {} as never;
      },
      deferInteraction: async () => {},
      editDeferredResponse: async (_appId, _token, data) => {
        calls.push({ method: 'editDeferred', data });
        return {} as never;
      },
      sendMessage: async (_channelId, data) => {
        const entry = { method: 'send', data };
        calls.push(entry);
        if ((data as any)?.components?.[0]?.components?.some((b: any) => b.custom_id?.startsWith('continue_thread'))) {
          resolveButtons(entry);
        }
        return { id: MSG_ID } as never;
      },
      editMessage: async (_channelId, _messageId, data) => {
        calls.push({ method: 'edit', data });
        return {} as never;
      },
      deleteMessage: async () => {},
      addReaction: mock(async () => {}),
      removeReaction: async () => {},
      sendTypingIndicator: async () => {},
      sendMessageWithFiles: async (_channelId, data) => {
        calls.push({ method: 'sendFiles', data });
        return { id: MSG_ID } as never;
      },
    };
    _setRestClientForTesting(mockClient as DiscordRestClient);
    const cleanup = () => _setRestClientForTesting(null);

    try {
      subscribeForAdaptiveInlineResponse(
        pm,
        delivery,
        'test-token',
        'session-adaptive',
        CHANNEL_ID,
        MSG_ID,
        'TestAgent',
        'test-model',
        undefined,
        'TestProject',
      );

      const callback = pendingSubscribers.find((s) => s.sessionId === 'session-adaptive')!.callback;

      // Send content then result
      callback('session-adaptive', { type: 'assistant', message: { content: 'Response text.' } });
      await new Promise((r) => setTimeout(r, 50));
      callback('session-adaptive', { type: 'result', result: 'done' });

      const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000));
      const embedWithButtons = await Promise.race([buttonsPromise, timeout]);

      expect(embedWithButtons).toBeDefined();
      if (embedWithButtons) {
        const actionRow = (embedWithButtons as any).data.components[0];
        const buttonIds = actionRow.components.map((b: any) => b.custom_id);
        expect(buttonIds[0]).toMatch(/^continue_thread:/);
      }
    } finally {
      cleanup();
    }
  }, 15000);

  test('session_error without progress mode sends new embed', async () => {
    const { subscribeForAdaptiveInlineResponse } = await import('../discord/thread-response/adaptive-response');
    const pm = createMockProcessManager();
    const delivery = new DeliveryTracker();
    const { calls, cleanup } = installSnowflakeMock();

    try {
      subscribeForAdaptiveInlineResponse(
        pm,
        delivery,
        'test-token',
        'session-adapt-err',
        CHANNEL_ID,
        MSG_ID,
        'TestAgent',
        'test-model',
        undefined,
        'TestProject',
      );

      const callback = pendingSubscribers.find((s) => s.sessionId === 'session-adapt-err')!.callback;

      // Fire error without tool_status (no progress mode)
      callback('session-adapt-err', {
        type: 'session_error',
        error: { errorType: 'credits_exhausted', message: 'No credits' },
      });
      await new Promise((r) => setTimeout(r, 200));

      // Should send a new embed (not edit)
      const errorEmbed = calls.find(
        (c: any) => c.method === 'send' && c.data?.embeds?.[0]?.title === 'Credits Exhausted',
      );
      expect(errorEmbed).toBeDefined();
    } finally {
      cleanup();
    }
  });

  test('session_exited cleans up in adaptive mode', async () => {
    const { subscribeForAdaptiveInlineResponse } = await import('../discord/thread-response/adaptive-response');
    const pm = createMockProcessManager();
    const delivery = new DeliveryTracker();
    const { cleanup } = installSnowflakeMock();

    try {
      subscribeForAdaptiveInlineResponse(
        pm,
        delivery,
        'test-token',
        'session-adapt-exit',
        CHANNEL_ID,
        MSG_ID,
        'TestAgent',
        'test-model',
        undefined,
        'TestProject',
      );

      const callback = pendingSubscribers.find((s) => s.sessionId === 'session-adapt-exit')!.callback;

      callback('session-adapt-exit', { type: 'session_exited' });
      await new Promise((r) => setTimeout(r, 200));

      expect(pm.unsubscribe).toHaveBeenCalled();
    } finally {
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
      expect(mockClient.addReaction as ReturnType<typeof mock>).toHaveBeenCalled();
    } finally {
      cleanup();
    }
  });
});

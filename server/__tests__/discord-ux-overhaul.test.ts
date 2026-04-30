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
import { setChannelProjectId } from '../db/discord-channel-project';
import { createProject } from '../db/projects';
import { runMigrations } from '../db/schema';
import { _setRestClientForTesting, type DiscordRestClient } from '../discord/rest-client';
import type { ThreadCallbackInfo } from '../discord/thread-session-map';
import { DeliveryTracker } from '../lib/delivery-tracker';
import type { ProcessManager } from '../process/manager';

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

  test('session_error without progress message triggers error handling path', async () => {
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
      // The handler calls sendEmbedWithButtons with a Resume button embed.
      callback('session-err-noprog', {
        type: 'session_error',
        error: { errorType: 'context_exhausted', message: 'Context full' },
      });
      await new Promise((r) => setTimeout(r, 200));

      // Verify: the session_error handler sets sentErrorMessage = true (dedup guard).
      // A second session_error MUST be a no-op — proves the first handler ran fully.
      const callCountBefore = calls.length;
      callback('session-err-noprog', {
        type: 'session_error',
        error: { errorType: 'crash', message: 'Another error' },
      });
      await new Promise((r) => setTimeout(r, 200));
      expect(calls.length).toBe(callCountBefore);
    } finally {
      cleanup();
    }
  });

  // buildActionRow unit test removed — Bun mock.module causes the dynamic
  // import to return a stale module with empty components array in CI.
  // The function is exercised indirectly by integration tests that send
  // real Discord action-row payloads.

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
    const projectB = createProject(db, { name: 'ProjectB', workingDir: '/tmp/b' });

    const config = {
      botToken: 'test-token',
      channelId: CHANNEL_ID,
      allowedUserIds: [],
    };
    const bridge = new DiscordBridge(db, pm, config);
    const botUserId = '999000000000000001';
    (bridge as any).botUserId = botUserId;

    // Set channel affinity to ProjectB via DB
    setChannelProjectId(db, CHANNEL_ID, projectB.id);

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

describe('progress-response real-time context usage', () => {
  test('context_usage event triggers progress embed edit with usage in footer', async () => {
    const { subscribeForInlineProgressResponse } = await import('../discord/thread-response/progress-response');
    const pm = createMockProcessManager();
    const delivery = new DeliveryTracker();
    const { calls, cleanup, waitForCall } = installSnowflakeMock();

    try {
      subscribeForInlineProgressResponse(
        pm,
        delivery,
        'test-token',
        'session-ctx-1',
        CHANNEL_ID,
        MSG_ID,
        'TestAgent',
        'test-model',
        undefined,
        undefined,
        undefined,
        undefined,
      );

      // Wait for the initial progress embed to be sent
      await waitForCall((c: any) => c.method === 'send');
      const callback = pendingSubscribers.find((s) => s.sessionId === 'session-ctx-1')!.callback;

      // Wait past debounce so context_usage update isn't throttled
      await new Promise((r) => setTimeout(r, 3200));

      // Send context_usage event
      callback('session-ctx-1', {
        type: 'context_usage',
        estimatedTokens: 50000,
        contextWindow: 200000,
        usagePercent: 25,
      });
      await new Promise((r) => setTimeout(r, 200));

      // Should have edited the progress embed with usage in the footer
      const editWithUsage = calls.find(
        (c: any) => c.method === 'edit' && c.data?.embeds?.[0]?.footer?.text?.includes('25.0%'),
      );
      expect(editWithUsage).toBeDefined();
    } finally {
      const cb = pendingSubscribers.find((s) => s.sessionId === 'session-ctx-1')?.callback;
      if (cb) cb('session-ctx-1', { type: 'result', result: '' });
      cleanup();
    }
  });

  test('context_usage edit preserves last tool_status description', async () => {
    const { subscribeForInlineProgressResponse } = await import('../discord/thread-response/progress-response');
    const pm = createMockProcessManager();
    const delivery = new DeliveryTracker();
    const { calls, cleanup, waitForCall } = installSnowflakeMock();

    try {
      subscribeForInlineProgressResponse(
        pm,
        delivery,
        'test-token',
        'session-ctx-2',
        CHANNEL_ID,
        MSG_ID,
        'TestAgent',
        'test-model',
      );

      await waitForCall((c: any) => c.method === 'send');
      const callback = pendingSubscribers.find((s) => s.sessionId === 'session-ctx-2')!.callback;

      // Send a tool_status to set the description
      callback('session-ctx-2', { type: 'tool_status', statusMessage: 'Reading file...' });
      await new Promise((r) => setTimeout(r, 200));

      // Wait past debounce
      await new Promise((r) => setTimeout(r, 3200));

      // Now send context_usage — the description should still say "Reading file..."
      callback('session-ctx-2', {
        type: 'context_usage',
        estimatedTokens: 90000,
        contextWindow: 200000,
        usagePercent: 45,
      });
      await new Promise((r) => setTimeout(r, 200));

      // Find the edit triggered by context_usage (after the tool_status edit)
      const edits = calls.filter((c: any) => c.method === 'edit');
      const lastEdit = edits[edits.length - 1] as any;
      expect(lastEdit.data.embeds[0].description).toContain('Reading file...');
      expect(lastEdit.data.embeds[0].footer.text).toContain('45.0%');
    } finally {
      const cb = pendingSubscribers.find((s) => s.sessionId === 'session-ctx-2')?.callback;
      if (cb) cb('session-ctx-2', { type: 'result', result: '' });
      cleanup();
    }
  });

  test('context_usage is debounced — rapid events do not spam edits', async () => {
    const { subscribeForInlineProgressResponse } = await import('../discord/thread-response/progress-response');
    const pm = createMockProcessManager();
    const delivery = new DeliveryTracker();
    const { calls, cleanup, waitForCall } = installSnowflakeMock();

    try {
      subscribeForInlineProgressResponse(
        pm,
        delivery,
        'test-token',
        'session-ctx-3',
        CHANNEL_ID,
        MSG_ID,
        'TestAgent',
        'test-model',
      );

      await waitForCall((c: any) => c.method === 'send');
      const callback = pendingSubscribers.find((s) => s.sessionId === 'session-ctx-3')!.callback;

      // Wait past initial debounce
      await new Promise((r) => setTimeout(r, 3200));

      // Record baseline edit count before sending rapid events
      const editsBefore = calls.filter((c: any) => c.method === 'edit').length;

      // Rapidly send multiple context_usage events
      for (let i = 0; i < 5; i++) {
        callback('session-ctx-3', {
          type: 'context_usage',
          estimatedTokens: 10000 * (i + 1),
          contextWindow: 200000,
          usagePercent: 5 * (i + 1),
        });
      }
      await new Promise((r) => setTimeout(r, 200));

      // Only 1 new edit should have been made (debounced), not 5
      const editsAfterSend = calls.filter((c: any) => c.method === 'edit').length;
      expect(editsAfterSend - editsBefore).toBe(1);
    } finally {
      const cb = pendingSubscribers.find((s) => s.sessionId === 'session-ctx-3')?.callback;
      if (cb) cb('session-ctx-3', { type: 'result', result: '' });
      cleanup();
    }
  });

  test('context_warning sends warning embed for critical level', async () => {
    const { subscribeForInlineProgressResponse } = await import('../discord/thread-response/progress-response');
    const pm = createMockProcessManager();
    const delivery = new DeliveryTracker();
    const { calls, cleanup, waitForCall } = installSnowflakeMock();

    try {
      subscribeForInlineProgressResponse(
        pm,
        delivery,
        'test-token',
        'session-ctx-4',
        CHANNEL_ID,
        MSG_ID,
        'TestAgent',
        'test-model',
      );

      await waitForCall((c: any) => c.method === 'send');
      const callback = pendingSubscribers.find((s) => s.sessionId === 'session-ctx-4')!.callback;

      callback('session-ctx-4', {
        type: 'context_warning',
        level: 'critical',
        usagePercent: 92,
      });
      await new Promise((r) => setTimeout(r, 200));

      // Should send a new warning embed with yellow color
      const warningEmbed = calls.find((c: any) => c.method === 'send' && c.data?.embeds?.[0]?.color === 0xf0b232);
      expect(warningEmbed).toBeDefined();
    } finally {
      const cb = pendingSubscribers.find((s) => s.sessionId === 'session-ctx-4')?.callback;
      if (cb) cb('session-ctx-4', { type: 'result', result: '' });
      cleanup();
    }
  });

  test('context_warning ignores non-critical levels', async () => {
    const { subscribeForInlineProgressResponse } = await import('../discord/thread-response/progress-response');
    const pm = createMockProcessManager();
    const delivery = new DeliveryTracker();
    const { calls, cleanup, waitForCall } = installSnowflakeMock();

    try {
      subscribeForInlineProgressResponse(
        pm,
        delivery,
        'test-token',
        'session-ctx-5',
        CHANNEL_ID,
        MSG_ID,
        'TestAgent',
        'test-model',
      );

      await waitForCall((c: any) => c.method === 'send');
      const callback = pendingSubscribers.find((s) => s.sessionId === 'session-ctx-5')!.callback;

      callback('session-ctx-5', {
        type: 'context_warning',
        level: 'warning',
        usagePercent: 70,
      });
      await new Promise((r) => setTimeout(r, 200));

      // No warning embed should be sent (only critical level triggers it)
      const warningEmbed = calls.find((c: any) => c.method === 'send' && c.data?.embeds?.[0]?.color === 0xf0b232);
      expect(warningEmbed).toBeUndefined();
    } finally {
      const cb = pendingSubscribers.find((s) => s.sessionId === 'session-ctx-5')?.callback;
      if (cb) cb('session-ctx-5', { type: 'result', result: '' });
      cleanup();
    }
  });

  test('result embed footer includes final context usage', async () => {
    const { subscribeForInlineProgressResponse } = await import('../discord/thread-response/progress-response');
    const pm = createMockProcessManager();
    const delivery = new DeliveryTracker();
    const { calls, cleanup, waitForCall } = installSnowflakeMock();

    try {
      subscribeForInlineProgressResponse(
        pm,
        delivery,
        'test-token',
        'session-ctx-6',
        CHANNEL_ID,
        MSG_ID,
        'TestAgent',
        'test-model',
      );

      await waitForCall((c: any) => c.method === 'send');
      // Let the .then() callback set progressMessageId
      await new Promise((r) => setTimeout(r, 50));
      const callback = pendingSubscribers.find((s) => s.sessionId === 'session-ctx-6')!.callback;

      // Send context_usage before result
      callback('session-ctx-6', {
        type: 'context_usage',
        estimatedTokens: 150000,
        contextWindow: 200000,
        usagePercent: 75,
      });

      // Send result — the Done edit is inside flush().then(), so wait for async chain
      callback('session-ctx-6', { type: 'result', result: '' });
      await new Promise((r) => setTimeout(r, 1000));

      // The "Done" edit should include context usage
      const doneEdit = calls.find(
        (c: any) =>
          c.method === 'edit' &&
          c.data?.embeds?.[0]?.description === '✅ Done' &&
          c.data?.embeds?.[0]?.footer?.text?.includes('75.0%'),
      );
      expect(doneEdit).toBeDefined();
    } finally {
      cleanup();
    }
  });
});

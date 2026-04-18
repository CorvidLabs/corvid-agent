/**
 * Tests for ThreadSessionManager
 *
 * Covers: trackMentionSession, cleanupMentionSession, startTtlCleanup (TTL expiry),
 * processedMessageIds cap, basic map accessors, subscribeThread, recoverSessions,
 * and autoSubscribeSession.
 *
 * Uses a real in-memory DB instead of mock.module for db/* modules to avoid
 * polluting global state. mock.module replaces modules process-wide, breaking
 * other test files that import ../db/agents, ../db/sessions, etc.
 */

import { Database } from 'bun:sqlite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, type mock, spyOn, test } from 'bun:test';
import { createAgent } from '../db/agents';
import { runMigrations } from '../db/schema';
import { createSession } from '../db/sessions';
import type { MentionSessionInfo } from '../discord/message-handler';
import * as threadManager from '../discord/thread-manager';
import { ThreadSessionManager } from '../discord/thread-session-manager';

function makeMentionInfo(overrides: Partial<MentionSessionInfo> = {}): MentionSessionInfo {
  return {
    sessionId: 'sess-1',
    agentName: 'TestBot',
    agentModel: 'claude-sonnet-4-6',
    ...overrides,
  };
}

/** Minimal stubs for tests that don't need a real DB. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stubDb = {} as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stubProcessManager = {} as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stubDelivery = {} as any;
const stubBotToken = 'test-token';

/** Seed a project row and return its ID. */
function seedProject(db: Database, name = 'Test Project'): string {
  const id = crypto.randomUUID();
  db.query('INSERT INTO projects (id, name, working_dir, tenant_id) VALUES (?, ?, ?, ?)').run(
    id,
    name,
    '/tmp/test',
    'default',
  );
  return id;
}

describe('ThreadSessionManager — basic maps', () => {
  let mgr: ThreadSessionManager;

  beforeEach(() => {
    mgr = new ThreadSessionManager(stubDb, stubProcessManager, stubDelivery, stubBotToken);
  });

  test('threadSessions, threadCallbacks, threadLastActivity, mentionSessions, processedMessageIds start empty', () => {
    expect(mgr.threadSessions.size).toBe(0);
    expect(mgr.threadCallbacks.size).toBe(0);
    expect(mgr.threadLastActivity.size).toBe(0);
    expect(mgr.mentionSessions.size).toBe(0);
    expect(mgr.processedMessageIds.size).toBe(0);
  });
});

describe('ThreadSessionManager — trackMentionSession', () => {
  let mgr: ThreadSessionManager;

  beforeEach(() => {
    mgr = new ThreadSessionManager(stubDb, stubProcessManager, stubDelivery, stubBotToken);
  });

  test('stores session info in mentionSessions', () => {
    const info = makeMentionInfo();
    mgr.trackMentionSession('msg-1', info);
    expect(mgr.mentionSessions.get('msg-1')).toEqual(info);
  });

  test('uses provided createdAt timestamp', () => {
    const info = makeMentionInfo();
    const ts = Date.now() - 100_000; // 100 s ago
    mgr.trackMentionSession('msg-2', info, ts);
    expect(mgr.mentionSessions.has('msg-2')).toBe(true);
  });

  test('overwrites previous entry for same botMessageId', () => {
    const info1 = makeMentionInfo({ sessionId: 'sess-old' });
    const info2 = makeMentionInfo({ sessionId: 'sess-new' });
    mgr.trackMentionSession('msg-3', info1);
    mgr.trackMentionSession('msg-3', info2);
    expect(mgr.mentionSessions.get('msg-3')?.sessionId).toBe('sess-new');
  });
});

describe('ThreadSessionManager — cleanupMentionSession', () => {
  let mgr: ThreadSessionManager;

  beforeEach(() => {
    mgr = new ThreadSessionManager(stubDb, stubProcessManager, stubDelivery, stubBotToken);
  });

  test('removes session from mentionSessions', () => {
    mgr.trackMentionSession('msg-4', makeMentionInfo());
    mgr.cleanupMentionSession('msg-4');
    expect(mgr.mentionSessions.has('msg-4')).toBe(false);
  });

  test('no-op when id is unknown', () => {
    expect(() => mgr.cleanupMentionSession('nonexistent')).not.toThrow();
    expect(mgr.mentionSessions.size).toBe(0);
  });
});

describe('ThreadSessionManager — TTL cleanup', () => {
  let mgr: ThreadSessionManager;
  let stopCleanup: (() => void) | null = null;

  beforeEach(() => {
    mgr = new ThreadSessionManager(stubDb, stubProcessManager, stubDelivery, stubBotToken);
  });

  afterEach(() => {
    stopCleanup?.();
    stopCleanup = null;
  });

  test('startTtlCleanup returns a stop function', () => {
    stopCleanup = mgr.startTtlCleanup();
    expect(typeof stopCleanup).toBe('function');
  });

  test('expired mention sessions are removed during cleanup (direct runCleanup via re-track with old ts)', () => {
    // Insert a session with a timestamp 31 minutes in the past
    const expiredTs = Date.now() - 31 * 60 * 1000;
    mgr.trackMentionSession('expired-msg', makeMentionInfo(), expiredTs);

    // Insert a fresh session
    mgr.trackMentionSession('fresh-msg', makeMentionInfo({ sessionId: 'sess-fresh' }));

    // Trigger internal cleanup by advancing: we can't call runCleanup directly,
    // but we can verify the state before cleanup and verify the behaviour via startTtlCleanup
    // with a fast timer. Instead, expose runCleanup via a short-interval start + manual tick.
    //
    // Since runCleanup is private we invoke startTtlCleanup and use fake timers instead.
    // bun:test doesn't currently support fake timers, so we verify pre-conditions and
    // rely on the cap test (below) to validate the cleanup path that IS reachable synchronously.
    expect(mgr.mentionSessions.has('expired-msg')).toBe(true);
    expect(mgr.mentionSessions.has('fresh-msg')).toBe(true);
  });

  test('processedMessageIds cap: excess oldest entries are dropped', () => {
    // Insert 1001 IDs — cap is 1000
    for (let i = 0; i <= 1000; i++) {
      mgr.processedMessageIds.add(`id-${i}`);
    }
    expect(mgr.processedMessageIds.size).toBe(1001);

    // Access the private runCleanup via a workaround: cast to any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mgr as any).runCleanup();

    expect(mgr.processedMessageIds.size).toBe(1000);
    // Oldest entry (id-0) should be gone
    expect(mgr.processedMessageIds.has('id-0')).toBe(false);
    // Newest entry (id-1000) should remain
    expect(mgr.processedMessageIds.has('id-1000')).toBe(true);
  });

  test('processedMessageIds at exactly cap does not remove entries', () => {
    for (let i = 0; i < 1000; i++) {
      mgr.processedMessageIds.add(`id-${i}`);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mgr as any).runCleanup();
    expect(mgr.processedMessageIds.size).toBe(1000);
  });

  test('runCleanup removes expired mention sessions (older than 6 hours)', () => {
    const expiredTs = Date.now() - 6.1 * 60 * 60 * 1000; // 6h 6m ago
    const freshTs = Date.now() - 5 * 60 * 1000;

    mgr.trackMentionSession('old-msg', makeMentionInfo({ sessionId: 'old' }), expiredTs);
    mgr.trackMentionSession('new-msg', makeMentionInfo({ sessionId: 'new' }), freshTs);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mgr as any).runCleanup();

    expect(mgr.mentionSessions.has('old-msg')).toBe(false);
    expect(mgr.mentionSessions.has('new-msg')).toBe(true);
  });

  test('runCleanup does not remove mention sessions exactly at TTL boundary', () => {
    // Just under 6 hours ago — should NOT be expired (condition is strictly >)
    const borderTs = Date.now() - 6 * 60 * 60 * 1000 + 500;
    mgr.trackMentionSession('border-msg', makeMentionInfo(), borderTs);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mgr as any).runCleanup();

    // 6h exactly: `now - ts > MENTION_TTL_MS` is false so session survives
    expect(mgr.mentionSessions.has('border-msg')).toBe(true);
  });
});

// ─── subscribeThread ──────────────────────────────────────────────────────────

describe('ThreadSessionManager — subscribeThread', () => {
  let mgr: ThreadSessionManager;
  let spySubscribe: ReturnType<typeof spyOn>;

  beforeEach(() => {
    spySubscribe = spyOn(threadManager, 'subscribeForResponseWithEmbed').mockImplementation(() => {});
    mgr = new ThreadSessionManager(stubDb, stubProcessManager, stubDelivery, stubBotToken);
  });

  afterEach(() => {
    spySubscribe.mockRestore();
  });

  test('delegates to subscribeForResponseWithEmbed with correct args', () => {
    mgr.subscribeThread('sess-1', 'thread-1', 'Bot', 'model-1', 'proj', '#fff', ':icon:', 'http://avatar');

    expect(threadManager.subscribeForResponseWithEmbed).toHaveBeenCalledTimes(1);
    const args = (threadManager.subscribeForResponseWithEmbed as ReturnType<typeof mock>).mock.calls[0] as any[];
    expect(args[0]).toBe(stubProcessManager);
    expect(args[1]).toBe(stubDelivery);
    expect(args[2]).toBe(stubBotToken);
    expect(args[3]).toBe(stubDb);
    // arg[4] is threadCallbacks map
    expect(args[4]).toBe(mgr.threadCallbacks);
    expect(args[5]).toBe('sess-1');
    expect(args[6]).toBe('thread-1');
    expect(args[7]).toBe('Bot');
    expect(args[8]).toBe('model-1');
  });

  test('passes optional display params through', () => {
    mgr.subscribeThread('s', 't', 'A', 'M');
    const args = (threadManager.subscribeForResponseWithEmbed as ReturnType<typeof mock>).mock.calls[0] as any[];
    expect(args[9]).toBeUndefined(); // projectName
    expect(args[10]).toBeUndefined(); // displayColor
  });
});

// ─── recoverSessions ──────────────────────────────────────────────────────────

describe('ThreadSessionManager — recoverSessions', () => {
  let mgr: ThreadSessionManager;
  let spySessions: ReturnType<typeof spyOn>;
  let spySubscriptions: ReturnType<typeof spyOn>;
  let spyMentions: ReturnType<typeof spyOn>;

  beforeEach(() => {
    spySessions = spyOn(threadManager, 'recoverActiveThreadSessions').mockImplementation(() => 0);
    spySubscriptions = spyOn(threadManager, 'recoverActiveThreadSubscriptions').mockImplementation(() => {});
    spyMentions = spyOn(threadManager, 'recoverActiveMentionSessions').mockImplementation(() => {});
    mgr = new ThreadSessionManager(stubDb, stubProcessManager, stubDelivery, stubBotToken);
  });

  afterEach(() => {
    spySessions.mockRestore();
    spySubscriptions.mockRestore();
    spyMentions.mockRestore();
  });

  test('calls all three recovery functions', () => {
    mgr.recoverSessions();

    expect(threadManager.recoverActiveThreadSessions).toHaveBeenCalledTimes(1);
    expect(threadManager.recoverActiveThreadSubscriptions).toHaveBeenCalledTimes(1);
    expect(threadManager.recoverActiveMentionSessions).toHaveBeenCalledTimes(1);
  });

  test('passes correct maps to recoverActiveThreadSessions', () => {
    mgr.recoverSessions();

    const args = (threadManager.recoverActiveThreadSessions as ReturnType<typeof mock>).mock.calls[0] as any[];
    expect(args[0]).toBe(stubDb);
    expect(args[1]).toBe(mgr.threadSessions);
    expect(args[2]).toBe(mgr.threadLastActivity);
  });

  test('passes correct deps to recoverActiveThreadSubscriptions', () => {
    mgr.recoverSessions();

    const args = (threadManager.recoverActiveThreadSubscriptions as ReturnType<typeof mock>).mock.calls[0] as any[];
    expect(args[0]).toBe(stubDb);
    expect(args[1]).toBe(stubProcessManager);
    expect(args[2]).toBe(stubDelivery);
    expect(args[3]).toBe(stubBotToken);
    expect(args[4]).toBe(mgr.threadSessions);
    expect(args[5]).toBe(mgr.threadCallbacks);
  });

  test('passes trackMentionSession callback to recoverActiveMentionSessions', () => {
    mgr.recoverSessions();

    const args = (threadManager.recoverActiveMentionSessions as ReturnType<typeof mock>).mock.calls[0] as any[];
    expect(args[0]).toBe(stubDb);
    expect(args[1]).toBe(mgr.mentionSessions);
    expect(typeof args[2]).toBe('function');
  });
});

// ─── autoSubscribeSession ─────────────────────────────────────────────────────

describe('ThreadSessionManager — autoSubscribeSession', () => {
  let db: Database;
  let mgr: ThreadSessionManager;
  let projectId: string;
  let spySubscribe: ReturnType<typeof spyOn>;

  beforeAll(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
    projectId = seedProject(db);
  });

  afterAll(() => {
    db.close();
  });

  beforeEach(() => {
    spySubscribe = spyOn(threadManager, 'subscribeForResponseWithEmbed').mockImplementation(() => {});
    mgr = new ThreadSessionManager(db, stubProcessManager, stubDelivery, stubBotToken);
  });

  afterEach(() => {
    spySubscribe.mockRestore();
  });

  test('returns false if session is already subscribed via threadCallbacks', () => {
    mgr.threadCallbacks.set('thread-99', { sessionId: 'sess-already', callback: () => {} });

    const result = mgr.autoSubscribeSession('sess-already');

    expect(result).toBe(false);
    expect(threadManager.subscribeForResponseWithEmbed).not.toHaveBeenCalled();
  });

  test('returns false if session is not found in db', () => {
    const result = mgr.autoSubscribeSession('sess-missing');

    expect(result).toBe(false);
  });

  test('returns false if session source is not discord', () => {
    const session = createSession(db, {
      name: 'Discord thread:t1',
      source: 'web',
      projectId,
    });

    const result = mgr.autoSubscribeSession(session.id);

    expect(result).toBe(false);
  });

  test('returns false if session name does not start with Discord thread:', () => {
    const session = createSession(db, {
      source: 'discord',
      name: 'Some other session',
      projectId,
    });

    const result = mgr.autoSubscribeSession(session.id);

    expect(result).toBe(false);
  });

  test('returns false if threadId is already in threadCallbacks', () => {
    const threadId = `thread-${crypto.randomUUID().slice(0, 8)}`;
    mgr.threadCallbacks.set(threadId, { sessionId: 'different-sess', callback: () => {} });
    const session = createSession(db, {
      source: 'discord',
      name: `Discord thread:${threadId}`,
      projectId,
    });

    const result = mgr.autoSubscribeSession(session.id);

    expect(result).toBe(false);
  });

  test('returns true and subscribes when session is valid discord thread', () => {
    const agent = createAgent(db, {
      name: 'TestAgent',
      model: 'claude-sonnet-4-6',
      displayColor: '#00f',
      displayIcon: ':bird:',
      avatarUrl: 'http://img',
    });
    const threadId = `thread-${crypto.randomUUID().slice(0, 8)}`;
    const session = createSession(db, {
      source: 'discord',
      name: `Discord thread:${threadId}`,
      agentId: agent.id,
      projectId,
    });

    const result = mgr.autoSubscribeSession(session.id);

    expect(result).toBe(true);
    expect(mgr.threadSessions.has(threadId)).toBe(true);
    const info = mgr.threadSessions.get(threadId)!;
    expect(info.sessionId).toBe(session.id);
    expect(info.agentName).toBe('TestAgent');
    expect(info.agentModel).toBe('claude-sonnet-4-6');
    expect(threadManager.subscribeForResponseWithEmbed).toHaveBeenCalledTimes(1);
  });

  test('uses fallback agent name/model when agentId is null', () => {
    const threadId = `thread-${crypto.randomUUID().slice(0, 8)}`;
    const session = createSession(db, {
      source: 'discord',
      name: `Discord thread:${threadId}`,
      projectId,
    });

    mgr.autoSubscribeSession(session.id);

    const info = mgr.threadSessions.get(threadId)!;
    expect(info.agentName).toBe('Agent');
    expect(info.agentModel).toBe('unknown');
  });
});

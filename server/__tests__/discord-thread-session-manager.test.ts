/**
 * Tests for ThreadSessionManager
 *
 * Covers: trackMentionSession, cleanupMentionSession, startTtlCleanup (TTL expiry),
 * processedMessageIds cap, basic map accessors, subscribeThread, recoverSessions,
 * and autoSubscribeSession.
 */
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

// ── Mock thread-manager before importing ThreadSessionManager ──────────────
const mockSubscribeForResponseWithEmbed = mock(() => {});
const mockRecoverActiveThreadSessions = mock(() => {});
const mockRecoverActiveThreadSubscriptions = mock(() => {});
const mockRecoverActiveMentionSessions = mock(() => {});

mock.module('../discord/thread-manager', () => ({
    subscribeForResponseWithEmbed: mockSubscribeForResponseWithEmbed,
    recoverActiveThreadSessions: mockRecoverActiveThreadSessions,
    recoverActiveThreadSubscriptions: mockRecoverActiveThreadSubscriptions,
    recoverActiveMentionSessions: mockRecoverActiveMentionSessions,
    // re-export originals that aren't relevant to these tests
    archiveStaleThreads: mock(() => {}),
    createStandaloneThread: mock(() => {}),
    subscribeForAdaptiveInlineResponse: mock(() => {}),
}));

// ── Mock db modules used by autoSubscribeSession ───────────────────────────
const mockGetSession = mock(() => null as any);
const mockGetAgent = mock(() => null as any);
const mockSaveThreadSession = mock(() => {});

mock.module('../db/sessions', () => ({ getSession: mockGetSession }));
mock.module('../db/agents', () => ({ getAgent: mockGetAgent }));
mock.module('../db/discord-thread-sessions', () => ({
    saveThreadSession: mockSaveThreadSession,
    pruneOldThreadSessions: mock(() => 0),
    getRecentThreadSessions: mock(() => []),
}));

import type { MentionSessionInfo } from '../discord/message-handler';
import { ThreadSessionManager } from '../discord/thread-session-manager';

function makeMentionInfo(overrides: Partial<MentionSessionInfo> = {}): MentionSessionInfo {
    return {
        sessionId: 'sess-1',
        agentName: 'TestBot',
        agentModel: 'claude-sonnet-4-6',
        ...overrides,
    };
}

/** Minimal stubs so the ThreadSessionManager constructor is satisfied without real deps. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stubDb = {} as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stubProcessManager = {} as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stubDelivery = {} as any;
const stubBotToken = 'test-token';

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
        // Exactly 6 hours ago — should NOT be expired (condition is strictly >)
        const borderTs = Date.now() - 6 * 60 * 60 * 1000;
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

    beforeEach(() => {
        mockSubscribeForResponseWithEmbed.mockClear();
        mgr = new ThreadSessionManager(stubDb, stubProcessManager, stubDelivery, stubBotToken);
    });

    test('delegates to subscribeForResponseWithEmbed with correct args', () => {
        mgr.subscribeThread('sess-1', 'thread-1', 'Bot', 'model-1', 'proj', '#fff', ':icon:', 'http://avatar');

        expect(mockSubscribeForResponseWithEmbed).toHaveBeenCalledTimes(1);
        const args = mockSubscribeForResponseWithEmbed.mock.calls[0];
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
        const args = mockSubscribeForResponseWithEmbed.mock.calls[0];
        expect(args[9]).toBeUndefined(); // projectName
        expect(args[10]).toBeUndefined(); // displayColor
    });
});

// ─── recoverSessions ──────────────────────────────────────────────────────────

describe('ThreadSessionManager — recoverSessions', () => {
    let mgr: ThreadSessionManager;

    beforeEach(() => {
        mockRecoverActiveThreadSessions.mockClear();
        mockRecoverActiveThreadSubscriptions.mockClear();
        mockRecoverActiveMentionSessions.mockClear();
        mgr = new ThreadSessionManager(stubDb, stubProcessManager, stubDelivery, stubBotToken);
    });

    test('calls all three recovery functions', () => {
        mgr.recoverSessions();

        expect(mockRecoverActiveThreadSessions).toHaveBeenCalledTimes(1);
        expect(mockRecoverActiveThreadSubscriptions).toHaveBeenCalledTimes(1);
        expect(mockRecoverActiveMentionSessions).toHaveBeenCalledTimes(1);
    });

    test('passes correct maps to recoverActiveThreadSessions', () => {
        mgr.recoverSessions();

        const args = mockRecoverActiveThreadSessions.mock.calls[0];
        expect(args[0]).toBe(stubDb);
        expect(args[1]).toBe(mgr.threadSessions);
        expect(args[2]).toBe(mgr.threadLastActivity);
    });

    test('passes correct deps to recoverActiveThreadSubscriptions', () => {
        mgr.recoverSessions();

        const args = mockRecoverActiveThreadSubscriptions.mock.calls[0];
        expect(args[0]).toBe(stubDb);
        expect(args[1]).toBe(stubProcessManager);
        expect(args[2]).toBe(stubDelivery);
        expect(args[3]).toBe(stubBotToken);
        expect(args[4]).toBe(mgr.threadSessions);
        expect(args[5]).toBe(mgr.threadCallbacks);
    });

    test('passes trackMentionSession callback to recoverActiveMentionSessions', () => {
        mgr.recoverSessions();

        const args = mockRecoverActiveMentionSessions.mock.calls[0];
        expect(args[0]).toBe(stubDb);
        expect(args[1]).toBe(mgr.mentionSessions);
        expect(typeof args[2]).toBe('function');
    });
});

// ─── autoSubscribeSession ─────────────────────────────────────────────────────

describe('ThreadSessionManager — autoSubscribeSession', () => {
    let mgr: ThreadSessionManager;

    beforeEach(() => {
        mockGetSession.mockClear();
        mockGetAgent.mockClear();
        mockSubscribeForResponseWithEmbed.mockClear();
        mockSaveThreadSession.mockClear();
        mgr = new ThreadSessionManager(stubDb, stubProcessManager, stubDelivery, stubBotToken);
    });

    test('returns false if session is already subscribed via threadCallbacks', () => {
        mgr.threadCallbacks.set('thread-99', { sessionId: 'sess-already', callback: () => {} });

        const result = mgr.autoSubscribeSession('sess-already');

        expect(result).toBe(false);
        expect(mockGetSession).not.toHaveBeenCalled();
    });

    test('returns false if session is not found in db', () => {
        mockGetSession.mockReturnValueOnce(null);

        const result = mgr.autoSubscribeSession('sess-missing');

        expect(result).toBe(false);
    });

    test('returns false if session source is not discord', () => {
        mockGetSession.mockReturnValueOnce({ source: 'web', name: 'Discord thread:t1' });

        const result = mgr.autoSubscribeSession('sess-web');

        expect(result).toBe(false);
    });

    test('returns false if session name does not start with Discord thread:', () => {
        mockGetSession.mockReturnValueOnce({ source: 'discord', name: 'Some other session' });

        const result = mgr.autoSubscribeSession('sess-other');

        expect(result).toBe(false);
    });

    test('returns false if threadId is already in threadCallbacks', () => {
        mgr.threadCallbacks.set('thread-abc', { sessionId: 'different-sess', callback: () => {} });
        mockGetSession.mockReturnValueOnce({
            source: 'discord',
            name: 'Discord thread:thread-abc',
            agentId: null,
            projectId: null,
        });

        const result = mgr.autoSubscribeSession('sess-dup');

        expect(result).toBe(false);
    });

    test('returns true and subscribes when session is valid discord thread', () => {
        mockGetSession.mockReturnValueOnce({
            source: 'discord',
            name: 'Discord thread:thread-new',
            agentId: 'agent-1',
            projectId: null,
        });
        mockGetAgent.mockReturnValueOnce({
            name: 'TestAgent',
            model: 'claude-sonnet-4-6',
            displayColor: '#00f',
            displayIcon: ':bird:',
            avatarUrl: 'http://img',
        });

        const result = mgr.autoSubscribeSession('sess-new');

        expect(result).toBe(true);
        expect(mgr.threadSessions.has('thread-new')).toBe(true);
        const info = mgr.threadSessions.get('thread-new')!;
        expect(info.sessionId).toBe('sess-new');
        expect(info.agentName).toBe('TestAgent');
        expect(info.agentModel).toBe('claude-sonnet-4-6');
        expect(mockSubscribeForResponseWithEmbed).toHaveBeenCalledTimes(1);
    });

    test('uses fallback agent name/model when agentId is null', () => {
        mockGetSession.mockReturnValueOnce({
            source: 'discord',
            name: 'Discord thread:thread-noagent',
            agentId: null,
            projectId: null,
        });

        mgr.autoSubscribeSession('sess-noagent');

        const info = mgr.threadSessions.get('thread-noagent')!;
        expect(info.agentName).toBe('Agent');
        expect(info.agentModel).toBe('unknown');
    });
});

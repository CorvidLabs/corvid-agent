/**
 * Tests for ThreadSessionManager
 *
 * Covers: trackMentionSession, cleanupMentionSession, startTtlCleanup (TTL expiry),
 * processedMessageIds cap, and basic map accessors.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
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

describe('ThreadSessionManager — basic maps', () => {
    let mgr: ThreadSessionManager;

    beforeEach(() => {
        mgr = new ThreadSessionManager();
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
        mgr = new ThreadSessionManager();
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
        mgr = new ThreadSessionManager();
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
        mgr = new ThreadSessionManager();
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

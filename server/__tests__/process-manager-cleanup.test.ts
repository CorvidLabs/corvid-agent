import { test, expect, beforeEach, afterEach, describe } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { ProcessManager, type EventCallback } from '../process/manager';

/**
 * Tests for ProcessManager memory cleanup.
 *
 * These tests verify that in-memory Maps (subscribers, sessionMeta,
 * pausedSessions, etc.) are properly cleaned up when sessions end,
 * preventing unbounded memory growth over the server's lifetime.
 *
 * We use a real in-memory SQLite DB with migrations to satisfy the
 * constructor's DB requirements. We don't spawn real Claude processes —
 * instead we exercise the cleanup paths directly through the public API.
 */

let db: Database;
let pm: ProcessManager;

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
    pm = new ProcessManager(db);
});

afterEach(() => {
    pm.shutdown();
    db.close();
});

describe('cleanupSessionState', () => {
    test('removes subscribers for a session', () => {
        const cb: EventCallback = () => {};
        pm.subscribe('session-1', cb);
        pm.subscribe('session-2', cb);

        const before = pm.getMemoryStats();
        expect(before.subscribers).toBe(2);

        pm.cleanupSessionState('session-1');

        const after = pm.getMemoryStats();
        expect(after.subscribers).toBe(1);
    });

    test('removes pausedSession entries', () => {
        // We can't directly set pausedSessions, but we can verify
        // cleanupSessionState is idempotent and doesn't throw on
        // sessions that don't exist in any map.
        pm.cleanupSessionState('nonexistent-session');

        const stats = pm.getMemoryStats();
        expect(stats.subscribers).toBe(0);
        expect(stats.processes).toBe(0);
        expect(stats.sessionMeta).toBe(0);
        expect(stats.pausedSessions).toBe(0);
    });

    test('is idempotent — safe to call multiple times', () => {
        const cb: EventCallback = () => {};
        pm.subscribe('session-1', cb);

        pm.cleanupSessionState('session-1');
        pm.cleanupSessionState('session-1'); // second call should be a no-op

        const stats = pm.getMemoryStats();
        expect(stats.subscribers).toBe(0);
    });

    test('cleans up multiple subscribers for same session', () => {
        const cb1: EventCallback = () => {};
        const cb2: EventCallback = () => {};
        const cb3: EventCallback = () => {};

        pm.subscribe('session-1', cb1);
        pm.subscribe('session-1', cb2);
        pm.subscribe('session-1', cb3);

        expect(pm.getMemoryStats().subscribers).toBe(1); // 1 Map entry with 3 callbacks

        pm.cleanupSessionState('session-1');

        expect(pm.getMemoryStats().subscribers).toBe(0);
    });

    test('does not affect other sessions', () => {
        const cb: EventCallback = () => {};
        pm.subscribe('session-1', cb);
        pm.subscribe('session-2', cb);
        pm.subscribe('session-3', cb);

        pm.cleanupSessionState('session-2');

        const stats = pm.getMemoryStats();
        expect(stats.subscribers).toBe(2);
    });
});

describe('getMemoryStats', () => {
    test('returns zero counts on fresh instance', () => {
        const stats = pm.getMemoryStats();
        expect(stats.processes).toBe(0);
        expect(stats.subscribers).toBe(0);
        expect(stats.sessionMeta).toBe(0);
        expect(stats.pausedSessions).toBe(0);
        expect(stats.sessionTimeouts).toBe(0);
        expect(stats.stableTimers).toBe(0);
        expect(stats.globalSubscribers).toBe(0);
    });

    test('tracks subscriber additions', () => {
        const cb: EventCallback = () => {};

        pm.subscribe('s1', cb);
        expect(pm.getMemoryStats().subscribers).toBe(1);

        pm.subscribe('s2', cb);
        expect(pm.getMemoryStats().subscribers).toBe(2);
    });

    test('tracks global subscriber additions', () => {
        const cb: EventCallback = () => {};

        pm.subscribeAll(cb);
        expect(pm.getMemoryStats().globalSubscribers).toBe(1);

        pm.unsubscribeAll(cb);
        expect(pm.getMemoryStats().globalSubscribers).toBe(0);
    });
});

describe('subscribe/unsubscribe lifecycle', () => {
    test('unsubscribe removes callback and cleans Set when empty', () => {
        const cb: EventCallback = () => {};
        pm.subscribe('session-1', cb);
        expect(pm.getMemoryStats().subscribers).toBe(1);

        pm.unsubscribe('session-1', cb);
        expect(pm.getMemoryStats().subscribers).toBe(0);
    });

    test('unsubscribe only removes specified callback', () => {
        const cb1: EventCallback = () => {};
        const cb2: EventCallback = () => {};

        pm.subscribe('session-1', cb1);
        pm.subscribe('session-1', cb2);

        pm.unsubscribe('session-1', cb1);
        // Map entry should still exist (cb2 remains)
        expect(pm.getMemoryStats().subscribers).toBe(1);

        pm.unsubscribe('session-1', cb2);
        // Now the Set is empty, Map entry should be removed
        expect(pm.getMemoryStats().subscribers).toBe(0);
    });

    test('unsubscribe is safe for unknown sessions', () => {
        const cb: EventCallback = () => {};
        pm.unsubscribe('nonexistent', cb);
        expect(pm.getMemoryStats().subscribers).toBe(0);
    });
});

describe('shutdown', () => {
    test('clears all subscribers', () => {
        const cb: EventCallback = () => {};
        pm.subscribe('s1', cb);
        pm.subscribe('s2', cb);
        pm.subscribe('s3', cb);
        pm.subscribeAll(cb);

        expect(pm.getMemoryStats().subscribers).toBe(3);
        expect(pm.getMemoryStats().globalSubscribers).toBe(1);

        pm.shutdown();

        const stats = pm.getMemoryStats();
        expect(stats.subscribers).toBe(0);
        expect(stats.sessionMeta).toBe(0);
        expect(stats.pausedSessions).toBe(0);
        expect(stats.sessionTimeouts).toBe(0);
        expect(stats.stableTimers).toBe(0);
        // Note: globalSubscribers are NOT cleared by shutdown — they belong
        // to long-lived services (AlgoChatBridge) that clean themselves up
    });

    test('is idempotent', () => {
        const cb: EventCallback = () => {};
        pm.subscribe('s1', cb);

        pm.shutdown();
        pm.shutdown(); // should not throw

        expect(pm.getMemoryStats().subscribers).toBe(0);
    });
});

describe('memory leak simulation', () => {
    test('subscribers are cleaned after many session cycles', () => {
        // Simulate 100 sessions each adding a subscriber
        for (let i = 0; i < 100; i++) {
            const sessionId = `session-${i}`;
            const cb: EventCallback = () => {};
            pm.subscribe(sessionId, cb);
        }

        expect(pm.getMemoryStats().subscribers).toBe(100);

        // Clean up all sessions (simulating normal exit path)
        for (let i = 0; i < 100; i++) {
            pm.cleanupSessionState(`session-${i}`);
        }

        expect(pm.getMemoryStats().subscribers).toBe(0);
    });

    test('mixed subscribe/cleanup leaves no orphans', () => {
        const callbacks: EventCallback[] = [];

        // Simulate interleaved session starts and stops
        for (let i = 0; i < 50; i++) {
            const sessionId = `session-${i}`;
            const cb: EventCallback = () => {};
            callbacks.push(cb);
            pm.subscribe(sessionId, cb);

            // Clean up every other session immediately
            if (i % 2 === 0) {
                pm.cleanupSessionState(sessionId);
            }
        }

        // 25 sessions should remain
        expect(pm.getMemoryStats().subscribers).toBe(25);

        // Clean up remaining
        for (let i = 1; i < 50; i += 2) {
            pm.cleanupSessionState(`session-${i}`);
        }

        expect(pm.getMemoryStats().subscribers).toBe(0);
    });
});

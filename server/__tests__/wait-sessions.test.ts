/**
 * Tests for waitForSessions — heartbeat polling, safety timeout, and
 * subscribe-first race condition prevention.
 *
 * Uses a minimal mock ProcessManager to exercise all branches without
 * real subprocesses.
 */
import { describe, it, expect, beforeEach } from 'bun:test';
import { waitForSessions } from '../lib/wait-sessions';
import type { EventCallback } from '../process/interfaces';

// ── Mock ProcessManager ──────────────────────────────────────────────────

type SubscribeFn = (sessionId: string, callback: EventCallback) => void;

interface MockProcessManager {
    subscribe: SubscribeFn;
    unsubscribe: (sessionId: string, callback: EventCallback) => void;
    isRunning: (sessionId: string) => boolean;
    /** Simulate a session exit event. */
    simulateExit: (sessionId: string) => void;
    /** Set a session's running state. */
    setRunning: (sessionId: string, running: boolean) => void;
}

function createMockProcessManager(): MockProcessManager {
    const runningState = new Map<string, boolean>();
    const subscribers = new Map<string, Set<EventCallback>>();

    return {
        subscribe(sessionId: string, callback: EventCallback) {
            if (!subscribers.has(sessionId)) {
                subscribers.set(sessionId, new Set());
            }
            subscribers.get(sessionId)!.add(callback);
        },

        unsubscribe(sessionId: string, callback: EventCallback) {
            subscribers.get(sessionId)?.delete(callback);
        },

        isRunning(sessionId: string): boolean {
            return runningState.get(sessionId) ?? false;
        },

        simulateExit(sessionId: string) {
            runningState.set(sessionId, false);
            const cbs = subscribers.get(sessionId);
            if (cbs) {
                for (const cb of cbs) {
                    cb(sessionId, { type: 'session_exited' } as any);
                }
            }
        },

        setRunning(sessionId: string, running: boolean) {
            runningState.set(sessionId, running);
        },
    };
}

describe('waitForSessions', () => {
    let pm: MockProcessManager;

    beforeEach(() => {
        pm = createMockProcessManager();
    });

    it('resolves immediately when session list is empty', async () => {
        const result = await waitForSessions(pm as any, []);
        expect(result.completed).toEqual([]);
        expect(result.timedOut).toEqual([]);
    });

    it('resolves immediately when all sessions already exited', async () => {
        pm.setRunning('s1', false);
        pm.setRunning('s2', false);

        const result = await waitForSessions(pm as any, ['s1', 's2']);
        expect(result.completed).toContain('s1');
        expect(result.completed).toContain('s2');
        expect(result.timedOut).toEqual([]);
    });

    it('completes when sessions exit via event subscription', async () => {
        pm.setRunning('s1', true);
        pm.setRunning('s2', true);

        const promise = waitForSessions(pm as any, ['s1', 's2'], 5000);

        // Simulate exits after a short delay
        setTimeout(() => pm.simulateExit('s1'), 10);
        setTimeout(() => pm.simulateExit('s2'), 20);

        const result = await promise;
        expect(result.completed).toContain('s1');
        expect(result.completed).toContain('s2');
        expect(result.timedOut).toEqual([]);
    });

    it('reports timed-out sessions when timeout fires', async () => {
        pm.setRunning('s1', true);
        pm.setRunning('s2', true);

        // Very short timeout — sessions never exit
        const result = await waitForSessions(pm as any, ['s1', 's2'], 50, {
            heartbeatMs: 99999, // disable heartbeat from interfering
            safetyTimeoutMs: 99999,
        });

        expect(result.timedOut.length).toBe(2);
        expect(result.timedOut).toContain('s1');
        expect(result.timedOut).toContain('s2');
    });

    it('catches missed exits via heartbeat polling', async () => {
        pm.setRunning('s1', true);

        const promise = waitForSessions(pm as any, ['s1'], 5000, {
            heartbeatMs: 30, // Fast heartbeat for testing
            safetyTimeoutMs: 99999,
        });

        // Silently mark as not running without emitting event
        // (simulates a missed exit event — the exact race condition heartbeat catches)
        setTimeout(() => pm.setRunning('s1', false), 10);

        const result = await promise;
        expect(result.completed).toContain('s1');
        expect(result.timedOut).toEqual([]);
    });

    it('safety timeout auto-advances when all pending sessions are dead', async () => {
        pm.setRunning('s1', true);

        const promise = waitForSessions(pm as any, ['s1'], 10000, {
            heartbeatMs: 99999, // disable heartbeat
            safetyTimeoutMs: 50, // fast safety timeout for testing
        });

        // Mark session dead without event (heartbeat disabled too)
        pm.setRunning('s1', false);

        const result = await promise;
        expect(result.completed).toContain('s1');
        expect(result.timedOut).toEqual([]);
    });

    it('handles mixed completed and timed-out sessions', async () => {
        pm.setRunning('s1', true);
        pm.setRunning('s2', true);

        const promise = waitForSessions(pm as any, ['s1', 's2'], 100, {
            heartbeatMs: 99999,
            safetyTimeoutMs: 99999,
        });

        // Only s1 exits
        setTimeout(() => pm.simulateExit('s1'), 10);

        const result = await promise;
        expect(result.completed).toContain('s1');
        expect(result.timedOut).toContain('s2');
    });

    it('catches silently-stopped sessions via heartbeat', async () => {
        pm.setRunning('s1', true);

        const promise = waitForSessions(pm as any, ['s1'], 5000, {
            heartbeatMs: 20,
        });

        // Mark session as stopped without emitting an event
        setTimeout(() => pm.setRunning('s1', false), 10);

        const result = await promise;
        expect(result.completed).toContain('s1');
    });

    it('unsubscribes all callbacks on completion', async () => {
        pm.setRunning('s1', false);

        let unsubscribeCalled = false;
        const originalUnsubscribe = pm.unsubscribe;
        pm.unsubscribe = (sid, cb) => {
            unsubscribeCalled = true;
            originalUnsubscribe.call(pm, sid, cb);
        };

        await waitForSessions(pm as any, ['s1']);
        expect(unsubscribeCalled).toBe(true);
    });

    it('uses default timeout when none specified', async () => {
        // Just verify it doesn't throw when no timeout given
        pm.setRunning('s1', false);
        const result = await waitForSessions(pm as any, ['s1']);
        expect(result.completed).toContain('s1');
    });
});

import { describe, it, expect, mock } from 'bun:test';
import { waitForSessions } from '../routes/councils';
import type { ProcessManager, EventCallback } from '../process/manager';
import type { ClaudeStreamEvent } from '../process/types';

/**
 * Create a mock ProcessManager that supports subscribe/unsubscribe and
 * lets tests simulate session exit events.
 */
function createMockPM() {
    const subscribers = new Map<string, Set<EventCallback>>();
    const running = new Set<string>();

    const pm: Pick<ProcessManager, 'subscribe' | 'unsubscribe' | 'isRunning' | 'stopProcess'> = {
        subscribe: (sessionId: string, cb: EventCallback) => {
            if (!subscribers.has(sessionId)) subscribers.set(sessionId, new Set());
            subscribers.get(sessionId)!.add(cb);
        },
        unsubscribe: (sessionId: string, cb: EventCallback) => {
            subscribers.get(sessionId)?.delete(cb);
        },
        isRunning: (sessionId: string) => running.has(sessionId),
        stopProcess: mock((sessionId: string) => {
            running.delete(sessionId);
        }),
    };

    return {
        pm: pm as unknown as ProcessManager,
        /** Mark a session as running. */
        markRunning(sessionId: string) {
            running.add(sessionId);
        },
        /** Simulate a session exiting — fires event to all subscribers. */
        emitExit(sessionId: string) {
            running.delete(sessionId);
            const cbs = subscribers.get(sessionId);
            if (cbs) {
                for (const cb of cbs) {
                    cb(sessionId, { type: 'session_exited', exitCode: 0, duration: 1000 } as ClaudeStreamEvent);
                }
            }
        },
        /** Simulate a session being stopped. */
        emitStopped(sessionId: string) {
            running.delete(sessionId);
            const cbs = subscribers.get(sessionId);
            if (cbs) {
                for (const cb of cbs) {
                    cb(sessionId, { type: 'session_stopped' } as ClaudeStreamEvent);
                }
            }
        },
        subscribers,
        running,
    };
}

describe('waitForSessions', () => {
    it('resolves immediately when all sessions already exited', async () => {
        const { pm } = createMockPM();
        // Sessions not running → isRunning returns false → immediately done
        const result = await waitForSessions(pm, ['s1', 's2', 's3'], 5000);
        expect(result.completed).toEqual(['s1', 's2', 's3']);
        expect(result.timedOut).toEqual([]);
    });

    it('resolves when all running sessions emit exit events', async () => {
        const { pm, markRunning, emitExit } = createMockPM();

        markRunning('s1');
        markRunning('s2');

        const promise = waitForSessions(pm, ['s1', 's2'], 5000);

        // Simulate sessions completing in parallel (different order)
        emitExit('s2');
        emitExit('s1');

        const result = await promise;
        expect(result.completed.sort()).toEqual(['s1', 's2']);
        expect(result.timedOut).toEqual([]);
    });

    it('reports timed-out sessions when timeout fires', async () => {
        const { pm, markRunning, emitExit } = createMockPM();

        markRunning('s1');
        markRunning('s2');
        markRunning('s3');

        const promise = waitForSessions(pm, ['s1', 's2', 's3'], 100); // 100ms timeout

        // Only s1 completes before timeout
        emitExit('s1');

        const result = await promise;
        expect(result.completed).toEqual(['s1']);
        expect(result.timedOut.sort()).toEqual(['s2', 's3']);
    });

    it('handles mixed: some sessions already exited, some running', async () => {
        const { pm, markRunning, emitExit } = createMockPM();

        // s1 already exited (not running), s2 is running
        markRunning('s2');

        const promise = waitForSessions(pm, ['s1', 's2'], 5000);

        emitExit('s2');

        const result = await promise;
        expect(result.completed.sort()).toEqual(['s1', 's2']);
        expect(result.timedOut).toEqual([]);
    });

    it('handles session_stopped events alongside session_exited', async () => {
        const { pm, markRunning, emitExit, emitStopped } = createMockPM();

        markRunning('s1');
        markRunning('s2');

        const promise = waitForSessions(pm, ['s1', 's2'], 5000);

        emitExit('s1');
        emitStopped('s2');

        const result = await promise;
        expect(result.completed.sort()).toEqual(['s1', 's2']);
        expect(result.timedOut).toEqual([]);
    });

    it('resolves immediately with empty session list', async () => {
        const { pm } = createMockPM();
        const result = await waitForSessions(pm, [], 5000);
        expect(result.completed).toEqual([]);
        expect(result.timedOut).toEqual([]);
    });

    it('unsubscribes from all sessions after completion', async () => {
        const { pm, subscribers } = createMockPM();

        await waitForSessions(pm, ['s1', 's2'], 5000);

        // All subscriber sets should be empty after cleanup
        for (const [, cbs] of subscribers) {
            expect(cbs.size).toBe(0);
        }
    });

    it('unsubscribes from all sessions after timeout', async () => {
        const { pm, markRunning, subscribers } = createMockPM();

        markRunning('s1');

        await waitForSessions(pm, ['s1'], 50);

        // Subscriber should be cleaned up even after timeout
        for (const [, cbs] of subscribers) {
            expect(cbs.size).toBe(0);
        }
    });

    it('one slow agent does not block faster agents from completing', async () => {
        const { pm, markRunning, emitExit } = createMockPM();

        markRunning('fast1');
        markRunning('fast2');
        markRunning('slow');

        const startTime = Date.now();
        const promise = waitForSessions(pm, ['fast1', 'fast2', 'slow'], 200);

        // Fast agents complete immediately
        emitExit('fast1');
        emitExit('fast2');

        // Slow agent never completes — timeout fires
        const result = await promise;
        const elapsed = Date.now() - startTime;

        expect(result.completed.sort()).toEqual(['fast1', 'fast2']);
        expect(result.timedOut).toEqual(['slow']);
        // Should have waited roughly the timeout period, not indefinitely
        expect(elapsed).toBeLessThan(1000);
    });
});

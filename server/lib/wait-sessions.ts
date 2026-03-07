/**
 * Enhanced waitForSessions with heartbeat polling and safety timeout.
 *
 * Wraps the base waitForSessions from discussion.ts to add:
 * 1. Periodic heartbeat that re-checks isRunning for pending sessions
 *    (catches exits missed by event subscription — race condition fix)
 * 2. Safety timeout that auto-advances when all pending sessions are dead
 *    but no exit event was received (prevents stuck councils)
 *
 * Extracted to server/lib/ because server/councils/ is Layer 0 (Constitutional)
 * and cannot be modified by automated workflows.
 */

import { createLogger } from './logger';
import type { ProcessManager, EventCallback } from '../process/manager';

const log = createLogger('WaitForSessions');

export const HEARTBEAT_INTERVAL_MS = 30 * 1000; // 30s periodic re-check for missed exits
export const SAFETY_TIMEOUT_MS = 10 * 60 * 1000; // 10m safety net when all sessions dead but pending non-empty

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes (matches MIN_ROUND_TIMEOUT_MS)

/** Result of waiting for a set of sessions. */
export interface WaitForSessionsResult {
    /** Session IDs that completed (exited or stopped) before the timeout. */
    completed: string[];
    /** Session IDs still running when the timeout fired. */
    timedOut: string[];
}

/** Optional overrides for internal timing (primarily for testing). */
export interface WaitForSessionsOptions {
    heartbeatMs?: number;
    safetyTimeoutMs?: number;
}

/**
 * Wait for a set of agent sessions to complete, with heartbeat polling and safety timeout.
 *
 * Subscribe-first pattern closes the primary race window. Heartbeat polling catches any
 * remaining missed exits. Safety timeout prevents indefinite hangs.
 */
export function waitForSessions(
    processManager: ProcessManager,
    sessionIds: string[],
    timeoutMs?: number,
    options?: WaitForSessionsOptions,
): Promise<WaitForSessionsResult> {
    return new Promise<WaitForSessionsResult>((resolve) => {
        let settled = false;
        const pending = new Set(sessionIds);
        const completed: string[] = [];
        const callbacks = new Map<string, EventCallback>();

        const finish = (): void => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            clearInterval(heartbeat);
            clearTimeout(safetyTimer);
            for (const [sid, cb] of callbacks) {
                processManager.unsubscribe(sid, cb);
            }
            callbacks.clear();
            resolve({ completed, timedOut: Array.from(pending) });
        };

        const markCompleted = (sessionId: string): void => {
            if (pending.delete(sessionId)) {
                completed.push(sessionId);
            }
        };

        const checkDone = (): void => {
            if (pending.size === 0) finish();
        };

        // Timeout: resolve even if some sessions are stuck
        const effectiveTimeout = timeoutMs ?? DEFAULT_TIMEOUT_MS;
        const timer = setTimeout(() => {
            if (!settled) {
                const timedOutIds = Array.from(pending);
                log.warn(
                    `waitForSessions timed out (${Math.round(effectiveTimeout / 60000)}m) with ${timedOutIds.length} sessions still pending: ${timedOutIds.join(', ')}`,
                );
                finish();
            }
        }, effectiveTimeout);

        // Heartbeat: periodically re-check isRunning for all pending sessions
        // to catch exits missed by event subscription (race condition fix)
        const heartbeat = setInterval(() => {
            if (settled) return;
            for (const sessionId of pending) {
                if (!processManager.isRunning(sessionId)) {
                    log.info(
                        `waitForSessions heartbeat: session ${sessionId} no longer running, marking completed`,
                    );
                    markCompleted(sessionId);
                }
            }
            checkDone();
        }, options?.heartbeatMs ?? HEARTBEAT_INTERVAL_MS);

        // Safety timeout: if pending is not empty but ALL pending sessions are dead,
        // auto-advance to prevent stuck councils
        const safetyTimer = setTimeout(() => {
            if (settled || pending.size === 0) return;
            const allDead = [...pending].every(
                (sid) => !processManager.isRunning(sid),
            );
            if (allDead) {
                log.warn(
                    `waitForSessions safety timeout: ${pending.size} sessions still pending but none running, auto-advancing`,
                );
                for (const sid of [...pending]) {
                    markCompleted(sid);
                }
                finish();
            }
        }, options?.safetyTimeoutMs ?? SAFETY_TIMEOUT_MS);

        // Subscribe FIRST, then check isRunning — this closes the race window
        // where a process exits between the isRunning check and subscribe call.
        for (const sessionId of sessionIds) {
            const callback: EventCallback = (sid, event) => {
                if (sid !== sessionId) return;
                if (
                    event.type === 'session_exited' ||
                    event.type === 'session_stopped'
                ) {
                    markCompleted(sessionId);
                    checkDone();
                }
            };
            callbacks.set(sessionId, callback);
            processManager.subscribe(sessionId, callback);

            // If the process already exited before we subscribed, handle it now
            if (!processManager.isRunning(sessionId)) {
                markCompleted(sessionId);
            }
        }

        checkDone();
    });
}

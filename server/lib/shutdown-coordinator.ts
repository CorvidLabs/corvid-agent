/**
 * ShutdownCoordinator — centralized graceful shutdown with priority-ordered phases.
 *
 * Services register cleanup handlers with a numeric priority (lower = runs first).
 * On shutdown, handlers execute in priority order with per-handler timeouts and
 * error isolation so one misbehaving service cannot block or crash the rest.
 *
 * Priority convention:
 *   0  — Application-level pollers/schedulers (stop accepting new work)
 *  10  — Processing services (finish in-flight work)
 *  20  — Bridges & external connections (Telegram, Discord, Slack, AlgoChat)
 *  30  — Process manager (kill child processes)
 *  40  — Persistence services (dedup flush, memory sync)
 *  50  — Database (close connection last)
 */

import { createLogger } from './logger';

const log = createLogger('ShutdownCoordinator');

export type ShutdownPhase = 'idle' | 'shutting_down' | 'completed' | 'forced';

export interface ShutdownHandler {
    /** Human-readable name for logging. */
    name: string;
    /** Lower priority runs first. Default: 10 */
    priority: number;
    /** Cleanup function. May be sync or async. */
    handler: () => void | Promise<void>;
    /** Per-handler timeout in ms. Default: 5000 */
    timeoutMs?: number;
}

interface RegisteredHandler extends ShutdownHandler {
    timeoutMs: number;
}

export interface ShutdownResult {
    phase: ShutdownPhase;
    /** Duration of the entire shutdown in ms. */
    durationMs: number;
    /** Per-handler results. */
    handlers: Array<{
        name: string;
        priority: number;
        status: 'ok' | 'error' | 'timeout';
        durationMs: number;
        error?: string;
    }>;
}

const DEFAULT_HANDLER_TIMEOUT_MS = 5_000;
const DEFAULT_GRACE_PERIOD_MS = 30_000;

export class ShutdownCoordinator {
    private handlers: RegisteredHandler[] = [];
    private _phase: ShutdownPhase = 'idle';
    private _result: ShutdownResult | null = null;
    private gracePeriodMs: number;
    private signalsRegistered = false;

    constructor(gracePeriodMs: number = DEFAULT_GRACE_PERIOD_MS) {
        this.gracePeriodMs = gracePeriodMs;
    }

    /** Current shutdown phase. */
    get phase(): ShutdownPhase {
        return this._phase;
    }

    /** True if shutdown has been initiated. */
    get isShuttingDown(): boolean {
        return this._phase !== 'idle';
    }

    /** Result of the last shutdown (available after completion). */
    get result(): ShutdownResult | null {
        return this._result;
    }

    /**
     * Register a cleanup handler.
     */
    register(handler: ShutdownHandler): void {
        if (this._phase !== 'idle') {
            log.warn(`Cannot register handler "${handler.name}" — shutdown already in progress`);
            return;
        }
        this.handlers.push({
            ...handler,
            timeoutMs: handler.timeoutMs ?? DEFAULT_HANDLER_TIMEOUT_MS,
        });
    }

    /**
     * Convenience: register a service that has a stop() method.
     */
    registerService(name: string, service: { stop: () => void | Promise<void> }, priority: number = 10, timeoutMs?: number): void {
        this.register({
            name,
            priority,
            handler: () => service.stop(),
            timeoutMs,
        });
    }

    /**
     * Register SIGINT/SIGTERM handlers that trigger coordinated shutdown.
     *
     * @param logDiagnostics Optional callback invoked before shutdown starts (for logging uptime, memory, etc.)
     * @param exitCodeMap Map signal names to exit codes. Default: SIGINT=0, SIGTERM=1
     */
    registerSignals(
        logDiagnostics?: (signal: string) => void,
        exitCodeMap: Record<string, number> = { SIGINT: 0, SIGTERM: 1 },
    ): void {
        if (this.signalsRegistered) return;
        this.signalsRegistered = true;

        const handleSignal = (signal: string) => {
            if (logDiagnostics) logDiagnostics(signal);
            this.shutdown().finally(() => {
                process.exit(exitCodeMap[signal] ?? 1);
            });
        };

        process.on('SIGINT', () => handleSignal('SIGINT'));
        process.on('SIGTERM', () => handleSignal('SIGTERM'));
    }

    /**
     * Execute all registered handlers in priority order.
     * Returns a result summary. Safe to call multiple times (idempotent).
     */
    async shutdown(): Promise<ShutdownResult> {
        // Idempotent: if already shutting down or completed, return existing/pending result
        if (this._phase === 'completed' || this._phase === 'forced') {
            return this._result!;
        }
        if (this._phase === 'shutting_down') {
            // Wait for the in-progress shutdown to complete
            return new Promise((resolve) => {
                const check = setInterval(() => {
                    if (this._phase === 'completed' || this._phase === 'forced') {
                        clearInterval(check);
                        resolve(this._result!);
                    }
                }, 100);
            });
        }

        this._phase = 'shutting_down';
        const shutdownStart = Date.now();
        const handlerResults: ShutdownResult['handlers'] = [];

        // Sort by priority (ascending — lower runs first)
        const sorted = [...this.handlers].sort((a, b) => a.priority - b.priority);

        log.info(`Graceful shutdown started (${sorted.length} handlers, grace period: ${this.gracePeriodMs}ms)`);

        // Overall grace period timeout
        const graceDeadline = shutdownStart + this.gracePeriodMs;

        for (const h of sorted) {
            const remaining = graceDeadline - Date.now();
            if (remaining <= 0) {
                log.warn(`Grace period exhausted — skipping remaining handlers (starting from "${h.name}")`);
                // Mark remaining handlers as timeout
                const idx = sorted.indexOf(h);
                for (let i = idx; i < sorted.length; i++) {
                    handlerResults.push({
                        name: sorted[i].name,
                        priority: sorted[i].priority,
                        status: 'timeout',
                        durationMs: 0,
                        error: 'Grace period exhausted',
                    });
                }
                break;
            }

            const effectiveTimeout = Math.min(h.timeoutMs, remaining);
            const handlerStart = Date.now();

            try {
                const result = h.handler();
                // If the handler returns a promise, race it against the timeout
                if (result && typeof (result as Promise<void>).then === 'function') {
                    await Promise.race([
                        result,
                        new Promise<never>((_, reject) =>
                            setTimeout(() => reject(new Error('timeout')), effectiveTimeout),
                        ),
                    ]);
                }
                const elapsed = Date.now() - handlerStart;
                handlerResults.push({
                    name: h.name,
                    priority: h.priority,
                    status: 'ok',
                    durationMs: elapsed,
                });
                log.debug(`  ✓ ${h.name} (${elapsed}ms)`);
            } catch (err) {
                const elapsed = Date.now() - handlerStart;
                const isTimeout = err instanceof Error && err.message === 'timeout';
                const status = isTimeout ? 'timeout' : 'error';
                const errorMsg = err instanceof Error ? err.message : String(err);

                handlerResults.push({
                    name: h.name,
                    priority: h.priority,
                    status,
                    durationMs: elapsed,
                    error: errorMsg,
                });

                if (isTimeout) {
                    log.warn(`  ⏱ ${h.name} timed out after ${effectiveTimeout}ms`);
                } else {
                    log.error(`  ✗ ${h.name} failed: ${errorMsg}`);
                }
            }
        }

        const totalDuration = Date.now() - shutdownStart;
        const hasTimeouts = handlerResults.some((r) => r.status === 'timeout');

        this._phase = hasTimeouts ? 'forced' : 'completed';
        this._result = {
            phase: this._phase,
            durationMs: totalDuration,
            handlers: handlerResults,
        };

        const okCount = handlerResults.filter((r) => r.status === 'ok').length;
        const errCount = handlerResults.filter((r) => r.status === 'error').length;
        const toCount = handlerResults.filter((r) => r.status === 'timeout').length;

        log.info(`Shutdown complete in ${totalDuration}ms (ok: ${okCount}, errors: ${errCount}, timeouts: ${toCount})`);

        return this._result;
    }

    /** Get status summary for health endpoint. */
    getStatus(): { phase: ShutdownPhase; handlerCount: number; result: ShutdownResult | null } {
        return {
            phase: this._phase,
            handlerCount: this.handlers.length,
            result: this._result,
        };
    }
}

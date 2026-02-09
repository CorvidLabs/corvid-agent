/**
 * SchedulerService — core engine for autonomous scheduled agent runs.
 *
 * Implements a 60-second tick loop that:
 *   1. Resets daily counters if the date has changed.
 *   2. Queries due schedules (active + next_run_at <= now).
 *   3. Skips schedules with an existing pending/running/awaiting_approval run.
 *   4. Dispatches runs up to the concurrency limit.
 *   5. Detects stale runs (running > 30 min with no live session).
 *
 * On startup, performs recovery: marks 'running' runs as 'interrupted' and
 * recomputes all next_run_at values from now.
 *
 * Supports graceful shutdown with a configurable drain timeout.
 */

import type { Database } from 'bun:sqlite';
import { Cron } from 'croner';
import { createLogger } from '../lib/logger';
import type { Schedule, ScheduleRun, SchedulerHealth, ScheduleEvent } from './types';
import { buildPrompt } from './prompts';
import {
    getDueSchedules,
    getActiveRunCount,
    getRunningRunCount,
    getRunningRuns,
    getActiveSchedules,
    getActiveScheduleCount,
    getNextGlobalRunAt,
    getTodayStats,
    getPendingApprovalRuns,
    createScheduleRun,
    updateScheduleRun,
    updateSchedule,
    getSchedule,
} from '../db/schedules';

const log = createLogger('Scheduler');

// ─── Environment config ──────────────────────────────────────────────────────

function envInt(key: string, fallback: number): number {
    const v = process.env[key];
    return v ? parseInt(v, 10) : fallback;
}

const POLL_INTERVAL_MS = envInt('SCHEDULER_POLL_INTERVAL_MS', 60_000);
const MAX_CONCURRENT = envInt('SCHEDULER_MAX_CONCURRENT', 2);
const FAILURE_THRESHOLD = envInt('SCHEDULER_FAILURE_THRESHOLD', 5);
const DRAIN_TIMEOUT_MS = envInt('SCHEDULER_DRAIN_TIMEOUT_MS', 30_000);
const MAX_SESSION_TIMEOUT_MS = envInt('SCHEDULER_MAX_SESSION_TIMEOUT_MS', 3_600_000);
const STALE_RUN_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

// ─── Service ─────────────────────────────────────────────────────────────────

export interface SchedulerServiceDeps {
    db: Database;
    /** Callback to start an agent session for a scheduled run. Returns sessionId. */
    startSession: (schedule: Schedule, run: ScheduleRun, prompt: string, timeoutMs: number) => Promise<string | null>;
    /** Check if a session is still alive. */
    isSessionAlive: (sessionId: string) => boolean;
    /** Emit a WebSocket event for subscribers. */
    emitEvent: (event: ScheduleEvent) => void;
    /** Injectable clock — defaults to real time, override in tests. */
    clock?: () => Date;
}

export class SchedulerService {
    private db: Database;
    private startSession: SchedulerServiceDeps['startSession'];
    private isSessionAlive: SchedulerServiceDeps['isSessionAlive'];
    private emitEvent: SchedulerServiceDeps['emitEvent'];
    private clock: () => Date;

    private tickTimer: ReturnType<typeof setInterval> | null = null;
    private paused = false;
    private lastTickAt: Date | null = null;
    private shuttingDown = false;

    constructor(deps: SchedulerServiceDeps) {
        this.db = deps.db;
        this.startSession = deps.startSession;
        this.isSessionAlive = deps.isSessionAlive;
        this.emitEvent = deps.emitEvent;
        this.clock = deps.clock ?? (() => new Date());
    }

    // ─── Lifecycle ───────────────────────────────────────────────────────────

    /** Perform startup recovery, then begin the tick loop. */
    start(): void {
        log.info('Scheduler starting', { pollIntervalMs: POLL_INTERVAL_MS, maxConcurrent: MAX_CONCURRENT });
        this.recoverOnStartup();
        this.tickTimer = setInterval(() => this.tick(), POLL_INTERVAL_MS);
        // Run first tick immediately
        this.tick();
    }

    /** Gracefully stop: pause, wait for running runs to drain, then force-interrupt. */
    async stop(): Promise<void> {
        if (this.shuttingDown) return;
        this.shuttingDown = true;
        this.paused = true;

        if (this.tickTimer) {
            clearInterval(this.tickTimer);
            this.tickTimer = null;
        }

        log.info('Scheduler shutting down, waiting for running runs to drain', { drainTimeoutMs: DRAIN_TIMEOUT_MS });

        const deadline = Date.now() + DRAIN_TIMEOUT_MS;
        while (Date.now() < deadline) {
            const runningCount = getRunningRunCount(this.db);
            if (runningCount === 0) {
                log.info('All runs drained');
                break;
            }
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        // Force-mark any survivors as interrupted
        const survivors = getRunningRuns(this.db);
        for (const run of survivors) {
            this.interruptRun(run, 'Server shutdown');
        }

        log.info('Scheduler stopped');
    }

    /** Emergency pause/resume — stops dispatching but keeps tick alive for stale detection. */
    setPaused(paused: boolean): void {
        this.paused = paused;
        log.info(`Scheduler ${paused ? 'paused' : 'resumed'}`);
    }

    isPaused(): boolean {
        return this.paused;
    }

    // ─── Startup Recovery ────────────────────────────────────────────────────

    private recoverOnStartup(): void {
        const now = this.clock();

        // Mark all 'running' runs as 'interrupted' (NOT failed — doesn't increment failures)
        const runningRuns = getRunningRuns(this.db);
        for (const run of runningRuns) {
            this.interruptRun(run, 'Server restart recovery');
        }
        if (runningRuns.length > 0) {
            log.info(`Recovered ${runningRuns.length} stale run(s) from previous instance`);
        }

        // Recompute daily counters for all active schedules
        const activeSchedules = getActiveSchedules(this.db);
        for (const schedule of activeSchedules) {
            this.resetDailyCountersIfNeeded(schedule);
            this.recomputeNextRunAt(schedule, now);
        }

        log.info(`Startup recovery complete`, { activeSchedules: activeSchedules.length });
    }

    // ─── Tick ────────────────────────────────────────────────────────────────

    private tick(): void {
        try {
            this.tickInner();
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            log.error('Tick failed', { error: message });
        }
    }

    private tickInner(): void {
        const now = this.clock();
        this.lastTickAt = now;

        // Detect stale runs first (always, even when paused)
        this.detectStaleRuns(now);

        if (this.paused || this.shuttingDown) return;

        // Query due schedules
        const dueSchedules = getDueSchedules(this.db, now);
        if (dueSchedules.length === 0) return;

        const currentRunning = getRunningRunCount(this.db);
        let slotsAvailable = MAX_CONCURRENT - currentRunning;

        for (const schedule of dueSchedules) {
            if (slotsAvailable <= 0) break;

            // Reset daily counters if date changed
            const freshSchedule = this.resetDailyCountersIfNeeded(schedule);

            // Skip if there's already an active run for this schedule
            const activeRuns = getActiveRunCount(this.db, freshSchedule.id);
            if (activeRuns > 0) {
                log.debug('Skipping schedule — active run exists', { scheduleId: freshSchedule.id });
                // Advance next_run_at so we don't re-check every tick
                this.recomputeNextRunAt(freshSchedule, now);
                continue;
            }

            // Budget check: daily budget
            if (freshSchedule.dailyCostUsd >= freshSchedule.dailyBudgetUsd) {
                log.info('Skipping schedule — daily budget exhausted', {
                    scheduleId: freshSchedule.id,
                    dailyCost: freshSchedule.dailyCostUsd,
                    dailyBudget: freshSchedule.dailyBudgetUsd,
                });
                this.recomputeNextRunAt(freshSchedule, now);
                continue;
            }

            // Dispatch the run
            this.dispatchRun(freshSchedule, now);
            slotsAvailable--;
        }
    }

    // ─── Dispatch ────────────────────────────────────────────────────────────

    private dispatchRun(schedule: Schedule, now: Date): void {
        const runId = crypto.randomUUID();

        // Create the run with a config snapshot
        const run = createScheduleRun(this.db, {
            id: runId,
            scheduleId: schedule.id,
            configSnapshot: schedule.actionConfig as unknown as Record<string, unknown>,
        });

        log.info('Dispatching scheduled run', {
            scheduleId: schedule.id,
            runId: run.id,
            actionType: schedule.actionType,
        });

        // Build prompt
        let prompt: string;
        let sessionTimeout: number;
        try {
            const result = buildPrompt(schedule.actionConfig);
            prompt = result.prompt;
            sessionTimeout = Math.min(result.sessionTimeout, MAX_SESSION_TIMEOUT_MS);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.failRun(run, schedule, `Prompt build failed: ${message}`);
            this.recomputeNextRunAt(schedule, now);
            return;
        }

        // Mark as running
        updateScheduleRun(this.db, run.id, {
            status: 'running',
            startedAt: now.toISOString(),
        });

        // Advance next_run_at and increment counters
        updateSchedule(this.db, schedule.id, {
            dailyRuns: schedule.dailyRuns + 1,
            totalRuns: schedule.totalRuns + 1,
        });
        this.recomputeNextRunAt(schedule, now);

        this.emitEvent({
            type: 'schedule_event',
            event: 'run_started',
            scheduleId: schedule.id,
            runId: run.id,
            patch: { dailyRuns: schedule.dailyRuns + 1, totalRuns: schedule.totalRuns + 1 },
        });

        // Start the session (async — fire and handle result)
        this.startSession(schedule, run, prompt, sessionTimeout).then((sessionId) => {
            if (!sessionId) {
                this.failRun(run, schedule, 'Failed to start agent session');
                return;
            }
            updateScheduleRun(this.db, run.id, { sessionId });
            log.info('Session started for scheduled run', {
                scheduleId: schedule.id,
                runId: run.id,
                sessionId,
            });
        }).catch((err) => {
            const message = err instanceof Error ? err.message : String(err);
            this.failRun(run, schedule, `Session start error: ${message}`);
        });
    }

    // ─── Run Completion ──────────────────────────────────────────────────────

    /** Called by the session lifecycle when a scheduled run's session completes. */
    onRunCompleted(runId: string, costUsd: number, output?: Record<string, unknown>): void {
        const run = updateScheduleRun(this.db, runId, {
            status: 'completed',
            costUsd,
            output: output ?? null,
            completedAt: this.clock().toISOString(),
        });
        if (!run) return;

        const schedule = getSchedule(this.db, run.scheduleId);
        if (!schedule) return;

        // Reset consecutive failures on success
        const updatedSchedule = updateSchedule(this.db, schedule.id, {
            consecutiveFailures: 0,
            dailyCostUsd: schedule.dailyCostUsd + costUsd,
        });

        // Post-run: check if max_budget_usd exceeded — auto-pause
        if (costUsd > schedule.maxBudgetUsd) {
            log.warn('Run exceeded max budget, pausing schedule', {
                scheduleId: schedule.id,
                runCost: costUsd,
                maxBudget: schedule.maxBudgetUsd,
            });
            updateSchedule(this.db, schedule.id, { status: 'paused' });
            this.emitEvent({
                type: 'schedule_event',
                event: 'schedule_paused',
                scheduleId: schedule.id,
                runId: run.id,
                patch: { status: 'paused' },
            });
            return;
        }

        this.emitEvent({
            type: 'schedule_event',
            event: 'run_completed',
            scheduleId: schedule.id,
            runId: run.id,
            patch: {
                consecutiveFailures: 0,
                dailyCostUsd: (updatedSchedule?.dailyCostUsd ?? schedule.dailyCostUsd + costUsd),
            },
        });

        log.info('Scheduled run completed', {
            scheduleId: schedule.id,
            runId: run.id,
            costUsd,
        });
    }

    /** Called when a run fails externally. */
    onRunFailed(runId: string, error: string): void {
        const run = updateScheduleRun(this.db, runId, {
            status: 'failed',
            error,
            completedAt: this.clock().toISOString(),
        });
        if (!run) return;

        const schedule = getSchedule(this.db, run.scheduleId);
        if (schedule) {
            this.incrementFailures(schedule);
        }

        this.emitEvent({
            type: 'schedule_event',
            event: 'run_failed',
            scheduleId: run.scheduleId,
            runId: run.id,
            patch: {},
        });
    }

    // ─── Stale Run Detection ─────────────────────────────────────────────────

    private detectStaleRuns(now: Date): void {
        const runningRuns = getRunningRuns(this.db);
        for (const run of runningRuns) {
            if (!run.startedAt) continue;

            const startedAt = new Date(run.startedAt).getTime();
            const elapsed = now.getTime() - startedAt;

            if (elapsed > STALE_RUN_THRESHOLD_MS) {
                // Check if session is still alive
                if (run.sessionId && this.isSessionAlive(run.sessionId)) {
                    continue; // Still alive, not stale
                }

                log.warn('Detected stale run, marking as failed', {
                    runId: run.id,
                    scheduleId: run.scheduleId,
                    elapsedMs: elapsed,
                });

                this.failRun(run, null, 'Stale run detected — session no longer alive');
            }
        }
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private failRun(run: ScheduleRun, schedule: Schedule | null, error: string): void {
        updateScheduleRun(this.db, run.id, {
            status: 'failed',
            error,
            completedAt: this.clock().toISOString(),
        });

        const sched = schedule ?? getSchedule(this.db, run.scheduleId);
        if (sched) {
            this.incrementFailures(sched);
        }

        this.emitEvent({
            type: 'schedule_event',
            event: 'run_failed',
            scheduleId: run.scheduleId,
            runId: run.id,
            patch: {},
        });

        log.error('Scheduled run failed', {
            scheduleId: run.scheduleId,
            runId: run.id,
            error,
        });
    }

    private interruptRun(run: ScheduleRun, reason: string): void {
        updateScheduleRun(this.db, run.id, {
            status: 'interrupted',
            error: reason,
            completedAt: this.clock().toISOString(),
        });

        this.emitEvent({
            type: 'schedule_event',
            event: 'run_interrupted',
            scheduleId: run.scheduleId,
            runId: run.id,
            patch: {},
        });

        log.info('Run interrupted', { runId: run.id, reason });
    }

    private incrementFailures(schedule: Schedule): void {
        const newCount = schedule.consecutiveFailures + 1;

        if (newCount >= FAILURE_THRESHOLD) {
            log.warn('Auto-pausing schedule after consecutive failures', {
                scheduleId: schedule.id,
                failures: newCount,
                threshold: FAILURE_THRESHOLD,
            });
            updateSchedule(this.db, schedule.id, {
                consecutiveFailures: newCount,
                status: 'error',
            });
            this.emitEvent({
                type: 'schedule_event',
                event: 'schedule_error',
                scheduleId: schedule.id,
                patch: { status: 'error', consecutiveFailures: newCount },
            });
        } else {
            updateSchedule(this.db, schedule.id, {
                consecutiveFailures: newCount,
            });
        }
    }

    private resetDailyCountersIfNeeded(schedule: Schedule): Schedule {
        const today = this.clock().toISOString().slice(0, 10);
        if (schedule.dailyResetDate === today) return schedule;

        const updated = updateSchedule(this.db, schedule.id, {
            dailyRuns: 0,
            dailyCostUsd: 0,
            dailyResetDate: today,
        });

        log.debug('Reset daily counters', { scheduleId: schedule.id, date: today });
        return updated ?? schedule;
    }

    private recomputeNextRunAt(schedule: Schedule, after: Date): void {
        try {
            const cron = new Cron(schedule.cronExpression);
            const next = cron.nextRun(after);
            const nextStr = next ? next.toISOString() : null;
            updateSchedule(this.db, schedule.id, { nextRunAt: nextStr });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            log.error('Failed to compute next_run_at', {
                scheduleId: schedule.id,
                cronExpression: schedule.cronExpression,
                error: message,
            });
        }
    }

    // ─── Health ──────────────────────────────────────────────────────────────

    getHealth(): SchedulerHealth {
        const now = this.clock();
        const today = now.toISOString().slice(0, 10);
        const stats = getTodayStats(this.db, today);
        const pendingApprovals = getPendingApprovalRuns(this.db);

        return {
            running: this.tickTimer !== null && !this.shuttingDown,
            paused: this.paused,
            lastTickAt: this.lastTickAt?.toISOString() ?? null,
            activeSchedules: getActiveScheduleCount(this.db),
            runningNow: getRunningRunCount(this.db),
            pendingApprovals: pendingApprovals.length,
            todayRuns: stats.runs,
            todayCostUsd: stats.costUsd,
            nextRunAt: getNextGlobalRunAt(this.db),
        };
    }
}

/**
 * UsageMonitor — watches scheduled session completions and detects anomalies.
 *
 * Responsibilities:
 * 1. Backfill schedule_executions.cost_usd from linked session costs on completion
 * 2. Detect long-running sessions (>30 min) and alert via notifications
 * 3. Detect cost spikes (>2x rolling average) and alert
 *
 * Part of #406: Usage & subscription monitor for scheduled sessions.
 */

import type { Database } from 'bun:sqlite';
import type { ProcessManager } from '../process/manager';
import type { NotificationService } from '../notifications/service';
import type { ClaudeStreamEvent } from '../process/types';
import { createLogger } from '../lib/logger';

const log = createLogger('UsageMonitor');

/** How often to check for long-running scheduled sessions (ms). */
const LONG_RUNNING_CHECK_INTERVAL_MS = 5 * 60_000; // 5 minutes

/** Threshold in seconds for "long running" alert. */
const LONG_RUNNING_THRESHOLD_SEC = 30 * 60; // 30 minutes

/** Minimum number of past executions needed before alerting on cost spikes. */
const MIN_EXECUTIONS_FOR_SPIKE = 3;

/** Cost spike multiplier (e.g. 2 = >2x average triggers alert). */
const COST_SPIKE_MULTIPLIER = 2;

export class UsageMonitor {
    private db: Database;
    private processManager: ProcessManager;
    private notificationService: NotificationService | null = null;
    private checkTimer: ReturnType<typeof setInterval> | null = null;
    /** Track which executions we've already alerted on to avoid spam. */
    private alertedExecutions = new Set<string>();

    constructor(db: Database, processManager: ProcessManager) {
        this.db = db;
        this.processManager = processManager;
    }

    setNotificationService(service: NotificationService): void {
        this.notificationService = service;
    }

    /** Start monitoring: subscribe to session events and poll for long-runners. */
    start(): void {
        // Subscribe to all session events to catch completions
        this.processManager.subscribeAll(this.onSessionEvent);

        // Periodically check for long-running scheduled sessions
        this.checkTimer = setInterval(() => this.checkLongRunning(), LONG_RUNNING_CHECK_INTERVAL_MS);

        log.info('Usage monitor started');
    }

    /** Stop monitoring. */
    stop(): void {
        this.processManager.unsubscribeAll(this.onSessionEvent);
        if (this.checkTimer) {
            clearInterval(this.checkTimer);
            this.checkTimer = null;
        }
        log.info('Usage monitor stopped');
    }

    /**
     * Backfill cost_usd for all schedule_executions that have a session_id
     * but cost_usd = 0. Called once on startup and can be triggered manually.
     */
    backfillCosts(): number {
        const result = this.db.query(`
            UPDATE schedule_executions
            SET cost_usd = (
                SELECT COALESCE(s.total_cost_usd, 0)
                FROM sessions s
                WHERE s.id = schedule_executions.session_id
            )
            WHERE session_id IS NOT NULL
              AND cost_usd = 0
              AND status IN ('completed', 'failed')
              AND EXISTS (
                  SELECT 1 FROM sessions s
                  WHERE s.id = schedule_executions.session_id
                    AND s.total_cost_usd > 0
              )
        `).run();

        if (result.changes > 0) {
            log.info('Backfilled execution costs', { updated: result.changes });
        }
        return result.changes;
    }

    // ─── Internal ────────────────────────────────────────────────────────────

    private onSessionEvent = (sessionId: string, event: ClaudeStreamEvent): void => {
        if (event.type !== 'session_exited' && event.type !== 'session_stopped') return;

        // Find any schedule_execution linked to this session
        const execution = this.db.query(`
            SELECT se.id, se.schedule_id, se.cost_usd
            FROM schedule_executions se
            WHERE se.session_id = ?
              AND se.status IN ('completed', 'failed', 'running')
            LIMIT 1
        `).get(sessionId) as { id: string; schedule_id: string; cost_usd: number } | null;

        if (!execution) return;

        // Get session cost
        const session = this.db.query(
            'SELECT total_cost_usd, total_turns FROM sessions WHERE id = ?'
        ).get(sessionId) as { total_cost_usd: number; total_turns: number } | null;

        if (!session) return;

        // Update execution cost from session
        if (session.total_cost_usd > 0 && execution.cost_usd === 0) {
            this.db.query(
                'UPDATE schedule_executions SET cost_usd = ? WHERE id = ?'
            ).run(session.total_cost_usd, execution.id);

            log.debug('Updated execution cost from session', {
                executionId: execution.id,
                sessionId,
                costUsd: session.total_cost_usd,
            });
        }

        // Check for cost spike
        this.checkCostSpike(execution.id, execution.schedule_id, session.total_cost_usd);
    };

    private checkCostSpike(executionId: string, scheduleId: string, costUsd: number): void {
        if (costUsd <= 0) return;

        // Get rolling average for this schedule (excluding current execution)
        const avg = this.db.query(`
            SELECT
                AVG(
                    CASE WHEN se.session_id IS NOT NULL
                        THEN COALESCE(sess.total_cost_usd, se.cost_usd)
                        ELSE se.cost_usd
                    END
                ) as avg_cost,
                COUNT(*) as exec_count
            FROM schedule_executions se
            LEFT JOIN sessions sess ON se.session_id = sess.id
            WHERE se.schedule_id = ?
              AND se.id != ?
              AND se.status = 'completed'
              AND se.started_at >= datetime('now', '-30 days')
        `).get(scheduleId, executionId) as { avg_cost: number | null; exec_count: number };

        if (!avg.avg_cost || avg.exec_count < MIN_EXECUTIONS_FOR_SPIKE) return;

        if (costUsd > avg.avg_cost * COST_SPIKE_MULTIPLIER) {
            const key = `spike:${executionId}`;
            if (this.alertedExecutions.has(key)) return;
            this.alertedExecutions.add(key);

            const scheduleName = this.getScheduleName(scheduleId);
            const message = `Schedule "${scheduleName}" latest execution cost $${costUsd.toFixed(4)} ` +
                `is ${(costUsd / avg.avg_cost).toFixed(1)}x the rolling average of $${avg.avg_cost.toFixed(4)} ` +
                `(based on ${avg.exec_count} executions over 30 days).`;

            log.warn('Cost spike detected', { executionId, scheduleId, costUsd, avgCost: avg.avg_cost });
            this.sendAlert(scheduleId, 'Cost Spike Detected', message, 'warning');
        }
    }

    private checkLongRunning(): void {
        // Find running schedule_executions that have been running too long
        const longRunning = this.db.query(`
            SELECT
                se.id,
                se.schedule_id,
                se.session_id,
                se.action_type,
                se.started_at,
                (julianday('now') - julianday(se.started_at)) * 86400 as duration_sec
            FROM schedule_executions se
            WHERE se.status = 'running'
              AND (julianday('now') - julianday(se.started_at)) * 86400 > ?
        `).all(LONG_RUNNING_THRESHOLD_SEC) as Array<{
            id: string;
            schedule_id: string;
            session_id: string | null;
            action_type: string;
            started_at: string;
            duration_sec: number;
        }>;

        for (const exec of longRunning) {
            const key = `long:${exec.id}`;
            if (this.alertedExecutions.has(key)) continue;
            this.alertedExecutions.add(key);

            const scheduleName = this.getScheduleName(exec.schedule_id);
            const durationMin = Math.round(exec.duration_sec / 60);
            const message = `Schedule "${scheduleName}" (${exec.action_type}) has been running for ${durationMin} minutes ` +
                `(started at ${exec.started_at}). Session: ${exec.session_id ?? 'N/A'}.`;

            log.warn('Long-running scheduled session detected', {
                executionId: exec.id,
                scheduleId: exec.schedule_id,
                durationMin,
            });
            this.sendAlert(exec.schedule_id, 'Long-Running Session', message, 'warning');
        }
    }

    private getScheduleName(scheduleId: string): string {
        const row = this.db.query(
            'SELECT name FROM agent_schedules WHERE id = ?'
        ).get(scheduleId) as { name: string } | null;
        return row?.name ?? scheduleId;
    }

    private sendAlert(scheduleId: string, title: string, message: string, level: string): void {
        if (!this.notificationService) {
            log.debug('No notification service, skipping alert', { title });
            return;
        }

        // Get the agent_id for this schedule
        const schedule = this.db.query(
            'SELECT agent_id FROM agent_schedules WHERE id = ?'
        ).get(scheduleId) as { agent_id: string } | null;

        if (!schedule) return;

        this.notificationService.notify({
            agentId: schedule.agent_id,
            title,
            message,
            level,
        }).catch(err => {
            log.warn('Failed to send usage alert', {
                title,
                error: err instanceof Error ? err.message : String(err),
            });
        });
    }
}

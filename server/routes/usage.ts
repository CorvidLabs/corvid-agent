/**
 * Usage API routes — provides per-schedule and per-day usage aggregates
 * for scheduled sessions, plus anomaly detection flags.
 *
 * Part of #406: Usage & subscription monitor for scheduled sessions.
 */

import type { Database } from 'bun:sqlite';
import { json, safeNumParam } from '../lib/response';

interface ScheduleUsageRow {
    schedule_id: string;
    schedule_name: string;
    agent_id: string;
    execution_count: number;
    completed_count: number;
    failed_count: number;
    total_cost_usd: number;
    avg_cost_usd: number;
    total_duration_sec: number;
    avg_duration_sec: number;
    total_turns: number;
    avg_turns: number;
    last_execution_at: string | null;
}

interface DailyUsageRow {
    date: string;
    execution_count: number;
    completed_count: number;
    failed_count: number;
    total_cost_usd: number;
    total_duration_sec: number;
    total_turns: number;
    unique_schedules: number;
}

interface ExecutionAnomalyRow {
    execution_id: string;
    schedule_id: string;
    schedule_name: string;
    action_type: string;
    duration_sec: number;
    cost_usd: number;
    started_at: string;
    completed_at: string | null;
    anomaly_type: string;
}

export function handleUsageRoutes(req: Request, url: URL, db: Database): Response | null {
    // GET /api/usage/summary — per-schedule aggregates + anomaly flags
    if (url.pathname === '/api/usage/summary' && req.method === 'GET') {
        const days = safeNumParam(url.searchParams.get('days'), 30);
        return handleUsageSummary(db, days);
    }

    // GET /api/usage/daily — per-day breakdown
    if (url.pathname === '/api/usage/daily' && req.method === 'GET') {
        const days = safeNumParam(url.searchParams.get('days'), 30);
        return handleDailyUsage(db, days);
    }

    // GET /api/usage/anomalies — current anomaly flags
    if (url.pathname === '/api/usage/anomalies' && req.method === 'GET') {
        const days = safeNumParam(url.searchParams.get('days'), 7);
        return handleAnomalies(db, days);
    }

    // GET /api/usage/schedule/:id — detailed usage for a specific schedule
    if (url.pathname.startsWith('/api/usage/schedule/') && req.method === 'GET') {
        const scheduleId = url.pathname.slice('/api/usage/schedule/'.length);
        const days = safeNumParam(url.searchParams.get('days'), 30);
        return handleScheduleUsage(db, scheduleId, days);
    }

    return null;
}

function handleUsageSummary(db: Database, days: number): Response {
    const clampedDays = Math.min(Math.max(days, 1), 365);

    // Per-schedule aggregates with session data joined
    const scheduleUsage = db.query(`
        SELECT
            se.schedule_id,
            s.name as schedule_name,
            se.agent_id,
            COUNT(*) as execution_count,
            SUM(CASE WHEN se.status = 'completed' THEN 1 ELSE 0 END) as completed_count,
            SUM(CASE WHEN se.status = 'failed' THEN 1 ELSE 0 END) as failed_count,
            COALESCE(SUM(
                CASE WHEN se.session_id IS NOT NULL
                    THEN COALESCE(sess.total_cost_usd, se.cost_usd)
                    ELSE se.cost_usd
                END
            ), 0) as total_cost_usd,
            COALESCE(AVG(
                CASE WHEN se.session_id IS NOT NULL
                    THEN COALESCE(sess.total_cost_usd, se.cost_usd)
                    ELSE se.cost_usd
                END
            ), 0) as avg_cost_usd,
            COALESCE(SUM(
                CASE WHEN se.completed_at IS NOT NULL
                    THEN (julianday(se.completed_at) - julianday(se.started_at)) * 86400
                    ELSE 0
                END
            ), 0) as total_duration_sec,
            COALESCE(AVG(
                CASE WHEN se.completed_at IS NOT NULL
                    THEN (julianday(se.completed_at) - julianday(se.started_at)) * 86400
                    ELSE NULL
                END
            ), 0) as avg_duration_sec,
            COALESCE(SUM(
                CASE WHEN se.session_id IS NOT NULL THEN sess.total_turns ELSE 0 END
            ), 0) as total_turns,
            COALESCE(AVG(
                CASE WHEN se.session_id IS NOT NULL THEN sess.total_turns ELSE NULL END
            ), 0) as avg_turns,
            MAX(se.started_at) as last_execution_at
        FROM schedule_executions se
        JOIN agent_schedules s ON se.schedule_id = s.id
        LEFT JOIN sessions sess ON se.session_id = sess.id
        WHERE se.started_at >= datetime('now', '-' || ? || ' days')
        GROUP BY se.schedule_id
        ORDER BY total_cost_usd DESC
    `).all(clampedDays) as ScheduleUsageRow[];

    // Totals
    const totals = db.query(`
        SELECT
            COUNT(*) as total_executions,
            SUM(CASE WHEN se.status = 'completed' THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN se.status = 'failed' THEN 1 ELSE 0 END) as failed,
            SUM(CASE WHEN se.status = 'running' THEN 1 ELSE 0 END) as running,
            COALESCE(SUM(
                CASE WHEN se.session_id IS NOT NULL
                    THEN COALESCE(sess.total_cost_usd, se.cost_usd)
                    ELSE se.cost_usd
                END
            ), 0) as total_cost_usd,
            COALESCE(SUM(
                CASE WHEN se.session_id IS NOT NULL THEN sess.total_turns ELSE 0 END
            ), 0) as total_turns
        FROM schedule_executions se
        LEFT JOIN sessions sess ON se.session_id = sess.id
        WHERE se.started_at >= datetime('now', '-' || ? || ' days')
    `).get(clampedDays) as Record<string, number>;

    return json({
        days: clampedDays,
        totals: {
            executions: totals.total_executions ?? 0,
            completed: totals.completed ?? 0,
            failed: totals.failed ?? 0,
            running: totals.running ?? 0,
            costUsd: totals.total_cost_usd ?? 0,
            turns: totals.total_turns ?? 0,
        },
        schedules: scheduleUsage.map(row => ({
            scheduleId: row.schedule_id,
            scheduleName: row.schedule_name,
            agentId: row.agent_id,
            executionCount: row.execution_count,
            completedCount: row.completed_count,
            failedCount: row.failed_count,
            totalCostUsd: row.total_cost_usd,
            avgCostUsd: row.avg_cost_usd,
            totalDurationSec: Math.round(row.total_duration_sec),
            avgDurationSec: Math.round(row.avg_duration_sec),
            totalTurns: row.total_turns,
            avgTurns: Math.round(row.avg_turns),
            lastExecutionAt: row.last_execution_at,
        })),
    });
}

function handleDailyUsage(db: Database, days: number): Response {
    const clampedDays = Math.min(Math.max(days, 1), 365);

    const daily = db.query(`
        SELECT
            date(se.started_at) as date,
            COUNT(*) as execution_count,
            SUM(CASE WHEN se.status = 'completed' THEN 1 ELSE 0 END) as completed_count,
            SUM(CASE WHEN se.status = 'failed' THEN 1 ELSE 0 END) as failed_count,
            COALESCE(SUM(
                CASE WHEN se.session_id IS NOT NULL
                    THEN COALESCE(sess.total_cost_usd, se.cost_usd)
                    ELSE se.cost_usd
                END
            ), 0) as total_cost_usd,
            COALESCE(SUM(
                CASE WHEN se.completed_at IS NOT NULL
                    THEN (julianday(se.completed_at) - julianday(se.started_at)) * 86400
                    ELSE 0
                END
            ), 0) as total_duration_sec,
            COALESCE(SUM(
                CASE WHEN se.session_id IS NOT NULL THEN sess.total_turns ELSE 0 END
            ), 0) as total_turns,
            COUNT(DISTINCT se.schedule_id) as unique_schedules
        FROM schedule_executions se
        LEFT JOIN sessions sess ON se.session_id = sess.id
        WHERE se.started_at >= datetime('now', '-' || ? || ' days')
        GROUP BY date(se.started_at)
        ORDER BY date ASC
    `).all(clampedDays) as DailyUsageRow[];

    return json({
        days: clampedDays,
        daily: daily.map(row => ({
            date: row.date,
            executionCount: row.execution_count,
            completedCount: row.completed_count,
            failedCount: row.failed_count,
            totalCostUsd: row.total_cost_usd,
            totalDurationSec: Math.round(row.total_duration_sec),
            totalTurns: row.total_turns,
            uniqueSchedules: row.unique_schedules,
        })),
    });
}

function handleAnomalies(db: Database, days: number): Response {
    const clampedDays = Math.min(Math.max(days, 1), 30);
    const anomalies: Array<{
        executionId: string;
        scheduleId: string;
        scheduleName: string;
        actionType: string;
        durationSec: number;
        costUsd: number;
        startedAt: string;
        completedAt: string | null;
        anomalyType: string;
    }> = [];

    // 1. Sessions running >30 minutes (including still-running ones)
    const longRunning = db.query(`
        SELECT
            se.id as execution_id,
            se.schedule_id,
            s.name as schedule_name,
            se.action_type,
            CASE
                WHEN se.completed_at IS NOT NULL
                    THEN (julianday(se.completed_at) - julianday(se.started_at)) * 86400
                ELSE (julianday('now') - julianday(se.started_at)) * 86400
            END as duration_sec,
            COALESCE(
                CASE WHEN se.session_id IS NOT NULL THEN sess.total_cost_usd ELSE se.cost_usd END,
                0
            ) as cost_usd,
            se.started_at,
            se.completed_at
        FROM schedule_executions se
        JOIN agent_schedules s ON se.schedule_id = s.id
        LEFT JOIN sessions sess ON se.session_id = sess.id
        WHERE se.started_at >= datetime('now', '-' || ? || ' days')
          AND (
              (se.status = 'running' AND (julianday('now') - julianday(se.started_at)) * 86400 > 1800)
              OR
              (se.completed_at IS NOT NULL AND (julianday(se.completed_at) - julianday(se.started_at)) * 86400 > 1800)
          )
        ORDER BY duration_sec DESC
    `).all(clampedDays) as ExecutionAnomalyRow[];

    for (const row of longRunning) {
        anomalies.push({
            executionId: row.execution_id,
            scheduleId: row.schedule_id,
            scheduleName: row.schedule_name,
            actionType: row.action_type,
            durationSec: Math.round(row.duration_sec),
            costUsd: row.cost_usd,
            startedAt: row.started_at,
            completedAt: row.completed_at,
            anomalyType: 'long_running',
        });
    }

    // 2. Schedules where latest execution cost >2x their rolling average
    const costSpikes = db.query(`
        WITH schedule_avg AS (
            SELECT
                se.schedule_id,
                AVG(
                    CASE WHEN se.session_id IS NOT NULL
                        THEN COALESCE(sess.total_cost_usd, se.cost_usd)
                        ELSE se.cost_usd
                    END
                ) as avg_cost
            FROM schedule_executions se
            LEFT JOIN sessions sess ON se.session_id = sess.id
            WHERE se.started_at >= datetime('now', '-30 days')
              AND se.status = 'completed'
            GROUP BY se.schedule_id
            HAVING COUNT(*) >= 3
        ),
        latest AS (
            SELECT
                se.id as execution_id,
                se.schedule_id,
                se.action_type,
                CASE WHEN se.session_id IS NOT NULL
                    THEN COALESCE(sess.total_cost_usd, se.cost_usd)
                    ELSE se.cost_usd
                END as cost_usd,
                se.started_at,
                se.completed_at,
                CASE WHEN se.completed_at IS NOT NULL
                    THEN (julianday(se.completed_at) - julianday(se.started_at)) * 86400
                    ELSE 0
                END as duration_sec,
                ROW_NUMBER() OVER (PARTITION BY se.schedule_id ORDER BY se.started_at DESC) as rn
            FROM schedule_executions se
            LEFT JOIN sessions sess ON se.session_id = sess.id
            WHERE se.started_at >= datetime('now', '-' || ? || ' days')
              AND se.status = 'completed'
        )
        SELECT
            l.execution_id,
            l.schedule_id,
            s.name as schedule_name,
            l.action_type,
            l.duration_sec,
            l.cost_usd,
            l.started_at,
            l.completed_at,
            sa.avg_cost
        FROM latest l
        JOIN schedule_avg sa ON l.schedule_id = sa.schedule_id
        JOIN agent_schedules s ON l.schedule_id = s.id
        WHERE l.rn = 1
          AND l.cost_usd > sa.avg_cost * 2
          AND sa.avg_cost > 0
    `).all(clampedDays) as (ExecutionAnomalyRow & { avg_cost: number })[];

    for (const row of costSpikes) {
        anomalies.push({
            executionId: row.execution_id,
            scheduleId: row.schedule_id,
            scheduleName: row.schedule_name,
            actionType: row.action_type,
            durationSec: Math.round(row.duration_sec),
            costUsd: row.cost_usd,
            startedAt: row.started_at,
            completedAt: row.completed_at,
            anomalyType: 'cost_spike',
        });
    }

    return json({
        days: clampedDays,
        anomalies,
        counts: {
            longRunning: longRunning.length,
            costSpikes: costSpikes.length,
            total: anomalies.length,
        },
    });
}

function handleScheduleUsage(db: Database, scheduleId: string, days: number): Response {
    const clampedDays = Math.min(Math.max(days, 1), 365);

    // Schedule info
    const schedule = db.query(
        'SELECT id, name, agent_id, status, cron_expression, max_budget_per_run FROM agent_schedules WHERE id = ?'
    ).get(scheduleId) as Record<string, unknown> | null;

    if (!schedule) {
        return json({ error: 'Schedule not found' }, 404);
    }

    // Aggregate stats for this schedule
    const stats = db.query(`
        SELECT
            COUNT(*) as execution_count,
            SUM(CASE WHEN se.status = 'completed' THEN 1 ELSE 0 END) as completed_count,
            SUM(CASE WHEN se.status = 'failed' THEN 1 ELSE 0 END) as failed_count,
            COALESCE(SUM(
                CASE WHEN se.session_id IS NOT NULL
                    THEN COALESCE(sess.total_cost_usd, se.cost_usd)
                    ELSE se.cost_usd
                END
            ), 0) as total_cost_usd,
            COALESCE(AVG(
                CASE WHEN se.session_id IS NOT NULL
                    THEN COALESCE(sess.total_cost_usd, se.cost_usd)
                    ELSE se.cost_usd
                END
            ), 0) as avg_cost_usd,
            COALESCE(AVG(
                CASE WHEN se.completed_at IS NOT NULL
                    THEN (julianday(se.completed_at) - julianday(se.started_at)) * 86400
                    ELSE NULL
                END
            ), 0) as avg_duration_sec,
            COALESCE(SUM(
                CASE WHEN se.session_id IS NOT NULL THEN sess.total_turns ELSE 0 END
            ), 0) as total_turns
        FROM schedule_executions se
        LEFT JOIN sessions sess ON se.session_id = sess.id
        WHERE se.schedule_id = ?
          AND se.started_at >= datetime('now', '-' || ? || ' days')
    `).get(scheduleId, clampedDays) as Record<string, number>;

    // Daily breakdown for this schedule
    const daily = db.query(`
        SELECT
            date(se.started_at) as date,
            COUNT(*) as execution_count,
            COALESCE(SUM(
                CASE WHEN se.session_id IS NOT NULL
                    THEN COALESCE(sess.total_cost_usd, se.cost_usd)
                    ELSE se.cost_usd
                END
            ), 0) as cost_usd,
            COALESCE(SUM(
                CASE WHEN se.session_id IS NOT NULL THEN sess.total_turns ELSE 0 END
            ), 0) as turns
        FROM schedule_executions se
        LEFT JOIN sessions sess ON se.session_id = sess.id
        WHERE se.schedule_id = ?
          AND se.started_at >= datetime('now', '-' || ? || ' days')
        GROUP BY date(se.started_at)
        ORDER BY date ASC
    `).all(scheduleId, clampedDays) as { date: string; execution_count: number; cost_usd: number; turns: number }[];

    // Recent executions (last 20)
    const recent = db.query(`
        SELECT
            se.id,
            se.status,
            se.action_type,
            se.session_id,
            COALESCE(
                CASE WHEN se.session_id IS NOT NULL THEN sess.total_cost_usd ELSE se.cost_usd END,
                0
            ) as cost_usd,
            COALESCE(
                CASE WHEN se.session_id IS NOT NULL THEN sess.total_turns ELSE 0 END,
                0
            ) as turns,
            CASE WHEN se.completed_at IS NOT NULL
                THEN ROUND((julianday(se.completed_at) - julianday(se.started_at)) * 86400)
                ELSE NULL
            END as duration_sec,
            se.started_at,
            se.completed_at
        FROM schedule_executions se
        LEFT JOIN sessions sess ON se.session_id = sess.id
        WHERE se.schedule_id = ?
        ORDER BY se.started_at DESC
        LIMIT 20
    `).all(scheduleId) as Array<Record<string, unknown>>;

    return json({
        schedule: {
            id: schedule.id,
            name: schedule.name,
            agentId: schedule.agent_id,
            status: schedule.status,
            cronExpression: schedule.cron_expression,
            maxBudgetPerRun: schedule.max_budget_per_run,
        },
        days: clampedDays,
        stats: {
            executionCount: stats.execution_count ?? 0,
            completedCount: stats.completed_count ?? 0,
            failedCount: stats.failed_count ?? 0,
            totalCostUsd: stats.total_cost_usd ?? 0,
            avgCostUsd: stats.avg_cost_usd ?? 0,
            avgDurationSec: Math.round(stats.avg_duration_sec ?? 0),
            totalTurns: stats.total_turns ?? 0,
        },
        daily,
        recent: recent.map(r => ({
            id: r.id,
            status: r.status,
            actionType: r.action_type,
            sessionId: r.session_id,
            costUsd: r.cost_usd,
            turns: r.turns,
            durationSec: r.duration_sec,
            startedAt: r.started_at,
            completedAt: r.completed_at,
        })),
    });
}

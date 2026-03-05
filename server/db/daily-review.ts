/**
 * DB query helpers for the daily review schedule action.
 *
 * Provides date-filtered aggregations over schedule_executions, pr_outcomes,
 * and server_health_snapshots for a single day's retrospective.
 */

import type { Database } from 'bun:sqlite';

// ─── Schedule Execution Stats ────────────────────────────────────────────────

export interface ExecutionStats {
    total: number;
    completed: number;
    failed: number;
    cancelled: number;
    byActionType: Record<string, number>;
}

interface ActionTypeCountRow {
    action_type: string;
    count: number;
}

interface StatusCountRow {
    status: string;
    count: number;
}

export function getExecutionStatsForDay(db: Database, date: string): ExecutionStats {
    const dayStart = `${date}T00:00:00.000Z`;
    const dayEnd = `${date}T23:59:59.999Z`;

    const statusRows = db.query(
        `SELECT status, COUNT(*) as count
         FROM schedule_executions
         WHERE started_at >= ? AND started_at <= ?
         GROUP BY status`,
    ).all(dayStart, dayEnd) as StatusCountRow[];

    const actionRows = db.query(
        `SELECT action_type, COUNT(*) as count
         FROM schedule_executions
         WHERE started_at >= ? AND started_at <= ?
         GROUP BY action_type`,
    ).all(dayStart, dayEnd) as ActionTypeCountRow[];

    const stats: ExecutionStats = {
        total: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
        byActionType: {},
    };

    for (const row of statusRows) {
        const count = row.count;
        stats.total += count;
        if (row.status === 'completed') stats.completed = count;
        else if (row.status === 'failed') stats.failed = count;
        else if (row.status === 'cancelled') stats.cancelled = count;
    }

    for (const row of actionRows) {
        stats.byActionType[row.action_type] = row.count;
    }

    return stats;
}

// ─── PR Outcome Stats ────────────────────────────────────────────────────────

export interface DailyPrStats {
    opened: number;
    merged: number;
    closed: number;
    rejectedRepos: string[];
}

interface PrStateCountRow {
    pr_state: string;
    count: number;
}

export function getPrStatsForDay(db: Database, date: string): DailyPrStats {
    const dayStart = `${date}T00:00:00.000Z`;
    const dayEnd = `${date}T23:59:59.999Z`;

    // PRs opened today
    const openedRow = db.query(
        `SELECT COUNT(*) as cnt FROM pr_outcomes
         WHERE created_at >= ? AND created_at <= ?`,
    ).get(dayStart, dayEnd) as { cnt: number } | null;

    // PRs resolved (merged/closed) today
    const resolvedRows = db.query(
        `SELECT pr_state, COUNT(*) as count FROM pr_outcomes
         WHERE resolved_at >= ? AND resolved_at <= ?
         GROUP BY pr_state`,
    ).all(dayStart, dayEnd) as PrStateCountRow[];

    // Repos that rejected PRs today
    const rejectedRows = db.query(
        `SELECT DISTINCT repo FROM pr_outcomes
         WHERE pr_state = 'closed' AND resolved_at >= ? AND resolved_at <= ?`,
    ).all(dayStart, dayEnd) as { repo: string }[];

    const stats: DailyPrStats = {
        opened: openedRow?.cnt ?? 0,
        merged: 0,
        closed: 0,
        rejectedRepos: rejectedRows.map(r => r.repo),
    };

    for (const row of resolvedRows) {
        if (row.pr_state === 'merged') stats.merged = row.count;
        else if (row.pr_state === 'closed') stats.closed = row.count;
    }

    return stats;
}

// ─── Health Snapshot Delta ───────────────────────────────────────────────────

export interface HealthDelta {
    snapshotCount: number;
    healthyCount: number;
    degradedCount: number;
    unhealthyCount: number;
    uptimePercent: number;
}

export function getHealthDeltaForDay(db: Database, date: string): HealthDelta {
    const dayStart = `${date}T00:00:00.000Z`;
    const dayEnd = `${date}T23:59:59.999Z`;

    const row = db.query(`
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN status = 'healthy' THEN 1 ELSE 0 END) as healthy,
            SUM(CASE WHEN status = 'degraded' THEN 1 ELSE 0 END) as degraded,
            SUM(CASE WHEN status = 'unhealthy' THEN 1 ELSE 0 END) as unhealthy
        FROM server_health_snapshots
        WHERE timestamp >= ? AND timestamp <= ?
    `).get(dayStart, dayEnd) as {
        total: number;
        healthy: number;
        degraded: number;
        unhealthy: number;
    };

    const total = row.total || 0;
    const healthy = row.healthy || 0;
    const degraded = row.degraded || 0;

    return {
        snapshotCount: total,
        healthyCount: healthy,
        degradedCount: degraded,
        unhealthyCount: row.unhealthy || 0,
        uptimePercent: total > 0
            ? Math.round(((healthy + degraded) / total) * 10000) / 100
            : 100,
    };
}

/**
 * Health metrics time-series storage + trend analysis.
 *
 * Stores health snapshots so the improvement loop can detect trends
 * (improving / stable / regressing) across successive cycles.
 */

import type { Database } from 'bun:sqlite';
import type { HealthMetrics } from './health-collector';
import { createLogger } from '../lib/logger';

const log = createLogger('HealthStore');

// ─── Types ───────────────────────────────────────────────────────────────────

export interface HealthSnapshot {
    id: string;
    agentId: string;
    projectId: string;
    tscErrorCount: number;
    tscPassed: boolean;
    testsPassed: boolean;
    testFailureCount: number;
    todoCount: number;
    fixmeCount: number;
    hackCount: number;
    largeFileCount: number;
    outdatedDepCount: number;
    collectedAt: string;
}

export type TrendDirection = 'improving' | 'stable' | 'regressing';

export interface MetricTrend {
    metric: string;
    direction: TrendDirection;
    values: number[];
}

// ─── Storage ─────────────────────────────────────────────────────────────────

export function saveHealthSnapshot(
    db: Database,
    agentId: string,
    projectId: string,
    metrics: HealthMetrics,
): HealthSnapshot {
    const id = crypto.randomUUID();
    db.query(`
        INSERT INTO health_snapshots
            (id, agent_id, project_id, tsc_error_count, tsc_passed, tests_passed,
             test_failure_count, todo_count, fixme_count, hack_count,
             large_file_count, outdated_dep_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id, agentId, projectId,
        metrics.tscErrorCount, metrics.tscPassed ? 1 : 0,
        metrics.testsPassed ? 1 : 0, metrics.testFailureCount,
        metrics.todoCount, metrics.fixmeCount, metrics.hackCount,
        metrics.largeFiles.length, metrics.outdatedDeps.length,
    );

    log.debug('Saved health snapshot', { id, agentId, projectId });

    return {
        id,
        agentId,
        projectId,
        tscErrorCount: metrics.tscErrorCount,
        tscPassed: metrics.tscPassed,
        testsPassed: metrics.testsPassed,
        testFailureCount: metrics.testFailureCount,
        todoCount: metrics.todoCount,
        fixmeCount: metrics.fixmeCount,
        hackCount: metrics.hackCount,
        largeFileCount: metrics.largeFiles.length,
        outdatedDepCount: metrics.outdatedDeps.length,
        collectedAt: new Date().toISOString(),
    };
}

interface HealthSnapshotRow {
    id: string;
    agent_id: string;
    project_id: string;
    tsc_error_count: number;
    tsc_passed: number;
    tests_passed: number;
    test_failure_count: number;
    todo_count: number;
    fixme_count: number;
    hack_count: number;
    large_file_count: number;
    outdated_dep_count: number;
    collected_at: string;
}

function rowToSnapshot(row: HealthSnapshotRow): HealthSnapshot {
    return {
        id: row.id,
        agentId: row.agent_id,
        projectId: row.project_id,
        tscErrorCount: row.tsc_error_count,
        tscPassed: row.tsc_passed === 1,
        testsPassed: row.tests_passed === 1,
        testFailureCount: row.test_failure_count,
        todoCount: row.todo_count,
        fixmeCount: row.fixme_count,
        hackCount: row.hack_count,
        largeFileCount: row.large_file_count,
        outdatedDepCount: row.outdated_dep_count,
        collectedAt: row.collected_at,
    };
}

export function getRecentSnapshots(
    db: Database,
    agentId: string,
    projectId: string,
    limit: number = 10,
): HealthSnapshot[] {
    const rows = db.query(`
        SELECT * FROM health_snapshots
        WHERE agent_id = ? AND project_id = ?
        ORDER BY collected_at DESC
        LIMIT ?
    `).all(agentId, projectId, limit) as HealthSnapshotRow[];

    return rows.map(rowToSnapshot);
}

// ─── Trends ──────────────────────────────────────────────────────────────────

/**
 * Classify the direction of a metric series.
 * Compares the first half average to the second half average.
 * Needs at least 2 values.
 */
function classifyDirection(values: number[], lowerIsBetter: boolean): TrendDirection {
    if (values.length < 2) return 'stable';

    const mid = Math.ceil(values.length / 2);
    const older = values.slice(0, mid);
    const newer = values.slice(mid);

    const avgOlder = older.reduce((a, b) => a + b, 0) / older.length;
    const avgNewer = newer.reduce((a, b) => a + b, 0) / newer.length;

    const diff = avgNewer - avgOlder;
    const threshold = Math.max(1, avgOlder * 0.1); // 10% or at least 1

    if (Math.abs(diff) < threshold) return 'stable';

    if (lowerIsBetter) {
        return diff < 0 ? 'improving' : 'regressing';
    }
    return diff > 0 ? 'improving' : 'regressing';
}

/**
 * Compute trends from a list of snapshots (oldest first recommended).
 * Returns per-metric trend directions.
 */
export function computeTrends(snapshots: HealthSnapshot[]): MetricTrend[] {
    if (snapshots.length < 2) return [];

    // Snapshots come in DESC order from the query — reverse to chronological
    const chronological = [...snapshots].reverse();

    const metrics: Array<{ metric: string; values: number[]; lowerIsBetter: boolean }> = [
        { metric: 'tsc_errors', values: chronological.map((s) => s.tscErrorCount), lowerIsBetter: true },
        { metric: 'test_failures', values: chronological.map((s) => s.testFailureCount), lowerIsBetter: true },
        { metric: 'todos', values: chronological.map((s) => s.todoCount), lowerIsBetter: true },
        { metric: 'fixmes', values: chronological.map((s) => s.fixmeCount), lowerIsBetter: true },
        { metric: 'hacks', values: chronological.map((s) => s.hackCount), lowerIsBetter: true },
        { metric: 'large_files', values: chronological.map((s) => s.largeFileCount), lowerIsBetter: true },
        { metric: 'outdated_deps', values: chronological.map((s) => s.outdatedDepCount), lowerIsBetter: true },
    ];

    return metrics.map(({ metric, values, lowerIsBetter }) => ({
        metric,
        direction: classifyDirection(values, lowerIsBetter),
        values,
    }));
}

/**
 * Format trends as a human-readable prompt section.
 */
export function formatTrendsForPrompt(trends: MetricTrend[]): string {
    if (trends.length === 0) return 'No trend data available yet (need at least 2 improvement cycles).';

    const directionLabel: Record<TrendDirection, string> = {
        improving: 'IMPROVING',
        stable: 'STABLE',
        regressing: 'REGRESSING',
    };

    const lines = trends.map((t) => {
        const vals = t.values.join(' -> ');
        return `  - ${t.metric}: ${vals} [${directionLabel[t.direction]}]`;
    });

    return lines.join('\n');
}

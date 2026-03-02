/**
 * Performance metrics collector.
 *
 * Periodically samples system performance (memory, DB health, disk usage)
 * and persists snapshots to the performance_metrics table for trend detection.
 */

import type { Database } from 'bun:sqlite';
import { statSync } from 'node:fs';
import { createLogger } from '../lib/logger';

const log = createLogger('PerfCollector');

/** How often to collect snapshots (default: 5 minutes). */
const COLLECT_INTERVAL_MS = parseInt(process.env.PERF_COLLECT_INTERVAL_MS ?? '300000', 10);

/** How long to retain metrics (default: 90 days). */
const RETENTION_DAYS = parseInt(process.env.PERF_RETENTION_DAYS ?? '90', 10);

/** Slow query threshold in ms. */
export const SLOW_QUERY_THRESHOLD_MS = parseInt(process.env.SLOW_QUERY_THRESHOLD_MS ?? '100', 10);

export interface PerformanceSnapshot {
    timestamp: string;
    memory: {
        heapUsed: number;
        heapTotal: number;
        rss: number;
        external: number;
    };
    db: {
        sizeBytes: number;
        latencyMs: number;
    };
    uptime: number;
}

export class PerformanceCollector {
    private db: Database;
    private dbPath: string;
    private timer: ReturnType<typeof setInterval> | null = null;
    private startTime: number;

    constructor(db: Database, dbPath: string = 'corvid-agent.db', startTime?: number) {
        this.db = db;
        this.dbPath = dbPath;
        this.startTime = startTime ?? Date.now();
    }

    /** Start periodic collection. */
    start(): void {
        if (this.timer) return;
        // Collect immediately on start, then at interval
        this.collect().catch(err => {
            log.warn('Initial collection failed', { error: err instanceof Error ? err.message : String(err) });
        });
        this.timer = setInterval(() => {
            this.collect().catch(err => {
                log.warn('Collection failed', { error: err instanceof Error ? err.message : String(err) });
            });
        }, COLLECT_INTERVAL_MS);
        log.info('Performance collector started', { intervalMs: COLLECT_INTERVAL_MS, retentionDays: RETENTION_DAYS });
    }

    /** Stop periodic collection. */
    stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
            log.info('Performance collector stopped');
        }
    }

    /** Take a single snapshot and persist it. */
    async collect(): Promise<PerformanceSnapshot> {
        const snapshot = this.takeSnapshot();
        this.persistSnapshot(snapshot);
        this.pruneOldMetrics();
        return snapshot;
    }

    /** Take a point-in-time snapshot without persisting. */
    takeSnapshot(): PerformanceSnapshot {
        const mem = process.memoryUsage();
        const dbStats = this.measureDb();

        return {
            timestamp: new Date().toISOString(),
            memory: {
                heapUsed: mem.heapUsed,
                heapTotal: mem.heapTotal,
                rss: mem.rss,
                external: mem.external,
            },
            db: dbStats,
            uptime: Math.round((Date.now() - this.startTime) / 1000),
        };
    }

    /** Record a slow query event. */
    recordSlowQuery(operation: string, durationMs: number): void {
        if (durationMs < SLOW_QUERY_THRESHOLD_MS) return;
        try {
            this.db.query(
                `INSERT INTO performance_metrics (metric, labels, value, unit) VALUES (?, ?, ?, ?)`,
            ).run('db_slow_query', operation, durationMs, 'ms');
        } catch {
            // Non-critical — don't let metrics recording break the caller
        }
    }

    /** Get latest snapshot from DB. */
    getLatestSnapshot(): PerformanceSnapshot | null {
        const metrics = this.db.query(`
            SELECT metric, value, unit, timestamp
            FROM performance_metrics
            WHERE metric IN ('memory_heap_used', 'memory_rss', 'memory_heap_total', 'memory_external',
                             'db_size', 'db_latency', 'uptime')
            ORDER BY timestamp DESC
            LIMIT 7
        `).all() as { metric: string; value: number; unit: string | null; timestamp: string }[];

        if (metrics.length === 0) return null;

        const byMetric = new Map<string, number>();
        let ts = '';
        for (const m of metrics) {
            byMetric.set(m.metric, m.value);
            if (!ts) ts = m.timestamp;
        }

        return {
            timestamp: ts,
            memory: {
                heapUsed: byMetric.get('memory_heap_used') ?? 0,
                heapTotal: byMetric.get('memory_heap_total') ?? 0,
                rss: byMetric.get('memory_rss') ?? 0,
                external: byMetric.get('memory_external') ?? 0,
            },
            db: {
                sizeBytes: byMetric.get('db_size') ?? 0,
                latencyMs: byMetric.get('db_latency') ?? 0,
            },
            uptime: byMetric.get('uptime') ?? 0,
        };
    }

    /** Get time-series data for a metric over a date range. */
    getTimeSeries(metric: string, days: number = 7): { timestamp: string; value: number }[] {
        const clampedDays = Math.min(Math.max(days, 1), 365);
        return this.db.query(`
            SELECT timestamp, value
            FROM performance_metrics
            WHERE metric = ?
              AND timestamp >= datetime('now', '-' || ? || ' days')
            ORDER BY timestamp ASC
        `).all(metric, clampedDays) as { timestamp: string; value: number }[];
    }

    /** Get available metric names. */
    getMetricNames(): string[] {
        const rows = this.db.query(`
            SELECT DISTINCT metric FROM performance_metrics ORDER BY metric
        `).all() as { metric: string }[];
        return rows.map(r => r.metric);
    }

    /**
     * Detect regressions by comparing this week's average vs last week's.
     * Returns metrics where the current week is >25% worse.
     */
    detectRegressions(thresholdPercent: number = 25): Regression[] {
        const regressions: Regression[] = [];

        // Metrics where higher = worse
        const higherIsWorse = ['memory_rss', 'memory_heap_used', 'db_size', 'db_latency'];

        for (const metric of higherIsWorse) {
            const thisWeek = this.db.query(`
                SELECT AVG(value) as avg_value, COUNT(*) as sample_count
                FROM performance_metrics
                WHERE metric = ?
                  AND timestamp >= datetime('now', '-7 days')
            `).get(metric) as { avg_value: number | null; sample_count: number } | null;

            const lastWeek = this.db.query(`
                SELECT AVG(value) as avg_value, COUNT(*) as sample_count
                FROM performance_metrics
                WHERE metric = ?
                  AND timestamp >= datetime('now', '-14 days')
                  AND timestamp < datetime('now', '-7 days')
            `).get(metric) as { avg_value: number | null; sample_count: number } | null;

            if (!thisWeek?.avg_value || !lastWeek?.avg_value || lastWeek.sample_count < 5) continue;

            const changePercent = ((thisWeek.avg_value - lastWeek.avg_value) / lastWeek.avg_value) * 100;
            if (changePercent > thresholdPercent) {
                regressions.push({
                    metric,
                    thisWeekAvg: Math.round(thisWeek.avg_value * 100) / 100,
                    lastWeekAvg: Math.round(lastWeek.avg_value * 100) / 100,
                    changePercent: Math.round(changePercent * 10) / 10,
                    severity: changePercent > 50 ? 'critical' : 'warning',
                });
            }
        }

        // Slow query count regression
        const slowThisWeek = this.db.query(`
            SELECT COUNT(*) as count FROM performance_metrics
            WHERE metric = 'db_slow_query'
              AND timestamp >= datetime('now', '-7 days')
        `).get() as { count: number };

        const slowLastWeek = this.db.query(`
            SELECT COUNT(*) as count FROM performance_metrics
            WHERE metric = 'db_slow_query'
              AND timestamp >= datetime('now', '-14 days')
              AND timestamp < datetime('now', '-7 days')
        `).get() as { count: number };

        if (slowLastWeek.count > 0 && slowThisWeek.count > 0) {
            const changePercent = ((slowThisWeek.count - slowLastWeek.count) / slowLastWeek.count) * 100;
            if (changePercent > thresholdPercent) {
                regressions.push({
                    metric: 'db_slow_query_count',
                    thisWeekAvg: slowThisWeek.count,
                    lastWeekAvg: slowLastWeek.count,
                    changePercent: Math.round(changePercent * 10) / 10,
                    severity: changePercent > 50 ? 'critical' : 'warning',
                });
            }
        }

        return regressions;
    }

    /** Get a performance summary suitable for a status report. */
    getStatusReportSection(): PerformanceReport {
        const snapshot = this.takeSnapshot();
        const regressions = this.detectRegressions();

        // Get slow query count for today
        const slowToday = this.db.query(`
            SELECT COUNT(*) as count FROM performance_metrics
            WHERE metric = 'db_slow_query'
              AND timestamp >= datetime('now', 'start of day')
        `).get() as { count: number };

        // Get total metrics count for storage info
        const totalRows = this.db.query(`
            SELECT COUNT(*) as count FROM performance_metrics
        `).get() as { count: number };

        return {
            snapshot,
            regressions,
            slowQueriestoday: slowToday.count,
            metricsStoredTotal: totalRows.count,
        };
    }

    // ─── Private ──────────────────────────────────────────────────────────

    private measureDb(): { sizeBytes: number; latencyMs: number } {
        let sizeBytes = 0;
        try {
            const stat = statSync(this.dbPath);
            sizeBytes = stat.size;
        } catch {
            // DB file may not exist yet
        }

        const start = performance.now();
        try {
            this.db.query('SELECT 1').get();
        } catch {
            // DB may be locked
        }
        const latencyMs = Math.round((performance.now() - start) * 100) / 100;

        return { sizeBytes, latencyMs };
    }

    private persistSnapshot(snapshot: PerformanceSnapshot): void {
        try {
            const insert = this.db.query(
                `INSERT INTO performance_metrics (metric, value, unit) VALUES (?, ?, ?)`,
            );
            const transaction = this.db.transaction(() => {
                insert.run('memory_heap_used', snapshot.memory.heapUsed, 'bytes');
                insert.run('memory_heap_total', snapshot.memory.heapTotal, 'bytes');
                insert.run('memory_rss', snapshot.memory.rss, 'bytes');
                insert.run('memory_external', snapshot.memory.external, 'bytes');
                insert.run('db_size', snapshot.db.sizeBytes, 'bytes');
                insert.run('db_latency', snapshot.db.latencyMs, 'ms');
                insert.run('uptime', snapshot.uptime, 'seconds');
            });
            transaction();
        } catch (err) {
            log.warn('Failed to persist snapshot', { error: err instanceof Error ? err.message : String(err) });
        }
    }

    private pruneOldMetrics(): void {
        try {
            const result = this.db.query(
                `DELETE FROM performance_metrics WHERE timestamp < datetime('now', '-' || ? || ' days')`,
            ).run(RETENTION_DAYS);
            if (result.changes > 0) {
                log.info('Pruned old metrics', { deleted: result.changes });
            }
        } catch {
            // Non-critical
        }
    }
}

export interface Regression {
    metric: string;
    thisWeekAvg: number;
    lastWeekAvg: number;
    changePercent: number;
    severity: 'warning' | 'critical';
}

export interface PerformanceReport {
    snapshot: PerformanceSnapshot;
    regressions: Regression[];
    slowQueriestoday: number;
    metricsStoredTotal: number;
}

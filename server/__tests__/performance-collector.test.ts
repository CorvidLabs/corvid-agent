import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { PerformanceCollector, SLOW_QUERY_THRESHOLD_MS } from '../performance/collector';

/**
 * Performance collector tests — snapshot collection, persistence,
 * slow query tracking, time-series retrieval, and regression detection.
 */

function createTestDb(): Database {
    const db = new Database(':memory:');
    db.exec(`
        CREATE TABLE performance_metrics (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp  TEXT    NOT NULL DEFAULT (datetime('now')),
            metric     TEXT    NOT NULL,
            labels     TEXT    DEFAULT NULL,
            value      REAL    NOT NULL,
            unit       TEXT    DEFAULT NULL
        )
    `);
    db.exec(`CREATE INDEX idx_perf_metric_ts ON performance_metrics(metric, timestamp)`);
    db.exec(`CREATE INDEX idx_perf_ts ON performance_metrics(timestamp)`);
    return db;
}

describe('PerformanceCollector', () => {
    let db: Database;
    let collector: PerformanceCollector;

    beforeEach(() => {
        db = createTestDb();
        // Use a non-existent path to avoid touching real DB file
        collector = new PerformanceCollector(db, '/tmp/nonexistent-test.db', Date.now() - 60_000);
    });

    afterEach(() => {
        collector.stop();
        db.close();
    });

    describe('takeSnapshot', () => {
        it('returns a valid snapshot with memory and DB info', () => {
            const snap = collector.takeSnapshot();
            expect(snap.timestamp).toBeTruthy();
            expect(snap.memory.heapUsed).toBeGreaterThan(0);
            expect(snap.memory.heapTotal).toBeGreaterThan(0);
            expect(snap.memory.rss).toBeGreaterThan(0);
            expect(typeof snap.memory.external).toBe('number');
            expect(snap.db.sizeBytes).toBe(0); // file doesn't exist
            expect(snap.db.latencyMs).toBeGreaterThanOrEqual(0);
            expect(snap.uptime).toBeGreaterThan(0);
        });

        it('measures DB latency', () => {
            const snap = collector.takeSnapshot();
            // In-memory DB should be very fast
            expect(snap.db.latencyMs).toBeLessThan(100);
        });
    });

    describe('collect', () => {
        it('persists snapshot to the performance_metrics table', async () => {
            await collector.collect();
            const count = (db.query('SELECT COUNT(*) as c FROM performance_metrics').get() as { c: number }).c;
            // Should have 7 metrics per snapshot (heapUsed, heapTotal, rss, external, dbSize, dbLatency, uptime)
            expect(count).toBe(7);
        });

        it('persists expected metric names', async () => {
            await collector.collect();
            const metrics = db.query('SELECT DISTINCT metric FROM performance_metrics ORDER BY metric')
                .all() as { metric: string }[];
            const names = metrics.map(m => m.metric);
            expect(names).toContain('memory_heap_used');
            expect(names).toContain('memory_heap_total');
            expect(names).toContain('memory_rss');
            expect(names).toContain('memory_external');
            expect(names).toContain('db_size');
            expect(names).toContain('db_latency');
            expect(names).toContain('uptime');
        });

        it('stores correct units', async () => {
            await collector.collect();
            const memRow = db.query(
                "SELECT unit FROM performance_metrics WHERE metric = 'memory_rss' LIMIT 1"
            ).get() as { unit: string };
            expect(memRow.unit).toBe('bytes');

            const latRow = db.query(
                "SELECT unit FROM performance_metrics WHERE metric = 'db_latency' LIMIT 1"
            ).get() as { unit: string };
            expect(latRow.unit).toBe('ms');

            const upRow = db.query(
                "SELECT unit FROM performance_metrics WHERE metric = 'uptime' LIMIT 1"
            ).get() as { unit: string };
            expect(upRow.unit).toBe('seconds');
        });
    });

    describe('recordSlowQuery', () => {
        it('records queries above the threshold', () => {
            collector.recordSlowQuery('SELECT expensive', SLOW_QUERY_THRESHOLD_MS + 50);
            const rows = db.query(
                "SELECT * FROM performance_metrics WHERE metric = 'db_slow_query'"
            ).all() as { labels: string; value: number }[];
            expect(rows.length).toBe(1);
            expect(rows[0].labels).toBe('SELECT expensive');
            expect(rows[0].value).toBe(SLOW_QUERY_THRESHOLD_MS + 50);
        });

        it('ignores queries below the threshold', () => {
            collector.recordSlowQuery('SELECT fast', SLOW_QUERY_THRESHOLD_MS - 1);
            const count = (db.query(
                "SELECT COUNT(*) as c FROM performance_metrics WHERE metric = 'db_slow_query'"
            ).get() as { c: number }).c;
            expect(count).toBe(0);
        });

        it('records exact threshold value', () => {
            // Exactly at threshold IS recorded (only < threshold is skipped)
            collector.recordSlowQuery('SELECT borderline', SLOW_QUERY_THRESHOLD_MS);
            const count = (db.query(
                "SELECT COUNT(*) as c FROM performance_metrics WHERE metric = 'db_slow_query'"
            ).get() as { c: number }).c;
            expect(count).toBe(1);
        });
    });

    describe('getMetricNames', () => {
        it('returns empty array when no data', () => {
            expect(collector.getMetricNames()).toEqual([]);
        });

        it('returns distinct metric names after collection', async () => {
            await collector.collect();
            const names = collector.getMetricNames();
            expect(names.length).toBeGreaterThanOrEqual(7);
            expect(names).toContain('memory_rss');
        });
    });

    describe('getTimeSeries', () => {
        it('returns empty array for non-existent metric', () => {
            const series = collector.getTimeSeries('nonexistent', 7);
            expect(series).toEqual([]);
        });

        it('returns data points after collection', async () => {
            await collector.collect();
            const series = collector.getTimeSeries('memory_rss', 7);
            expect(series.length).toBe(1);
            expect(series[0].value).toBeGreaterThan(0);
            expect(series[0].timestamp).toBeTruthy();
        });

        it('clamps days parameter', () => {
            // Should not throw for extreme values
            const series = collector.getTimeSeries('memory_rss', 0);
            expect(Array.isArray(series)).toBe(true);
            const series2 = collector.getTimeSeries('memory_rss', 999);
            expect(Array.isArray(series2)).toBe(true);
        });
    });

    describe('detectRegressions', () => {
        it('returns empty array with no data', () => {
            const regressions = collector.detectRegressions();
            expect(regressions).toEqual([]);
        });

        it('returns empty array with insufficient samples', () => {
            // Insert only 3 samples for last week (below the 5-sample threshold)
            for (let i = 0; i < 3; i++) {
                db.query(`
                    INSERT INTO performance_metrics (timestamp, metric, value, unit)
                    VALUES (datetime('now', '-10 days'), 'memory_rss', 100, 'bytes')
                `).run();
            }
            for (let i = 0; i < 10; i++) {
                db.query(`
                    INSERT INTO performance_metrics (timestamp, metric, value, unit)
                    VALUES (datetime('now', '-1 day'), 'memory_rss', 200, 'bytes')
                `).run();
            }
            const regressions = collector.detectRegressions();
            expect(regressions).toEqual([]);
        });

        it('detects a >25% regression', () => {
            // Last week: 100 bytes average
            for (let i = 0; i < 10; i++) {
                db.query(`
                    INSERT INTO performance_metrics (timestamp, metric, value, unit)
                    VALUES (datetime('now', '-10 days'), 'memory_rss', 100, 'bytes')
                `).run();
            }
            // This week: 200 bytes average (100% increase)
            for (let i = 0; i < 10; i++) {
                db.query(`
                    INSERT INTO performance_metrics (timestamp, metric, value, unit)
                    VALUES (datetime('now', '-1 day'), 'memory_rss', 200, 'bytes')
                `).run();
            }
            const regressions = collector.detectRegressions();
            expect(regressions.length).toBeGreaterThanOrEqual(1);
            const memRegression = regressions.find(r => r.metric === 'memory_rss');
            expect(memRegression).toBeDefined();
            expect(memRegression!.changePercent).toBe(100);
            expect(memRegression!.severity).toBe('critical'); // >50% is critical
        });

        it('does not flag stable metrics', () => {
            // Last week and this week are the same
            for (let i = 0; i < 10; i++) {
                db.query(`
                    INSERT INTO performance_metrics (timestamp, metric, value, unit)
                    VALUES (datetime('now', '-10 days'), 'memory_rss', 100, 'bytes')
                `).run();
                db.query(`
                    INSERT INTO performance_metrics (timestamp, metric, value, unit)
                    VALUES (datetime('now', '-1 day'), 'memory_rss', 105, 'bytes')
                `).run();
            }
            // 5% increase — should not trigger default 25% threshold
            const regressions = collector.detectRegressions();
            const memRegression = regressions.find(r => r.metric === 'memory_rss');
            expect(memRegression).toBeUndefined();
        });

        it('respects custom threshold', () => {
            for (let i = 0; i < 10; i++) {
                db.query(`
                    INSERT INTO performance_metrics (timestamp, metric, value, unit)
                    VALUES (datetime('now', '-10 days'), 'db_latency', 1.0, 'ms')
                `).run();
                db.query(`
                    INSERT INTO performance_metrics (timestamp, metric, value, unit)
                    VALUES (datetime('now', '-1 day'), 'db_latency', 1.15, 'ms')
                `).run();
            }
            // 15% increase — not flagged at default 25%
            expect(collector.detectRegressions(25)).toEqual([]);
            // But flagged at 10% threshold
            const regressions = collector.detectRegressions(10);
            const dbRegression = regressions.find(r => r.metric === 'db_latency');
            expect(dbRegression).toBeDefined();
        });

        it('detects slow query count regression', () => {
            // 5 slow queries last week
            for (let i = 0; i < 5; i++) {
                db.query(`
                    INSERT INTO performance_metrics (timestamp, metric, labels, value, unit)
                    VALUES (datetime('now', '-10 days'), 'db_slow_query', 'SELECT x', 150, 'ms')
                `).run();
            }
            // 15 slow queries this week (200% increase)
            for (let i = 0; i < 15; i++) {
                db.query(`
                    INSERT INTO performance_metrics (timestamp, metric, labels, value, unit)
                    VALUES (datetime('now', '-1 day'), 'db_slow_query', 'SELECT x', 150, 'ms')
                `).run();
            }
            const regressions = collector.detectRegressions();
            const slowRegression = regressions.find(r => r.metric === 'db_slow_query_count');
            expect(slowRegression).toBeDefined();
            expect(slowRegression!.changePercent).toBe(200);
            expect(slowRegression!.severity).toBe('critical');
        });
    });

    describe('getStatusReportSection', () => {
        it('returns a complete report', () => {
            const report = collector.getStatusReportSection();
            expect(report.snapshot).toBeDefined();
            expect(report.snapshot.memory.rss).toBeGreaterThan(0);
            expect(report.regressions).toEqual([]);
            expect(typeof report.slowQueriestoday).toBe('number');
            expect(typeof report.metricsStoredTotal).toBe('number');
        });
    });

    describe('getLatestSnapshot', () => {
        it('returns null when no data exists', () => {
            expect(collector.getLatestSnapshot()).toBeNull();
        });

        it('returns snapshot from stored data', async () => {
            await collector.collect();
            const snap = collector.getLatestSnapshot();
            expect(snap).not.toBeNull();
            expect(snap!.memory.rss).toBeGreaterThan(0);
            expect(snap!.db.latencyMs).toBeGreaterThanOrEqual(0);
        });
    });

    describe('start/stop', () => {
        it('does not throw when started twice', () => {
            collector.start();
            collector.start(); // Should be a no-op
            collector.stop();
        });

        it('does not throw when stopped without starting', () => {
            collector.stop();
        });

        it('does not throw when stopped twice', () => {
            collector.start();
            collector.stop();
            collector.stop();
        });
    });
});

/**
 * Performance metrics API routes.
 *
 * Exposes endpoints for viewing current performance snapshots,
 * time-series trends, and regression detection.
 */

import type { Database } from 'bun:sqlite';
import type { PerformanceCollector } from '../performance/collector';
import { json, handleRouteError } from '../lib/response';

export function handlePerformanceRoutes(
    req: Request,
    url: URL,
    _db: Database,
    collector: PerformanceCollector | null,
): Response | null {
    if (!url.pathname.startsWith('/api/performance')) return null;
    if (!collector) return json({ error: 'Performance collector not available' }, 503);

    // GET /api/performance/snapshot — current performance snapshot
    if (url.pathname === '/api/performance/snapshot' && req.method === 'GET') {
        try {
            const snapshot = collector.takeSnapshot();
            return json(snapshot);
        } catch (err) {
            return handleRouteError(err);
        }
    }

    // GET /api/performance/trends — time-series data for charts
    if (url.pathname === '/api/performance/trends' && req.method === 'GET') {
        try {
            const days = Math.min(Math.max(Number(url.searchParams.get('days') ?? '7'), 1), 365);
            const metric = url.searchParams.get('metric');

            if (metric) {
                // Single metric time-series
                const series = collector.getTimeSeries(metric, days);
                return json({ metric, days, series });
            }

            // All key metrics
            const metrics = [
                'memory_rss', 'memory_heap_used', 'db_size', 'db_latency', 'uptime',
            ];
            const trends: Record<string, { timestamp: string; value: number }[]> = {};
            for (const m of metrics) {
                trends[m] = collector.getTimeSeries(m, days);
            }
            return json({ days, trends });
        } catch (err) {
            return handleRouteError(err);
        }
    }

    // GET /api/performance/regressions — regression detection
    if (url.pathname === '/api/performance/regressions' && req.method === 'GET') {
        try {
            const threshold = Number(url.searchParams.get('threshold') ?? '25');
            const regressions = collector.detectRegressions(threshold);
            return json({
                threshold,
                regressions,
                hasRegressions: regressions.length > 0,
                criticalCount: regressions.filter(r => r.severity === 'critical').length,
            });
        } catch (err) {
            return handleRouteError(err);
        }
    }

    // GET /api/performance/report — full performance report for status reports
    if (url.pathname === '/api/performance/report' && req.method === 'GET') {
        try {
            const report = collector.getStatusReportSection();
            return json(report);
        } catch (err) {
            return handleRouteError(err);
        }
    }

    // GET /api/performance/metrics — list available metric names
    if (url.pathname === '/api/performance/metrics' && req.method === 'GET') {
        try {
            const names = collector.getMetricNames();
            return json({ metrics: names });
        } catch (err) {
            return handleRouteError(err);
        }
    }

    // POST /api/performance/collect — trigger manual collection
    if (url.pathname === '/api/performance/collect' && req.method === 'POST') {
        try {
            const snapshot = collector.takeSnapshot();
            return json({ ok: true, snapshot });
        } catch (err) {
            return handleRouteError(err);
        }
    }

    return null;
}

/**
 * Health check routes — liveness, readiness, history, and full health.
 *
 * Extracted from server/index.ts as part of god-module decomposition (#442).
 */

import type { Database } from 'bun:sqlite';
import { getHealthCheck, getLivenessCheck, getReadinessCheck, type HealthCheckDeps } from '../health/service';
import { listHealthSnapshots, getUptimeStats } from '../db/health-snapshots';
import { json } from '../lib/response';

/**
 * Handle all health check routes:
 *   GET /health/live         — Liveness probe
 *   GET /health/ready        — Readiness probe
 *   GET /api/health/history  — Health history snapshots
 *   GET /health              — Full health check
 *   GET /api/health          — Full health check (alias)
 */
export async function handleHealthRoutes(
    req: Request,
    url: URL,
    deps: HealthCheckDeps,
    db: Database,
): Promise<Response | null> {
    if (req.method !== 'GET') return null;
    if (url.pathname !== '/api/health' && !url.pathname.startsWith('/api/health/') && !url.pathname.startsWith('/health')) {
        return null;
    }

    // Liveness probe: /health/live
    if (url.pathname === '/health/live') {
        return json(getLivenessCheck());
    }

    // Readiness probe: /health/ready
    if (url.pathname === '/health/ready') {
        const readiness = getReadinessCheck(deps);
        const httpStatus = readiness.status === 'ready' ? 200 : 503;
        return json(readiness, httpStatus);
    }

    // Health history: /api/health/history
    if (url.pathname === '/api/health/history') {
        const hours = Math.min(Math.max(Number(url.searchParams.get('hours') ?? '24'), 1), 720);
        const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
        const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? '100'), 1), 1000);
        const snapshots = listHealthSnapshots(db, { limit, since });
        const uptime = getUptimeStats(db, since);
        return json({ uptime, snapshots });
    }

    // Full health check: /health or /api/health
    if (url.pathname === '/health' || url.pathname === '/api/health') {
        const health = await getHealthCheck(deps);
        const httpStatus = health.status === 'unhealthy' ? 503 : 200;
        return json(health, httpStatus);
    }

    return null;
}

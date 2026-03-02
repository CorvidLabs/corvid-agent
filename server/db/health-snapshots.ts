import type { Database } from 'bun:sqlite';

export interface HealthSnapshot {
    id: number;
    timestamp: string;
    status: string;
    responseTimeMs: number | null;
    dependencies: Record<string, unknown> | null;
    source: string;
}

interface SnapshotRow {
    id: number;
    timestamp: string;
    status: string;
    response_time_ms: number | null;
    dependencies: string | null;
    source: string;
}

function rowToSnapshot(row: SnapshotRow): HealthSnapshot {
    return {
        id: row.id,
        timestamp: row.timestamp,
        status: row.status,
        responseTimeMs: row.response_time_ms,
        dependencies: row.dependencies ? JSON.parse(row.dependencies) : null,
        source: row.source,
    };
}

export function insertHealthSnapshot(
    db: Database,
    snapshot: {
        status: string;
        responseTimeMs?: number;
        dependencies?: Record<string, unknown>;
        source?: string;
    },
): HealthSnapshot {
    const stmt = db.prepare(`
        INSERT INTO system_health_snapshots (status, response_time_ms, dependencies, source)
        VALUES (?, ?, ?, ?)
    `);
    stmt.run(
        snapshot.status,
        snapshot.responseTimeMs ?? null,
        snapshot.dependencies ? JSON.stringify(snapshot.dependencies) : null,
        snapshot.source ?? 'internal',
    );
    const row = db.query(
        `SELECT * FROM system_health_snapshots ORDER BY id DESC LIMIT 1`,
    ).get() as SnapshotRow;
    return rowToSnapshot(row);
}

export function listHealthSnapshots(
    db: Database,
    opts?: { limit?: number; since?: string },
): HealthSnapshot[] {
    const limit = opts?.limit ?? 100;
    if (opts?.since) {
        const rows = db.query(
            `SELECT * FROM system_health_snapshots WHERE timestamp >= ? ORDER BY timestamp DESC LIMIT ?`,
        ).all(opts.since, limit) as SnapshotRow[];
        return rows.map(rowToSnapshot);
    }
    const rows = db.query(
        `SELECT * FROM system_health_snapshots ORDER BY timestamp DESC LIMIT ?`,
    ).all(limit) as SnapshotRow[];
    return rows.map(rowToSnapshot);
}

export interface UptimeStats {
    totalChecks: number;
    healthyChecks: number;
    degradedChecks: number;
    unhealthyChecks: number;
    uptimePercent: number;
    periodStart: string;
    periodEnd: string;
}

export function getUptimeStats(db: Database, since: string): UptimeStats {
    const rows = db.query(`
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN status = 'healthy' THEN 1 ELSE 0 END) as healthy,
            SUM(CASE WHEN status = 'degraded' THEN 1 ELSE 0 END) as degraded,
            SUM(CASE WHEN status = 'unhealthy' THEN 1 ELSE 0 END) as unhealthy,
            MIN(timestamp) as period_start,
            MAX(timestamp) as period_end
        FROM system_health_snapshots
        WHERE timestamp >= ?
    `).get(since) as {
        total: number;
        healthy: number;
        degraded: number;
        unhealthy: number;
        period_start: string | null;
        period_end: string | null;
    };

    const total = rows.total || 0;
    const healthy = rows.healthy || 0;
    const degraded = rows.degraded || 0;

    return {
        totalChecks: total,
        healthyChecks: healthy,
        degradedChecks: degraded,
        unhealthyChecks: rows.unhealthy || 0,
        // healthy + degraded both count as "up" for uptime calculation
        uptimePercent: total > 0 ? Math.round(((healthy + degraded) / total) * 10000) / 100 : 100,
        periodStart: rows.period_start ?? since,
        periodEnd: rows.period_end ?? new Date().toISOString(),
    };
}

/** Delete snapshots older than the given number of days. */
export function pruneHealthSnapshots(db: Database, olderThanDays: number): number {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
    const result = db.query(`DELETE FROM system_health_snapshots WHERE timestamp < ?`).run(cutoff);
    return result.changes;
}

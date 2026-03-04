import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import {
    insertHealthSnapshot,
    listHealthSnapshots,
    getUptimeStats,
    pruneHealthSnapshots,
} from '../db/health-snapshots';

let db: Database;

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
});

afterEach(() => {
    db.close();
});

// ── insertHealthSnapshot ─────────────────────────────────────────────

describe('insertHealthSnapshot', () => {
    test('inserts a minimal snapshot with defaults', () => {
        const snap = insertHealthSnapshot(db, { status: 'healthy' });
        expect(snap.id).toBeGreaterThan(0);
        expect(snap.status).toBe('healthy');
        expect(snap.responseTimeMs).toBeNull();
        expect(snap.dependencies).toBeNull();
        expect(snap.source).toBe('internal');
        expect(snap.timestamp).toBeTruthy();
    });

    test('inserts a full snapshot with all fields', () => {
        const deps = { db: 'ok', redis: 'ok' };
        const snap = insertHealthSnapshot(db, {
            status: 'degraded',
            responseTimeMs: 150,
            dependencies: deps,
            source: 'uptime-check',
        });
        expect(snap.status).toBe('degraded');
        expect(snap.responseTimeMs).toBe(150);
        expect(snap.dependencies).toEqual(deps);
        expect(snap.source).toBe('uptime-check');
    });

    test('auto-increments id', () => {
        const s1 = insertHealthSnapshot(db, { status: 'healthy' });
        const s2 = insertHealthSnapshot(db, { status: 'unhealthy' });
        expect(s2.id).toBeGreaterThan(s1.id);
    });
});

// ── listHealthSnapshots ──────────────────────────────────────────────

describe('listHealthSnapshots', () => {
    test('returns empty array for no snapshots', () => {
        const list = listHealthSnapshots(db);
        expect(list).toEqual([]);
    });

    test('returns snapshots in descending timestamp order', () => {
        insertHealthSnapshot(db, { status: 'healthy' });
        insertHealthSnapshot(db, { status: 'degraded' });
        insertHealthSnapshot(db, { status: 'unhealthy' });

        const list = listHealthSnapshots(db);
        expect(list).toHaveLength(3);
        // Most recent first
        expect(list[0].status).toBe('unhealthy');
        expect(list[2].status).toBe('healthy');
    });

    test('respects limit parameter', () => {
        for (let i = 0; i < 10; i++) {
            insertHealthSnapshot(db, { status: 'healthy' });
        }
        const list = listHealthSnapshots(db, { limit: 3 });
        expect(list).toHaveLength(3);
    });

    test('filters by since timestamp', () => {
        // Insert an old snapshot
        db.query(`INSERT INTO server_health_snapshots (status, source, timestamp)
                  VALUES ('healthy', 'internal', '2025-01-01T00:00:00Z')`).run();
        // Insert a recent one
        insertHealthSnapshot(db, { status: 'degraded' });

        const list = listHealthSnapshots(db, { since: '2026-01-01T00:00:00Z' });
        expect(list).toHaveLength(1);
        expect(list[0].status).toBe('degraded');
    });
});

// ── getUptimeStats ───────────────────────────────────────────────────

describe('getUptimeStats', () => {
    test('returns 100% uptime when no snapshots exist', () => {
        const stats = getUptimeStats(db, '2020-01-01T00:00:00Z');
        expect(stats.totalChecks).toBe(0);
        expect(stats.healthyChecks).toBe(0);
        expect(stats.uptimePercent).toBe(100);
    });

    test('calculates correct uptime percentages', () => {
        // 3 healthy, 1 degraded, 1 unhealthy
        insertHealthSnapshot(db, { status: 'healthy' });
        insertHealthSnapshot(db, { status: 'healthy' });
        insertHealthSnapshot(db, { status: 'healthy' });
        insertHealthSnapshot(db, { status: 'degraded' });
        insertHealthSnapshot(db, { status: 'unhealthy' });

        const stats = getUptimeStats(db, '2020-01-01T00:00:00Z');
        expect(stats.totalChecks).toBe(5);
        expect(stats.healthyChecks).toBe(3);
        expect(stats.degradedChecks).toBe(1);
        expect(stats.unhealthyChecks).toBe(1);
        // healthy + degraded = 4/5 = 80%
        expect(stats.uptimePercent).toBe(80);
    });

    test('counts degraded as uptime', () => {
        insertHealthSnapshot(db, { status: 'degraded' });
        insertHealthSnapshot(db, { status: 'degraded' });

        const stats = getUptimeStats(db, '2020-01-01T00:00:00Z');
        expect(stats.uptimePercent).toBe(100);
    });

    test('respects since filter', () => {
        db.query(`INSERT INTO server_health_snapshots (status, source, timestamp)
                  VALUES ('unhealthy', 'internal', '2025-01-01T00:00:00Z')`).run();
        insertHealthSnapshot(db, { status: 'healthy' });

        const stats = getUptimeStats(db, '2026-01-01T00:00:00Z');
        expect(stats.totalChecks).toBe(1);
        expect(stats.healthyChecks).toBe(1);
        expect(stats.uptimePercent).toBe(100);
    });

    test('returns period start and end timestamps', () => {
        insertHealthSnapshot(db, { status: 'healthy' });
        const stats = getUptimeStats(db, '2020-01-01T00:00:00Z');
        expect(stats.periodStart).toBeTruthy();
        expect(stats.periodEnd).toBeTruthy();
    });
});

// ── pruneHealthSnapshots ─────────────────────────────────────────────

describe('pruneHealthSnapshots', () => {
    test('deletes old snapshots', () => {
        db.query(`INSERT INTO server_health_snapshots (status, source, timestamp)
                  VALUES ('healthy', 'internal', '2024-01-01T00:00:00Z')`).run();
        insertHealthSnapshot(db, { status: 'healthy' });

        const deleted = pruneHealthSnapshots(db, 30);
        expect(deleted).toBe(1);

        const remaining = listHealthSnapshots(db);
        expect(remaining).toHaveLength(1);
    });

    test('preserves recent snapshots', () => {
        insertHealthSnapshot(db, { status: 'healthy' });
        insertHealthSnapshot(db, { status: 'degraded' });

        const deleted = pruneHealthSnapshots(db, 30);
        expect(deleted).toBe(0);
        expect(listHealthSnapshots(db)).toHaveLength(2);
    });

    test('returns 0 when table is empty', () => {
        const deleted = pruneHealthSnapshots(db, 1);
        expect(deleted).toBe(0);
    });
});

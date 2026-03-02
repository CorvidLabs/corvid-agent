import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { HealthMonitorService } from '../health/monitor';
import { resetHealthCache, type HealthCheckDeps } from '../health/service';
import {
    insertHealthSnapshot,
    listHealthSnapshots,
    getUptimeStats,
    pruneHealthSnapshots,
} from '../db/health-snapshots';

function createTestDb(): Database {
    const db = new Database(':memory:');
    db.exec('PRAGMA journal_mode = WAL');
    // Create the server_health_snapshots table
    db.exec(`
        CREATE TABLE IF NOT EXISTS server_health_snapshots (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp       TEXT    NOT NULL DEFAULT (datetime('now')),
            status          TEXT    NOT NULL,
            response_time_ms INTEGER DEFAULT NULL,
            dependencies    TEXT    DEFAULT NULL,
            source          TEXT    NOT NULL DEFAULT 'internal'
        )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_server_health_snapshots_timestamp ON server_health_snapshots(timestamp)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_server_health_snapshots_status ON server_health_snapshots(status)`);
    return db;
}

function createDeps(db: Database, overrides: Partial<HealthCheckDeps> = {}): HealthCheckDeps {
    return {
        db,
        startTime: Date.now() - 60_000,
        version: '1.0.0-test',
        getActiveSessions: () => [],
        isAlgoChatConnected: () => false,
        isShuttingDown: () => false,
        getSchedulerStats: () => ({ running: true }),
        getMentionPollingStats: () => ({ isRunning: true }),
        getWorkflowStats: () => ({ running: true }),
        ...overrides,
    };
}

// ─── DB: health-snapshots ─────────────────────────────────────────────────────

describe('health-snapshots DB module', () => {
    let db: Database;

    beforeEach(() => {
        db = createTestDb();
    });

    afterEach(() => {
        db.close();
    });

    test('insertHealthSnapshot creates a snapshot and returns it', () => {
        const snapshot = insertHealthSnapshot(db, {
            status: 'healthy',
            responseTimeMs: 42,
            dependencies: { database: { status: 'healthy' } },
            source: 'internal',
        });

        expect(snapshot.id).toBe(1);
        expect(snapshot.status).toBe('healthy');
        expect(snapshot.responseTimeMs).toBe(42);
        expect(snapshot.dependencies).toEqual({ database: { status: 'healthy' } });
        expect(snapshot.source).toBe('internal');
        expect(snapshot.timestamp).toBeTruthy();
    });

    test('insertHealthSnapshot defaults source to internal', () => {
        const snapshot = insertHealthSnapshot(db, { status: 'degraded' });
        expect(snapshot.source).toBe('internal');
        expect(snapshot.responseTimeMs).toBeNull();
        expect(snapshot.dependencies).toBeNull();
    });

    test('listHealthSnapshots returns snapshots in descending order', () => {
        insertHealthSnapshot(db, { status: 'healthy' });
        insertHealthSnapshot(db, { status: 'degraded' });
        insertHealthSnapshot(db, { status: 'unhealthy' });

        const snapshots = listHealthSnapshots(db);
        expect(snapshots).toHaveLength(3);
        // Most recent first
        expect(snapshots[0].status).toBe('unhealthy');
        expect(snapshots[1].status).toBe('degraded');
        expect(snapshots[2].status).toBe('healthy');
    });

    test('listHealthSnapshots respects limit', () => {
        for (let i = 0; i < 10; i++) {
            insertHealthSnapshot(db, { status: 'healthy' });
        }

        const snapshots = listHealthSnapshots(db, { limit: 5 });
        expect(snapshots).toHaveLength(5);
    });

    test('listHealthSnapshots filters by since', () => {
        // Insert a snapshot with explicit old timestamp
        db.exec(`INSERT INTO server_health_snapshots (timestamp, status, source) VALUES ('2020-01-01T00:00:00Z', 'unhealthy', 'internal')`);
        insertHealthSnapshot(db, { status: 'healthy' });

        const allSnapshots = listHealthSnapshots(db);
        expect(allSnapshots).toHaveLength(2);

        const recentSnapshots = listHealthSnapshots(db, { since: '2025-01-01T00:00:00Z' });
        expect(recentSnapshots).toHaveLength(1);
        expect(recentSnapshots[0].status).toBe('healthy');
    });

    test('getUptimeStats computes correct percentages', () => {
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
        // healthy + degraded = 4 out of 5 = 80%
        expect(stats.uptimePercent).toBe(80);
    });

    test('getUptimeStats returns 100% when no snapshots exist', () => {
        const stats = getUptimeStats(db, '2020-01-01T00:00:00Z');
        expect(stats.totalChecks).toBe(0);
        expect(stats.uptimePercent).toBe(100);
    });

    test('pruneHealthSnapshots deletes old records', () => {
        // Insert an old snapshot
        db.exec(`INSERT INTO server_health_snapshots (timestamp, status, source) VALUES ('2020-01-01T00:00:00Z', 'healthy', 'internal')`);
        // Insert a recent snapshot
        insertHealthSnapshot(db, { status: 'healthy' });

        const deleted = pruneHealthSnapshots(db, 30);
        expect(deleted).toBe(1);

        const remaining = listHealthSnapshots(db);
        expect(remaining).toHaveLength(1);
        expect(remaining[0].status).toBe('healthy');
    });
});

// ─── HealthMonitorService ─────────────────────────────────────────────────────

describe('HealthMonitorService', () => {
    let db: Database;
    let monitor: HealthMonitorService;
    let savedAnthropicKey: string | undefined;

    beforeEach(() => {
        db = createTestDb();
        resetHealthCache();
        savedAnthropicKey = process.env.ANTHROPIC_API_KEY;
        process.env.ANTHROPIC_API_KEY = 'test-key-for-health-check';
    });

    afterEach(() => {
        monitor?.stop();
        db.close();
        if (savedAnthropicKey === undefined) {
            delete process.env.ANTHROPIC_API_KEY;
        } else {
            process.env.ANTHROPIC_API_KEY = savedAnthropicKey;
        }
    });

    test('check() stores a health snapshot in the database', async () => {
        const deps = createDeps(db);
        monitor = new HealthMonitorService(db, deps);

        await monitor.check();

        const snapshots = listHealthSnapshots(db);
        expect(snapshots).toHaveLength(1);
        expect(snapshots[0].status).toBe('healthy');
        expect(snapshots[0].responseTimeMs).toBeGreaterThanOrEqual(0);
        expect(snapshots[0].source).toBe('internal');
    });

    test('check() records unhealthy when database is broken', async () => {
        const brokenDb = new Database(':memory:');
        brokenDb.exec('PRAGMA journal_mode = WAL');
        // Create tables in the working db but not in the health check deps db
        brokenDb.exec(`
            CREATE TABLE IF NOT EXISTS server_health_snapshots (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp       TEXT    NOT NULL DEFAULT (datetime('now')),
                status          TEXT    NOT NULL,
                response_time_ms INTEGER DEFAULT NULL,
                dependencies    TEXT    DEFAULT NULL,
                source          TEXT    NOT NULL DEFAULT 'internal'
            )
        `);

        const closedDb = new Database(':memory:');
        closedDb.close();

        const deps = createDeps(brokenDb, { db: closedDb });
        monitor = new HealthMonitorService(brokenDb, deps);

        await monitor.check();

        const snapshots = listHealthSnapshots(brokenDb);
        expect(snapshots).toHaveLength(1);
        expect(snapshots[0].status).toBe('unhealthy');

        brokenDb.close();
    });

    test('check() sends notification on recovery', async () => {
        let notified = false;
        const mockNotificationService = {
            notify: async (params: { title: string; message: string; level: string }) => {
                if (params.title?.includes('recovered')) {
                    notified = true;
                }
                return { notificationId: 'test', channels: [] };
            },
            start: () => {},
            stop: () => {},
        } as any;

        // Use a single monitor that starts unhealthy and then goes healthy
        let shuttingDown = true;
        const toggleDeps = createDeps(db, { isShuttingDown: () => shuttingDown });
        const toggleMonitor = new HealthMonitorService(db, toggleDeps);
        toggleMonitor.setNotificationService(mockNotificationService);

        // First: unhealthy (sets lastStatus)
        resetHealthCache();
        await toggleMonitor.check();

        // Second: still unhealthy (triggers consecutive alert at threshold=2)
        resetHealthCache();
        await toggleMonitor.check();

        // Third: now healthy — should trigger recovery notification
        shuttingDown = false;
        resetHealthCache();
        await toggleMonitor.check();

        expect(notified).toBe(true);

        toggleMonitor.stop();
    });

    test('start() and stop() manage timers', () => {
        const deps = createDeps(db);
        monitor = new HealthMonitorService(db, deps);

        monitor.start();
        // Should not throw if started twice
        monitor.start();

        monitor.stop();
        // Should not throw if stopped twice
        monitor.stop();
    });
});

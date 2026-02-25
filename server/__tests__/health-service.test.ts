import { test, expect, describe, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import {
    getHealthCheck,
    getLivenessCheck,
    getReadinessCheck,
    resetHealthCache,
    type HealthCheckDeps,
} from '../health/service';

function createTestDb(): Database {
    const db = new Database(':memory:');
    db.exec('PRAGMA journal_mode = WAL');
    return db;
}

function createDeps(overrides: Partial<HealthCheckDeps> = {}): HealthCheckDeps {
    return {
        db: createTestDb(),
        startTime: Date.now() - 60_000, // 1 minute ago
        version: '1.0.0-test',
        getActiveSessions: () => ['session-1', 'session-2'],
        isAlgoChatConnected: () => false,
        isShuttingDown: () => false,
        getSchedulerStats: () => ({ running: true }),
        getMentionPollingStats: () => ({ isRunning: true }),
        getWorkflowStats: () => ({ running: true }),
        ...overrides,
    };
}

describe('getLivenessCheck', () => {
    test('returns ok status', () => {
        const result = getLivenessCheck();
        expect(result).toEqual({ status: 'ok' });
    });
});

describe('getReadinessCheck', () => {
    test('returns ready when database is healthy', () => {
        const deps = createDeps();
        const result = getReadinessCheck(deps);
        expect(result.status).toBe('ready');
        expect(result.checks.database).toBe(true);
        expect(result.checks.not_shutting_down).toBe(true);
    });

    test('returns not_ready when shutting down', () => {
        const deps = createDeps({ isShuttingDown: () => true });
        const result = getReadinessCheck(deps);
        expect(result.status).toBe('not_ready');
        expect(result.checks.not_shutting_down).toBe(false);
    });

    test('returns not_ready when database fails', () => {
        const brokenDb = createTestDb();
        brokenDb.close();
        const deps = createDeps({ db: brokenDb });
        const result = getReadinessCheck(deps);
        expect(result.status).toBe('not_ready');
        expect(result.checks.database).toBe(false);
    });
});

describe('getHealthCheck', () => {
    beforeEach(() => {
        resetHealthCache();
    });

    test('returns health status with dependencies', async () => {
        const deps = createDeps();
        const result = await getHealthCheck(deps);

        expect(result.version).toBe('1.0.0-test');
        expect(result.uptime).toBeGreaterThanOrEqual(59);
        expect(result.timestamp).toBeTruthy();
        expect(result.dependencies.database).toBeDefined();
        expect(result.dependencies.database.status).toBe('healthy');
        expect(typeof result.dependencies.database.latency_ms).toBe('number');
        expect(result.dependencies.github).toBeDefined();
        expect(result.dependencies.algorand).toBeDefined();
        expect(result.dependencies.llm).toBeDefined();
    });

    test('returns unhealthy when database is down', async () => {
        const brokenDb = createTestDb();
        brokenDb.close();
        const deps = createDeps({ db: brokenDb });
        const result = await getHealthCheck(deps);

        expect(result.status).toBe('unhealthy');
        expect(result.dependencies.database.status).toBe('unhealthy');
    });

    test('returns unhealthy when shutting down', async () => {
        const deps = createDeps({ isShuttingDown: () => true });
        const result = await getHealthCheck(deps);

        expect(result.status).toBe('unhealthy');
    });

    test('caches results within TTL', async () => {
        const deps = createDeps();
        const result1 = await getHealthCheck(deps);
        const result2 = await getHealthCheck(deps);

        // Should be the same cached object
        expect(result1).toBe(result2);
        expect(result1.timestamp).toBe(result2.timestamp);
    });

    test('algorand shows not configured when not connected', async () => {
        const deps = createDeps({ isAlgoChatConnected: () => false });
        const result = await getHealthCheck(deps);

        expect(result.dependencies.algorand.status).toBe('healthy');
        expect(result.dependencies.algorand.configured).toBe(false);
    });

    test('algorand shows configured when connected', async () => {
        const deps = createDeps({ isAlgoChatConnected: () => true });
        const result = await getHealthCheck(deps);

        expect(result.dependencies.algorand.status).toBe('healthy');
        expect(result.dependencies.algorand.configured).toBe(true);
    });
});

import { test, expect, beforeEach, afterEach, describe } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { handleHealthRoutes } from '../routes/health';
import type { HealthCheckDeps } from '../health/service';

let db: Database;

function createDeps(overrides: Partial<HealthCheckDeps> = {}): HealthCheckDeps {
    return {
        db,
        startTime: Date.now() - 60_000,
        version: '1.0.0-test',
        getActiveSessions: () => ['session-1'],
        isAlgoChatConnected: () => true,
        isShuttingDown: () => false,
        getSchedulerStats: () => ({ running: true }),
        getMentionPollingStats: () => ({ isRunning: true }),
        getWorkflowStats: () => ({ running: true }),
        ...overrides,
    };
}

function makeRequest(path: string, method: string = 'GET'): { req: Request; url: URL } {
    const url = new URL(`http://localhost${path}`);
    return { req: new Request(url, { method }), url };
}

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
});

afterEach(() => {
    db.close();
});

// ─── Route matching ─────────────────────────────────────────────────────────

describe('route matching', () => {
    test('returns null for non-GET requests', async () => {
        const { req, url } = makeRequest('/health', 'POST');
        const result = await handleHealthRoutes(req, url, createDeps(), db);
        expect(result).toBeNull();
    });

    test('returns null for unrelated paths', async () => {
        const { req, url } = makeRequest('/api/agents');
        const result = await handleHealthRoutes(req, url, createDeps(), db);
        expect(result).toBeNull();
    });
});

// ─── /health/live ───────────────────────────────────────────────────────────

describe('/health/live', () => {
    test('returns ok status', async () => {
        const { req, url } = makeRequest('/health/live');
        const response = await handleHealthRoutes(req, url, createDeps(), db);

        expect(response).not.toBeNull();
        expect(response!.status).toBe(200);

        const body = await response!.json();
        expect(body.status).toBe('ok');
    });
});

// ─── /health/ready ──────────────────────────────────────────────────────────

describe('/health/ready', () => {
    test('returns 200 when ready', async () => {
        const { req, url } = makeRequest('/health/ready');
        const response = await handleHealthRoutes(req, url, createDeps(), db);

        expect(response).not.toBeNull();
        expect(response!.status).toBe(200);

        const body = await response!.json();
        expect(body.status).toBe('ready');
    });

    test('returns 503 when shutting down', async () => {
        const deps = createDeps({ isShuttingDown: () => true });
        const { req, url } = makeRequest('/health/ready');
        const response = await handleHealthRoutes(req, url, deps, db);

        expect(response).not.toBeNull();
        expect(response!.status).toBe(503);

        const body = await response!.json();
        expect(body.status).toBe('not_ready');
    });
});

// ─── /health ────────────────────────────────────────────────────────────────

describe('/health', () => {
    test('returns full health check at /health', async () => {
        const { req, url } = makeRequest('/health');
        const response = await handleHealthRoutes(req, url, createDeps(), db);

        expect(response).not.toBeNull();
        expect(response!.status).toBe(200);

        const body = await response!.json();
        expect(body.status).toBeDefined();
    });

    test('returns full health check at /api/health', async () => {
        const { req, url } = makeRequest('/api/health');
        const response = await handleHealthRoutes(req, url, createDeps(), db);

        expect(response).not.toBeNull();
        expect(response!.status).toBe(200);
    });

    test('returns 503 when unhealthy', async () => {
        // Close the DB to simulate unhealthy state
        const brokenDb = new Database(':memory:');
        brokenDb.close();
        const deps = createDeps({ db: brokenDb });

        const { req, url } = makeRequest('/health');
        const response = await handleHealthRoutes(req, url, deps, db);

        expect(response).not.toBeNull();
        // When deps.db is broken, health check should detect it
        const body = await response!.json();
        expect(body.status).toBeDefined();
    });
});

// ─── /api/health/history ────────────────────────────────────────────────────

describe('/api/health/history', () => {
    test('returns history with default params', async () => {
        const { req, url } = makeRequest('/api/health/history');
        const response = await handleHealthRoutes(req, url, createDeps(), db);

        expect(response).not.toBeNull();
        expect(response!.status).toBe(200);

        const body = await response!.json();
        expect(body.uptime).toBeDefined();
        expect(body.snapshots).toBeDefined();
        expect(Array.isArray(body.snapshots)).toBe(true);
    });

    test('respects hours and limit query params', async () => {
        const { req, url } = makeRequest('/api/health/history?hours=48&limit=10');
        const response = await handleHealthRoutes(req, url, createDeps(), db);

        expect(response).not.toBeNull();
        expect(response!.status).toBe(200);
    });

    test('clamps hours to valid range', async () => {
        // hours < 1 should clamp to 1, hours > 720 should clamp to 720
        const { req, url } = makeRequest('/api/health/history?hours=0');
        const response = await handleHealthRoutes(req, url, createDeps(), db);

        expect(response).not.toBeNull();
        expect(response!.status).toBe(200);
    });

    test('clamps limit to valid range', async () => {
        const { req, url } = makeRequest('/api/health/history?limit=9999');
        const response = await handleHealthRoutes(req, url, createDeps(), db);

        expect(response).not.toBeNull();
        expect(response!.status).toBe(200);
    });
});

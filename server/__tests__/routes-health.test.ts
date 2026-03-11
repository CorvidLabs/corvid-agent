import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { handleHealthRoutes } from '../routes/health';
import { resetHealthCache, type HealthCheckDeps } from '../health/service';

// --- Helpers ----------------------------------------------------------------

function fakeReq(method: string, path: string): { req: Request; url: URL } {
    const url = new URL(`http://localhost:3000${path}`);
    return { req: new Request(url.toString(), { method }), url };
}

function createMockDeps(db: Database, overrides?: Partial<HealthCheckDeps>): HealthCheckDeps {
    return {
        db,
        startTime: Date.now() - 60_000, // 1 minute ago
        version: '0.25.1-test',
        getActiveSessions: mock(() => []),
        isAlgoChatConnected: mock(() => false),
        isShuttingDown: mock(() => false),
        getSchedulerStats: mock(() => ({})),
        getMentionPollingStats: mock(() => ({})),
        getWorkflowStats: mock(() => ({})),
        ...overrides,
    };
}

// --- Tests ------------------------------------------------------------------

describe('routes/health', () => {
    let db: Database;

    beforeEach(() => {
        db = new Database(':memory:');
        db.exec('PRAGMA foreign_keys = ON');
        runMigrations(db);
        resetHealthCache();
    });

    afterEach(() => {
        db.close();
    });

    // ── Routing ──────────────────────────────────────────────────────────

    it('returns null for non-health paths', async () => {
        const deps = createMockDeps(db);
        const { req, url } = fakeReq('GET', '/api/agents');
        expect(await handleHealthRoutes(req, url, deps, db)).toBeNull();
    });

    it('returns null for non-GET methods', async () => {
        const deps = createMockDeps(db);
        const { req, url } = fakeReq('POST', '/health');
        expect(await handleHealthRoutes(req, url, deps, db)).toBeNull();
    });

    // ── Liveness ─────────────────────────────────────────────────────────

    it('returns liveness check', async () => {
        const deps = createMockDeps(db);
        const { req, url } = fakeReq('GET', '/health/live');
        const res = await handleHealthRoutes(req, url, deps, db);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.status).toBe('ok');
    });

    // ── Readiness ────────────────────────────────────────────────────────

    it('returns ready when DB is healthy and not shutting down', async () => {
        const deps = createMockDeps(db);
        const { req, url } = fakeReq('GET', '/health/ready');
        const res = await handleHealthRoutes(req, url, deps, db);
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.status).toBe('ready');
        expect(data.checks.database).toBe(true);
        expect(data.checks.not_shutting_down).toBe(true);
    });

    it('returns not_ready when shutting down', async () => {
        const deps = createMockDeps(db, {
            isShuttingDown: mock(() => true),
        });
        const { req, url } = fakeReq('GET', '/health/ready');
        const res = await handleHealthRoutes(req, url, deps, db);
        expect(res!.status).toBe(503);
        const data = await res!.json();
        expect(data.status).toBe('not_ready');
        expect(data.checks.not_shutting_down).toBe(false);
    });

    // ── Full health ──────────────────────────────────────────────────────

    it('returns full health check at /health', async () => {
        const deps = createMockDeps(db);
        const { req, url } = fakeReq('GET', '/health');
        const res = await handleHealthRoutes(req, url, deps, db);
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.version).toBe('0.25.1-test');
        expect(data.uptime).toBeGreaterThanOrEqual(0);
        expect(data.dependencies).toBeDefined();
        expect(data.dependencies.database.status).toBe('healthy');
    });

    it('returns full health check at /api/health', async () => {
        const deps = createMockDeps(db);
        const { req, url } = fakeReq('GET', '/api/health');
        const res = await handleHealthRoutes(req, url, deps, db);
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.version).toBe('0.25.1-test');
    });

    it('returns 503 when shutting down', async () => {
        const deps = createMockDeps(db, {
            isShuttingDown: mock(() => true),
        });
        const { req, url } = fakeReq('GET', '/health');
        const res = await handleHealthRoutes(req, url, deps, db);
        expect(res!.status).toBe(503);
        const data = await res!.json();
        expect(data.status).toBe('unhealthy');
    });

    // ── Health history ───────────────────────────────────────────────────

    it('returns health history with default params', async () => {
        const deps = createMockDeps(db);
        const { req, url } = fakeReq('GET', '/api/health/history');
        const res = await handleHealthRoutes(req, url, deps, db);
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.snapshots).toBeDefined();
        expect(data.uptime).toBeDefined();
    });

    it('accepts custom hours and limit params', async () => {
        const deps = createMockDeps(db);
        const { req, url } = fakeReq('GET', '/api/health/history?hours=48&limit=50');
        const res = await handleHealthRoutes(req, url, deps, db);
        expect(res!.status).toBe(200);
    });

    it('clamps hours to valid range', async () => {
        const deps = createMockDeps(db);
        // hours > 720 should be clamped
        const { req, url } = fakeReq('GET', '/api/health/history?hours=9999');
        const res = await handleHealthRoutes(req, url, deps, db);
        expect(res!.status).toBe(200);
    });
});

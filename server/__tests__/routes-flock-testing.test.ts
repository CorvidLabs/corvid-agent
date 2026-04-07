/**
 * Tests for flock-testing route handlers.
 *
 * Tests score, cooldown, stats, results, latest, and the on-demand
 * test trigger (without a real FlockDirectoryService or network).
 */
import { describe, it, expect, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { handleFlockTestingRoutes } from '../routes/flock-testing';
import type { FlockTestRunner } from '../flock-directory/testing/runner';
import type { FlockTestingDeps } from '../routes/flock-testing';

function fakeReq(method: string, path: string, query?: Record<string, string>): { req: Request; url: URL } {
    const url = new URL(`http://localhost:3000${path}`);
    if (query) {
        for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    }
    return { req: new Request(url.toString(), { method }), url };
}

function mockTestRunner(overrides?: Partial<FlockTestRunner>): FlockTestRunner {
    return {
        runTest: mock(() => Promise.resolve({ overallScore: 85, completedAt: new Date().toISOString() })),
        getLatestResult: mock(() => null),
        getResults: mock(() => []),
        getEffectiveScore: mock(() => 72),
        getTestStats: mock(() => ({ totalTests: 5, testedAgents: 2, avgScore: 78 })),
        ...overrides,
    } as unknown as FlockTestRunner;
}

const db = new Database(':memory:');

describe('Flock Testing Routes', () => {
    it('returns null for paths outside /api/flock-directory/testing', () => {
        const { req, url } = fakeReq('GET', '/api/flock-directory/other');
        expect(handleFlockTestingRoutes(req, url, db)).toBeNull();
    });

    // ─── Score endpoint (no testRunner needed) ─────────────────────────────

    it('GET /score — returns nulls when testRunner is absent', async () => {
        const { req, url } = fakeReq('GET', '/api/flock-directory/testing/agents/agent-1/score');
        const res = await handleFlockTestingRoutes(req, url, db, null);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json() as { agentId: string; effectiveScore: null; rawScore: null };
        expect(data.agentId).toBe('agent-1');
        expect(data.effectiveScore).toBeNull();
        expect(data.rawScore).toBeNull();
    });

    it('GET /score — returns values when testRunner has results', async () => {
        const runner = mockTestRunner({
            getEffectiveScore: mock(() => 90),
            getLatestResult: mock(() => ({ overallScore: 88, completedAt: '2026-01-01T00:00:00Z' }) as any),
        });
        const { req, url } = fakeReq('GET', '/api/flock-directory/testing/agents/agent-2/score');
        const res = await handleFlockTestingRoutes(req, url, db, runner);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json() as { effectiveScore: number; rawScore: number };
        expect(data.effectiveScore).toBe(90);
        expect(data.rawScore).toBe(88);
    });

    // ─── Cooldown endpoint ──────────────────────────────────────────────────

    it('GET /cooldown — returns onCooldown: false when no previous run', async () => {
        const { req, url } = fakeReq('GET', '/api/flock-directory/testing/agents/fresh-agent/cooldown');
        const res = await handleFlockTestingRoutes(req, url, db, null);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json() as { onCooldown: boolean };
        expect(data.onCooldown).toBe(false);
    });

    // ─── Test trigger ───────────────────────────────────────────────────────

    it('POST /run — returns 503 when flock directory not available', async () => {
        const { req, url } = fakeReq('POST', '/api/flock-directory/testing/agents/agent-1/run');
        const res = await handleFlockTestingRoutes(req, url, db, null, undefined, {});
        expect(res).not.toBeNull();
        const data = await (res as Response).json() as { error: string };
        expect(data.error).toContain('Flock Directory not available');
    });

    it('POST /run — returns 404 when agent not in flock directory', async () => {
        const deps: FlockTestingDeps = {
            flockDirectory: {
                getById: mock(() => null),
                computeReputation: mock(() => {}),
            } as any,
        };
        const { req, url } = fakeReq('POST', '/api/flock-directory/testing/agents/unknown-agent/run');
        const res = await handleFlockTestingRoutes(req, url, db, null, undefined, deps);
        expect(res).not.toBeNull();
        const resolved = await Promise.resolve(res as unknown as Response);
        expect(resolved.status).toBe(404);
    });

    it('POST /run — returns 400 for inactive agent', async () => {
        const deps: FlockTestingDeps = {
            flockDirectory: {
                getById: mock(() => ({ id: 'agent-inactive', address: 'addr-1', status: 'inactive' })),
                computeReputation: mock(() => {}),
            } as any,
        };
        const { req, url } = fakeReq('POST', '/api/flock-directory/testing/agents/agent-inactive/run');
        const res = await handleFlockTestingRoutes(req, url, db, null, undefined, deps);
        expect(res).not.toBeNull();
        const resolved = await Promise.resolve(res as unknown as Response);
        expect(resolved.status).toBe(400);
        const data = await resolved.json() as { error: string };
        expect(data.error).toContain('not active');
    });

    // ─── Stats endpoint (requires testRunner) ──────────────────────────────

    it('GET /stats — returns 503 when testRunner is absent', async () => {
        const { req, url } = fakeReq('GET', '/api/flock-directory/testing/stats');
        const res = await handleFlockTestingRoutes(req, url, db, null);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(503);
    });

    it('GET /stats — returns stats when testRunner present', async () => {
        const runner = mockTestRunner();
        const { req, url } = fakeReq('GET', '/api/flock-directory/testing/stats');
        const res = await handleFlockTestingRoutes(req, url, db, runner);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json() as { totalTests: number };
        expect(data.totalTests).toBe(5);
    });

    // ─── Results endpoint ───────────────────────────────────────────────────

    it('GET /results — returns 503 when testRunner is absent', async () => {
        const { req, url } = fakeReq('GET', '/api/flock-directory/testing/agents/agent-1/results');
        const res = await handleFlockTestingRoutes(req, url, db, null);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(503);
    });

    it('GET /results — returns empty list when no results exist', async () => {
        const runner = mockTestRunner();
        const { req, url } = fakeReq('GET', '/api/flock-directory/testing/agents/agent-x/results');
        const res = await handleFlockTestingRoutes(req, url, db, runner);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json() as { results: unknown[] };
        expect(Array.isArray(data.results)).toBe(true);
    });

    it('GET /results — respects ?limit param', async () => {
        const runner = mockTestRunner();
        const { req, url } = fakeReq(
            'GET',
            '/api/flock-directory/testing/agents/agent-x/results',
            { limit: '5' },
        );
        const res = await handleFlockTestingRoutes(req, url, db, runner);
        expect(res!.status).toBe(200);
        expect(runner.getResults).toHaveBeenCalledWith('agent-x', 5);
    });

    // ─── Latest result endpoint ─────────────────────────────────────────────

    it('GET /latest — returns 503 when testRunner is absent', async () => {
        const { req, url } = fakeReq('GET', '/api/flock-directory/testing/agents/agent-1/latest');
        const res = await handleFlockTestingRoutes(req, url, db, null);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(503);
    });

    it('GET /latest — returns 404 when no result exists', async () => {
        const runner = mockTestRunner({ getLatestResult: mock(() => null) });
        const { req, url } = fakeReq('GET', '/api/flock-directory/testing/agents/new-agent/latest');
        const res = await handleFlockTestingRoutes(req, url, db, runner);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(404);
    });

    it('GET /latest — returns result when it exists', async () => {
        const result = { overallScore: 95, completedAt: '2026-04-06T20:00:00Z' };
        const runner = mockTestRunner({ getLatestResult: mock(() => result as any) });
        const { req, url } = fakeReq('GET', '/api/flock-directory/testing/agents/top-agent/latest');
        const res = await handleFlockTestingRoutes(req, url, db, runner);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json() as { overallScore: number };
        expect(data.overallScore).toBe(95);
    });
});

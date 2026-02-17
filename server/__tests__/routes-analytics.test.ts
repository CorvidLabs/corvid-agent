import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { handleAnalyticsRoutes } from '../routes/analytics';

let db: Database;

function fakeReq(method: string, path: string, body?: unknown): { req: Request; url: URL } {
    const url = new URL(`http://localhost:3000${path}`);
    const opts: RequestInit = { method };
    if (body !== undefined) {
        opts.body = JSON.stringify(body);
        opts.headers = { 'Content-Type': 'application/json' };
    }
    return { req: new Request(url.toString(), opts), url };
}

beforeAll(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);

    // Seed data for analytics
    const projId = crypto.randomUUID();
    const agentId = crypto.randomUUID();
    db.query("INSERT INTO projects (id, name, working_dir) VALUES (?, 'Analytics Project', '/tmp')").run(projId);
    db.query("INSERT INTO agents (id, name) VALUES (?, 'TestAgent')").run(agentId);

    // Insert sessions
    for (let i = 0; i < 3; i++) {
        const sid = crypto.randomUUID();
        const status = i === 0 ? 'running' : 'completed';
        db.query(
            `INSERT INTO sessions (id, project_id, agent_id, status, source, total_cost_usd, total_turns, total_algo_spent, credits_consumed)
             VALUES (?, ?, ?, ?, 'web', ?, ?, ?, ?)`,
        ).run(sid, projId, agentId, status, 0.05 * (i + 1), i + 1, 100 * (i + 1), 10 * (i + 1));
    }

    // Insert daily spending
    const today = new Date().toISOString().slice(0, 10);
    db.query("INSERT INTO daily_spending (date, algo_micro, api_cost_usd) VALUES (?, 5000, 0.25)").run(today);
});

afterAll(() => db.close());

describe('Analytics Routes', () => {
    it('GET /api/analytics/overview returns aggregated stats', async () => {
        const { req, url } = fakeReq('GET', '/api/analytics/overview');
        const res = handleAnalyticsRoutes(req, url, db);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);

        const data = await res!.json();
        expect(data.totalSessions).toBe(3);
        expect(data.activeSessions).toBe(1); // 1 running
        expect(data.totalAgents).toBe(1);
        expect(data.totalProjects).toBe(1);
        expect(typeof data.totalCostUsd).toBe('number');
        expect(typeof data.totalTurns).toBe('number');
        expect(data.todaySpending).toBeDefined();
    });

    it('GET /api/analytics/overview returns today spending', async () => {
        const { req, url } = fakeReq('GET', '/api/analytics/overview');
        const res = handleAnalyticsRoutes(req, url, db);
        const data = await res!.json();
        expect(data.todaySpending.algoMicro).toBe(5000);
        expect(data.todaySpending.apiCostUsd).toBe(0.25);
    });

    it('GET /api/analytics/spending returns time-series data', async () => {
        const { req, url } = fakeReq('GET', '/api/analytics/spending?days=30');
        const res = handleAnalyticsRoutes(req, url, db);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.days).toBe(30);
        expect(Array.isArray(data.spending)).toBe(true);
        expect(Array.isArray(data.sessionCosts)).toBe(true);
    });

    it('GET /api/analytics/spending clamps days to valid range', async () => {
        const { req, url } = fakeReq('GET', '/api/analytics/spending?days=9999');
        const res = handleAnalyticsRoutes(req, url, db);
        const data = await res!.json();
        expect(data.days).toBe(365);
    });

    it('GET /api/analytics/sessions returns session breakdowns', async () => {
        const { req, url } = fakeReq('GET', '/api/analytics/sessions');
        const res = handleAnalyticsRoutes(req, url, db);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(Array.isArray(data.byAgent)).toBe(true);
        expect(Array.isArray(data.bySource)).toBe(true);
        expect(Array.isArray(data.byStatus)).toBe(true);
        expect(Array.isArray(data.recent)).toBe(true);
        expect(data.byAgent.length).toBeGreaterThan(0);
    });

    it('returns null for unmatched paths', () => {
        const { req, url } = fakeReq('GET', '/api/other');
        const res = handleAnalyticsRoutes(req, url, db);
        expect(res).toBeNull();
    });
});

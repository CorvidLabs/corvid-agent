/**
 * Tests for GET /api/analytics/weekly-recap
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { handleAnalyticsRoutes } from '../routes/analytics';

let db: Database;

function fakeReq(method: string, path: string): { req: Request; url: URL } {
    const url = new URL(`http://localhost:3000${path}`);
    return { req: new Request(url.toString(), { method }), url };
}

beforeAll(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
});

afterAll(() => db.close());

describe('GET /api/analytics/weekly-recap', () => {
    it('returns 200 with correct shape (empty db)', async () => {
        const { req, url } = fakeReq('GET', '/api/analytics/weekly-recap');
        const res = handleAnalyticsRoutes(req, url, db);
        expect(res).not.toBeNull();
        expect((res as Response).status).toBe(200);

        const data = await (res as Response).json();
        expect(data).toHaveProperty('periodDays', 7);
        expect(data).toHaveProperty('generatedAt');
        expect(data).toHaveProperty('workTasks');
        expect(data.workTasks).toHaveProperty('started', 0);
        expect(data.workTasks).toHaveProperty('completed', 0);
        expect(data.workTasks).toHaveProperty('prsCreated', 0);
        expect(data).toHaveProperty('sessions');
        expect(data.sessions).toHaveProperty('started', 0);
        expect(data.sessions).toHaveProperty('totalTurns', 0);
        expect(data.sessions).toHaveProperty('costUsd', 0);
        expect(data.sessions).toHaveProperty('algoSpent', 0);
        expect(data).toHaveProperty('messages');
        expect(data.messages).toHaveProperty('agentToAgent', 0);
        expect(data.messages).toHaveProperty('algochat', 0);
    });

    it('defaults to 7 days when no ?days= param', async () => {
        const { req, url } = fakeReq('GET', '/api/analytics/weekly-recap');
        const res = handleAnalyticsRoutes(req, url, db);
        const data = await (res as Response).json();
        expect(data.periodDays).toBe(7);
    });

    it('respects ?days= param', async () => {
        const { req, url } = fakeReq('GET', '/api/analytics/weekly-recap?days=30');
        const res = handleAnalyticsRoutes(req, url, db);
        const data = await (res as Response).json();
        expect(data.periodDays).toBe(30);
    });

    it('clamps days to minimum of 1', async () => {
        const { req, url } = fakeReq('GET', '/api/analytics/weekly-recap?days=0');
        const res = handleAnalyticsRoutes(req, url, db);
        const data = await (res as Response).json();
        expect(data.periodDays).toBe(1);
    });

    it('clamps days to maximum of 90', async () => {
        const { req, url } = fakeReq('GET', '/api/analytics/weekly-recap?days=999');
        const res = handleAnalyticsRoutes(req, url, db);
        const data = await (res as Response).json();
        expect(data.periodDays).toBe(90);
    });

    it('returns null for unrelated routes', () => {
        const { req, url } = fakeReq('GET', '/api/analytics/nonexistent');
        const res = handleAnalyticsRoutes(req, url, db);
        expect(res).toBeNull();
    });
});

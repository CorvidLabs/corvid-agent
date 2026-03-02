import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { handleUsageRoutes } from '../routes/usage';

let db: Database;
let agentId: string;
let scheduleId: string;
let projectId: string;

function fakeReq(method: string, path: string): { req: Request; url: URL } {
    const url = new URL(`http://localhost:3000${path}`);
    return { req: new Request(url.toString(), { method }), url };
}

beforeAll(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);

    // Seed project, agent, and schedule
    projectId = crypto.randomUUID();
    db.query("INSERT INTO projects (id, name, working_dir) VALUES (?, 'Test Project', '/tmp')").run(projectId);

    agentId = crypto.randomUUID();
    db.query("INSERT INTO agents (id, name) VALUES (?, 'Test Agent')").run(agentId);

    scheduleId = crypto.randomUUID();
    db.query(`
        INSERT INTO agent_schedules (id, agent_id, name, description, cron_expression, actions, status)
        VALUES (?, ?, 'Daily Review', 'Review PRs daily', '0 9 * * *', '[]', 'active')
    `).run(scheduleId, agentId);
});

afterAll(() => db.close());

describe('Usage Routes', () => {
    describe('GET /api/usage/summary', () => {
        it('returns empty summary when no executions exist', async () => {
            const { req, url } = fakeReq('GET', '/api/usage/summary');
            const res = handleUsageRoutes(req, url, db);
            expect(res).not.toBeNull();
            const data = await res!.json();
            expect(data.totals.executions).toBe(0);
            expect(data.totals.costUsd).toBe(0);
            expect(data.schedules).toEqual([]);
        });

        it('returns per-schedule aggregates with executions', async () => {
            // Create a session
            const sessionId = crypto.randomUUID();
            db.query(`
                INSERT INTO sessions (id, project_id, agent_id, name, status, total_cost_usd, total_turns)
                VALUES (?, ?, ?, 'Scheduled PR Review', 'stopped', 0.05, 12)
            `).run(sessionId, projectId, agentId);

            // Create execution linked to session
            const execId = crypto.randomUUID();
            db.query(`
                INSERT INTO schedule_executions (id, schedule_id, agent_id, action_type, action_input, session_id, status, cost_usd, completed_at)
                VALUES (?, ?, ?, 'review_prs', '{}', ?, 'completed', 0.05, datetime('now'))
            `).run(execId, scheduleId, agentId, sessionId);

            const { req, url } = fakeReq('GET', '/api/usage/summary?days=7');
            const res = handleUsageRoutes(req, url, db);
            const data = await res!.json();

            expect(data.days).toBe(7);
            expect(data.totals.executions).toBeGreaterThanOrEqual(1);
            expect(data.totals.completed).toBeGreaterThanOrEqual(1);
            expect(data.schedules.length).toBeGreaterThanOrEqual(1);

            const scheduleEntry = data.schedules.find((s: { scheduleId: string }) => s.scheduleId === scheduleId);
            expect(scheduleEntry).toBeDefined();
            expect(scheduleEntry.scheduleName).toBe('Daily Review');
            expect(scheduleEntry.executionCount).toBeGreaterThanOrEqual(1);
        });
    });

    describe('GET /api/usage/daily', () => {
        it('returns daily breakdown', async () => {
            const { req, url } = fakeReq('GET', '/api/usage/daily?days=7');
            const res = handleUsageRoutes(req, url, db);
            expect(res).not.toBeNull();
            const data = await res!.json();
            expect(data.days).toBe(7);
            expect(Array.isArray(data.daily)).toBe(true);
            // Should have at least one day from the execution we created
            expect(data.daily.length).toBeGreaterThanOrEqual(1);
            expect(data.daily[0]).toHaveProperty('date');
            expect(data.daily[0]).toHaveProperty('executionCount');
            expect(data.daily[0]).toHaveProperty('totalCostUsd');
        });
    });

    describe('GET /api/usage/anomalies', () => {
        it('returns anomaly data', async () => {
            const { req, url } = fakeReq('GET', '/api/usage/anomalies?days=7');
            const res = handleUsageRoutes(req, url, db);
            expect(res).not.toBeNull();
            const data = await res!.json();
            expect(data).toHaveProperty('anomalies');
            expect(data).toHaveProperty('counts');
            expect(data.counts).toHaveProperty('longRunning');
            expect(data.counts).toHaveProperty('costSpikes');
            expect(data.counts).toHaveProperty('total');
        });

        it('detects long-running executions', async () => {
            // Create execution that started >30 min ago and is still running
            const longExecId = crypto.randomUUID();
            db.query(`
                INSERT INTO schedule_executions (id, schedule_id, agent_id, action_type, action_input, status, started_at)
                VALUES (?, ?, ?, 'work_task', '{}', 'running', datetime('now', '-45 minutes'))
            `).run(longExecId, scheduleId, agentId);

            const { req, url } = fakeReq('GET', '/api/usage/anomalies?days=1');
            const res = handleUsageRoutes(req, url, db);
            const data = await res!.json();
            expect(data.counts.longRunning).toBeGreaterThanOrEqual(1);

            const longRunning = data.anomalies.find(
                (a: { anomalyType: string; executionId: string }) => a.anomalyType === 'long_running' && a.executionId === longExecId,
            );
            expect(longRunning).toBeDefined();
            expect(longRunning.durationSec).toBeGreaterThan(1800);

            // Cleanup
            db.query('DELETE FROM schedule_executions WHERE id = ?').run(longExecId);
        });
    });

    describe('GET /api/usage/schedule/:id', () => {
        it('returns detailed usage for a specific schedule', async () => {
            const { req, url } = fakeReq('GET', `/api/usage/schedule/${scheduleId}?days=30`);
            const res = handleUsageRoutes(req, url, db);
            expect(res).not.toBeNull();
            const data = await res!.json();

            expect(data.schedule.id).toBe(scheduleId);
            expect(data.schedule.name).toBe('Daily Review');
            expect(data.stats).toHaveProperty('executionCount');
            expect(data.stats).toHaveProperty('totalCostUsd');
            expect(data.stats).toHaveProperty('avgDurationSec');
            expect(Array.isArray(data.daily)).toBe(true);
            expect(Array.isArray(data.recent)).toBe(true);
        });

        it('returns 404 for unknown schedule', async () => {
            const { req, url } = fakeReq('GET', '/api/usage/schedule/nonexistent');
            const res = handleUsageRoutes(req, url, db);
            expect(res).not.toBeNull();
            expect(res!.status).toBe(404);
        });
    });

    describe('route matching', () => {
        it('returns null for non-usage paths', () => {
            const { req, url } = fakeReq('GET', '/api/analytics/overview');
            const res = handleUsageRoutes(req, url, db);
            expect(res).toBeNull();
        });

        it('returns null for POST requests', () => {
            const { req, url } = fakeReq('POST', '/api/usage/summary');
            const res = handleUsageRoutes(req, url, db);
            expect(res).toBeNull();
        });
    });
});

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { handleSystemLogRoutes } from '../routes/system-logs';

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

let councilId: string;
let launchId: string;
let projectId: string;
let agentId: string;

beforeAll(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);

    // Seed data needed for system logs
    projectId = crypto.randomUUID();
    agentId = crypto.randomUUID();
    councilId = crypto.randomUUID();
    launchId = crypto.randomUUID();

    db.query("INSERT INTO projects (id, name, working_dir) VALUES (?, 'Test', '/tmp')").run(projectId);
    db.query("INSERT INTO agents (id, name) VALUES (?, 'TestAgent')").run(agentId);
    db.query("INSERT INTO councils (id, name) VALUES (?, 'TestCouncil')").run(councilId);
    db.query("INSERT INTO council_launches (id, council_id, project_id, prompt) VALUES (?, ?, ?, 'test prompt')").run(
        launchId, councilId, projectId,
    );

    // Council launch logs
    db.query(
        "INSERT INTO council_launch_logs (launch_id, level, message, detail) VALUES (?, 'info', 'Council started', 'detail1')",
    ).run(launchId);

    // Escalation queue entry
    const sessId = crypto.randomUUID();
    db.query(
        "INSERT INTO sessions (id, project_id, status) VALUES (?, ?, 'running')",
    ).run(sessId, projectId);
    db.query(
        "INSERT INTO escalation_queue (session_id, tool_name, status) VALUES (?, 'bash', 'pending')",
    ).run(sessId);

    // Work task
    const taskId = crypto.randomUUID();
    db.query(
        "INSERT INTO work_tasks (id, agent_id, project_id, description, status) VALUES (?, ?, ?, 'Fix bug', 'completed')",
    ).run(taskId, agentId, projectId);

    // Credit transactions
    db.query(
        "INSERT INTO credit_transactions (wallet_address, type, amount, balance_after, reference) VALUES ('ADDR1', 'purchase', 100, 100, 'test-ref')",
    ).run();
});

afterAll(() => db.close());

describe('System Log Routes', () => {
    it('GET /api/system-logs returns aggregated logs (all types)', async () => {
        const { req, url } = fakeReq('GET', '/api/system-logs');
        const res = handleSystemLogRoutes(req, url, db);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(Array.isArray(data.logs)).toBe(true);
        expect(data.logs.length).toBeGreaterThanOrEqual(3); // council + escalation + work-task

        const types = new Set(data.logs.map((l: { type: string }) => l.type));
        expect(types.has('council')).toBe(true);
        expect(types.has('escalation')).toBe(true);
        expect(types.has('work-task')).toBe(true);
    });

    it('GET /api/system-logs?type=council returns only council logs', async () => {
        const { req, url } = fakeReq('GET', '/api/system-logs?type=council');
        const res = handleSystemLogRoutes(req, url, db);
        expect(res).not.toBeNull();
        const data = await res!.json();
        expect(data.logs.length).toBeGreaterThanOrEqual(1);
        for (const log of data.logs) {
            expect(log.type).toBe('council');
        }
    });

    it('GET /api/system-logs?type=escalation returns only escalation logs', async () => {
        const { req, url } = fakeReq('GET', '/api/system-logs?type=escalation');
        const res = handleSystemLogRoutes(req, url, db);
        const data = await res!.json();
        expect(data.logs.length).toBeGreaterThanOrEqual(1);
        for (const log of data.logs) {
            expect(log.type).toBe('escalation');
        }
    });

    it('GET /api/system-logs/credit-transactions returns credit ledger', async () => {
        const { req, url } = fakeReq('GET', '/api/system-logs/credit-transactions');
        const res = handleSystemLogRoutes(req, url, db);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(Array.isArray(data.transactions)).toBe(true);
        expect(data.transactions.length).toBe(1);
        expect(data.transactions[0].wallet_address).toBe('ADDR1');
        expect(data.total).toBe(1);
    });

    it('returns null for unmatched paths', () => {
        const { req, url } = fakeReq('GET', '/api/other');
        const res = handleSystemLogRoutes(req, url, db);
        expect(res).toBeNull();
    });
});

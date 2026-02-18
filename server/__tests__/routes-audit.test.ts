import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { handleAuditRoutes } from '../routes/audit';

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

    // Seed audit log entries
    const stmt = db.prepare(
        `INSERT INTO audit_log (action, actor, resource_type, resource_id, detail, trace_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
    );
    stmt.run('credit_grant', 'system', 'credit', 'c1', 'Granted 100 credits', 'trace-1');
    stmt.run('schedule_create', 'agent-1', 'schedule', 's1', 'Created daily schedule', 'trace-2');
    stmt.run('config_change', 'admin', 'config', 'cfg1', 'Updated threshold', 'trace-3');
    stmt.run('credit_grant', 'system', 'credit', 'c2', 'Granted 50 credits', 'trace-4');
    stmt.run('work_task_create', 'agent-2', 'work_task', 'wt1', 'Fix tests', 'trace-5');
});

afterAll(() => db.close());

describe('Audit Routes', () => {
    it('GET /api/audit-log returns entries with pagination', async () => {
        const { req, url } = fakeReq('GET', '/api/audit-log');
        const res = handleAuditRoutes(req, url, db);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(Array.isArray(data.entries)).toBe(true);
        expect(data.entries.length).toBe(5);
        expect(data.total).toBe(5);
        expect(data.offset).toBe(0);
        expect(data.limit).toBe(50);

        // Verify entry shape
        const entry = data.entries[0];
        expect(entry.action).toBeDefined();
        expect(entry.actor).toBeDefined();
        expect(entry.resourceType).toBeDefined();
        expect(entry.timestamp).toBeDefined();
    });

    it('GET /api/audit-log?action=credit_grant filters by action', async () => {
        const { req, url } = fakeReq('GET', '/api/audit-log?action=credit_grant');
        const res = handleAuditRoutes(req, url, db);
        const data = await res!.json();
        expect(data.entries.length).toBe(2);
        expect(data.total).toBe(2);
        for (const entry of data.entries) {
            expect(entry.action).toBe('credit_grant');
        }
    });

    it('GET /api/audit-log?actor=system filters by actor', async () => {
        const { req, url } = fakeReq('GET', '/api/audit-log?actor=system');
        const res = handleAuditRoutes(req, url, db);
        const data = await res!.json();
        expect(data.entries.length).toBe(2);
        for (const entry of data.entries) {
            expect(entry.actor).toBe('system');
        }
    });

    it('GET /api/audit-log?limit=2&offset=1 paginates', async () => {
        const { req, url } = fakeReq('GET', '/api/audit-log?limit=2&offset=1');
        const res = handleAuditRoutes(req, url, db);
        const data = await res!.json();
        expect(data.entries.length).toBe(2);
        expect(data.offset).toBe(1);
        expect(data.limit).toBe(2);
    });

    it('returns null for unmatched paths', () => {
        const { req, url } = fakeReq('GET', '/api/other');
        const res = handleAuditRoutes(req, url, db);
        expect(res).toBeNull();
    });
});

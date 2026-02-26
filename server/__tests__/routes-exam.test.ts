import { describe, it, expect, beforeAll, afterAll, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { handleExamRoutes } from '../routes/exam';
import type { ProcessManager } from '../process/manager';

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

function createMockPM(): ProcessManager {
    return {
        startProcess: mock(() => {}),
        stopProcess: mock(() => {}),
        resumeProcess: mock(() => {}),
        resumeSession: mock(() => true),
        sendMessage: mock(() => true),
        subscribe: mock(() => {}),
        unsubscribe: mock(() => {}),
        isRunning: mock(() => false),
        approvalManager: { resolveRequest: mock(() => {}), getQueuedRequests: mock(() => []), operationalMode: 'default' },
    } as unknown as ProcessManager;
}

beforeAll(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
});

afterAll(() => db.close());

describe('Exam Routes', () => {
    it('GET /api/exam/categories returns category list', async () => {
        const pm = createMockPM();
        const { req, url } = fakeReq('GET', '/api/exam/categories');
        const res = handleExamRoutes(req, url, db, pm);
        expect(res).not.toBeNull();
        expect((res as Response).status).toBe(200);
        const data = await (res as Response).json();
        expect(data.categories).toBeDefined();
        expect(Array.isArray(data.categories)).toBe(true);
        expect(data.categories).toContain('coding');
        expect(data.categories).toContain('context');
        expect(data.categories).toContain('tools');
    });

    it('POST /api/exam/run rejects empty body', async () => {
        const pm = createMockPM();
        const { req, url } = fakeReq('POST', '/api/exam/run', {});
        const res = await handleExamRoutes(req, url, db, pm);
        expect(res).not.toBeNull();
        expect((res as Response).status).toBe(400);
    });

    it('POST /api/exam/run rejects missing model', async () => {
        const pm = createMockPM();
        const { req, url } = fakeReq('POST', '/api/exam/run', { categories: ['coding'] });
        const res = await handleExamRoutes(req, url, db, pm);
        expect((res as Response).status).toBe(400);
    });

    it('POST /api/exam/run rejects empty model string', async () => {
        const pm = createMockPM();
        const { req, url } = fakeReq('POST', '/api/exam/run', { model: '' });
        const res = await handleExamRoutes(req, url, db, pm);
        expect((res as Response).status).toBe(400);
    });

    it('POST /api/exam/run rejects invalid category values', async () => {
        const pm = createMockPM();
        const { req, url } = fakeReq('POST', '/api/exam/run', {
            model: 'sonnet',
            categories: ['invalid_category'],
        });
        const res = await handleExamRoutes(req, url, db, pm);
        expect((res as Response).status).toBe(400);
    });

    it('returns null for unmatched paths', () => {
        const pm = createMockPM();
        const { req, url } = fakeReq('GET', '/api/other');
        const res = handleExamRoutes(req, url, db, pm);
        expect(res).toBeNull();
    });

    it('returns null for GET /api/exam/run (wrong method)', () => {
        const pm = createMockPM();
        const { req, url } = fakeReq('GET', '/api/exam/run');
        const res = handleExamRoutes(req, url, db, pm);
        expect(res).toBeNull();
    });

    it('returns null for POST /api/exam/categories (wrong method)', () => {
        const pm = createMockPM();
        const { req, url } = fakeReq('POST', '/api/exam/categories');
        const res = handleExamRoutes(req, url, db, pm);
        expect(res).toBeNull();
    });
});

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { handleExamRoutes } from '../routes/exam';
import { saveExamRun } from '../db/model-exams';
import type { ProcessManager } from '../process/manager';
import type { ExamScorecard } from '../exam/types';

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
        startProcess: () => {},
        stopProcess: () => {},
        resumeProcess: () => {},
        resumeSession: () => true,
        sendMessage: () => true,
        subscribe: () => {},
        unsubscribe: () => {},
        isRunning: () => false,
        approvalManager: { resolveRequest: () => {}, getQueuedRequests: () => [], operationalMode: 'default' },
    } as unknown as ProcessManager;
}

function makeScorecard(overrides: Partial<ExamScorecard> = {}): ExamScorecard {
    return {
        model: 'qwen3:14b',
        timestamp: new Date().toISOString(),
        overall: 75,
        categories: {
            coding: { score: 80, passed: 4, total: 5 },
            context: { score: 60, passed: 3, total: 5 },
            tools: { score: 90, passed: 4, total: 5 },
            algochat: { score: 70, passed: 3, total: 5 },
            council: { score: 80, passed: 4, total: 5 },
            instruction: { score: 70, passed: 3, total: 5 },
        },
        results: [
            {
                caseId: 'coding-001',
                category: 'coding',
                name: 'Basic function',
                grade: { passed: true, reason: 'Correct output', score: 1 },
                durationMs: 1500,
            },
            {
                caseId: 'context-001',
                category: 'context',
                name: 'Follow-up question',
                grade: { passed: false, reason: 'Missed key context', score: 0.3 },
                durationMs: 2200,
            },
        ],
        durationMs: 3700,
        ...overrides,
    };
}

beforeAll(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
});

afterAll(() => db.close());

describe('Exam Persistence Routes', () => {
    let savedRunId: string;

    it('GET /api/exam/runs returns empty list initially', async () => {
        const pm = createMockPM();
        const { req, url } = fakeReq('GET', '/api/exam/runs');
        const res = handleExamRoutes(req, url, db, pm);
        expect(res).not.toBeNull();
        const data = await (res as Response).json();
        expect(data.runs).toBeDefined();
        expect(Array.isArray(data.runs)).toBe(true);
        expect(data.runs.length).toBe(0);
    });

    it('GET /api/exam/models returns empty list initially', async () => {
        const pm = createMockPM();
        const { req, url } = fakeReq('GET', '/api/exam/models');
        const res = handleExamRoutes(req, url, db, pm);
        expect(res).not.toBeNull();
        const data = await (res as Response).json();
        expect(data.runs).toHaveLength(0);
    });

    it('GET /api/exam/runs lists runs after saving', async () => {
        const run = saveExamRun(db, makeScorecard());
        savedRunId = run.id;

        const pm = createMockPM();
        const { req, url } = fakeReq('GET', '/api/exam/runs');
        const res = handleExamRoutes(req, url, db, pm);
        const data = await (res as Response).json();
        expect(data.runs).toHaveLength(1);
        expect(data.runs[0].model).toBe('qwen3:14b');
    });

    it('GET /api/exam/runs supports model filter', async () => {
        saveExamRun(db, makeScorecard({ model: 'llama3:8b' }));

        const pm = createMockPM();
        const { req, url } = fakeReq('GET', '/api/exam/runs?model=llama3:8b');
        const res = handleExamRoutes(req, url, db, pm);
        const data = await (res as Response).json();
        expect(data.runs).toHaveLength(1);
        expect(data.runs[0].model).toBe('llama3:8b');
    });

    it('GET /api/exam/runs supports limit and offset', async () => {
        const pm = createMockPM();
        const { req, url } = fakeReq('GET', '/api/exam/runs?limit=1&offset=0');
        const res = handleExamRoutes(req, url, db, pm);
        const data = await (res as Response).json();
        expect(data.runs).toHaveLength(1);
    });

    it('GET /api/exam/runs/:id returns run with results', async () => {
        const pm = createMockPM();
        const { req, url } = fakeReq('GET', `/api/exam/runs/${savedRunId}`);
        const res = handleExamRoutes(req, url, db, pm);
        expect(res).not.toBeNull();
        expect((res as Response).status).toBe(200);
        const data = await (res as Response).json();
        expect(data.run.id).toBe(savedRunId);
        expect(data.run.results).toHaveLength(2);
    });

    it('GET /api/exam/runs/:id returns 404 for unknown id', async () => {
        const pm = createMockPM();
        const { req, url } = fakeReq('GET', '/api/exam/runs/nonexistent');
        const res = handleExamRoutes(req, url, db, pm);
        expect(res).not.toBeNull();
        expect((res as Response).status).toBe(404);
    });

    it('GET /api/exam/models returns latest run per model', async () => {
        const pm = createMockPM();
        const { req, url } = fakeReq('GET', '/api/exam/models');
        const res = handleExamRoutes(req, url, db, pm);
        const data = await (res as Response).json();
        // We have qwen3:14b and llama3:8b from earlier tests
        expect(data.runs.length).toBeGreaterThanOrEqual(2);
        const models = data.runs.map((r: { model: string }) => r.model);
        expect(models).toContain('qwen3:14b');
        expect(models).toContain('llama3:8b');
    });

    it('DELETE /api/exam/runs/:id deletes a run', async () => {
        const run = saveExamRun(db, makeScorecard({ model: 'to-delete' }));
        const pm = createMockPM();
        const { req, url } = fakeReq('DELETE', `/api/exam/runs/${run.id}`);
        const res = handleExamRoutes(req, url, db, pm);
        expect(res).not.toBeNull();
        expect((res as Response).status).toBe(200);
        const data = await (res as Response).json();
        expect(data.deleted).toBe(true);

        // Verify it's gone
        const { req: req2, url: url2 } = fakeReq('GET', `/api/exam/runs/${run.id}`);
        const res2 = handleExamRoutes(req2, url2, db, pm);
        expect((res2 as Response).status).toBe(404);
    });

    it('DELETE /api/exam/runs/:id returns 404 for unknown id', async () => {
        const pm = createMockPM();
        const { req, url } = fakeReq('DELETE', '/api/exam/runs/nonexistent');
        const res = handleExamRoutes(req, url, db, pm);
        expect((res as Response).status).toBe(404);
    });

    it('returns null for unmatched paths', () => {
        const pm = createMockPM();
        const { req, url } = fakeReq('GET', '/api/other');
        expect(handleExamRoutes(req, url, db, pm)).toBeNull();
    });
});

import { describe, it, expect, mock } from 'bun:test';
import { handleWorkTaskRoutes } from '../routes/work-tasks';
import type { WorkTaskService } from '../work/service';

function fakeReq(method: string, path: string, body?: unknown): { req: Request; url: URL } {
    const url = new URL(`http://localhost:3000${path}`);
    const opts: RequestInit = { method };
    if (body !== undefined) {
        opts.body = JSON.stringify(body);
        opts.headers = { 'Content-Type': 'application/json' };
    }
    return { req: new Request(url.toString(), opts), url };
}

function createMockWorkTaskService(overrides?: Partial<WorkTaskService>): WorkTaskService {
    return {
        listTasks: mock(() => []),
        getTask: mock(() => null),
        create: mock(async () => ({
            id: 'task-1',
            agentId: 'agent-1',
            description: 'fix bug',
            status: 'pending',
            projectId: 'proj-1',
            source: 'web',
            sourceId: null,
            branchName: null,
            worktreeDir: null,
            sessionId: null,
            prUrl: null,
            iterationCount: 0,
            validationOutput: null,
            requesterInfo: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        })),
        cancelTask: mock(async () => null),
        onComplete: mock(() => {}),
        ...overrides,
    } as unknown as WorkTaskService;
}

describe('Work Task Routes', () => {
    it('GET /api/work-tasks returns list', async () => {
        const svc = createMockWorkTaskService({
            listTasks: mock(() => [{ id: 'task-1', description: 'fix bug' }]),
        } as any);
        const { req, url } = fakeReq('GET', '/api/work-tasks');
        const res = handleWorkTaskRoutes(req, url, svc);
        expect(res).not.toBeNull();
        const data = await (res as Response).json();
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBe(1);
    });

    it('GET /api/work-tasks passes agentId filter', async () => {
        const svc = createMockWorkTaskService();
        const { req, url } = fakeReq('GET', '/api/work-tasks?agentId=agent-1');
        handleWorkTaskRoutes(req, url, svc);
        expect(svc.listTasks).toHaveBeenCalledWith('agent-1');
    });

    it('POST /api/work-tasks rejects empty body', async () => {
        const svc = createMockWorkTaskService();
        const { req, url } = fakeReq('POST', '/api/work-tasks', {});
        const res = await handleWorkTaskRoutes(req, url, svc)!;
        expect((res as Response).status).toBe(400);
    });

    it('POST /api/work-tasks creates task with valid input', async () => {
        const svc = createMockWorkTaskService();
        const { req, url } = fakeReq('POST', '/api/work-tasks', {
            agentId: 'agent-1',
            description: 'fix bug',
        });
        const res = await handleWorkTaskRoutes(req, url, svc)!;
        expect((res as Response).status).toBe(201);
        const data = await (res as Response).json();
        expect(data.id).toBe('task-1');
        expect(svc.create).toHaveBeenCalledTimes(1);
    });

    it('GET /api/work-tasks/:id returns task', async () => {
        const svc = createMockWorkTaskService({
            getTask: mock(() => ({ id: 'task-1', description: 'fix bug' })),
        } as any);
        const { req, url } = fakeReq('GET', '/api/work-tasks/task-1');
        const res = handleWorkTaskRoutes(req, url, svc);
        expect(res).not.toBeNull();
        const data = await (res as Response).json();
        expect(data.id).toBe('task-1');
    });

    it('GET /api/work-tasks/:id returns 404 for unknown', async () => {
        const svc = createMockWorkTaskService();
        const { req, url } = fakeReq('GET', '/api/work-tasks/nonexistent');
        const res = handleWorkTaskRoutes(req, url, svc);
        expect((res as Response).status).toBe(404);
    });

    it('POST /api/work-tasks/:id/cancel returns 404 for unknown', async () => {
        const svc = createMockWorkTaskService();
        const { req, url } = fakeReq('POST', '/api/work-tasks/nonexistent/cancel');
        const res = await handleWorkTaskRoutes(req, url, svc)!;
        expect((res as Response).status).toBe(404);
    });

    it('returns null for unmatched paths', () => {
        const svc = createMockWorkTaskService();
        const { req, url } = fakeReq('GET', '/api/other');
        const res = handleWorkTaskRoutes(req, url, svc);
        expect(res).toBeNull();
    });
});

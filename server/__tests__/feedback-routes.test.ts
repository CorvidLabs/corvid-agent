import { describe, test, expect, mock } from 'bun:test';
import { handleFeedbackRoutes } from '../routes/feedback';

function makeRequest(path: string, method: string = 'GET'): { req: Request; url: URL } {
    const url = new URL(`http://localhost:3000${path}`);
    const req = new Request(url, { method });
    return { req, url };
}

function makeTracker(overrides: Record<string, unknown> = {}) {
    return {
        getMetrics: mock(() => ({ totalPRs: 10, mergedPRs: 8, mergeRate: 0.8 })),
        analyzeWeekly: mock(() => ({ weekOf: '2026-03-09', summary: 'good' })),
        getOutcomeContext: mock(() => 'Context string for prompts'),
        ...overrides,
    };
}

const mockDb = {} as any;

describe('handleFeedbackRoutes', () => {
    test('returns null for non-feedback paths', () => {
        const tracker = makeTracker();
        const { req, url } = makeRequest('/api/health');
        const result = handleFeedbackRoutes(req, url, mockDb, tracker as any);
        expect(result).toBeNull();
    });

    test('returns 503 when outcomeTracker is null', async () => {
        const { req, url } = makeRequest('/api/feedback/metrics');
        const result = handleFeedbackRoutes(req, url, mockDb, null);
        expect(result).not.toBeNull();
        expect(result!.status).toBe(503);
        const body = await result!.json();
        expect(body.error).toBe('Feedback service not available');
    });

    test('GET /api/feedback/metrics returns metrics data', async () => {
        const tracker = makeTracker();
        const { req, url } = makeRequest('/api/feedback/metrics');
        const result = handleFeedbackRoutes(req, url, mockDb, tracker as any);
        expect(result).not.toBeNull();
        expect(result!.status).toBe(200);
        const body = await result!.json();
        expect(body.totalPRs).toBe(10);
        expect(body.mergedPRs).toBe(8);
        expect(body.mergeRate).toBe(0.8);
        expect(tracker.getMetrics).toHaveBeenCalledWith(undefined);
    });

    test('GET /api/feedback/metrics passes since query param', async () => {
        const tracker = makeTracker();
        const { req, url } = makeRequest('/api/feedback/metrics?since=2026-03-01');
        const result = handleFeedbackRoutes(req, url, mockDb, tracker as any);
        expect(result).not.toBeNull();
        expect(result!.status).toBe(200);
        expect(tracker.getMetrics).toHaveBeenCalledWith('2026-03-01');
    });

    test('GET /api/feedback/metrics handles errors', async () => {
        const tracker = makeTracker({
            getMetrics: mock(() => { throw new Error('db failure'); }),
        });
        const { req, url } = makeRequest('/api/feedback/metrics');
        const result = handleFeedbackRoutes(req, url, mockDb, tracker as any);
        expect(result).not.toBeNull();
        expect(result!.status).toBeGreaterThanOrEqual(400);
    });

    test('GET /api/feedback/analysis returns weekly analysis', async () => {
        const tracker = makeTracker();
        const { req, url } = makeRequest('/api/feedback/analysis');
        const result = handleFeedbackRoutes(req, url, mockDb, tracker as any);
        expect(result).not.toBeNull();
        expect(result!.status).toBe(200);
        const body = await result!.json();
        expect(body.weekOf).toBe('2026-03-09');
        expect(body.summary).toBe('good');
        expect(tracker.analyzeWeekly).toHaveBeenCalledWith(undefined);
    });

    test('GET /api/feedback/analysis passes agentId query param', async () => {
        const tracker = makeTracker();
        const { req, url } = makeRequest('/api/feedback/analysis?agentId=agent-42');
        const result = handleFeedbackRoutes(req, url, mockDb, tracker as any);
        expect(result).not.toBeNull();
        expect(result!.status).toBe(200);
        expect(tracker.analyzeWeekly).toHaveBeenCalledWith('agent-42');
    });

    test('GET /api/feedback/analysis handles errors', async () => {
        const tracker = makeTracker({
            analyzeWeekly: mock(() => { throw new Error('analysis failed'); }),
        });
        const { req, url } = makeRequest('/api/feedback/analysis');
        const result = handleFeedbackRoutes(req, url, mockDb, tracker as any);
        expect(result).not.toBeNull();
        expect(result!.status).toBeGreaterThanOrEqual(400);
    });

    test('GET /api/feedback/context returns context string', async () => {
        const tracker = makeTracker();
        const { req, url } = makeRequest('/api/feedback/context');
        const result = handleFeedbackRoutes(req, url, mockDb, tracker as any);
        expect(result).not.toBeNull();
        expect(result!.status).toBe(200);
        const body = await result!.json();
        expect(body.context).toBe('Context string for prompts');
        expect(tracker.getOutcomeContext).toHaveBeenCalled();
    });

    test('GET /api/feedback/context handles errors', async () => {
        const tracker = makeTracker({
            getOutcomeContext: mock(() => { throw new Error('context error'); }),
        });
        const { req, url } = makeRequest('/api/feedback/context');
        const result = handleFeedbackRoutes(req, url, mockDb, tracker as any);
        expect(result).not.toBeNull();
        expect(result!.status).toBeGreaterThanOrEqual(400);
    });

    test('returns null for unknown feedback sub-paths', () => {
        const tracker = makeTracker();
        const { req, url } = makeRequest('/api/feedback/unknown');
        const result = handleFeedbackRoutes(req, url, mockDb, tracker as any);
        expect(result).toBeNull();
    });

    test('returns null for POST methods on GET-only routes', () => {
        const tracker = makeTracker();
        const paths = ['/api/feedback/metrics', '/api/feedback/analysis', '/api/feedback/context'];
        for (const path of paths) {
            const { req, url } = makeRequest(path, 'POST');
            const result = handleFeedbackRoutes(req, url, mockDb, tracker as any);
            expect(result).toBeNull();
        }
    });
});

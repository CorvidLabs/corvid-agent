import { describe, it, expect } from 'bun:test';
import { handleFlockTestingRoutes } from '../routes/flock-testing';
import { Database } from 'bun:sqlite';

function makeReq(method: string, path: string): { req: Request; url: URL } {
    const url = new URL(`http://localhost${path}`);
    const req = new Request(url.toString(), { method });
    return { req, url };
}

describe('handleFlockTestingRoutes', () => {
    const db = new Database(':memory:');

    it('returns null for non-matching paths', () => {
        const { req, url } = makeReq('GET', '/api/other');
        expect(handleFlockTestingRoutes(req, url, db)).toBeNull();
    });

    describe('score endpoint', () => {
        it('returns null scores when testRunner is null', () => {
            const { req, url } = makeReq('GET', '/api/flock-directory/testing/agents/agent-1/score');
            const res = handleFlockTestingRoutes(req, url, db, null);
            expect(res).toBeInstanceOf(Response);
            const body = (res as Response).json();
            return (body as Promise<any>).then((data) => {
                expect(data.agentId).toBe('agent-1');
                expect(data.effectiveScore).toBeNull();
                expect(data.rawScore).toBeNull();
                expect(data.lastTestedAt).toBeNull();
            });
        });

        it('returns null scores when testRunner is undefined', () => {
            const { req, url } = makeReq('GET', '/api/flock-directory/testing/agents/agent-2/score');
            const res = handleFlockTestingRoutes(req, url, db, undefined);
            expect(res).toBeInstanceOf(Response);
            const body = (res as Response).json();
            return (body as Promise<any>).then((data) => {
                expect(data.agentId).toBe('agent-2');
                expect(data.effectiveScore).toBeNull();
            });
        });
    });

    describe('cooldown endpoint', () => {
        it('returns not on cooldown for unknown agent', () => {
            const { req, url } = makeReq('GET', '/api/flock-directory/testing/agents/unknown-agent/cooldown');
            const res = handleFlockTestingRoutes(req, url, db, null);
            expect(res).toBeInstanceOf(Response);
            const body = (res as Response).json();
            return (body as Promise<any>).then((data) => {
                expect(data.onCooldown).toBe(false);
            });
        });

        it('works without testRunner', () => {
            const { req, url } = makeReq('GET', '/api/flock-directory/testing/agents/some-agent/cooldown');
            const res = handleFlockTestingRoutes(req, url, db, null);
            expect(res).toBeInstanceOf(Response);
        });
    });

    describe('testRunner-gated endpoints', () => {
        it('returns 503 for stats when testRunner is null', () => {
            const { req, url } = makeReq('GET', '/api/flock-directory/testing/stats');
            const res = handleFlockTestingRoutes(req, url, db, null);
            expect(res).toBeInstanceOf(Response);
            expect((res as Response).status).toBe(503);
        });

        it('returns 503 for results when testRunner is null', () => {
            const { req, url } = makeReq('GET', '/api/flock-directory/testing/agents/agent-1/results');
            const res = handleFlockTestingRoutes(req, url, db, null);
            expect(res).toBeInstanceOf(Response);
            expect((res as Response).status).toBe(503);
        });

        it('returns 503 for latest when testRunner is null', () => {
            const { req, url } = makeReq('GET', '/api/flock-directory/testing/agents/agent-1/latest');
            const res = handleFlockTestingRoutes(req, url, db, null);
            expect(res).toBeInstanceOf(Response);
            expect((res as Response).status).toBe(503);
        });

        it('returns stats from testRunner', async () => {
            const mockRunner = {
                getTestStats: () => ({ totalTests: 5, testedAgents: 2, avgScore: 85 }),
            } as any;
            const { req, url } = makeReq('GET', '/api/flock-directory/testing/stats');
            const res = handleFlockTestingRoutes(req, url, db, mockRunner);
            expect(res).toBeInstanceOf(Response);
            const data = await (res as Response).json();
            expect(data.totalTests).toBe(5);
            expect(data.testedAgents).toBe(2);
            expect(data.avgScore).toBe(85);
        });

        it('returns results from testRunner', async () => {
            const mockRunner = {
                getResults: (id: string, limit?: number) => [{ agentId: id, overallScore: 90 }],
            } as any;
            const { req, url } = makeReq('GET', '/api/flock-directory/testing/agents/agent-1/results');
            const res = handleFlockTestingRoutes(req, url, db, mockRunner);
            expect(res).toBeInstanceOf(Response);
            const data = await (res as Response).json();
            expect(data.agentId).toBe('agent-1');
            expect(data.results).toHaveLength(1);
            expect(data.results[0].overallScore).toBe(90);
        });

        it('returns latest result from testRunner', async () => {
            const mockRunner = {
                getLatestResult: (id: string) => ({ agentId: id, overallScore: 88, completedAt: '2026-01-01T00:00:00Z' }),
            } as any;
            const { req, url } = makeReq('GET', '/api/flock-directory/testing/agents/agent-1/latest');
            const res = handleFlockTestingRoutes(req, url, db, mockRunner);
            expect(res).toBeInstanceOf(Response);
            const data = await (res as Response).json();
            expect(data.overallScore).toBe(88);
        });

        it('returns 404 for latest when no results exist', async () => {
            const mockRunner = {
                getLatestResult: () => null,
            } as any;
            const { req, url } = makeReq('GET', '/api/flock-directory/testing/agents/agent-1/latest');
            const res = handleFlockTestingRoutes(req, url, db, mockRunner);
            expect(res).toBeInstanceOf(Response);
            expect((res as Response).status).toBe(404);
        });
    });

    describe('run endpoint', () => {
        it('returns 503 when flock directory not available', async () => {
            const { req, url } = makeReq('POST', '/api/flock-directory/testing/agents/agent-1/run');
            const res = handleFlockTestingRoutes(req, url, db, null, undefined, {});
            expect(res).toBeInstanceOf(Response);
            expect((res as Response).status).toBe(503);
        });
    });
});

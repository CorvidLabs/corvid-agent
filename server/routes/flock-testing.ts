/**
 * Flock Directory testing routes — Agent test results and stats.
 */
import type { Database } from 'bun:sqlite';
import type { FlockTestRunner } from '../flock-directory/testing/runner';
import type { RequestContext } from '../middleware/guards';
import { json, notFound, safeNumParam } from '../lib/response';

export function handleFlockTestingRoutes(
    req: Request,
    url: URL,
    _db: Database,
    testRunner?: FlockTestRunner | null,
    _context?: RequestContext,
): Response | null {
    if (!url.pathname.startsWith('/api/flock-directory/testing')) return null;
    if (!testRunner) {
        return json({ error: 'Flock testing not available' }, 503);
    }

    const path = url.pathname;
    const method = req.method;

    // ─── Test Stats ─────────────────────────────────────────────────────────

    if (path === '/api/flock-directory/testing/stats' && method === 'GET') {
        return json(testRunner.getTestStats());
    }

    // ─── Agent test results ─────────────────────────────────────────────────

    const resultsMatch = path.match(/^\/api\/flock-directory\/testing\/agents\/([^/]+)\/results$/);
    if (resultsMatch && method === 'GET') {
        const agentId = resultsMatch[1];
        const limitParam = url.searchParams.get('limit');
        const limit = limitParam !== null ? safeNumParam(limitParam, 10) : undefined;
        const results = testRunner.getResults(agentId, limit);
        return json({ agentId, results });
    }

    // ─── Agent latest test result ───────────────────────────────────────────

    const latestMatch = path.match(/^\/api\/flock-directory\/testing\/agents\/([^/]+)\/latest$/);
    if (latestMatch && method === 'GET') {
        const agentId = latestMatch[1];
        const result = testRunner.getLatestResult(agentId);
        if (!result) return notFound('No test results for this agent');
        return json(result);
    }

    // ─── Agent effective score (with decay) ─────────────────────────────────

    const scoreMatch = path.match(/^\/api\/flock-directory\/testing\/agents\/([^/]+)\/score$/);
    if (scoreMatch && method === 'GET') {
        const agentId = scoreMatch[1];
        const effectiveScore = testRunner.getEffectiveScore(agentId);
        const latest = testRunner.getLatestResult(agentId);
        return json({
            agentId,
            effectiveScore,
            rawScore: latest?.overallScore ?? null,
            lastTestedAt: latest?.completedAt ?? null,
        });
    }

    return null;
}

/**
 * Flock Directory testing routes — Agent test results, stats, and on-demand test trigger.
 */
import type { Database } from 'bun:sqlite';
import { FlockTestRunner } from '../flock-directory/testing/runner';
import { createA2ATransport } from '../flock-directory/testing/a2a-transport';
import type { FlockDirectoryService } from '../flock-directory/service';
import type { RequestContext } from '../middleware/guards';
import { json, notFound, safeNumParam, handleRouteError } from '../lib/response';

/** 4-hour cooldown between manual test triggers per agent. */
const TEST_COOLDOWN_MS = 4 * 60 * 60 * 1000;
const testCooldowns = new Map<string, number>();

export interface FlockTestingDeps {
    flockDirectory?: FlockDirectoryService | null;
}

export function handleFlockTestingRoutes(
    req: Request,
    url: URL,
    db: Database,
    testRunner?: FlockTestRunner | null,
    _context?: RequestContext,
    deps?: FlockTestingDeps,
): Response | Promise<Response> | null {
    if (!url.pathname.startsWith('/api/flock-directory/testing')) return null;

    const path = url.pathname;
    const method = req.method;

    // ─── Trigger on-demand test (works even without a persistent test runner) ─

    const runMatch = path.match(/^\/api\/flock-directory\/testing\/agents\/([^/]+)\/run$/);
    if (runMatch && method === 'POST') {
        const agentId = runMatch[1];
        const flockDirectory = deps?.flockDirectory;

        if (!flockDirectory) {
            return json({ error: 'Flock Directory not available' }, 503);
        }

        // Enforce cooldown
        const lastRun = testCooldowns.get(agentId);
        if (lastRun) {
            const elapsed = Date.now() - lastRun;
            if (elapsed < TEST_COOLDOWN_MS) {
                const remainingMs = TEST_COOLDOWN_MS - elapsed;
                const remainingMin = Math.ceil(remainingMs / 60_000);
                return json({
                    error: 'Test cooldown active',
                    remainingMs,
                    remainingMin,
                    nextAvailableAt: new Date(lastRun + TEST_COOLDOWN_MS).toISOString(),
                }, 429);
            }
        }

        const agent = flockDirectory.getById(agentId);
        if (!agent) return notFound('Agent not found in Flock Directory');
        if (agent.status !== 'active') {
            return json({ error: 'Agent is not active' }, 400);
        }

        // Record cooldown immediately to prevent concurrent triggers
        testCooldowns.set(agentId, Date.now());

        return (async () => {
            try {
                const transport = createA2ATransport(db);
                const runner = new FlockTestRunner(db, transport);
                const result = await runner.runTest(agent.id, agent.address, { mode: 'full', decayPerDay: 0.02 });

                // Update reputation with test results
                flockDirectory.computeReputation(agent.id);

                return json({
                    result,
                    nextAvailableAt: new Date(Date.now() + TEST_COOLDOWN_MS).toISOString(),
                });
            } catch (err) {
                // Clear cooldown on failure so user can retry
                testCooldowns.delete(agentId);
                return handleRouteError(err);
            }
        })();
    }

    // ─── Agent effective score (with decay) ─────────────────────────────────
    // Works without testRunner by returning nulls gracefully.

    const scoreMatch = path.match(/^\/api\/flock-directory\/testing\/agents\/([^/]+)\/score$/);
    if (scoreMatch && method === 'GET') {
        const agentId = scoreMatch[1];
        const effectiveScore = testRunner?.getEffectiveScore(agentId) ?? null;
        const latest = testRunner?.getLatestResult(agentId) ?? null;
        return json({
            agentId,
            effectiveScore,
            rawScore: latest?.overallScore ?? null,
            lastTestedAt: latest?.completedAt ?? null,
        });
    }

    // ─── Test cooldown status ────────────────────────────────────────────────
    // Uses module-level map — no testRunner needed.

    const cooldownMatch = path.match(/^\/api\/flock-directory\/testing\/agents\/([^/]+)\/cooldown$/);
    if (cooldownMatch && method === 'GET') {
        const agentId = cooldownMatch[1];
        const lastRun = testCooldowns.get(agentId);
        if (!lastRun || Date.now() - lastRun >= TEST_COOLDOWN_MS) {
            return json({ onCooldown: false });
        }
        const remainingMs = TEST_COOLDOWN_MS - (Date.now() - lastRun);
        return json({
            onCooldown: true,
            remainingMs,
            remainingMin: Math.ceil(remainingMs / 60_000),
            nextAvailableAt: new Date(lastRun + TEST_COOLDOWN_MS).toISOString(),
        });
    }

    // All remaining endpoints require a test runner
    if (!testRunner) {
        return json({ error: 'Flock testing not available' }, 503);
    }

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

    return null;
}

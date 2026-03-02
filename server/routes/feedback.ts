/**
 * Feedback metrics API routes.
 *
 * Exposes endpoints for PR outcome tracking data, weekly analysis,
 * and repo-level success rates.
 */

import type { Database } from 'bun:sqlite';
import type { OutcomeTrackerService } from '../feedback/outcome-tracker';
import { json, handleRouteError } from '../lib/response';

export function handleFeedbackRoutes(
    req: Request,
    url: URL,
    _db: Database,
    outcomeTracker: OutcomeTrackerService | null,
): Response | null {
    if (!url.pathname.startsWith('/api/feedback')) return null;
    if (!outcomeTracker) return json({ error: 'Feedback service not available' }, 503);

    // GET /api/feedback/metrics — current outcome metrics
    if (url.pathname === '/api/feedback/metrics' && req.method === 'GET') {
        try {
            const since = url.searchParams.get('since') ?? undefined;
            const metrics = outcomeTracker.getMetrics(since);
            return json(metrics);
        } catch (err) {
            return handleRouteError(err);
        }
    }

    // GET /api/feedback/analysis — weekly analysis
    if (url.pathname === '/api/feedback/analysis' && req.method === 'GET') {
        try {
            const agentId = url.searchParams.get('agentId') ?? undefined;
            const analysis = outcomeTracker.analyzeWeekly(agentId);
            return json(analysis);
        } catch (err) {
            return handleRouteError(err);
        }
    }

    // GET /api/feedback/context — outcome context string for prompts
    if (url.pathname === '/api/feedback/context' && req.method === 'GET') {
        try {
            const context = outcomeTracker.getOutcomeContext();
            return json({ context });
        } catch (err) {
            return handleRouteError(err);
        }
    }

    return null;
}

/**
 * GitHub Activity API routes.
 *
 * All endpoints require `owner` and `repo` query params (e.g. owner=CorvidLabs&repo=corvid-agent).
 *
 * GET /api/github-activity/events?owner={owner}&repo={repo}&limit={n}
 * GET /api/github-activity/prs?owner={owner}&repo={repo}
 * GET /api/github-activity/issues?owner={owner}&repo={repo}
 * GET /api/github-activity/runs?owner={owner}&repo={repo}
 * GET /api/github-activity/summary?owner={owner}&repo={repo}
 */

import { json, badRequest, handleRouteError } from '../lib/response';
import {
    fetchRecentEvents,
    fetchOpenPRs,
    fetchOpenIssues,
    fetchRecentRuns,
    fetchActivitySummary,
} from '../github/activity';

export function handleGitHubActivityRoutes(req: Request, url: URL): Response | Promise<Response> | null {
    if (!url.pathname.startsWith('/api/github-activity/')) return null;
    if (req.method !== 'GET') return null;

    const owner = url.searchParams.get('owner');
    const repo = url.searchParams.get('repo');
    if (!owner || !repo) return badRequest('owner and repo query parameters are required');

    const subpath = url.pathname.slice('/api/github-activity/'.length);

    if (subpath === 'events') {
        return (async () => {
            try {
                const limit = Number(url.searchParams.get('limit') ?? 30);
                const events = await fetchRecentEvents(owner, repo, limit);
                return json({ events });
            } catch (err) {
                return handleRouteError(err);
            }
        })();
    }

    if (subpath === 'prs') {
        return (async () => {
            try {
                const prs = await fetchOpenPRs(owner, repo);
                return json({ prs });
            } catch (err) {
                return handleRouteError(err);
            }
        })();
    }

    if (subpath === 'issues') {
        return (async () => {
            try {
                const issues = await fetchOpenIssues(owner, repo);
                return json({ issues });
            } catch (err) {
                return handleRouteError(err);
            }
        })();
    }

    if (subpath === 'runs') {
        return (async () => {
            try {
                const runs = await fetchRecentRuns(owner, repo);
                return json({ runs });
            } catch (err) {
                return handleRouteError(err);
            }
        })();
    }

    if (subpath === 'summary') {
        return (async () => {
            try {
                const summary = await fetchActivitySummary(owner, repo);
                return json(summary);
            } catch (err) {
                return handleRouteError(err);
            }
        })();
    }

    return null;
}

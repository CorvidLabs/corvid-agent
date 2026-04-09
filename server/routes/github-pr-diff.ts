import { createLogger } from '../lib/logger';
import { handleRouteError, json } from '../lib/response';
import type { RequestContext } from '../middleware/guards';
import { tenantRoleGuard } from '../middleware/guards';

const log = createLogger('GitHubPRDiff');

/**
 * GET /api/github/pr-diff?owner=X&repo=Y&number=Z
 * Proxies a GitHub PR diff request, returning the unified diff as a string.
 */
export function handleGitHubPRDiffRoutes(
  req: Request,
  url: URL,
  context?: RequestContext,
): Response | Promise<Response> | null {
  if (url.pathname !== '/api/github/pr-diff' || req.method !== 'GET') return null;

  if (context) {
    const denied = tenantRoleGuard('viewer', 'operator', 'owner')(req, url, context);
    if (denied) return denied;
  }

  const owner = url.searchParams.get('owner');
  const repo = url.searchParams.get('repo');
  const number = url.searchParams.get('number');

  if (!owner || !repo || !number) {
    return json({ error: 'Missing owner, repo, or number query params' }, 400);
  }

  // Validate inputs to prevent SSRF — only allow alphanumeric, hyphens, underscores, dots
  const safePattern = /^[a-zA-Z0-9._-]+$/;
  if (!safePattern.test(owner) || !safePattern.test(repo) || !/^\d+$/.test(number)) {
    return json({ error: 'Invalid owner, repo, or number format' }, 400);
  }

  return fetchDiff(owner, repo, number);
}

async function fetchDiff(owner: string, repo: string, number: string): Promise<Response> {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3.diff',
    'User-Agent': 'corvid-agent',
  };
  if (token) {
    headers.Authorization = `token ${token}`;
  }

  try {
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${number}`;
    const resp = await fetch(apiUrl, { headers });
    if (!resp.ok) {
      log.warn('GitHub API error', { status: resp.status, owner, repo, number });
      return json({ error: `GitHub API returned ${resp.status}` }, resp.status as 400);
    }
    const diff = await resp.text();
    // Return as plain text JSON-wrapped so ApiService can consume it
    return json(diff);
  } catch (err) {
    return handleRouteError(err);
  }
}

/**
 * GitHub Activity API client.
 *
 * Fetches events, PRs, issues, and CI runs via `gh` CLI using
 * repo-specific endpoints (not search API) to avoid rate limits.
 * Uses in-memory caching (2-minute TTL).
 */

import { buildSafeGhEnv } from '../lib/env';
import { createLogger } from '../lib/logger';

const log = createLogger('GitHubActivity');

// ── Types ────────────────────────────────────────────────────────────

export interface GitHubEvent {
    id: string;
    type: string;
    repo: string;
    actor: string;
    action?: string;
    title?: string;
    number?: number;
    url?: string;
    ref?: string;
    commits?: number;
    createdAt: string;
}

export interface GitHubPR {
    repo: string;
    number: number;
    title: string;
    author: string;
    state: string;
    draft: boolean;
    url: string;
    labels: string[];
    createdAt: string;
    updatedAt: string;
}

export interface GitHubIssue {
    repo: string;
    number: number;
    title: string;
    author: string;
    labels: string[];
    url: string;
    createdAt: string;
    updatedAt: string;
}

export interface GitHubRun {
    id: number;
    repo: string;
    name: string;
    branch: string;
    status: string;
    conclusion: string;
    url: string;
    createdAt: string;
}

export interface ActivitySummary {
    openPRs: number;
    openIssues: number;
    recentCommits: number;
    ciPassRate: number;
    lastUpdated: string;
}

// ── Cache ────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

interface CacheEntry<T> {
    data: T;
    expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        cache.delete(key);
        return null;
    }
    return entry.data as T;
}

function setCache<T>(key: string, data: T): void {
    cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ── gh CLI runner ────────────────────────────────────────────────────

async function runGh(args: string[]): Promise<{ ok: boolean; stdout: string }> {
    try {
        const proc = Bun.spawn(['gh', ...args], {
            env: buildSafeGhEnv(),
            stdout: 'pipe',
            stderr: 'pipe',
        });
        const stdout = await new Response(proc.stdout).text();
        const exitCode = await proc.exited;
        if (exitCode !== 0) {
            const stderr = await new Response(proc.stderr).text();
            log.warn('gh command failed', { args: args.join(' '), exitCode, stderr: stderr.slice(0, 200) });
            return { ok: false, stdout: '' };
        }
        return { ok: true, stdout };
    } catch (err) {
        log.error('gh spawn error', { error: err instanceof Error ? err.message : String(err) });
        return { ok: false, stdout: '' };
    }
}

// ── Fetch functions (repo-specific) ──────────────────────────────────

export async function fetchRecentEvents(owner: string, repo: string, perPage = 30): Promise<GitHubEvent[]> {
    const cacheKey = `events:${owner}/${repo}:${perPage}`;
    const cached = getCached<GitHubEvent[]>(cacheKey);
    if (cached) return cached;

    const { ok, stdout } = await runGh([
        'api', `/repos/${owner}/${repo}/events`,
        '-f', `per_page=${perPage}`,
    ]);
    if (!ok) return [];

    try {
        const raw = JSON.parse(stdout) as Array<Record<string, unknown>>;
        const events: GitHubEvent[] = raw.map((e) => {
            const payload = e.payload as Record<string, unknown> | undefined;
            const actor = (e.actor as Record<string, string>)?.login ?? '';
            const type = String(e.type ?? '');

            const event: GitHubEvent = {
                id: String(e.id),
                type,
                repo: `${owner}/${repo}`,
                actor,
                createdAt: String(e.created_at),
            };

            if (payload) {
                event.action = payload.action as string | undefined;

                if (type === 'PushEvent') {
                    event.ref = (payload.ref as string)?.replace('refs/heads/', '');
                    event.commits = (payload.commits as unknown[])?.length ?? 0;
                }

                const prOrIssue = (payload.pull_request ?? payload.issue) as Record<string, unknown> | undefined;
                if (prOrIssue) {
                    event.title = prOrIssue.title as string;
                    event.number = prOrIssue.number as number;
                    event.url = prOrIssue.html_url as string;
                }

                if (type === 'ReleaseEvent') {
                    const release = payload.release as Record<string, unknown> | undefined;
                    if (release) {
                        event.title = release.tag_name as string;
                        event.url = release.html_url as string;
                    }
                }
            }

            return event;
        });

        setCache(cacheKey, events);
        return events;
    } catch {
        log.warn('Failed to parse events response');
        return [];
    }
}

export async function fetchOpenPRs(owner: string, repo: string): Promise<GitHubPR[]> {
    const cacheKey = `prs:${owner}/${repo}`;
    const cached = getCached<GitHubPR[]>(cacheKey);
    if (cached) return cached;

    const { ok, stdout } = await runGh([
        'api', `/repos/${owner}/${repo}/pulls`,
        '-f', 'state=open',
        '-f', 'sort=updated',
        '-f', 'per_page=30',
    ]);
    if (!ok) return [];

    try {
        const items = JSON.parse(stdout) as Array<Record<string, unknown>>;
        const prs: GitHubPR[] = items.map((item) => ({
            repo: `${owner}/${repo}`,
            number: item.number as number,
            title: String(item.title),
            author: (item.user as Record<string, string>)?.login ?? '',
            state: String(item.state),
            draft: Boolean(item.draft),
            url: String(item.html_url),
            labels: ((item.labels as Array<Record<string, string>>) ?? []).map((l) => l.name),
            createdAt: String(item.created_at),
            updatedAt: String(item.updated_at),
        }));

        setCache(cacheKey, prs);
        return prs;
    } catch {
        log.warn('Failed to parse PRs response');
        return [];
    }
}

export async function fetchOpenIssues(owner: string, repo: string): Promise<GitHubIssue[]> {
    const cacheKey = `issues:${owner}/${repo}`;
    const cached = getCached<GitHubIssue[]>(cacheKey);
    if (cached) return cached;

    const { ok, stdout } = await runGh([
        'api', `/repos/${owner}/${repo}/issues`,
        '-f', 'state=open',
        '-f', 'sort=updated',
        '-f', 'per_page=30',
    ]);
    if (!ok) return [];

    try {
        const items = JSON.parse(stdout) as Array<Record<string, unknown>>;
        // GitHub issues API includes PRs — filter them out
        const issues: GitHubIssue[] = items
            .filter((item) => !(item.pull_request))
            .map((item) => ({
                repo: `${owner}/${repo}`,
                number: item.number as number,
                title: String(item.title),
                author: (item.user as Record<string, string>)?.login ?? '',
                labels: ((item.labels as Array<Record<string, string>>) ?? []).map((l) => l.name),
                url: String(item.html_url),
                createdAt: String(item.created_at),
                updatedAt: String(item.updated_at),
            }));

        setCache(cacheKey, issues);
        return issues;
    } catch {
        log.warn('Failed to parse issues response');
        return [];
    }
}

export async function fetchRecentRuns(owner: string, repo: string): Promise<GitHubRun[]> {
    const cacheKey = `runs:${owner}/${repo}`;
    const cached = getCached<GitHubRun[]>(cacheKey);
    if (cached) return cached;

    const { ok, stdout } = await runGh([
        'api', `/repos/${owner}/${repo}/actions/runs`,
        '-f', 'per_page=10',
        '--jq', '.workflow_runs',
    ]);
    if (!ok) return [];

    try {
        const items = JSON.parse(stdout) as Array<Record<string, unknown>>;
        const runs: GitHubRun[] = items.map((item) => ({
            id: item.id as number,
            repo: `${owner}/${repo}`,
            name: String(item.name),
            branch: String(item.head_branch),
            status: String(item.status),
            conclusion: String(item.conclusion ?? ''),
            url: String(item.html_url),
            createdAt: String(item.created_at),
        }));

        setCache(cacheKey, runs);
        return runs;
    } catch {
        log.warn('Failed to parse runs response');
        return [];
    }
}

export async function fetchActivitySummary(owner: string, repo: string): Promise<ActivitySummary> {
    const cacheKey = `summary:${owner}/${repo}`;
    const cached = getCached<ActivitySummary>(cacheKey);
    if (cached) return cached;

    const [events, prs, issues, runs] = await Promise.all([
        fetchRecentEvents(owner, repo, 30),
        fetchOpenPRs(owner, repo),
        fetchOpenIssues(owner, repo),
        fetchRecentRuns(owner, repo),
    ]);

    const recentCommits = events
        .filter((e) => e.type === 'PushEvent')
        .reduce((sum, e) => sum + (e.commits ?? 0), 0);

    // CI pass rate from recent completed runs
    const completedRuns = runs.filter((r) => r.status === 'completed');
    const passedRuns = completedRuns.filter((r) => r.conclusion === 'success');
    const ciPassRate = completedRuns.length > 0
        ? Math.round((passedRuns.length / completedRuns.length) * 100)
        : 0;

    const summary: ActivitySummary = {
        openPRs: prs.length,
        openIssues: issues.length,
        recentCommits,
        ciPassRate,
        lastUpdated: new Date().toISOString(),
    };

    setCache(cacheKey, summary);
    return summary;
}

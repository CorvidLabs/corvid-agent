/**
 * GitHub Operations — wraps the `gh` CLI for repo actions.
 * Requires GH_TOKEN env var to be set.
 */

import { createLogger } from '../lib/logger';

const log = createLogger('GitHubOps');

function hasGhToken(): boolean {
    return !!process.env.GH_TOKEN;
}

async function runGh(args: string[], cwd?: string): Promise<{ ok: boolean; stdout: string; stderr: string }> {
    if (!hasGhToken()) {
        return { ok: false, stdout: '', stderr: 'GH_TOKEN not configured' };
    }

    try {
        const proc = Bun.spawn(['gh', ...args], {
            cwd: cwd ?? process.cwd(),
            stdout: 'pipe',
            stderr: 'pipe',
            env: { ...process.env },
        });

        const stdout = await new Response(proc.stdout).text();
        const stderr = await new Response(proc.stderr).text();
        const exitCode = await proc.exited;

        return { ok: exitCode === 0, stdout: stdout.trim(), stderr: stderr.trim() };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, stdout: '', stderr: message };
    }
}

// ─── Star / Unstar ───────────────────────────────────────────────────────────

export async function starRepo(repo: string): Promise<{ ok: boolean; message: string }> {
    log.info('Starring repo', { repo });
    // gh doesn't have a direct star command — use the REST API
    const apiResult = await runGh(['api', '-X', 'PUT', `/user/starred/${repo}`]);
    if (apiResult.ok) {
        log.info('Starred repo successfully', { repo });
        return { ok: true, message: `Starred ${repo}` };
    }
    log.warn('Failed to star repo', { repo, error: apiResult.stderr });
    return { ok: false, message: `Failed to star ${repo}: ${apiResult.stderr}` };
}

export async function unstarRepo(repo: string): Promise<{ ok: boolean; message: string }> {
    const result = await runGh(['api', '-X', 'DELETE', `/user/starred/${repo}`]);
    return result.ok
        ? { ok: true, message: `Unstarred ${repo}` }
        : { ok: false, message: `Failed to unstar ${repo}: ${result.stderr}` };
}

// ─── Fork ────────────────────────────────────────────────────────────────────

export async function forkRepo(repo: string, org?: string): Promise<{ ok: boolean; message: string; forkUrl?: string }> {
    log.info('Forking repo', { repo, org });
    const args = ['repo', 'fork', repo, '--clone=false'];
    if (org) args.push(`--org=${org}`);

    const result = await runGh(args);
    if (result.ok || result.stderr.includes('already exists')) {
        // Extract fork URL from output
        const urlMatch = result.stdout.match(/https:\/\/github\.com\/[^\s]+/) ||
                         result.stderr.match(/https:\/\/github\.com\/[^\s]+/);
        const forkUrl = urlMatch?.[0];
        log.info('Forked repo successfully', { repo, forkUrl });
        return { ok: true, message: `Forked ${repo}`, forkUrl };
    }
    log.warn('Failed to fork repo', { repo, error: result.stderr });
    return { ok: false, message: `Failed to fork ${repo}: ${result.stderr}` };
}

// ─── Review PRs ──────────────────────────────────────────────────────────────

export interface PullRequest {
    number: number;
    title: string;
    url: string;
    author: string;
    state: string;
    headBranch: string;
    baseBranch: string;
    body: string;
    createdAt: string;
    additions: number;
    deletions: number;
    changedFiles: number;
}

export async function listOpenPrs(repo: string, maxPrs: number = 10): Promise<{ ok: boolean; prs: PullRequest[]; error?: string }> {
    log.info('Listing open PRs', { repo, maxPrs });
    const result = await runGh([
        'pr', 'list', '--repo', repo, '--state', 'open', '--limit', String(maxPrs),
        '--json', 'number,title,url,author,state,headRefName,baseRefName,body,createdAt,additions,deletions,changedFiles',
    ]);

    if (!result.ok) {
        return { ok: false, prs: [], error: result.stderr };
    }

    try {
        const raw = JSON.parse(result.stdout) as Array<Record<string, unknown>>;
        const prs: PullRequest[] = raw.map((pr) => ({
            number: pr.number as number,
            title: pr.title as string,
            url: pr.url as string,
            author: ((pr.author as Record<string, unknown>)?.login as string) ?? 'unknown',
            state: pr.state as string,
            headBranch: pr.headRefName as string,
            baseBranch: pr.baseRefName as string,
            body: (pr.body as string) ?? '',
            createdAt: pr.createdAt as string,
            additions: (pr.additions as number) ?? 0,
            deletions: (pr.deletions as number) ?? 0,
            changedFiles: (pr.changedFiles as number) ?? 0,
        }));
        return { ok: true, prs };
    } catch {
        return { ok: false, prs: [], error: 'Failed to parse PR list' };
    }
}

export async function getPrDiff(repo: string, prNumber: number): Promise<{ ok: boolean; diff: string; error?: string }> {
    const result = await runGh(['pr', 'diff', String(prNumber), '--repo', repo]);
    return result.ok
        ? { ok: true, diff: result.stdout }
        : { ok: false, diff: '', error: result.stderr };
}

export async function addPrComment(repo: string, prNumber: number, body: string): Promise<{ ok: boolean; error?: string }> {
    log.info('Adding PR comment', { repo, prNumber });
    const result = await runGh(['pr', 'comment', String(prNumber), '--repo', repo, '--body', body]);
    return result.ok ? { ok: true } : { ok: false, error: result.stderr };
}

export async function addPrReview(
    repo: string,
    prNumber: number,
    event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT',
    body: string,
): Promise<{ ok: boolean; error?: string }> {
    log.info('Adding PR review', { repo, prNumber, event });
    const result = await runGh([
        'pr', 'review', String(prNumber), '--repo', repo,
        `--${event.toLowerCase().replace('_', '-')}`,
        '--body', body,
    ]);
    return result.ok ? { ok: true } : { ok: false, error: result.stderr };
}

// ─── Create PR ───────────────────────────────────────────────────────────────

export async function createPr(
    repo: string,
    title: string,
    body: string,
    headBranch: string,
    baseBranch: string = 'main',
    cwd?: string,
): Promise<{ ok: boolean; prUrl?: string; error?: string }> {
    log.info('Creating PR', { repo, title, headBranch, baseBranch });
    const result = await runGh([
        'pr', 'create',
        '--repo', repo,
        '--title', title,
        '--body', body,
        '--head', headBranch,
        '--base', baseBranch,
    ], cwd);

    if (result.ok) {
        const urlMatch = result.stdout.match(/https:\/\/github\.com\/[^\s]+/);
        return { ok: true, prUrl: urlMatch?.[0] ?? result.stdout };
    }
    return { ok: false, error: result.stderr };
}

// ─── Repo info ───────────────────────────────────────────────────────────────

export async function getRepoInfo(repo: string): Promise<{ ok: boolean; info?: Record<string, unknown>; error?: string }> {
    const result = await runGh([
        'repo', 'view', repo, '--json',
        'name,owner,description,url,stargazerCount,forkCount,isArchived,defaultBranchRef',
    ]);

    if (!result.ok) return { ok: false, error: result.stderr };

    try {
        const info = JSON.parse(result.stdout);
        return { ok: true, info };
    } catch {
        return { ok: false, error: 'Failed to parse repo info' };
    }
}

// ─── Follow / Unfollow ───────────────────────────────────────────────────────

export async function followUser(username: string): Promise<{ ok: boolean; message: string }> {
    log.info('Following user', { username });
    const result = await runGh(['api', '-X', 'PUT', `/user/following/${username}`]);
    if (result.ok) {
        log.info('Followed user successfully', { username });
        return { ok: true, message: `Followed ${username}` };
    }
    log.warn('Failed to follow user', { username, error: result.stderr });
    return { ok: false, message: `Failed to follow ${username}: ${result.stderr}` };
}

// ─── Issues ──────────────────────────────────────────────────────────────────

export interface Issue {
    number: number;
    title: string;
    state: string;
    labels: Array<{ name: string }>;
    url: string;
}

export async function createIssue(
    repo: string,
    title: string,
    body: string,
    labels?: string[],
): Promise<{ ok: boolean; issueUrl?: string; error?: string }> {
    log.info('Creating issue', { repo, title });
    const args = ['issue', 'create', '--repo', repo, '--title', title, '--body', body];
    if (labels?.length) {
        for (const label of labels) {
            args.push('--label', label);
        }
    }

    const result = await runGh(args);
    if (result.ok) {
        const urlMatch = result.stdout.match(/https:\/\/github\.com\/[^\s]+/);
        const issueUrl = urlMatch?.[0] ?? result.stdout;
        log.info('Created issue successfully', { repo, issueUrl });
        return { ok: true, issueUrl };
    }
    log.warn('Failed to create issue', { repo, error: result.stderr });
    return { ok: false, error: result.stderr };
}

export async function listIssues(
    repo: string,
    state: 'open' | 'closed' | 'all' = 'open',
    limit: number = 30,
): Promise<{ ok: boolean; issues: Issue[]; error?: string }> {
    log.info('Listing issues', { repo, state, limit });
    const result = await runGh([
        'issue', 'list', '--repo', repo, '--state', state, '--limit', String(limit),
        '--json', 'number,title,state,labels,url',
    ]);

    if (!result.ok) {
        return { ok: false, issues: [], error: result.stderr };
    }

    try {
        const issues = JSON.parse(result.stdout) as Issue[];
        return { ok: true, issues };
    } catch {
        return { ok: false, issues: [], error: 'Failed to parse issue list' };
    }
}

// ─── Issue Comments & Lifecycle ──────────────────────────────────────────

export interface IssueComment {
    id: number;
    body: string;
    author: string;
    createdAt: string;
}

export async function listIssueComments(
    repo: string,
    issueNumber: number,
    since?: string,
): Promise<{ ok: boolean; comments: IssueComment[]; error?: string }> {
    // Use the API directly with optional since filter
    const apiArgs = since
        ? ['api', `/repos/${repo}/issues/${issueNumber}/comments?since=${since}`]
        : ['api', `/repos/${repo}/issues/${issueNumber}/comments`];

    const result = await runGh(apiArgs);
    if (!result.ok) {
        return { ok: false, comments: [], error: result.stderr };
    }

    try {
        const raw = JSON.parse(result.stdout || '[]') as Array<Record<string, unknown>>;
        const comments: IssueComment[] = raw.map((c) => ({
            id: c.id as number,
            body: (c.body as string) ?? '',
            author: ((c.user as Record<string, unknown>)?.login as string) ?? 'unknown',
            createdAt: (c.created_at as string) ?? '',
        }));
        return { ok: true, comments };
    } catch {
        return { ok: false, comments: [], error: 'Failed to parse issue comments' };
    }
}

export async function closeIssue(
    repo: string,
    issueNumber: number,
): Promise<{ ok: boolean; error?: string }> {
    log.info('Closing issue', { repo, issueNumber });
    const result = await runGh(['issue', 'close', String(issueNumber), '--repo', repo]);
    return result.ok ? { ok: true } : { ok: false, error: result.stderr };
}

export async function addIssueComment(
    repo: string,
    issueNumber: number,
    body: string,
): Promise<{ ok: boolean; error?: string }> {
    log.info('Adding issue comment', { repo, issueNumber });
    const result = await runGh(['issue', 'comment', String(issueNumber), '--repo', repo, '--body', body]);
    return result.ok ? { ok: true } : { ok: false, error: result.stderr };
}

export function isGitHubConfigured(): boolean {
    return hasGhToken();
}

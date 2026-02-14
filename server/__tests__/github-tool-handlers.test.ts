/**
 * Comprehensive tests for all 12 GitHub tool handlers.
 *
 * Uses Bun's mock.module() to mock the github/operations module so no real
 * GitHub CLI calls are made.  Each handler is tested for success paths,
 * error (ok:false) returns, exception handling, parameter passing, default
 * values, and output formatting.
 */

import { describe, test, expect, afterEach, mock } from 'bun:test';
import type { McpToolContext } from '../mcp/tool-handlers';

// ── Mock setup ────────────────────────────────────────────────────────────
// We define mock functions for every operation the handlers call, then
// wire them into the module graph via mock.module().

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mocks need flexible return types
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;

const mockStarRepo: AnyMock = mock(() => Promise.resolve({ ok: true, message: 'Starred owner/repo' }));
const mockUnstarRepo: AnyMock = mock(() => Promise.resolve({ ok: true, message: 'Unstarred owner/repo' }));
const mockForkRepo: AnyMock = mock(() => Promise.resolve({ ok: true, message: 'Forked owner/repo', forkUrl: 'https://github.com/me/repo' }));
const mockListOpenPrs: AnyMock = mock(() => Promise.resolve({ ok: true, prs: [] as any[] }));
const mockCreatePr: AnyMock = mock(() => Promise.resolve({ ok: true, prUrl: 'https://github.com/owner/repo/pull/1' }));
const mockAddPrReview: AnyMock = mock(() => Promise.resolve({ ok: true }));
const mockCreateIssue: AnyMock = mock(() => Promise.resolve({ ok: true, issueUrl: 'https://github.com/owner/repo/issues/1' }));
const mockListIssues: AnyMock = mock(() => Promise.resolve({ ok: true, issues: [] as any[] }));
const mockGetRepoInfo: AnyMock = mock(() => Promise.resolve({ ok: true, info: { name: 'repo' } }));
const mockGetPrDiff: AnyMock = mock(() => Promise.resolve({ ok: true, diff: 'diff --git a/file' }));
const mockAddPrComment: AnyMock = mock(() => Promise.resolve({ ok: true }));
const mockFollowUser: AnyMock = mock(() => Promise.resolve({ ok: true, message: 'Followed user' }));

mock.module('../github/operations', () => ({
    starRepo: mockStarRepo,
    unstarRepo: mockUnstarRepo,
    forkRepo: mockForkRepo,
    listOpenPrs: mockListOpenPrs,
    createPr: mockCreatePr,
    addPrReview: mockAddPrReview,
    createIssue: mockCreateIssue,
    listIssues: mockListIssues,
    getRepoInfo: mockGetRepoInfo,
    getPrDiff: mockGetPrDiff,
    addPrComment: mockAddPrComment,
    followUser: mockFollowUser,
}));

// Import handlers AFTER mocking so they pick up the mocked module.
const {
    handleGitHubStarRepo,
    handleGitHubUnstarRepo,
    handleGitHubForkRepo,
    handleGitHubListPrs,
    handleGitHubCreatePr,
    handleGitHubReviewPr,
    handleGitHubCreateIssue,
    handleGitHubListIssues,
    handleGitHubRepoInfo,
    handleGitHubGetPrDiff,
    handleGitHubCommentOnPr,
    handleGitHubFollowUser,
} = await import('../mcp/tool-handlers');

// ── Helpers ───────────────────────────────────────────────────────────────

/** Build a minimal McpToolContext for testing. */
function makeCtx(overrides?: Partial<McpToolContext>): McpToolContext {
    return {
        agentId: 'test-agent',
        db: {} as McpToolContext['db'],
        agentMessenger: {} as McpToolContext['agentMessenger'],
        agentDirectory: {} as McpToolContext['agentDirectory'],
        agentWalletService: {} as McpToolContext['agentWalletService'],
        emitStatus: () => {},
        ...overrides,
    };
}

/** Extract the text string from a CallToolResult. */
function getText(result: { content: Array<{ type: string; text?: string }> }): string {
    const first = result.content[0];
    return (first as { type: 'text'; text: string }).text;
}

/** Check whether a result is flagged as an error. */
function isError(result: { isError?: boolean }): boolean {
    return result.isError === true;
}

// Reset all mocks between tests so call counts and implementations don't leak.
afterEach(() => {
    mockStarRepo.mockReset();
    mockUnstarRepo.mockReset();
    mockForkRepo.mockReset();
    mockListOpenPrs.mockReset();
    mockCreatePr.mockReset();
    mockAddPrReview.mockReset();
    mockCreateIssue.mockReset();
    mockListIssues.mockReset();
    mockGetRepoInfo.mockReset();
    mockGetPrDiff.mockReset();
    mockAddPrComment.mockReset();
    mockFollowUser.mockReset();
});

// ── handleGitHubStarRepo ─────────────────────────────────────────────────

describe('handleGitHubStarRepo', () => {
    test('returns success message when star succeeds', async () => {
        mockStarRepo.mockResolvedValueOnce({ ok: true, message: 'Starred owner/repo' });

        const result = await handleGitHubStarRepo(makeCtx(), { repo: 'owner/repo' });

        expect(isError(result)).toBe(false);
        expect(getText(result)).toBe('Starred owner/repo');
        expect(mockStarRepo).toHaveBeenCalledWith('owner/repo');
    });

    test('returns error message when star fails', async () => {
        mockStarRepo.mockResolvedValueOnce({ ok: false, message: 'Failed to star owner/repo: not found' });

        const result = await handleGitHubStarRepo(makeCtx(), { repo: 'owner/repo' });

        expect(isError(result)).toBe(true);
        expect(getText(result)).toContain('Failed to star');
    });

    test('catches exceptions and returns error result', async () => {
        mockStarRepo.mockRejectedValueOnce(new Error('Network timeout'));

        const result = await handleGitHubStarRepo(makeCtx(), { repo: 'owner/repo' });

        expect(isError(result)).toBe(true);
        expect(getText(result)).toContain('Network timeout');
    });
});

// ── handleGitHubUnstarRepo ──────────────────────────────────────────────

describe('handleGitHubUnstarRepo', () => {
    test('returns success message when unstar succeeds', async () => {
        mockUnstarRepo.mockResolvedValueOnce({ ok: true, message: 'Unstarred owner/repo' });

        const result = await handleGitHubUnstarRepo(makeCtx(), { repo: 'owner/repo' });

        expect(isError(result)).toBe(false);
        expect(getText(result)).toBe('Unstarred owner/repo');
        expect(mockUnstarRepo).toHaveBeenCalledWith('owner/repo');
    });

    test('returns error message when unstar fails', async () => {
        mockUnstarRepo.mockResolvedValueOnce({ ok: false, message: 'Failed to unstar owner/repo: not found' });

        const result = await handleGitHubUnstarRepo(makeCtx(), { repo: 'owner/repo' });

        expect(isError(result)).toBe(true);
        expect(getText(result)).toContain('Failed to unstar');
    });

    test('catches exceptions and returns error result', async () => {
        mockUnstarRepo.mockRejectedValueOnce(new Error('Connection refused'));

        const result = await handleGitHubUnstarRepo(makeCtx(), { repo: 'owner/repo' });

        expect(isError(result)).toBe(true);
        expect(getText(result)).toContain('Connection refused');
    });
});

// ── handleGitHubForkRepo ────────────────────────────────────────────────

describe('handleGitHubForkRepo', () => {
    test('returns success with fork URL appended', async () => {
        mockForkRepo.mockResolvedValueOnce({
            ok: true,
            message: 'Forked owner/repo',
            forkUrl: 'https://github.com/me/repo',
        });

        const result = await handleGitHubForkRepo(makeCtx(), { repo: 'owner/repo' });

        expect(isError(result)).toBe(false);
        expect(getText(result)).toBe('Forked owner/repo (https://github.com/me/repo)');
    });

    test('passes org parameter to forkRepo', async () => {
        mockForkRepo.mockResolvedValueOnce({
            ok: true,
            message: 'Forked owner/repo',
            forkUrl: 'https://github.com/myorg/repo',
        });

        await handleGitHubForkRepo(makeCtx(), { repo: 'owner/repo', org: 'myorg' });

        expect(mockForkRepo).toHaveBeenCalledWith('owner/repo', 'myorg');
    });

    test('returns error when fork fails', async () => {
        mockForkRepo.mockResolvedValueOnce({
            ok: false,
            message: 'Failed to fork owner/repo: permission denied',
        });

        const result = await handleGitHubForkRepo(makeCtx(), { repo: 'owner/repo' });

        expect(isError(result)).toBe(true);
        expect(getText(result)).toContain('permission denied');
    });

    test('returns success without URL when forkUrl is missing', async () => {
        mockForkRepo.mockResolvedValueOnce({
            ok: true,
            message: 'Forked owner/repo',
            forkUrl: undefined,
        });

        const result = await handleGitHubForkRepo(makeCtx(), { repo: 'owner/repo' });

        expect(isError(result)).toBe(false);
        expect(getText(result)).toBe('Forked owner/repo');
        expect(getText(result)).not.toContain('(');
    });
});

// ── handleGitHubListPrs ─────────────────────────────────────────────────

describe('handleGitHubListPrs', () => {
    test('returns "no open PRs" when list is empty', async () => {
        mockListOpenPrs.mockResolvedValueOnce({ ok: true, prs: [] });

        const result = await handleGitHubListPrs(makeCtx(), { repo: 'owner/repo' });

        expect(isError(result)).toBe(false);
        expect(getText(result)).toBe('No open PRs in owner/repo.');
    });

    test('returns formatted PR list', async () => {
        mockListOpenPrs.mockResolvedValueOnce({
            ok: true,
            prs: [
                {
                    number: 42,
                    title: 'Add feature',
                    url: 'https://github.com/owner/repo/pull/42',
                    author: 'contributor',
                    additions: 10,
                    deletions: 3,
                    changedFiles: 2,
                },
            ],
        });

        const result = await handleGitHubListPrs(makeCtx(), { repo: 'owner/repo' });
        const text = getText(result);

        expect(text).toContain('Open PRs in owner/repo:');
        expect(text).toContain('#42 Add feature');
        expect(text).toContain('by contributor');
        expect(text).toContain('+10/-3');
        expect(text).toContain('2 files');
    });

    test('passes limit parameter to listOpenPrs', async () => {
        mockListOpenPrs.mockResolvedValueOnce({ ok: true, prs: [] });

        await handleGitHubListPrs(makeCtx(), { repo: 'owner/repo', limit: 5 });

        expect(mockListOpenPrs).toHaveBeenCalledWith('owner/repo', 5);
    });

    test('uses default limit of 10 when not specified', async () => {
        mockListOpenPrs.mockResolvedValueOnce({ ok: true, prs: [] });

        await handleGitHubListPrs(makeCtx(), { repo: 'owner/repo' });

        expect(mockListOpenPrs).toHaveBeenCalledWith('owner/repo', 10);
    });

    test('returns error when listOpenPrs fails', async () => {
        mockListOpenPrs.mockResolvedValueOnce({ ok: false, prs: [], error: 'repo not found' });

        const result = await handleGitHubListPrs(makeCtx(), { repo: 'owner/repo' });

        expect(isError(result)).toBe(true);
        expect(getText(result)).toContain('repo not found');
    });
});

// ── handleGitHubCreatePr ────────────────────────────────────────────────

describe('handleGitHubCreatePr', () => {
    test('returns success with PR URL', async () => {
        mockCreatePr.mockResolvedValueOnce({
            ok: true,
            prUrl: 'https://github.com/owner/repo/pull/99',
        });

        const result = await handleGitHubCreatePr(makeCtx(), {
            repo: 'owner/repo',
            title: 'My PR',
            body: 'Description',
            head: 'feature-branch',
        });

        expect(isError(result)).toBe(false);
        expect(getText(result)).toContain('https://github.com/owner/repo/pull/99');
    });

    test('passes custom base branch', async () => {
        mockCreatePr.mockResolvedValueOnce({ ok: true, prUrl: 'https://github.com/owner/repo/pull/1' });

        await handleGitHubCreatePr(makeCtx(), {
            repo: 'owner/repo',
            title: 'My PR',
            body: 'Description',
            head: 'feature',
            base: 'develop',
        });

        expect(mockCreatePr).toHaveBeenCalledWith('owner/repo', 'My PR', 'Description', 'feature', 'develop');
    });

    test('uses "main" as default base branch', async () => {
        mockCreatePr.mockResolvedValueOnce({ ok: true, prUrl: 'https://github.com/owner/repo/pull/1' });

        await handleGitHubCreatePr(makeCtx(), {
            repo: 'owner/repo',
            title: 'My PR',
            body: 'Description',
            head: 'feature',
        });

        expect(mockCreatePr).toHaveBeenCalledWith('owner/repo', 'My PR', 'Description', 'feature', 'main');
    });

    test('returns error when PR creation fails', async () => {
        mockCreatePr.mockResolvedValueOnce({ ok: false, error: 'branch not found' });

        const result = await handleGitHubCreatePr(makeCtx(), {
            repo: 'owner/repo',
            title: 'My PR',
            body: 'Description',
            head: 'missing-branch',
        });

        expect(isError(result)).toBe(true);
        expect(getText(result)).toContain('branch not found');
    });
});

// ── handleGitHubReviewPr ────────────────────────────────────────────────

describe('handleGitHubReviewPr', () => {
    test('submits APPROVE review successfully', async () => {
        mockAddPrReview.mockResolvedValueOnce({ ok: true });

        const result = await handleGitHubReviewPr(makeCtx(), {
            repo: 'owner/repo',
            pr_number: 42,
            event: 'APPROVE',
            body: 'LGTM!',
        });

        expect(isError(result)).toBe(false);
        expect(getText(result)).toContain('PR #42 reviewed with APPROVE');
        expect(mockAddPrReview).toHaveBeenCalledWith('owner/repo', 42, 'APPROVE', 'LGTM!');
    });

    test('submits REQUEST_CHANGES review', async () => {
        mockAddPrReview.mockResolvedValueOnce({ ok: true });

        const result = await handleGitHubReviewPr(makeCtx(), {
            repo: 'owner/repo',
            pr_number: 10,
            event: 'REQUEST_CHANGES',
            body: 'Please fix the tests.',
        });

        expect(isError(result)).toBe(false);
        expect(getText(result)).toContain('reviewed with REQUEST_CHANGES');
    });

    test('rejects invalid review event', async () => {
        const result = await handleGitHubReviewPr(makeCtx(), {
            repo: 'owner/repo',
            pr_number: 5,
            event: 'INVALID_EVENT',
            body: 'body',
        });

        expect(isError(result)).toBe(true);
        expect(getText(result)).toContain('Invalid review event');
        expect(getText(result)).toContain('INVALID_EVENT');
        // addPrReview should NOT have been called
        expect(mockAddPrReview).not.toHaveBeenCalled();
    });

    test('normalizes lowercase event to uppercase', async () => {
        mockAddPrReview.mockResolvedValueOnce({ ok: true });

        const result = await handleGitHubReviewPr(makeCtx(), {
            repo: 'owner/repo',
            pr_number: 7,
            event: 'approve',
            body: 'Looks good',
        });

        expect(isError(result)).toBe(false);
        expect(mockAddPrReview).toHaveBeenCalledWith('owner/repo', 7, 'APPROVE', 'Looks good');
    });

    test('returns error when review submission fails', async () => {
        mockAddPrReview.mockResolvedValueOnce({ ok: false, error: 'PR is closed' });

        const result = await handleGitHubReviewPr(makeCtx(), {
            repo: 'owner/repo',
            pr_number: 3,
            event: 'APPROVE',
            body: 'Good',
        });

        expect(isError(result)).toBe(true);
        expect(getText(result)).toContain('PR is closed');
    });
});

// ── handleGitHubCreateIssue ─────────────────────────────────────────────

describe('handleGitHubCreateIssue', () => {
    test('returns success with issue URL', async () => {
        mockCreateIssue.mockResolvedValueOnce({
            ok: true,
            issueUrl: 'https://github.com/owner/repo/issues/10',
        });

        const result = await handleGitHubCreateIssue(makeCtx(), {
            repo: 'owner/repo',
            title: 'Bug report',
            body: 'Something is broken',
        });

        expect(isError(result)).toBe(false);
        expect(getText(result)).toContain('https://github.com/owner/repo/issues/10');
    });

    test('passes labels array to createIssue', async () => {
        mockCreateIssue.mockResolvedValueOnce({
            ok: true,
            issueUrl: 'https://github.com/owner/repo/issues/11',
        });

        await handleGitHubCreateIssue(makeCtx(), {
            repo: 'owner/repo',
            title: 'Feature request',
            body: 'New feature',
            labels: ['enhancement', 'priority'],
        });

        expect(mockCreateIssue).toHaveBeenCalledWith('owner/repo', 'Feature request', 'New feature', ['enhancement', 'priority']);
    });

    test('works without labels parameter', async () => {
        mockCreateIssue.mockResolvedValueOnce({ ok: true, issueUrl: 'https://github.com/owner/repo/issues/12' });

        await handleGitHubCreateIssue(makeCtx(), {
            repo: 'owner/repo',
            title: 'Simple issue',
            body: 'Details here',
        });

        expect(mockCreateIssue).toHaveBeenCalledWith('owner/repo', 'Simple issue', 'Details here', undefined);
    });

    test('returns error when issue creation fails', async () => {
        mockCreateIssue.mockResolvedValueOnce({ ok: false, error: 'repo is archived' });

        const result = await handleGitHubCreateIssue(makeCtx(), {
            repo: 'owner/repo',
            title: 'Issue',
            body: 'Body',
        });

        expect(isError(result)).toBe(true);
        expect(getText(result)).toContain('repo is archived');
    });
});

// ── handleGitHubListIssues ──────────────────────────────────────────────

describe('handleGitHubListIssues', () => {
    test('returns "no issues" when list is empty', async () => {
        mockListIssues.mockResolvedValueOnce({ ok: true, issues: [] });

        const result = await handleGitHubListIssues(makeCtx(), { repo: 'owner/repo' });

        expect(isError(result)).toBe(false);
        expect(getText(result)).toBe('No open issues in owner/repo.');
    });

    test('returns formatted issue list with labels', async () => {
        mockListIssues.mockResolvedValueOnce({
            ok: true,
            issues: [
                {
                    number: 1,
                    title: 'Bug in login',
                    state: 'open',
                    labels: [{ name: 'bug' }, { name: 'urgent' }],
                    url: 'https://github.com/owner/repo/issues/1',
                },
                {
                    number: 2,
                    title: 'Add dark mode',
                    state: 'open',
                    labels: [],
                    url: 'https://github.com/owner/repo/issues/2',
                },
            ],
        });

        const result = await handleGitHubListIssues(makeCtx(), { repo: 'owner/repo' });
        const text = getText(result);

        expect(text).toContain('Open issues in owner/repo:');
        expect(text).toContain('#1 Bug in login [bug, urgent]');
        expect(text).toContain('#2 Add dark mode');
        // Second issue has no labels, so no brackets
        expect(text).not.toContain('#2 Add dark mode [');
    });

    test('uses default state "open" and limit 30', async () => {
        mockListIssues.mockResolvedValueOnce({ ok: true, issues: [] });

        await handleGitHubListIssues(makeCtx(), { repo: 'owner/repo' });

        expect(mockListIssues).toHaveBeenCalledWith('owner/repo', 'open', 30);
    });

    test('passes custom state and limit parameters', async () => {
        mockListIssues.mockResolvedValueOnce({ ok: true, issues: [] });

        await handleGitHubListIssues(makeCtx(), { repo: 'owner/repo', state: 'closed', limit: 5 });

        expect(mockListIssues).toHaveBeenCalledWith('owner/repo', 'closed', 5);
    });

    test('capitalizes state in header', async () => {
        mockListIssues.mockResolvedValueOnce({
            ok: true,
            issues: [
                {
                    number: 1,
                    title: 'Closed issue',
                    state: 'closed',
                    labels: [],
                    url: 'https://github.com/owner/repo/issues/1',
                },
            ],
        });

        const result = await handleGitHubListIssues(makeCtx(), { repo: 'owner/repo', state: 'closed' });
        const text = getText(result);

        expect(text).toContain('Closed issues in owner/repo:');
    });

    test('returns error when listing fails', async () => {
        mockListIssues.mockResolvedValueOnce({ ok: false, issues: [], error: 'API rate limited' });

        const result = await handleGitHubListIssues(makeCtx(), { repo: 'owner/repo' });

        expect(isError(result)).toBe(true);
        expect(getText(result)).toContain('API rate limited');
    });
});

// ── handleGitHubRepoInfo ────────────────────────────────────────────────

describe('handleGitHubRepoInfo', () => {
    test('returns JSON-formatted repo info on success', async () => {
        const info = { name: 'repo', owner: { login: 'owner' }, stargazerCount: 100 };
        mockGetRepoInfo.mockResolvedValueOnce({ ok: true, info });

        const result = await handleGitHubRepoInfo(makeCtx(), { repo: 'owner/repo' });

        expect(isError(result)).toBe(false);
        const parsed = JSON.parse(getText(result));
        expect(parsed.name).toBe('repo');
        expect(parsed.stargazerCount).toBe(100);
    });

    test('returns error when repo info fetch fails', async () => {
        mockGetRepoInfo.mockResolvedValueOnce({ ok: false, error: 'repo not found' });

        const result = await handleGitHubRepoInfo(makeCtx(), { repo: 'owner/nonexistent' });

        expect(isError(result)).toBe(true);
        expect(getText(result)).toContain('repo not found');
    });

    test('catches exceptions and returns error result', async () => {
        mockGetRepoInfo.mockRejectedValueOnce(new Error('DNS failure'));

        const result = await handleGitHubRepoInfo(makeCtx(), { repo: 'owner/repo' });

        expect(isError(result)).toBe(true);
        expect(getText(result)).toContain('DNS failure');
    });
});

// ── handleGitHubGetPrDiff ───────────────────────────────────────────────

describe('handleGitHubGetPrDiff', () => {
    test('returns diff content on success', async () => {
        mockGetPrDiff.mockResolvedValueOnce({
            ok: true,
            diff: 'diff --git a/file.ts b/file.ts\n+added line',
        });

        const result = await handleGitHubGetPrDiff(makeCtx(), { repo: 'owner/repo', pr_number: 42 });

        expect(isError(result)).toBe(false);
        expect(getText(result)).toContain('diff --git');
        expect(getText(result)).toContain('+added line');
        expect(mockGetPrDiff).toHaveBeenCalledWith('owner/repo', 42);
    });

    test('returns placeholder for empty diff', async () => {
        mockGetPrDiff.mockResolvedValueOnce({ ok: true, diff: '' });

        const result = await handleGitHubGetPrDiff(makeCtx(), { repo: 'owner/repo', pr_number: 10 });

        expect(isError(result)).toBe(false);
        expect(getText(result)).toBe('No changes in this PR.');
    });

    test('returns error when diff fetch fails', async () => {
        mockGetPrDiff.mockResolvedValueOnce({ ok: false, diff: '', error: 'PR not found' });

        const result = await handleGitHubGetPrDiff(makeCtx(), { repo: 'owner/repo', pr_number: 999 });

        expect(isError(result)).toBe(true);
        expect(getText(result)).toContain('PR not found');
    });

    test('catches exceptions and returns error result', async () => {
        mockGetPrDiff.mockRejectedValueOnce(new Error('Timeout'));

        const result = await handleGitHubGetPrDiff(makeCtx(), { repo: 'owner/repo', pr_number: 1 });

        expect(isError(result)).toBe(true);
        expect(getText(result)).toContain('Timeout');
    });
});

// ── handleGitHubCommentOnPr ─────────────────────────────────────────────

describe('handleGitHubCommentOnPr', () => {
    test('returns success message on comment', async () => {
        mockAddPrComment.mockResolvedValueOnce({ ok: true });

        const result = await handleGitHubCommentOnPr(makeCtx(), {
            repo: 'owner/repo',
            pr_number: 42,
            body: 'Great work!',
        });

        expect(isError(result)).toBe(false);
        expect(getText(result)).toBe('Comment added to PR #42.');
        expect(mockAddPrComment).toHaveBeenCalledWith('owner/repo', 42, 'Great work!');
    });

    test('returns error when comment fails', async () => {
        mockAddPrComment.mockResolvedValueOnce({ ok: false, error: 'PR is locked' });

        const result = await handleGitHubCommentOnPr(makeCtx(), {
            repo: 'owner/repo',
            pr_number: 5,
            body: 'Comment',
        });

        expect(isError(result)).toBe(true);
        expect(getText(result)).toContain('PR is locked');
    });

    test('catches exceptions and returns error result', async () => {
        mockAddPrComment.mockRejectedValueOnce(new Error('Server error'));

        const result = await handleGitHubCommentOnPr(makeCtx(), {
            repo: 'owner/repo',
            pr_number: 1,
            body: 'test',
        });

        expect(isError(result)).toBe(true);
        expect(getText(result)).toContain('Server error');
    });
});

// ── handleGitHubFollowUser ──────────────────────────────────────────────

describe('handleGitHubFollowUser', () => {
    test('returns success message when follow succeeds', async () => {
        mockFollowUser.mockResolvedValueOnce({ ok: true, message: 'Followed octocat' });

        const result = await handleGitHubFollowUser(makeCtx(), { username: 'octocat' });

        expect(isError(result)).toBe(false);
        expect(getText(result)).toBe('Followed octocat');
        expect(mockFollowUser).toHaveBeenCalledWith('octocat');
    });

    test('returns error when follow fails', async () => {
        mockFollowUser.mockResolvedValueOnce({ ok: false, message: 'Failed to follow ghost: user not found' });

        const result = await handleGitHubFollowUser(makeCtx(), { username: 'ghost' });

        expect(isError(result)).toBe(true);
        expect(getText(result)).toContain('user not found');
    });

    test('catches exceptions and returns error result', async () => {
        mockFollowUser.mockRejectedValueOnce(new Error('Auth expired'));

        const result = await handleGitHubFollowUser(makeCtx(), { username: 'someone' });

        expect(isError(result)).toBe(true);
        expect(getText(result)).toContain('Auth expired');
    });
});

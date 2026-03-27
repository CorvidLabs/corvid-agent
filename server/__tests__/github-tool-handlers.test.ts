import { describe, test, expect, mock, beforeEach } from 'bun:test';
import type { McpToolContext } from '../mcp/tool-handlers';

// ── Mock the github/operations module before importing handlers ──────────
// Bun freezes module exports, so we must use mock.module() to intercept.

const mockStarRepo = mock(() => Promise.resolve({ ok: true, message: 'Starred test/repo', error: undefined as string | undefined }));
const mockUnstarRepo = mock(() => Promise.resolve({ ok: true, message: 'Unstarred test/repo', error: undefined as string | undefined }));
const mockForkRepo = mock(() => Promise.resolve({ ok: true, message: 'Forked test/repo', forkUrl: 'https://github.com/me/repo', error: undefined as string | undefined }));
const mockListOpenPrs = mock(() => Promise.resolve({ ok: true, prs: [] as Array<Record<string, unknown>>, error: undefined as string | undefined }));
const mockCreatePr = mock(() => Promise.resolve({ ok: true, prUrl: 'https://github.com/test/repo/pull/1', error: undefined as string | undefined }));
const mockAddPrReview = mock(() => Promise.resolve({ ok: true, error: undefined as string | undefined }));
const mockCreateIssue = mock(() => Promise.resolve({ ok: true, issueUrl: 'https://github.com/test/repo/issues/1', error: undefined as string | undefined }));
const mockListIssues = mock(() => Promise.resolve({ ok: true, issues: [] as Array<Record<string, unknown>>, error: undefined as string | undefined }));
const mockGetRepoInfo = mock(() => Promise.resolve({ ok: true, info: { name: 'repo', stargazerCount: 42 }, error: undefined as string | undefined }));
const mockGetPrDiff = mock(() => Promise.resolve({ ok: true, diff: 'diff --git a/file.ts b/file.ts\n+new line', error: undefined as string | undefined }));
const mockAddPrComment = mock(() => Promise.resolve({ ok: true, error: undefined as string | undefined }));
const mockFollowUser = mock(() => Promise.resolve({ ok: true, message: 'Followed testuser', error: undefined as string | undefined }));

const mockGetAgent = mock(() => null as null | { name: string; model: string });

mock.module('../db/agents', () => ({
    getAgent: mockGetAgent,
    listAgents: () => [],
    getAgentByWalletAddress: () => null,
    createAgent: () => ({}),
    updateAgent: () => null,
    deleteAgent: () => false,
    setAgentWallet: () => {},
    getAgentWalletMnemonic: () => null,
    addAgentFunding: () => {},
    getAlgochatEnabledAgents: () => [],
}));

mock.module('../work/intern-guard', () => ({
    checkInternPrGuard: () => ({ blocked: false }),
}));

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
    isGitHubConfigured: () => true,
}));

// Import handlers AFTER the mock is set up
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

const { friendlyModelName } = await import('../mcp/tool-handlers/github');

// ── Helpers ──────────────────────────────────────────────────────────────

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

function getText(result: { content: Array<{ type: string; text?: string }> }): string {
    const first = result.content[0];
    return (first as { type: 'text'; text: string }).text;
}

beforeEach(() => {
    // Reset all mocks and restore default success behaviors
    mockStarRepo.mockReset().mockResolvedValue({ ok: true, message: 'Starred test/repo', error: undefined });
    mockUnstarRepo.mockReset().mockResolvedValue({ ok: true, message: 'Unstarred test/repo', error: undefined });
    mockForkRepo.mockReset().mockResolvedValue({ ok: true, message: 'Forked test/repo', forkUrl: 'https://github.com/me/repo', error: undefined });
    mockListOpenPrs.mockReset().mockResolvedValue({ ok: true, prs: [], error: undefined });
    mockCreatePr.mockReset().mockResolvedValue({ ok: true, prUrl: 'https://github.com/test/repo/pull/1', error: undefined });
    mockAddPrReview.mockReset().mockResolvedValue({ ok: true, error: undefined });
    mockCreateIssue.mockReset().mockResolvedValue({ ok: true, issueUrl: 'https://github.com/test/repo/issues/1', error: undefined });
    mockListIssues.mockReset().mockResolvedValue({ ok: true, issues: [], error: undefined });
    mockGetRepoInfo.mockReset().mockResolvedValue({ ok: true, info: { name: 'repo', stargazerCount: 42 }, error: undefined });
    mockGetPrDiff.mockReset().mockResolvedValue({ ok: true, diff: 'diff --git a/file.ts b/file.ts\n+new line', error: undefined });
    mockAddPrComment.mockReset().mockResolvedValue({ ok: true, error: undefined });
    mockFollowUser.mockReset().mockResolvedValue({ ok: true, message: 'Followed testuser', error: undefined });
    mockGetAgent.mockReset().mockReturnValue(null);
});

// ── Star / Unstar ────────────────────────────────────────────────────────

describe('handleGitHubStarRepo', () => {
    test('returns success message on ok', async () => {
        const ctx = makeCtx();
        const result = await handleGitHubStarRepo(ctx, { repo: 'test/repo' });
        expect(result.isError).toBeUndefined();
        expect(getText(result)).toBe('Starred test/repo');
        expect(mockStarRepo).toHaveBeenCalledWith('test/repo');
    });

    test('returns error on failure', async () => {
        mockStarRepo.mockResolvedValue({ ok: false, message: 'GH_TOKEN not configured', error: undefined });
        const ctx = makeCtx();
        const result = await handleGitHubStarRepo(ctx, { repo: 'bad/repo' });
        expect(result.isError).toBe(true);
        expect(getText(result)).toContain('GH_TOKEN not configured');
    });

    test('handles thrown exception', async () => {
        mockStarRepo.mockRejectedValue(new Error('Network error'));
        const ctx = makeCtx();
        const result = await handleGitHubStarRepo(ctx, { repo: 'test/repo' });
        expect(result.isError).toBe(true);
        expect(getText(result)).toContain('Failed to star repo');
        expect(getText(result)).toContain('Network error');
    });
});

describe('handleGitHubUnstarRepo', () => {
    test('returns success message on ok', async () => {
        const ctx = makeCtx();
        const result = await handleGitHubUnstarRepo(ctx, { repo: 'test/repo' });
        expect(result.isError).toBeUndefined();
        expect(getText(result)).toBe('Unstarred test/repo');
        expect(mockUnstarRepo).toHaveBeenCalledWith('test/repo');
    });

    test('returns error on failure', async () => {
        mockUnstarRepo.mockResolvedValue({ ok: false, message: 'Not found', error: undefined });
        const ctx = makeCtx();
        const result = await handleGitHubUnstarRepo(ctx, { repo: 'bad/repo' });
        expect(result.isError).toBe(true);
        expect(getText(result)).toContain('Not found');
    });

    test('handles thrown exception', async () => {
        mockUnstarRepo.mockRejectedValue(new Error('Connection timeout'));
        const ctx = makeCtx();
        const result = await handleGitHubUnstarRepo(ctx, { repo: 'test/repo' });
        expect(result.isError).toBe(true);
        expect(getText(result)).toContain('Failed to unstar repo');
    });
});

// ── Fork ─────────────────────────────────────────────────────────────────

describe('handleGitHubForkRepo', () => {
    test('returns success with fork URL', async () => {
        const ctx = makeCtx();
        const result = await handleGitHubForkRepo(ctx, { repo: 'test/repo' });
        expect(result.isError).toBeUndefined();
        expect(getText(result)).toContain('Forked test/repo');
        expect(getText(result)).toContain('https://github.com/me/repo');
    });

    test('passes org parameter when provided', async () => {
        const ctx = makeCtx();
        await handleGitHubForkRepo(ctx, { repo: 'test/repo', org: 'my-org' });
        expect(mockForkRepo).toHaveBeenCalledWith('test/repo', 'my-org');
    });

    test('returns error on failure', async () => {
        mockForkRepo.mockResolvedValue({ ok: false, message: 'Permission denied', forkUrl: '', error: undefined });
        const ctx = makeCtx();
        const result = await handleGitHubForkRepo(ctx, { repo: 'private/repo' });
        expect(result.isError).toBe(true);
        expect(getText(result)).toContain('Permission denied');
    });

    test('handles missing fork URL gracefully', async () => {
        mockForkRepo.mockResolvedValue({ ok: true, message: 'Forked test/repo', forkUrl: '', error: undefined });
        const ctx = makeCtx();
        const result = await handleGitHubForkRepo(ctx, { repo: 'test/repo' });
        expect(result.isError).toBeUndefined();
        expect(getText(result)).toBe('Forked test/repo');
    });
});

// ── List PRs ─────────────────────────────────────────────────────────────

describe('handleGitHubListPrs', () => {
    test('returns "no open PRs" when empty', async () => {
        const ctx = makeCtx();
        const result = await handleGitHubListPrs(ctx, { repo: 'test/repo' });
        expect(result.isError).toBeUndefined();
        expect(getText(result)).toContain('No open PRs');
    });

    test('formats PR list with details', async () => {
        mockListOpenPrs.mockResolvedValue({
            ok: true,
            prs: [
                {
                    number: 42,
                    title: 'Add feature X',
                    url: 'https://github.com/test/repo/pull/42',
                    author: 'alice',
                    state: 'open',
                    headBranch: 'feature-x',
                    baseBranch: 'main',
                    body: 'This PR adds feature X',
                    createdAt: '2026-01-01T00:00:00Z',
                    additions: 100,
                    deletions: 20,
                    changedFiles: 5,
                },
            ],
            error: undefined,
        });

        const ctx = makeCtx();
        const result = await handleGitHubListPrs(ctx, { repo: 'test/repo' });
        const text = getText(result);
        expect(text).toContain('#42');
        expect(text).toContain('Add feature X');
        expect(text).toContain('alice');
        expect(text).toContain('+100/-20');
        expect(text).toContain('5 files');
    });

    test('passes limit parameter', async () => {
        const ctx = makeCtx();
        await handleGitHubListPrs(ctx, { repo: 'test/repo', limit: 5 });
        expect(mockListOpenPrs).toHaveBeenCalledWith('test/repo', 5);
    });

    test('defaults to limit 10', async () => {
        const ctx = makeCtx();
        await handleGitHubListPrs(ctx, { repo: 'test/repo' });
        expect(mockListOpenPrs).toHaveBeenCalledWith('test/repo', 10);
    });

    test('returns error on failure', async () => {
        mockListOpenPrs.mockResolvedValue({ ok: false, prs: [], error: 'Repo not found' });
        const ctx = makeCtx();
        const result = await handleGitHubListPrs(ctx, { repo: 'bad/repo' });
        expect(result.isError).toBe(true);
        expect(getText(result)).toContain('Repo not found');
    });
});

// ── Create PR ────────────────────────────────────────────────────────────

describe('handleGitHubCreatePr', () => {
    test('returns success with PR URL', async () => {
        const ctx = makeCtx();
        const result = await handleGitHubCreatePr(ctx, {
            repo: 'test/repo',
            title: 'New feature',
            body: 'Description',
            head: 'feature-branch',
        });
        expect(result.isError).toBeUndefined();
        expect(getText(result)).toContain('PR created');
        expect(getText(result)).toContain('https://github.com/test/repo/pull/1');
    });

    test('passes base branch when provided', async () => {
        const ctx = makeCtx();
        await handleGitHubCreatePr(ctx, {
            repo: 'test/repo',
            title: 'Fix',
            body: 'Bug fix',
            head: 'fix-branch',
            base: 'develop',
        });
        expect(mockCreatePr).toHaveBeenCalledWith('test/repo', 'Fix', 'Bug fix', 'fix-branch', 'develop');
    });

    test('defaults to main as base branch', async () => {
        const ctx = makeCtx();
        await handleGitHubCreatePr(ctx, {
            repo: 'test/repo',
            title: 'Fix',
            body: 'Bug fix',
            head: 'fix-branch',
        });
        expect(mockCreatePr).toHaveBeenCalledWith('test/repo', 'Fix', 'Bug fix', 'fix-branch', 'main');
    });

    test('returns error on failure', async () => {
        mockCreatePr.mockResolvedValue({ ok: false, prUrl: '', error: 'Branch not found' });
        const ctx = makeCtx();
        const result = await handleGitHubCreatePr(ctx, {
            repo: 'test/repo',
            title: 'PR',
            body: 'Desc',
            head: 'nonexistent',
        });
        expect(result.isError).toBe(true);
        expect(getText(result)).toContain('Branch not found');
    });
});

// ── Review PR ────────────────────────────────────────────────────────────

describe('handleGitHubReviewPr', () => {
    test('approves a PR', async () => {
        const ctx = makeCtx();
        const result = await handleGitHubReviewPr(ctx, {
            repo: 'test/repo',
            pr_number: 42,
            event: 'APPROVE',
            body: 'LGTM!',
        });
        expect(result.isError).toBeUndefined();
        expect(getText(result)).toContain('#42');
        expect(getText(result)).toContain('APPROVE');
        expect(mockAddPrReview).toHaveBeenCalledWith('test/repo', 42, 'APPROVE', 'LGTM!');
    });

    test('requests changes on a PR', async () => {
        const ctx = makeCtx();
        const result = await handleGitHubReviewPr(ctx, {
            repo: 'test/repo',
            pr_number: 42,
            event: 'REQUEST_CHANGES',
            body: 'Please fix the bug',
        });
        expect(result.isError).toBeUndefined();
        expect(getText(result)).toContain('REQUEST_CHANGES');
    });

    test('rejects invalid event type', async () => {
        const ctx = makeCtx();
        const result = await handleGitHubReviewPr(ctx, {
            repo: 'test/repo',
            pr_number: 42,
            event: 'INVALID',
            body: 'Bad event',
        });
        expect(result.isError).toBe(true);
        expect(getText(result)).toContain('Invalid review event');
    });

    test('normalizes event case', async () => {
        const ctx = makeCtx();
        await handleGitHubReviewPr(ctx, {
            repo: 'test/repo',
            pr_number: 42,
            event: 'approve',
            body: 'LGTM!',
        });
        expect(mockAddPrReview).toHaveBeenCalledWith('test/repo', 42, 'APPROVE', 'LGTM!');
    });

    test('returns error on failure', async () => {
        mockAddPrReview.mockResolvedValue({ ok: false, error: 'PR not found' });
        const ctx = makeCtx();
        const result = await handleGitHubReviewPr(ctx, {
            repo: 'test/repo',
            pr_number: 999,
            event: 'COMMENT',
            body: 'Note',
        });
        expect(result.isError).toBe(true);
        expect(getText(result)).toContain('PR not found');
    });
});

// ── Create Issue ─────────────────────────────────────────────────────────

describe('handleGitHubCreateIssue', () => {
    test('returns success with issue URL', async () => {
        const ctx = makeCtx();
        const result = await handleGitHubCreateIssue(ctx, {
            repo: 'test/repo',
            title: 'Bug report',
            body: 'Something is broken',
        });
        expect(result.isError).toBeUndefined();
        expect(getText(result)).toContain('Issue created');
        expect(getText(result)).toContain('https://github.com/test/repo/issues/1');
    });

    test('passes labels when provided', async () => {
        const ctx = makeCtx();
        await handleGitHubCreateIssue(ctx, {
            repo: 'test/repo',
            title: 'Bug',
            body: 'Desc',
            labels: ['bug', 'priority-high'],
        });
        expect(mockCreateIssue).toHaveBeenCalledWith('test/repo', 'Bug', 'Desc', ['bug', 'priority-high']);
    });

    test('works without labels', async () => {
        const ctx = makeCtx();
        await handleGitHubCreateIssue(ctx, {
            repo: 'test/repo',
            title: 'Feature',
            body: 'Please add this',
        });
        expect(mockCreateIssue).toHaveBeenCalledWith('test/repo', 'Feature', 'Please add this', undefined);
    });

    test('returns error on failure', async () => {
        mockCreateIssue.mockResolvedValue({ ok: false, issueUrl: '', error: 'Rate limited' });
        const ctx = makeCtx();
        const result = await handleGitHubCreateIssue(ctx, {
            repo: 'test/repo',
            title: 'Issue',
            body: 'Desc',
        });
        expect(result.isError).toBe(true);
        expect(getText(result)).toContain('Rate limited');
    });
});

// ── List Issues ──────────────────────────────────────────────────────────

describe('handleGitHubListIssues', () => {
    test('returns "no issues" when empty', async () => {
        const ctx = makeCtx();
        const result = await handleGitHubListIssues(ctx, { repo: 'test/repo' });
        expect(result.isError).toBeUndefined();
        expect(getText(result)).toContain('No open issues');
    });

    test('formats issue list with labels', async () => {
        mockListIssues.mockResolvedValue({
            ok: true,
            issues: [
                {
                    number: 10,
                    title: 'Add dark mode',
                    state: 'open',
                    labels: [{ name: 'enhancement' }, { name: 'ui' }],
                    url: 'https://github.com/test/repo/issues/10',
                },
            ],
            error: undefined,
        });

        const ctx = makeCtx();
        const result = await handleGitHubListIssues(ctx, { repo: 'test/repo' });
        const text = getText(result);
        expect(text).toContain('#10');
        expect(text).toContain('Add dark mode');
        expect(text).toContain('enhancement');
        expect(text).toContain('ui');
    });

    test('defaults to open state and limit 30', async () => {
        const ctx = makeCtx();
        await handleGitHubListIssues(ctx, { repo: 'test/repo' });
        expect(mockListIssues).toHaveBeenCalledWith('test/repo', 'open', 30);
    });

    test('passes custom state and limit', async () => {
        const ctx = makeCtx();
        await handleGitHubListIssues(ctx, { repo: 'test/repo', state: 'closed', limit: 5 });
        expect(mockListIssues).toHaveBeenCalledWith('test/repo', 'closed', 5);
    });

    test('capitalizes state in output header', async () => {
        mockListIssues.mockResolvedValue({
            ok: true,
            issues: [{
                number: 1, title: 'Issue', state: 'closed',
                labels: [], url: 'https://github.com/test/repo/issues/1',
            }],
            error: undefined,
        });
        const ctx = makeCtx();
        const result = await handleGitHubListIssues(ctx, { repo: 'test/repo', state: 'closed' });
        expect(getText(result)).toContain('Closed issues');
    });

    test('returns error on failure', async () => {
        mockListIssues.mockResolvedValue({ ok: false, issues: [], error: 'Not found' });
        const ctx = makeCtx();
        const result = await handleGitHubListIssues(ctx, { repo: 'bad/repo' });
        expect(result.isError).toBe(true);
    });
});

// ── Repo Info ────────────────────────────────────────────────────────────

describe('handleGitHubRepoInfo', () => {
    test('returns formatted JSON info', async () => {
        const ctx = makeCtx();
        const result = await handleGitHubRepoInfo(ctx, { repo: 'test/repo' });
        expect(result.isError).toBeUndefined();
        const text = getText(result);
        const parsed = JSON.parse(text);
        expect(parsed.name).toBe('repo');
        expect(parsed.stargazerCount).toBe(42);
    });

    test('returns error on failure', async () => {
        mockGetRepoInfo.mockResolvedValue({ ok: false, info: { name: '', stargazerCount: 0 }, error: 'Not found' });
        const ctx = makeCtx();
        const result = await handleGitHubRepoInfo(ctx, { repo: 'nonexistent/repo' });
        expect(result.isError).toBe(true);
        expect(getText(result)).toContain('Not found');
    });

    test('handles thrown exception', async () => {
        mockGetRepoInfo.mockRejectedValue(new Error('API down'));
        const ctx = makeCtx();
        const result = await handleGitHubRepoInfo(ctx, { repo: 'test/repo' });
        expect(result.isError).toBe(true);
        expect(getText(result)).toContain('Failed to get repo info');
    });
});

// ── Get PR Diff ──────────────────────────────────────────────────────────

describe('handleGitHubGetPrDiff', () => {
    test('returns diff content', async () => {
        const ctx = makeCtx();
        const result = await handleGitHubGetPrDiff(ctx, { repo: 'test/repo', pr_number: 42 });
        expect(result.isError).toBeUndefined();
        expect(getText(result)).toContain('diff --git');
        expect(getText(result)).toContain('+new line');
        expect(mockGetPrDiff).toHaveBeenCalledWith('test/repo', 42);
    });

    test('returns message for empty diff', async () => {
        mockGetPrDiff.mockResolvedValue({ ok: true, diff: '', error: undefined });
        const ctx = makeCtx();
        const result = await handleGitHubGetPrDiff(ctx, { repo: 'test/repo', pr_number: 42 });
        expect(result.isError).toBeUndefined();
        expect(getText(result)).toContain('no diff');
    });

    test('returns error on failure', async () => {
        mockGetPrDiff.mockResolvedValue({ ok: false, diff: '', error: 'PR not found' });
        const ctx = makeCtx();
        const result = await handleGitHubGetPrDiff(ctx, { repo: 'test/repo', pr_number: 999 });
        expect(result.isError).toBe(true);
        expect(getText(result)).toContain('PR not found');
    });

    test('handles thrown exception', async () => {
        mockGetPrDiff.mockRejectedValue(new Error('Timeout'));
        const ctx = makeCtx();
        const result = await handleGitHubGetPrDiff(ctx, { repo: 'test/repo', pr_number: 42 });
        expect(result.isError).toBe(true);
        expect(getText(result)).toContain('Failed to get PR diff');
    });
});

// ── Comment on PR ────────────────────────────────────────────────────────

describe('handleGitHubCommentOnPr', () => {
    test('returns success message', async () => {
        const ctx = makeCtx();
        const result = await handleGitHubCommentOnPr(ctx, {
            repo: 'test/repo',
            pr_number: 42,
            body: 'Great work!',
        });
        expect(result.isError).toBeUndefined();
        expect(getText(result)).toContain('Comment added');
        expect(getText(result)).toContain('#42');
        expect(mockAddPrComment).toHaveBeenCalledWith('test/repo', 42, 'Great work!');
    });

    test('returns error on failure', async () => {
        mockAddPrComment.mockResolvedValue({ ok: false, error: 'Permission denied' });
        const ctx = makeCtx();
        const result = await handleGitHubCommentOnPr(ctx, {
            repo: 'test/repo',
            pr_number: 42,
            body: 'Comment',
        });
        expect(result.isError).toBe(true);
        expect(getText(result)).toContain('Permission denied');
    });

    test('handles thrown exception', async () => {
        mockAddPrComment.mockRejectedValue(new Error('Server error'));
        const ctx = makeCtx();
        const result = await handleGitHubCommentOnPr(ctx, {
            repo: 'test/repo',
            pr_number: 42,
            body: 'Comment',
        });
        expect(result.isError).toBe(true);
        expect(getText(result)).toContain('Failed to comment on PR');
    });
});

// ── Follow User ──────────────────────────────────────────────────────────

describe('handleGitHubFollowUser', () => {
    test('returns success message', async () => {
        const ctx = makeCtx();
        const result = await handleGitHubFollowUser(ctx, { username: 'testuser' });
        expect(result.isError).toBeUndefined();
        expect(getText(result)).toBe('Followed testuser');
        expect(mockFollowUser).toHaveBeenCalledWith('testuser');
    });

    test('returns error on failure', async () => {
        mockFollowUser.mockResolvedValue({ ok: false, message: 'User not found', error: undefined });
        const ctx = makeCtx();
        const result = await handleGitHubFollowUser(ctx, { username: 'nobody' });
        expect(result.isError).toBe(true);
        expect(getText(result)).toContain('User not found');
    });

    test('handles thrown exception', async () => {
        mockFollowUser.mockRejectedValue(new Error('API error'));
        const ctx = makeCtx();
        const result = await handleGitHubFollowUser(ctx, { username: 'testuser' });
        expect(result.isError).toBe(true);
        expect(getText(result)).toContain('Failed to follow user');
    });
});

// ── Scheduler Tool Gating (handler-level enforcement) ─────────────────

describe('scheduler tool gating', () => {
    function makeSchedulerCtx(actionType?: string) {
        return makeCtx({
            schedulerMode: true,
            schedulerActionType: actionType as McpToolContext['schedulerActionType'],
            schedulerToolUsage: new Map(),
        });
    }

    describe('handleGitHubCreateIssue — scheduler mode', () => {
        test('blocks issues in non-allowed orgs', async () => {
            const ctx = makeSchedulerCtx('daily_review');
            const result = await handleGitHubCreateIssue(ctx, {
                repo: 'external/repo', title: 'test', body: 'test',
            });
            expect(result.isError).toBe(true);
            expect(getText(result)).toContain('not permitted');
            expect(mockCreateIssue).not.toHaveBeenCalled();
        });

        test('allows issues in CorvidLabs repos', async () => {
            const ctx = makeSchedulerCtx('daily_review');
            const result = await handleGitHubCreateIssue(ctx, {
                repo: 'CorvidLabs/corvid-agent', title: 'test', body: 'test',
            });
            expect(result.isError).toBeUndefined();
            expect(mockCreateIssue).toHaveBeenCalled();
        });

        test('auto-labels with agent-escalation', async () => {
            const ctx = makeSchedulerCtx('daily_review');
            await handleGitHubCreateIssue(ctx, {
                repo: 'CorvidLabs/corvid-agent', title: 'test', body: 'test',
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const callArgs = (mockCreateIssue.mock.calls as any[][])[0];
            expect(callArgs[3]).toContain('agent-escalation');
        });

        test('preserves existing labels and adds agent-escalation', async () => {
            const ctx = makeSchedulerCtx('daily_review');
            await handleGitHubCreateIssue(ctx, {
                repo: 'CorvidLabs/corvid-agent', title: 'test', body: 'test', labels: ['bug'],
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const callArgs = (mockCreateIssue.mock.calls as any[][])[0];
            expect(callArgs[3]).toContain('bug');
            expect(callArgs[3]).toContain('agent-escalation');
        });

        test('rate-limits issues to 3 per session', async () => {
            const ctx = makeSchedulerCtx('daily_review');
            // First 3 should succeed
            for (let i = 0; i < 3; i++) {
                const r = await handleGitHubCreateIssue(ctx, {
                    repo: 'CorvidLabs/corvid-agent', title: `test ${i}`, body: 'test',
                });
                expect(r.isError).toBeUndefined();
            }
            // 4th should be rate-limited
            const r4 = await handleGitHubCreateIssue(ctx, {
                repo: 'CorvidLabs/corvid-agent', title: 'test 4', body: 'test',
            });
            expect(r4.isError).toBe(true);
            expect(getText(r4)).toContain('rate limit');
            expect(mockCreateIssue).toHaveBeenCalledTimes(3);
        });
    });

    describe('handleGitHubCreatePr — scheduler mode', () => {
        test('blocks PRs in non-allowed orgs', async () => {
            const ctx = makeSchedulerCtx('work_task');
            const result = await handleGitHubCreatePr(ctx, {
                repo: 'external/repo', title: 'test', body: 'test', head: 'feat',
            });
            expect(result.isError).toBe(true);
            expect(getText(result)).toContain('not permitted');
        });

        test('allows PRs in CorvidLabs repos', async () => {
            const ctx = makeSchedulerCtx('work_task');
            const result = await handleGitHubCreatePr(ctx, {
                repo: 'CorvidLabs/corvid-agent', title: 'test', body: 'test', head: 'feat',
            });
            expect(result.isError).toBeUndefined();
        });

        test('rate-limits PRs to 3 per session', async () => {
            const ctx = makeSchedulerCtx('work_task');
            for (let i = 0; i < 3; i++) {
                await handleGitHubCreatePr(ctx, {
                    repo: 'CorvidLabs/corvid-agent', title: `pr ${i}`, body: 'test', head: `feat-${i}`,
                });
            }
            const r4 = await handleGitHubCreatePr(ctx, {
                repo: 'CorvidLabs/corvid-agent', title: 'pr 4', body: 'test', head: 'feat-4',
            });
            expect(r4.isError).toBe(true);
            expect(getText(r4)).toContain('rate limit');
        });
    });

    describe('handleGitHubCommentOnPr — scheduler mode', () => {
        test('blocks comments in non-allowed orgs', async () => {
            const ctx = makeSchedulerCtx('review_prs');
            const result = await handleGitHubCommentOnPr(ctx, {
                repo: 'external/repo', pr_number: 1, body: 'test',
            });
            expect(result.isError).toBe(true);
            expect(getText(result)).toContain('not permitted');
        });

        test('allows comments in CorvidLabs repos', async () => {
            const ctx = makeSchedulerCtx('review_prs');
            const result = await handleGitHubCommentOnPr(ctx, {
                repo: 'CorvidLabs/corvid-agent', pr_number: 1, body: 'LGTM',
            });
            expect(result.isError).toBeUndefined();
        });

        test('rate-limits comments to 5 per session', async () => {
            const ctx = makeSchedulerCtx('review_prs');
            for (let i = 0; i < 5; i++) {
                await handleGitHubCommentOnPr(ctx, {
                    repo: 'CorvidLabs/corvid-agent', pr_number: i + 1, body: `comment ${i}`,
                });
            }
            const r6 = await handleGitHubCommentOnPr(ctx, {
                repo: 'CorvidLabs/corvid-agent', pr_number: 6, body: 'too many',
            });
            expect(r6.isError).toBe(true);
            expect(getText(r6)).toContain('rate limit');
        });
    });

    describe('non-scheduler mode', () => {
        test('issue creation works without restrictions', async () => {
            const ctx = makeCtx(); // no schedulerMode
            const result = await handleGitHubCreateIssue(ctx, {
                repo: 'external/repo', title: 'test', body: 'test',
            });
            expect(result.isError).toBeUndefined();
        });

        test('PR creation works without restrictions', async () => {
            const ctx = makeCtx();
            const result = await handleGitHubCreatePr(ctx, {
                repo: 'external/repo', title: 'test', body: 'test', head: 'feat',
            });
            expect(result.isError).toBeUndefined();
        });
    });
});

// ── friendlyModelName ────────────────────────────────────────────────────

describe('friendlyModelName', () => {
    test('maps claude-opus-4-6 to Opus 4.6', () => {
        expect(friendlyModelName('claude-opus-4-6')).toBe('Opus 4.6');
    });

    test('maps claude-sonnet-4-6 to Sonnet 4.6', () => {
        expect(friendlyModelName('claude-sonnet-4-6')).toBe('Sonnet 4.6');
    });

    test('maps claude-haiku-4-5-20251001 to Haiku 4.5', () => {
        expect(friendlyModelName('claude-haiku-4-5-20251001')).toBe('Haiku 4.5');
    });

    test('maps claude-sonnet-4-20250514 to Sonnet 4', () => {
        expect(friendlyModelName('claude-sonnet-4-20250514')).toBe('Sonnet 4');
    });

    test('returns raw string for unknown models', () => {
        expect(friendlyModelName('gpt-4o')).toBe('gpt-4o');
    });
});

// ── Agent signature on GitHub write operations (#1555) ───────────────────

describe('agent identity signature (#1555)', () => {
    const SIGNATURE_PATTERN = /\n\n---\n.*CorvidLabs Team Alpha$/;

    test('handleGitHubCreatePr appends signature when agent is resolved', async () => {
        mockGetAgent.mockReturnValue({ name: 'Rook', model: 'claude-opus-4-6' } as ReturnType<typeof mockGetAgent>);
        const ctx = makeCtx();
        await handleGitHubCreatePr(ctx, {
            repo: 'test/repo', title: 'PR', body: 'Original body', head: 'feat',
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const passedBody = (mockCreatePr.mock.calls as any[][])[0][2] as string;
        expect(passedBody).toMatch(SIGNATURE_PATTERN);
        expect(passedBody).toContain('**Rook**');
        expect(passedBody).toContain('Opus 4.6');
    });

    test('handleGitHubCreateIssue appends signature when agent is resolved', async () => {
        mockGetAgent.mockReturnValue({ name: 'Bishop', model: 'claude-sonnet-4-6' } as ReturnType<typeof mockGetAgent>);
        const ctx = makeCtx();
        await handleGitHubCreateIssue(ctx, {
            repo: 'test/repo', title: 'Issue', body: 'Bug report',
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const passedBody = (mockCreateIssue.mock.calls as any[][])[0][2] as string;
        expect(passedBody).toMatch(SIGNATURE_PATTERN);
        expect(passedBody).toContain('**Bishop**');
        expect(passedBody).toContain('Sonnet 4.6');
    });

    test('handleGitHubCommentOnPr appends signature when agent is resolved', async () => {
        mockGetAgent.mockReturnValue({ name: 'Rook', model: 'claude-opus-4-6' } as ReturnType<typeof mockGetAgent>);
        const ctx = makeCtx();
        await handleGitHubCommentOnPr(ctx, {
            repo: 'test/repo', pr_number: 42, body: 'Nice work!',
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const passedBody = (mockAddPrComment.mock.calls as any[][])[0][2] as string;
        expect(passedBody).toMatch(SIGNATURE_PATTERN);
        expect(passedBody).toContain('**Rook**');
    });

    test('handleGitHubReviewPr appends signature when agent is resolved', async () => {
        mockGetAgent.mockReturnValue({ name: 'Rook', model: 'claude-haiku-4-5-20251001' } as ReturnType<typeof mockGetAgent>);
        const ctx = makeCtx();
        await handleGitHubReviewPr(ctx, {
            repo: 'test/repo', pr_number: 42, event: 'APPROVE', body: 'LGTM!',
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const passedBody = (mockAddPrReview.mock.calls as any[][])[0][3] as string;
        expect(passedBody).toMatch(SIGNATURE_PATTERN);
        expect(passedBody).toContain('Haiku 4.5');
    });

    test('no signature appended when agent cannot be resolved', async () => {
        mockGetAgent.mockReturnValue(null);
        const ctx = makeCtx();
        await handleGitHubCreatePr(ctx, {
            repo: 'test/repo', title: 'PR', body: 'Original body', head: 'feat',
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const passedBody = (mockCreatePr.mock.calls as any[][])[0][2] as string;
        expect(passedBody).toBe('Original body');
    });

    test('no signature when getAgent throws', async () => {
        mockGetAgent.mockImplementation(() => { throw new Error('DB error'); });
        const ctx = makeCtx();
        await handleGitHubCreateIssue(ctx, {
            repo: 'test/repo', title: 'Issue', body: 'Body text',
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const passedBody = (mockCreateIssue.mock.calls as any[][])[0][2] as string;
        expect(passedBody).toBe('Body text');
    });
});

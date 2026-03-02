import { test, expect, describe } from 'bun:test';
import {
    GitHubSearcher,
    repoQualifier,
    resolveFullRepo,
    shouldPollEventType,
    containsMention,
    filterNewMentions,
    escapeRegex,
    type DetectedMention,
    type GhResult,
    type RunGhFn,
} from '../polling/github-searcher';
import type { MentionPollingConfig } from '../../shared/types';

// ─── Test Helpers ───────────────────────────────────────────────────────────

function ghOk(stdout: string): GhResult {
    return { ok: true, stdout, stderr: '' };
}

function ghFail(stderr = 'error'): GhResult {
    return { ok: false, stdout: '', stderr };
}

/** Build a minimal MentionPollingConfig for testing. */
function makeConfig(overrides: Partial<MentionPollingConfig> = {}): MentionPollingConfig {
    return {
        id: 'cfg-1',
        agentId: 'agent-1',
        repo: 'CorvidLabs/corvid-agent',
        mentionUsername: 'corvid-agent',
        projectId: 'proj-1',
        intervalSeconds: 60,
        status: 'active',
        triggerCount: 0,
        lastPollAt: '2026-03-01T12:00:00Z',
        lastSeenId: null,
        processedIds: [],
        eventFilter: [],
        allowedUsers: [],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-03-01T12:00:00Z',
        ...overrides,
    };
}

// ─── Pure Functions ─────────────────────────────────────────────────────────

describe('repoQualifier', () => {
    test('specific repo returns repo: qualifier', () => {
        expect(repoQualifier('CorvidLabs/corvid-agent')).toBe('repo:CorvidLabs/corvid-agent');
    });

    test('org name returns org: qualifier', () => {
        expect(repoQualifier('CorvidLabs')).toBe('org:CorvidLabs');
    });

    test('user name returns org: qualifier', () => {
        expect(repoQualifier('alice')).toBe('org:alice');
    });
});

describe('resolveFullRepo', () => {
    test('returns configRepo when it contains a slash', () => {
        expect(resolveFullRepo('CorvidLabs/corvid-agent', 'https://github.com/CorvidLabs/other/issues/1'))
            .toBe('CorvidLabs/corvid-agent');
    });

    test('extracts owner/repo from HTML URL when config is org-only', () => {
        expect(resolveFullRepo('CorvidLabs', 'https://github.com/CorvidLabs/site/pull/22'))
            .toBe('CorvidLabs/site');
    });

    test('handles deep URL paths', () => {
        expect(resolveFullRepo('CorvidLabs', 'https://github.com/CorvidLabs/corvid-agent/issues/400#issuecomment-123'))
            .toBe('CorvidLabs/corvid-agent');
    });

    test('returns configRepo for invalid URL', () => {
        expect(resolveFullRepo('CorvidLabs', 'not-a-url')).toBe('CorvidLabs');
    });

    test('returns configRepo for empty URL', () => {
        expect(resolveFullRepo('CorvidLabs', '')).toBe('CorvidLabs');
    });

    test('returns configRepo when URL has insufficient path parts', () => {
        expect(resolveFullRepo('CorvidLabs', 'https://github.com/CorvidLabs')).toBe('CorvidLabs');
    });
});

describe('shouldPollEventType', () => {
    test('returns true for any type when eventFilter is empty', () => {
        const config = makeConfig({ eventFilter: [] });
        expect(shouldPollEventType(config, 'issue_comment')).toBe(true);
        expect(shouldPollEventType(config, 'issues')).toBe(true);
        expect(shouldPollEventType(config, 'pull_request_review_comment')).toBe(true);
    });

    test('returns true when type is in the filter', () => {
        const config = makeConfig({ eventFilter: ['issue_comment', 'issues'] });
        expect(shouldPollEventType(config, 'issue_comment')).toBe(true);
        expect(shouldPollEventType(config, 'issues')).toBe(true);
    });

    test('returns false when type is not in the filter', () => {
        const config = makeConfig({ eventFilter: ['issue_comment'] });
        expect(shouldPollEventType(config, 'issues')).toBe(false);
        expect(shouldPollEventType(config, 'pull_request_review_comment')).toBe(false);
    });
});

describe('containsMention', () => {
    test('detects @mention at start of text', () => {
        expect(containsMention('@alice hello', 'alice')).toBe(true);
    });

    test('detects @mention in middle of text', () => {
        expect(containsMention('hey @alice can you review?', 'alice')).toBe(true);
    });

    test('detects @mention at end of text', () => {
        expect(containsMention('cc @alice', 'alice')).toBe(true);
    });

    test('case insensitive matching', () => {
        expect(containsMention('Hey @Alice!', 'alice')).toBe(true);
        expect(containsMention('Hey @ALICE!', 'alice')).toBe(true);
    });

    test('does not match substring of longer username', () => {
        expect(containsMention('@alicewonderland hi', 'alice')).toBe(false);
    });

    test('does not match without @ prefix', () => {
        expect(containsMention('alice is here', 'alice')).toBe(false);
    });

    test('handles special regex characters in username', () => {
        expect(containsMention('@user.name hi', 'user.name')).toBe(true);
    });

    test('returns false for empty body', () => {
        expect(containsMention('', 'alice')).toBe(false);
    });

    test('detects mention after newline', () => {
        expect(containsMention('line1\n@alice line2', 'alice')).toBe(true);
    });
});

describe('filterNewMentions', () => {
    const mentions: DetectedMention[] = [
        { id: 'a', type: 'issue_comment', body: '', sender: 'x', number: 1, title: '', htmlUrl: '', createdAt: '', isPullRequest: false },
        { id: 'b', type: 'issues', body: '', sender: 'y', number: 2, title: '', htmlUrl: '', createdAt: '', isPullRequest: false },
        { id: 'c', type: 'assignment', body: '', sender: 'z', number: 3, title: '', htmlUrl: '', createdAt: '', isPullRequest: false },
    ];

    test('returns all mentions when processedIds is empty', () => {
        expect(filterNewMentions(mentions, [])).toEqual(mentions);
    });

    test('filters out processed IDs', () => {
        expect(filterNewMentions(mentions, ['a', 'c'])).toEqual([mentions[1]]);
    });

    test('returns empty when all are processed', () => {
        expect(filterNewMentions(mentions, ['a', 'b', 'c'])).toEqual([]);
    });

    test('handles unknown processed IDs gracefully', () => {
        expect(filterNewMentions(mentions, ['x', 'y'])).toEqual(mentions);
    });
});

describe('escapeRegex', () => {
    test('escapes dots', () => {
        expect(escapeRegex('a.b')).toBe('a\\.b');
    });

    test('escapes brackets', () => {
        expect(escapeRegex('[test]')).toBe('\\[test\\]');
    });

    test('escapes multiple special characters', () => {
        expect(escapeRegex('a.b+c*d?e')).toBe('a\\.b\\+c\\*d\\?e');
    });

    test('passes through plain strings', () => {
        expect(escapeRegex('hello')).toBe('hello');
    });

    test('escapes all special regex characters', () => {
        const specials = '.*+?^${}()|[]\\';
        const escaped = escapeRegex(specials);
        // Every character should be escaped
        expect(escaped).toBe('\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\');
    });
});

// ─── GitHubSearcher Class ───────────────────────────────────────────────────

describe('GitHubSearcher', () => {
    let capturedArgs: string[][];

    /** Create a searcher that records all gh calls and returns provided responses. */
    function createSearcher(responses: Map<string, GhResult>): GitHubSearcher {
        capturedArgs = [];
        const runGh: RunGhFn = async (args) => {
            capturedArgs.push(args);
            for (const [key, result] of responses) {
                if (args.some(a => a.includes(key))) return result;
            }
            return ghFail('no mock');
        };
        return new GitHubSearcher(runGh);
    }

    // ─── searchIssueMentions ────────────────────────────────────────────

    describe('searchIssueMentions', () => {
        test('returns empty array when gh command fails', async () => {
            const searcher = createSearcher(new Map([['search/issues', ghFail()]]));
            const result = await searcher.searchIssueMentions('CorvidLabs/repo', 'user', '2026-03-01T00:00:00Z');
            expect(result).toEqual([]);
        });

        test('returns empty array for empty stdout', async () => {
            const searcher = createSearcher(new Map([['search/issues', ghOk('')]]));
            const result = await searcher.searchIssueMentions('CorvidLabs/repo', 'user', '2026-03-01T00:00:00Z');
            expect(result).toEqual([]);
        });

        test('returns empty array when no items match', async () => {
            const searchResponse = ghOk(JSON.stringify({ items: [] }));
            const searcher = createSearcher(new Map([['search/issues', searchResponse]]));
            const result = await searcher.searchIssueMentions('CorvidLabs/repo', 'user', '2026-03-01T00:00:00Z');
            expect(result).toEqual([]);
        });

        test('fetches comments for each matching issue and finds mentions', async () => {
            const searchResponse = ghOk(JSON.stringify({
                items: [{
                    number: 42,
                    pull_request: null,
                    html_url: 'https://github.com/CorvidLabs/repo/issues/42',
                    title: 'Test issue',
                }],
            }));
            const commentsResponse = ghOk(JSON.stringify([{
                id: 100,
                body: 'Hey @testuser can you look at this?',
                user: { login: 'alice' },
                html_url: 'https://github.com/CorvidLabs/repo/issues/42#issuecomment-100',
                created_at: '2026-03-01T14:00:00Z',
            }]));

            const responses = new Map<string, GhResult>();
            responses.set('search/issues', searchResponse);
            responses.set('repos/CorvidLabs/repo/issues/42/comments', commentsResponse);
            const searcher = createSearcher(responses);

            const result = await searcher.searchIssueMentions('CorvidLabs/repo', 'testuser', '2026-03-01T00:00:00Z');
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('comment-100');
            expect(result[0].sender).toBe('alice');
            expect(result[0].number).toBe(42);
            expect(result[0].type).toBe('issue_comment');
        });

        test('resolves full repo from URL when config is org-only', async () => {
            const searchResponse = ghOk(JSON.stringify({
                items: [{
                    number: 5,
                    html_url: 'https://github.com/CorvidLabs/site/issues/5',
                    title: 'Site issue',
                }],
            }));
            const commentsResponse = ghOk(JSON.stringify([{
                id: 200,
                body: '@user check this',
                user: { login: 'bob' },
                html_url: 'https://github.com/CorvidLabs/site/issues/5#issuecomment-200',
                created_at: '2026-03-01T15:00:00Z',
            }]));

            const responses = new Map<string, GhResult>();
            responses.set('search/issues', searchResponse);
            responses.set('repos/CorvidLabs/site/issues/5/comments', commentsResponse);
            const searcher = createSearcher(responses);

            const result = await searcher.searchIssueMentions('CorvidLabs', 'user', '2026-03-01T00:00:00Z');
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('comment-200');
        });

        test('uses involves: qualifier and org: for org-level search', async () => {
            const searcher = createSearcher(new Map([['search/issues', ghOk(JSON.stringify({ items: [] }))]]));
            await searcher.searchIssueMentions('CorvidLabs', 'user', '2026-03-01T00:00:00Z');

            expect(capturedArgs[0]).toContain('-f');
            const qArg = capturedArgs[0].find(a => a.startsWith('q='));
            expect(qArg).toContain('org:CorvidLabs');
            expect(qArg).toContain('involves:user');
        });

        test('handles malformed JSON gracefully', async () => {
            const searcher = createSearcher(new Map([['search/issues', ghOk('not json')]]));
            const result = await searcher.searchIssueMentions('CorvidLabs/repo', 'user', '2026-03-01T00:00:00Z');
            expect(result).toEqual([]);
        });
    });

    // ─── fetchRecentComments ────────────────────────────────────────────

    describe('fetchRecentComments', () => {
        test('returns empty when gh fails', async () => {
            const searcher = createSearcher(new Map([['repos/', ghFail()]]));
            const result = await searcher.fetchRecentComments('CorvidLabs/repo', 1, 'user', '2026-03-01T00:00:00Z', false, {});
            expect(result).toEqual([]);
        });

        test('filters comments that do not contain @mention', async () => {
            const commentsResponse = ghOk(JSON.stringify([
                { id: 1, body: 'No mention here', user: { login: 'alice' }, created_at: '2026-03-01T14:00:00Z' },
                { id: 2, body: 'Hey @testuser check this', user: { login: 'bob' }, created_at: '2026-03-01T14:30:00Z' },
            ]));
            const searcher = createSearcher(new Map([['repos/', commentsResponse]]));

            const result = await searcher.fetchRecentComments(
                'CorvidLabs/repo', 10, 'testuser', '2026-03-01T00:00:00Z', false,
                { title: 'Test', html_url: 'https://github.com/CorvidLabs/repo/issues/10' },
            );
            expect(result).toHaveLength(1);
            expect(result[0].sender).toBe('bob');
        });

        test('sets isPullRequest flag correctly', async () => {
            const commentsResponse = ghOk(JSON.stringify([
                { id: 3, body: '@user hi', user: { login: 'alice' }, created_at: '2026-03-01T14:00:00Z' },
            ]));
            const searcher = createSearcher(new Map([['repos/', commentsResponse]]));

            const result = await searcher.fetchRecentComments(
                'CorvidLabs/repo', 5, 'user', '2026-03-01T00:00:00Z', true,
                { title: 'PR title' },
            );
            expect(result[0].isPullRequest).toBe(true);
        });
    });

    // ─── searchNewIssueMentions ─────────────────────────────────────────

    describe('searchNewIssueMentions', () => {
        test('returns empty on gh failure', async () => {
            const searcher = createSearcher(new Map([['search/issues', ghFail()]]));
            const result = await searcher.searchNewIssueMentions('CorvidLabs/repo', 'user', '2026-03-01T00:00:00Z');
            expect(result).toEqual([]);
        });

        test('finds new issues with @mention in body', async () => {
            const response = ghOk(JSON.stringify({
                items: [{
                    number: 99,
                    body: 'Hey @testuser this needs attention',
                    user: { login: 'carol' },
                    html_url: 'https://github.com/CorvidLabs/repo/issues/99',
                    title: 'New issue',
                    created_at: '2026-03-01T16:00:00Z',
                }],
            }));
            const searcher = createSearcher(new Map([['search/issues', response]]));

            const result = await searcher.searchNewIssueMentions('CorvidLabs/repo', 'testuser', '2026-03-01T00:00:00Z');
            expect(result).toHaveLength(1);
            expect(result[0].type).toBe('issues');
            expect(result[0].id).toBe('issue-CorvidLabs/repo-99');
            expect(result[0].sender).toBe('carol');
            expect(result[0].isPullRequest).toBe(false);
        });

        test('skips issues without @mention in body', async () => {
            const response = ghOk(JSON.stringify({
                items: [{
                    number: 50,
                    body: 'No mention here',
                    user: { login: 'dave' },
                    html_url: 'https://github.com/CorvidLabs/repo/issues/50',
                    title: 'Unrelated',
                    created_at: '2026-03-01T16:00:00Z',
                }],
            }));
            const searcher = createSearcher(new Map([['search/issues', response]]));

            const result = await searcher.searchNewIssueMentions('CorvidLabs/repo', 'testuser', '2026-03-01T00:00:00Z');
            expect(result).toEqual([]);
        });

        test('uses is:issue and created: qualifiers', async () => {
            const searcher = createSearcher(new Map([['search/issues', ghOk(JSON.stringify({ items: [] }))]]));
            await searcher.searchNewIssueMentions('CorvidLabs/repo', 'user', '2026-03-01T00:00:00Z');

            const qArg = capturedArgs[0].find(a => a.startsWith('q='));
            expect(qArg).toContain('is:issue');
            expect(qArg).toContain('created:>=');
        });
    });

    // ─── searchAssignedIssues ───────────────────────────────────────────

    describe('searchAssignedIssues', () => {
        test('returns empty on gh failure', async () => {
            const searcher = createSearcher(new Map([['search/issues', ghFail()]]));
            const result = await searcher.searchAssignedIssues('CorvidLabs/repo', 'user', '2026-03-01T00:00:00Z');
            expect(result).toEqual([]);
        });

        test('finds assigned issues', async () => {
            const response = ghOk(JSON.stringify({
                items: [{
                    number: 77,
                    body: 'Fix this bug',
                    user: { login: 'eve' },
                    html_url: 'https://github.com/CorvidLabs/repo/issues/77',
                    title: 'Bug report',
                    created_at: '2026-03-01T10:00:00Z',
                }],
            }));
            const searcher = createSearcher(new Map([['search/issues', response]]));

            const result = await searcher.searchAssignedIssues('CorvidLabs/repo', 'user', '2026-03-01T00:00:00Z');
            expect(result).toHaveLength(1);
            expect(result[0].type).toBe('assignment');
            expect(result[0].id).toBe('assigned-CorvidLabs/repo-77');
        });

        test('detects PRs via pull_request field', async () => {
            const response = ghOk(JSON.stringify({
                items: [{
                    number: 88,
                    body: '',
                    user: { login: 'frank' },
                    html_url: 'https://github.com/CorvidLabs/repo/pull/88',
                    title: 'PR title',
                    created_at: '2026-03-01T11:00:00Z',
                    pull_request: { url: 'https://api.github.com/repos/CorvidLabs/repo/pulls/88' },
                }],
            }));
            const searcher = createSearcher(new Map([['search/issues', response]]));

            const result = await searcher.searchAssignedIssues('CorvidLabs/repo', 'user', '2026-03-01T00:00:00Z');
            expect(result[0].isPullRequest).toBe(true);
        });

        test('uses assignee: qualifier', async () => {
            const searcher = createSearcher(new Map([['search/issues', ghOk(JSON.stringify({ items: [] }))]]));
            await searcher.searchAssignedIssues('CorvidLabs/repo', 'corvid-agent', '2026-03-01T00:00:00Z');

            const qArg = capturedArgs[0].find(a => a.startsWith('q='));
            expect(qArg).toContain('assignee:corvid-agent');
            expect(qArg).toContain('is:open');
        });
    });

    // ─── fetchPRReviews ─────────────────────────────────────────────────

    describe('fetchPRReviews', () => {
        test('returns empty on gh failure', async () => {
            const searcher = createSearcher(new Map([['repos/', ghFail()]]));
            const result = await searcher.fetchPRReviews('CorvidLabs/repo', 1, 'user', '2026-03-01T00:00:00Z', 'PR', 'url');
            expect(result).toEqual([]);
        });

        test('finds non-self reviews after since date', async () => {
            const response = ghOk(JSON.stringify([
                { id: 10, user: { login: 'reviewer1' }, state: 'APPROVED', body: 'LGTM', submitted_at: '2026-03-01T15:00:00Z', html_url: 'url1' },
                { id: 11, user: { login: 'reviewer2' }, state: 'CHANGES_REQUESTED', body: 'Fix this', submitted_at: '2026-03-01T16:00:00Z', html_url: 'url2' },
            ]));
            const searcher = createSearcher(new Map([['repos/', response]]));

            const result = await searcher.fetchPRReviews('CorvidLabs/repo', 5, 'author', '2026-03-01T00:00:00Z', 'My PR', 'prurl');
            expect(result).toHaveLength(2);
            expect(result[0].id).toBe('review-10');
            expect(result[1].id).toBe('review-11');
        });

        test('skips self-reviews', async () => {
            const response = ghOk(JSON.stringify([
                { id: 20, user: { login: 'author' }, state: 'COMMENTED', body: 'Self comment', submitted_at: '2026-03-01T15:00:00Z' },
            ]));
            const searcher = createSearcher(new Map([['repos/', response]]));

            const result = await searcher.fetchPRReviews('CorvidLabs/repo', 5, 'author', '2026-03-01T00:00:00Z', 'PR', 'url');
            expect(result).toEqual([]);
        });

        test('skips reviews before since date', async () => {
            const response = ghOk(JSON.stringify([
                { id: 30, user: { login: 'reviewer' }, state: 'APPROVED', body: 'Old', submitted_at: '2026-02-28T00:00:00Z' },
            ]));
            const searcher = createSearcher(new Map([['repos/', response]]));

            const result = await searcher.fetchPRReviews('CorvidLabs/repo', 5, 'author', '2026-03-01T00:00:00Z', 'PR', 'url');
            expect(result).toEqual([]);
        });

        test('skips dismissed reviews', async () => {
            const response = ghOk(JSON.stringify([
                { id: 40, user: { login: 'reviewer' }, state: 'DISMISSED', body: 'Dismissed', submitted_at: '2026-03-01T15:00:00Z' },
            ]));
            const searcher = createSearcher(new Map([['repos/', response]]));

            const result = await searcher.fetchPRReviews('CorvidLabs/repo', 5, 'author', '2026-03-01T00:00:00Z', 'PR', 'url');
            expect(result).toEqual([]);
        });

        test('skips empty COMMENTED reviews (phantom inline)', async () => {
            const response = ghOk(JSON.stringify([
                { id: 50, user: { login: 'reviewer' }, state: 'COMMENTED', body: '', submitted_at: '2026-03-01T15:00:00Z' },
                { id: 51, user: { login: 'reviewer' }, state: 'COMMENTED', body: '   ', submitted_at: '2026-03-01T15:00:00Z' },
            ]));
            const searcher = createSearcher(new Map([['repos/', response]]));

            const result = await searcher.fetchPRReviews('CorvidLabs/repo', 5, 'author', '2026-03-01T00:00:00Z', 'PR', 'url');
            expect(result).toEqual([]);
        });

        test('uses fallback body when review body is empty', async () => {
            const response = ghOk(JSON.stringify([
                { id: 60, user: { login: 'reviewer' }, state: 'APPROVED', body: '', submitted_at: '2026-03-01T15:00:00Z' },
            ]));
            const searcher = createSearcher(new Map([['repos/', response]]));

            const result = await searcher.fetchPRReviews('CorvidLabs/repo', 5, 'author', '2026-03-01T00:00:00Z', 'PR', 'url');
            expect(result).toHaveLength(1);
            expect(result[0].body).toBe('[APPROVED review with no body]');
        });

        test('case-insensitive self-review detection', async () => {
            const response = ghOk(JSON.stringify([
                { id: 70, user: { login: 'Author' }, state: 'APPROVED', body: 'ok', submitted_at: '2026-03-01T15:00:00Z' },
            ]));
            const searcher = createSearcher(new Map([['repos/', response]]));

            const result = await searcher.fetchPRReviews('CorvidLabs/repo', 5, 'author', '2026-03-01T00:00:00Z', 'PR', 'url');
            expect(result).toEqual([]);
        });
    });

    // ─── fetchPRReviewComments ──────────────────────────────────────────

    describe('fetchPRReviewComments', () => {
        test('returns empty on gh failure', async () => {
            const searcher = createSearcher(new Map([['repos/', ghFail()]]));
            const result = await searcher.fetchPRReviewComments('CorvidLabs/repo', 1, 'user', '2026-03-01T00:00:00Z', 'PR', 'url');
            expect(result).toEqual([]);
        });

        test('finds inline review comments from other users', async () => {
            const response = ghOk(JSON.stringify([
                { id: 101, body: 'Suggestion: use const here', user: { login: 'reviewer' }, html_url: 'url-101', created_at: '2026-03-01T17:00:00Z' },
            ]));
            const searcher = createSearcher(new Map([['repos/', response]]));

            const result = await searcher.fetchPRReviewComments('CorvidLabs/repo', 10, 'author', '2026-03-01T00:00:00Z', 'PR', 'url');
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('reviewcomment-101');
            expect(result[0].type).toBe('pull_request_review_comment');
            expect(result[0].isPullRequest).toBe(true);
        });

        test('skips self-comments', async () => {
            const response = ghOk(JSON.stringify([
                { id: 102, body: 'My own comment', user: { login: 'author' }, created_at: '2026-03-01T17:00:00Z' },
            ]));
            const searcher = createSearcher(new Map([['repos/', response]]));

            const result = await searcher.fetchPRReviewComments('CorvidLabs/repo', 10, 'author', '2026-03-01T00:00:00Z', 'PR', 'url');
            expect(result).toEqual([]);
        });

        test('case-insensitive self-comment detection', async () => {
            const response = ghOk(JSON.stringify([
                { id: 103, body: 'test', user: { login: 'AUTHOR' }, created_at: '2026-03-01T17:00:00Z' },
            ]));
            const searcher = createSearcher(new Map([['repos/', response]]));

            const result = await searcher.fetchPRReviewComments('CorvidLabs/repo', 10, 'author', '2026-03-01T00:00:00Z', 'PR', 'url');
            expect(result).toEqual([]);
        });
    });

    // ─── searchAuthoredPRReviews ────────────────────────────────────────

    describe('searchAuthoredPRReviews', () => {
        test('returns empty on gh failure', async () => {
            const searcher = createSearcher(new Map([['search/issues', ghFail()]]));
            const result = await searcher.searchAuthoredPRReviews('CorvidLabs/repo', 'user', '2026-03-01T00:00:00Z');
            expect(result).toEqual([]);
        });

        test('combines reviews and review comments from authored PRs', async () => {
            const searchResponse = ghOk(JSON.stringify({
                items: [{
                    number: 15,
                    title: 'My PR',
                    html_url: 'https://github.com/CorvidLabs/repo/pull/15',
                }],
            }));
            const reviewsResponse = ghOk(JSON.stringify([
                { id: 300, user: { login: 'reviewer' }, state: 'APPROVED', body: 'Nice work', submitted_at: '2026-03-01T18:00:00Z', html_url: 'rev-url' },
            ]));
            const commentsResponse = ghOk(JSON.stringify([
                { id: 400, body: 'Inline fix needed', user: { login: 'reviewer2' }, html_url: 'comment-url', created_at: '2026-03-01T18:30:00Z' },
            ]));

            const responses = new Map<string, GhResult>();
            responses.set('search/issues', searchResponse);
            responses.set('pulls/15/reviews', reviewsResponse);
            responses.set('pulls/15/comments', commentsResponse);
            const searcher = createSearcher(responses);

            const result = await searcher.searchAuthoredPRReviews('CorvidLabs/repo', 'author', '2026-03-01T00:00:00Z');
            expect(result).toHaveLength(2);
            expect(result.map(m => m.id).sort()).toEqual(['review-300', 'reviewcomment-400']);
        });

        test('uses is:pr is:open author: qualifiers', async () => {
            const searcher = createSearcher(new Map([['search/issues', ghOk(JSON.stringify({ items: [] }))]]));
            await searcher.searchAuthoredPRReviews('CorvidLabs/repo', 'corvid-agent', '2026-03-01T00:00:00Z');

            const qArg = capturedArgs[0].find(a => a.startsWith('q='));
            expect(qArg).toContain('is:pr');
            expect(qArg).toContain('is:open');
            expect(qArg).toContain('author:corvid-agent');
        });
    });

    // ─── fetchMentions (orchestrator) ───────────────────────────────────

    describe('fetchMentions', () => {
        test('calls all search methods when no eventFilter set', async () => {
            const searchResponse = ghOk(JSON.stringify({ items: [] }));
            const searcher = createSearcher(new Map([['search/issues', searchResponse]]));
            const config = makeConfig({ eventFilter: [] });

            await searcher.fetchMentions(config, () => true);

            // Should make 4 search/issues calls: issue_comment, issues, assigned, PR reviews
            const searchCalls = capturedArgs.filter(a => a.includes('search/issues'));
            expect(searchCalls).toHaveLength(4);
        });

        test('skips issue_comment search when filtered out', async () => {
            const searchResponse = ghOk(JSON.stringify({ items: [] }));
            const searcher = createSearcher(new Map([['search/issues', searchResponse]]));
            const config = makeConfig({ eventFilter: ['issues'] });

            await searcher.fetchMentions(config, () => true);

            // issues + assigned + no PR review search + no issue_comment
            const searchCalls = capturedArgs.filter(a => a.includes('search/issues'));
            // issues (1) + assigned (always) = 2
            expect(searchCalls).toHaveLength(2);
        });

        test('applies global allowlist filter', async () => {
            const searchResponse = ghOk(JSON.stringify({
                items: [{
                    number: 1,
                    body: '',
                    user: { login: 'allowed-user' },
                    html_url: 'https://github.com/CorvidLabs/repo/issues/1',
                    title: 'Test',
                    created_at: '2026-03-01T10:00:00Z',
                }, {
                    number: 2,
                    body: '',
                    user: { login: 'blocked-user' },
                    html_url: 'https://github.com/CorvidLabs/repo/issues/2',
                    title: 'Test2',
                    created_at: '2026-03-01T11:00:00Z',
                }],
            }));
            const searcher = createSearcher(new Map([['search/issues', searchResponse]]));

            // Only issue_comment filtered, so assigned still runs
            const config = makeConfig({ eventFilter: ['issues'] });
            const isAllowed = (sender: string) => sender === 'allowed-user';

            const result = await searcher.fetchMentions(config, isAllowed);
            // Assigned search runs without mention filter, so it will include items
            // but the global isAllowed filter should block 'blocked-user'
            for (const m of result) {
                expect(m.sender).toBe('allowed-user');
            }
        });

        test('applies per-config allowed users filter', async () => {
            const searchResponse = ghOk(JSON.stringify({
                items: [{
                    number: 10,
                    body: '',
                    user: { login: 'alice' },
                    html_url: 'https://github.com/CorvidLabs/repo/issues/10',
                    title: 'Test',
                    created_at: '2026-03-01T12:00:00Z',
                }, {
                    number: 11,
                    body: '',
                    user: { login: 'bob' },
                    html_url: 'https://github.com/CorvidLabs/repo/issues/11',
                    title: 'Test2',
                    created_at: '2026-03-01T13:00:00Z',
                }],
            }));
            const searcher = createSearcher(new Map([['search/issues', searchResponse]]));
            const config = makeConfig({
                eventFilter: ['issues'], // skip everything except issues + assigned
                allowedUsers: ['alice'], // only allow alice
            });

            const result = await searcher.fetchMentions(config, () => true);
            for (const m of result) {
                expect(m.sender.toLowerCase()).toBe('alice');
            }
        });

        test('sorts mentions by createdAt descending', async () => {
            const searchResponse = ghOk(JSON.stringify({
                items: [
                    { number: 1, body: '', user: { login: 'a' }, html_url: 'https://github.com/CorvidLabs/repo/issues/1', title: 'T1', created_at: '2026-03-01T10:00:00Z' },
                    { number: 2, body: '', user: { login: 'b' }, html_url: 'https://github.com/CorvidLabs/repo/issues/2', title: 'T2', created_at: '2026-03-01T14:00:00Z' },
                    { number: 3, body: '', user: { login: 'c' }, html_url: 'https://github.com/CorvidLabs/repo/issues/3', title: 'T3', created_at: '2026-03-01T12:00:00Z' },
                ],
            }));
            const searcher = createSearcher(new Map([['search/issues', searchResponse]]));
            // Only assigned search (skip issue_comment, issues, PR reviews) for simpler test
            const config = makeConfig({ eventFilter: ['issue_comment'] }); // skip issues and pr_review

            const result = await searcher.fetchMentions(config, () => true);
            // The assigned search returns items; they should be sorted newest first
            if (result.length >= 2) {
                for (let i = 0; i < result.length - 1; i++) {
                    expect(new Date(result[i].createdAt).getTime())
                        .toBeGreaterThanOrEqual(new Date(result[i + 1].createdAt).getTime());
                }
            }
        });

        test('handles lastPollAt without Z suffix', async () => {
            const searchResponse = ghOk(JSON.stringify({ items: [] }));
            const searcher = createSearcher(new Map([['search/issues', searchResponse]]));
            const config = makeConfig({ lastPollAt: '2026-03-01T12:00:00' }); // no Z

            // Should not throw
            const result = await searcher.fetchMentions(config, () => true);
            expect(result).toEqual([]);
        });

        test('handles null lastPollAt (defaults to 24h ago)', async () => {
            const searchResponse = ghOk(JSON.stringify({ items: [] }));
            const searcher = createSearcher(new Map([['search/issues', searchResponse]]));
            const config = makeConfig({ lastPollAt: null });

            const result = await searcher.fetchMentions(config, () => true);
            expect(result).toEqual([]);
        });
    });
});

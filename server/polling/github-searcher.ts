/**
 * GitHubSearcher — extracted GitHub search logic from MentionPollingService.
 *
 * Searches GitHub for @mentions, assignments, and PR reviews using the `gh` CLI.
 * This module is independently testable and reusable across polling, webhooks, and work tasks.
 */

import type { MentionPollingConfig } from '../../shared/types';
import { createLogger } from '../lib/logger';

const log = createLogger('GitHubSearcher');

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DetectedMention {
    /** Unique identifier (e.g. comment ID or issue number + timestamp) */
    id: string;
    /** Event type */
    type: 'issue_comment' | 'issues' | 'pull_request_review_comment' | 'assignment';
    /** The comment/issue body containing the @mention */
    body: string;
    /** GitHub username of the author */
    sender: string;
    /** Issue/PR number */
    number: number;
    /** Issue/PR title */
    title: string;
    /** Direct URL to the comment/issue */
    htmlUrl: string;
    /** When the comment/issue was created */
    createdAt: string;
    /** Whether this is on a PR (vs an issue) */
    isPullRequest: boolean;
}

/** Result of running a `gh` CLI command. */
export interface GhResult {
    ok: boolean;
    stdout: string;
    stderr: string;
}

/** Function that executes a `gh` CLI command. Injected for testability. */
export type RunGhFn = (args: string[]) => Promise<GhResult>;

/**
 * Callback to check whether a GitHub user is in the allowlist.
 * Separates DB dependency from the searcher.
 */
export type IsAllowedFn = (sender: string) => boolean;

// ─── GitHubSearcher ─────────────────────────────────────────────────────────

export class GitHubSearcher {
    constructor(private readonly runGh: RunGhFn) {}

    // ─── Orchestrator ───────────────────────────────────────────────────────

    /**
     * Fetch all recent mentions for a polling config.
     * Orchestrates the individual search methods and applies allowlist filtering.
     */
    async fetchMentions(
        config: MentionPollingConfig,
        isAllowed: IsAllowedFn,
    ): Promise<DetectedMention[]> {
        const mentions: DetectedMention[] = [];

        // GitHub search `updated:` only supports date precision (no time), so we
        // subtract 1 day from lastPollAt to avoid missing mentions near midnight.
        // Duplicate prevention is handled by the processedIds set, not the date filter.
        const lastPollDate = config.lastPollAt
            ? new Date(config.lastPollAt.endsWith('Z') ? config.lastPollAt : config.lastPollAt + 'Z')
            : new Date(Date.now() - 24 * 60 * 60 * 1000);
        const paddedDate = new Date(lastPollDate.getTime() - 24 * 60 * 60 * 1000);
        const sinceDate = paddedDate.toISOString();

        if (shouldPollEventType(config, 'issue_comment')) {
            const commentMentions = await this.searchIssueMentions(config.repo, config.mentionUsername, sinceDate);
            mentions.push(...commentMentions);
        }

        if (shouldPollEventType(config, 'issues')) {
            const issueMentions = await this.searchNewIssueMentions(config.repo, config.mentionUsername, sinceDate);
            mentions.push(...issueMentions);
        }

        const assignedIssues = await this.searchAssignedIssues(config.repo, config.mentionUsername, sinceDate);
        mentions.push(...assignedIssues);

        if (shouldPollEventType(config, 'pull_request_review_comment')) {
            const prReviewMentions = await this.searchAuthoredPRReviews(
                config.repo, config.mentionUsername, sinceDate,
            );
            mentions.push(...prReviewMentions);
        }

        // Sort by creation time descending (newest first)
        mentions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        // Global allowlist filter (empty = open mode)
        const globalFiltered = mentions.filter(m => isAllowed(m.sender));

        // Per-config allowed users filter (further restricts global list)
        if (config.allowedUsers.length > 0) {
            const allowed = new Set(config.allowedUsers.map(u => u.toLowerCase()));
            return globalFiltered.filter(m => allowed.has(m.sender.toLowerCase()));
        }

        return globalFiltered;
    }

    // ─── Search Methods ─────────────────────────────────────────────────────

    /**
     * Search for issue/PR comments mentioning the username.
     */
    async searchIssueMentions(
        repo: string,
        username: string,
        since: string,
    ): Promise<DetectedMention[]> {
        try {
            const query = `${repoQualifier(repo)} involves:${username} updated:>=${since.split('T')[0]}`;
            const result = await this.runGh([
                'api', 'search/issues',
                '-X', 'GET',
                '-f', `q=${query}`,
                '-f', 'sort=updated',
                '-f', 'order=desc',
                '-f', 'per_page=30',
            ]);

            if (!result.ok || !result.stdout.trim()) return [];

            const parsed = JSON.parse(result.stdout) as { items?: Array<Record<string, unknown>> };
            const items = parsed.items ?? [];
            const mentions: DetectedMention[] = [];

            for (const item of items) {
                const number = item.number as number;
                const isPR = !!(item.pull_request);
                const itemRepo = resolveFullRepo(repo, (item.html_url as string) ?? '');
                const commentMentions = await this.fetchRecentComments(itemRepo, number, username, since, isPR, item);
                mentions.push(...commentMentions);
            }

            return mentions;
        } catch (err) {
            log.error('Error searching issue mentions', { repo, error: err instanceof Error ? err.message : String(err) });
            return [];
        }
    }

    /**
     * Fetch recent comments on a specific issue/PR and find @mentions.
     */
    async fetchRecentComments(
        repo: string,
        issueNumber: number,
        username: string,
        since: string,
        isPR: boolean,
        issueData: Record<string, unknown>,
    ): Promise<DetectedMention[]> {
        try {
            const result = await this.runGh([
                'api',
                `repos/${repo}/issues/${issueNumber}/comments`,
                '-X', 'GET',
                '-f', `since=${since}`,
                '-f', 'per_page=50',
                '-f', 'sort=created',
                '-f', 'direction=desc',
            ]);

            if (!result.ok || !result.stdout.trim()) return [];

            const comments = JSON.parse(result.stdout) as Array<Record<string, unknown>>;
            const mentions: DetectedMention[] = [];

            for (const comment of comments) {
                const body = (comment.body as string) ?? '';
                const commentUser = (comment.user as Record<string, unknown>)?.login as string ?? '';

                if (containsMention(body, username)) {
                    mentions.push({
                        id: `comment-${comment.id}`,
                        type: 'issue_comment',
                        body,
                        sender: commentUser,
                        number: issueNumber,
                        title: (issueData.title as string) ?? '',
                        htmlUrl: (comment.html_url as string) ?? (issueData.html_url as string) ?? '',
                        createdAt: (comment.created_at as string) ?? '',
                        isPullRequest: isPR,
                    });
                }
            }

            return mentions;
        } catch (err) {
            log.debug('Error fetching comments', { repo, issueNumber, error: err instanceof Error ? err.message : String(err) });
            return [];
        }
    }

    /**
     * Search for newly opened issues that mention the username in their body.
     */
    async searchNewIssueMentions(
        repo: string,
        username: string,
        since: string,
    ): Promise<DetectedMention[]> {
        try {
            const sinceDate = since.split('T')[0];
            const query = `${repoQualifier(repo)} involves:${username} is:issue created:>=${sinceDate}`;
            const result = await this.runGh([
                'api', 'search/issues',
                '-X', 'GET',
                '-f', `q=${query}`,
                '-f', 'sort=created',
                '-f', 'order=desc',
                '-f', 'per_page=20',
            ]);

            if (!result.ok || !result.stdout.trim()) return [];

            const parsed = JSON.parse(result.stdout) as { items?: Array<Record<string, unknown>> };
            const items = parsed.items ?? [];
            const mentions: DetectedMention[] = [];

            for (const item of items) {
                const body = (item.body as string) ?? '';
                const sender = ((item.user as Record<string, unknown>)?.login as string) ?? '';

                if (containsMention(body, username)) {
                    const htmlUrl = (item.html_url as string) ?? '';
                    const itemRepo = resolveFullRepo(repo, htmlUrl);
                    mentions.push({
                        id: `issue-${itemRepo}-${item.number}`,
                        type: 'issues',
                        body,
                        sender,
                        number: item.number as number,
                        title: (item.title as string) ?? '',
                        htmlUrl,
                        createdAt: (item.created_at as string) ?? '',
                        isPullRequest: false,
                    });
                }
            }

            return mentions;
        } catch (err) {
            log.error('Error searching new issue mentions', { repo, error: err instanceof Error ? err.message : String(err) });
            return [];
        }
    }

    /**
     * Search for issues/PRs recently assigned to the username.
     */
    async searchAssignedIssues(
        repo: string,
        username: string,
        since: string,
    ): Promise<DetectedMention[]> {
        try {
            const sinceDate = since.split('T')[0];
            const query = `${repoQualifier(repo)} assignee:${username} is:open updated:>=${sinceDate}`;
            const result = await this.runGh([
                'api', 'search/issues',
                '-X', 'GET',
                '-f', `q=${query}`,
                '-f', 'sort=updated',
                '-f', 'order=desc',
                '-f', 'per_page=20',
            ]);

            if (!result.ok || !result.stdout.trim()) return [];

            const parsed = JSON.parse(result.stdout) as { items?: Array<Record<string, unknown>> };
            const items = parsed.items ?? [];
            const mentions: DetectedMention[] = [];

            for (const item of items) {
                const body = (item.body as string) ?? '';
                const sender = ((item.user as Record<string, unknown>)?.login as string) ?? '';
                const isPR = !!(item.pull_request);

                const htmlUrl = (item.html_url as string) ?? '';
                const itemRepo = resolveFullRepo(repo, htmlUrl);
                mentions.push({
                    id: `assigned-${itemRepo}-${item.number}`,
                    type: 'assignment',
                    body,
                    sender,
                    number: item.number as number,
                    title: (item.title as string) ?? '',
                    htmlUrl,
                    createdAt: (item.created_at as string) ?? '',
                    isPullRequest: isPR,
                });
            }

            return mentions;
        } catch (err) {
            log.error('Error searching assigned issues', { repo, error: err instanceof Error ? err.message : String(err) });
            return [];
        }
    }

    /**
     * Search for open PRs authored by the user and fetch new reviews/review comments on each.
     */
    async searchAuthoredPRReviews(
        repo: string,
        username: string,
        since: string,
    ): Promise<DetectedMention[]> {
        try {
            const sinceDate = since.split('T')[0];
            const query = `${repoQualifier(repo)} is:pr is:open author:${username} updated:>=${sinceDate}`;
            const result = await this.runGh([
                'api', 'search/issues',
                '-X', 'GET',
                '-f', `q=${query}`,
                '-f', 'sort=updated',
                '-f', 'order=desc',
                '-f', 'per_page=10',
            ]);

            if (!result.ok || !result.stdout.trim()) return [];

            const parsed = JSON.parse(result.stdout) as { items?: Array<Record<string, unknown>> };
            const items = parsed.items ?? [];
            const mentions: DetectedMention[] = [];

            for (const item of items) {
                const prNumber = item.number as number;
                const prTitle = (item.title as string) ?? '';
                const prHtmlUrl = (item.html_url as string) ?? '';
                const fullRepo = resolveFullRepo(repo, prHtmlUrl);

                const [reviews, reviewComments] = await Promise.all([
                    this.fetchPRReviews(fullRepo, prNumber, username, since, prTitle, prHtmlUrl),
                    this.fetchPRReviewComments(fullRepo, prNumber, username, since, prTitle, prHtmlUrl),
                ]);

                mentions.push(...reviews, ...reviewComments);
            }

            return mentions;
        } catch (err) {
            log.error('Error searching authored PR reviews', { repo, error: err instanceof Error ? err.message : String(err) });
            return [];
        }
    }

    /**
     * Fetch review submissions (approve/changes_requested/comment) on a specific PR.
     */
    async fetchPRReviews(
        repo: string,
        prNumber: number,
        username: string,
        since: string,
        prTitle: string,
        prHtmlUrl: string,
    ): Promise<DetectedMention[]> {
        try {
            const result = await this.runGh([
                'api',
                `repos/${repo}/pulls/${prNumber}/reviews`,
                '-X', 'GET',
            ]);

            if (!result.ok || !result.stdout.trim()) return [];

            const reviews = JSON.parse(result.stdout) as Array<Record<string, unknown>>;
            const sinceTime = new Date(since).getTime();
            const mentions: DetectedMention[] = [];

            for (const review of reviews) {
                const reviewer = ((review.user as Record<string, unknown>)?.login as string) ?? '';
                const state = (review.state as string) ?? '';
                const body = (review.body as string) ?? '';
                const submittedAt = (review.submitted_at as string) ?? '';

                // Skip self-reviews
                if (reviewer.toLowerCase() === username.toLowerCase()) continue;

                // Skip reviews before the since window
                if (submittedAt && new Date(submittedAt).getTime() < sinceTime) continue;

                // Skip dismissed reviews
                if (state === 'DISMISSED') continue;

                // Skip empty COMMENTED reviews (phantom top-level for inline comments)
                if (state === 'COMMENTED' && !body.trim()) continue;

                mentions.push({
                    id: `review-${review.id}`,
                    type: 'pull_request_review_comment',
                    body: body || `[${state} review with no body]`,
                    sender: reviewer,
                    number: prNumber,
                    title: prTitle,
                    htmlUrl: (review.html_url as string) ?? prHtmlUrl,
                    createdAt: submittedAt,
                    isPullRequest: true,
                });
            }

            return mentions;
        } catch (err) {
            log.debug('Error fetching PR reviews', { repo, prNumber, error: err instanceof Error ? err.message : String(err) });
            return [];
        }
    }

    /**
     * Fetch inline code review comments on a specific PR.
     */
    async fetchPRReviewComments(
        repo: string,
        prNumber: number,
        username: string,
        since: string,
        prTitle: string,
        prHtmlUrl: string,
    ): Promise<DetectedMention[]> {
        try {
            const result = await this.runGh([
                'api',
                `repos/${repo}/pulls/${prNumber}/comments`,
                '-X', 'GET',
                '-f', `since=${since}`,
            ]);

            if (!result.ok || !result.stdout.trim()) return [];

            const comments = JSON.parse(result.stdout) as Array<Record<string, unknown>>;
            const mentions: DetectedMention[] = [];

            for (const comment of comments) {
                const commenter = ((comment.user as Record<string, unknown>)?.login as string) ?? '';
                const body = (comment.body as string) ?? '';

                // Skip self-comments
                if (commenter.toLowerCase() === username.toLowerCase()) continue;

                mentions.push({
                    id: `reviewcomment-${comment.id}`,
                    type: 'pull_request_review_comment',
                    body,
                    sender: commenter,
                    number: prNumber,
                    title: prTitle,
                    htmlUrl: (comment.html_url as string) ?? prHtmlUrl,
                    createdAt: (comment.created_at as string) ?? '',
                    isPullRequest: true,
                });
            }

            return mentions;
        } catch (err) {
            log.debug('Error fetching PR review comments', { repo, prNumber, error: err instanceof Error ? err.message : String(err) });
            return [];
        }
    }
}

// ─── Exported Helpers ───────────────────────────────────────────────────────
// These are pure functions, exported for direct use and testing.

/**
 * Build the GitHub search qualifier for the repo field.
 * If it contains a '/' it's a specific repo (repo:owner/name).
 * Otherwise it's an org or user — use org: which covers both.
 */
export function repoQualifier(repo: string): string {
    if (repo.includes('/')) return `repo:${repo}`;
    return `org:${repo}`;
}

/**
 * Resolve the full owner/repo from the mention's HTML URL when the config
 * repo is just an org/user name (no '/').
 */
export function resolveFullRepo(configRepo: string, htmlUrl: string): string {
    if (configRepo.includes('/')) return configRepo;
    try {
        const url = new URL(htmlUrl);
        const parts = url.pathname.split('/').filter(Boolean);
        if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
    } catch { /* ignore */ }
    return configRepo;
}

/** Check whether a polling config includes a specific event type. */
export function shouldPollEventType(config: MentionPollingConfig, type: string): boolean {
    if (config.eventFilter.length === 0) return true;
    return config.eventFilter.includes(type as MentionPollingConfig['eventFilter'][number]);
}

/** Check whether a text body contains an @mention of the given username. */
export function containsMention(body: string, username: string): boolean {
    const regex = new RegExp(`(?:^|\\s|[^\\w])@${escapeRegex(username)}(?:\\s|$|[^\\w])`, 'i');
    return regex.test(body);
}

/** Filter out mentions whose IDs are already in the processed set. */
export function filterNewMentions(mentions: DetectedMention[], processedIds: string[]): DetectedMention[] {
    if (processedIds.length === 0) return mentions;
    const seen = new Set(processedIds);
    return mentions.filter(m => !seen.has(m.id));
}

/** Escape special regex characters in a string. */
export function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

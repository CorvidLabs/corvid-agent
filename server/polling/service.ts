/**
 * MentionPollingService — polls GitHub for @mentions without requiring a public webhook URL.
 *
 * Uses the `gh` CLI to search for recent comments/issues in configured repos,
 * detecting @mentions and triggering agent sessions or work tasks.
 *
 * This is the local-first alternative to webhooks:
 * - Works entirely on the user's device with no public URL needed
 * - Polls on a per-config interval (default 60s, min 30s)
 * - Tracks last-seen comment ID to avoid processing duplicates
 * - Reuses the same trigger logic as WebhookService (sessions + work tasks)
 */

import type { Database } from 'bun:sqlite';
import type { ProcessManager } from '../process/manager';
import type { MentionPollingConfig } from '../../shared/types';
import {
    findDuePollingConfigs,
    updatePollState,
    incrementPollingTriggerCount,
    updateProcessedIds,
} from '../db/mention-polling';
// Webhook delivery helpers not needed here — polling uses its own trigger tracking
import { getAgent } from '../db/agents';
import { createSession } from '../db/sessions';
import { createLogger } from '../lib/logger';
import { DedupService } from '../lib/dedup';
import { buildSafeGhEnv } from '../lib/env';
import { createEventContext, runWithEventContext } from '../observability/event-context';

const log = createLogger('MentionPoller');
const TRIGGER_DEDUP_NS = 'polling:triggers';

/** How often we check which configs are due (main loop interval). */
const POLL_LOOP_INTERVAL_MS = 15_000; // 15 seconds

/** Max concurrent polls to avoid hammering the GitHub API. */
const MAX_CONCURRENT_POLLS = 3;

/** Rate limit: minimum gap between triggers for the same config. */
const MIN_TRIGGER_GAP_MS = 60_000;

/** Max sessions spawned per config per poll cycle — prevents stampede. */
const MAX_TRIGGERS_PER_CYCLE = 5;

/**
 * A parsed mention from a GitHub API response.
 */
interface DetectedMention {
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

type PollingEventCallback = (event: {
    type: 'mention_poll_trigger';
    data: unknown;
}) => void;

/** How often to check for mergeable PRs (auto-merge loop). */
const AUTO_MERGE_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

export class MentionPollingService {
    private db: Database;
    private processManager: ProcessManager;
    private loopTimer: ReturnType<typeof setInterval> | null = null;
    private autoMergeTimer: ReturnType<typeof setInterval> | null = null;
    private activePolls = new Set<string>(); // config IDs currently being polled
    private dedup = DedupService.global();
    private eventCallbacks = new Set<PollingEventCallback>();
    private running = false;

    /** Cache: "owner/repo#123" → { open, checkedAt } */
    private issueStateCache = new Map<string, { open: boolean; checkedAt: number }>();
    private static readonly ISSUE_STATE_TTL_MS = 5 * 60 * 1000; // 5 min

    constructor(
        db: Database,
        processManager: ProcessManager,
        _workTaskService?: unknown,
    ) {
        this.db = db;
        this.processManager = processManager;
        // Rate limit triggers: 60s TTL matches MIN_TRIGGER_GAP_MS, bounded at 500 entries
        this.dedup.register(TRIGGER_DEDUP_NS, { maxSize: 500, ttlMs: MIN_TRIGGER_GAP_MS });
    }

    /** Subscribe to polling events (for WebSocket broadcast). */
    onEvent(callback: PollingEventCallback): () => void {
        this.eventCallbacks.add(callback);
        return () => this.eventCallbacks.delete(callback);
    }

    /** Start the polling loop. */
    start(): void {
        if (this.running) return;
        this.running = true;

        log.info('Mention polling service started');

        // Run immediately on start, then on interval
        this.pollDueConfigs();
        this.loopTimer = setInterval(() => this.pollDueConfigs(), POLL_LOOP_INTERVAL_MS);

        // Auto-merge loop: squash-merge PRs authored by the agent that pass CI
        this.autoMergePRs();
        this.autoMergeTimer = setInterval(() => this.autoMergePRs(), AUTO_MERGE_INTERVAL_MS);
    }

    /** Stop the polling loop. */
    stop(): void {
        this.running = false;
        if (this.loopTimer) {
            clearInterval(this.loopTimer);
            this.loopTimer = null;
        }
        if (this.autoMergeTimer) {
            clearInterval(this.autoMergeTimer);
            this.autoMergeTimer = null;
        }
        log.info('Mention polling service stopped');
    }

    /** Get polling stats for the dashboard. */
    getStats(): { isRunning: boolean; activeConfigs: number; totalConfigs: number; totalTriggers: number } {
        try {
            const row = this.db.query(`
                SELECT
                    COUNT(*) as total,
                    COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
                    COALESCE(SUM(trigger_count), 0) as triggers
                FROM mention_polling_configs
            `).get() as { total: number; active: number; triggers: number } | null;
            return {
                isRunning: this.running,
                activeConfigs: row?.active ?? 0,
                totalConfigs: row?.total ?? 0,
                totalTriggers: row?.triggers ?? 0,
            };
        } catch {
            return { isRunning: this.running, activeConfigs: 0, totalConfigs: 0, totalTriggers: 0 };
        }
    }

    // ─── Main Loop ──────────────────────────────────────────────────────────

    private async pollDueConfigs(): Promise<void> {
        if (!this.running) return;

        try {
            const dueConfigs = findDuePollingConfigs(this.db);
            if (dueConfigs.length === 0) return;

            log.debug('Found due polling configs', { count: dueConfigs.length });

            // Process up to MAX_CONCURRENT_POLLS at once
            const batch = dueConfigs
                .filter(c => !this.activePolls.has(c.id))
                .slice(0, MAX_CONCURRENT_POLLS);

            const promises = batch.map(config => this.pollConfig(config));
            await Promise.allSettled(promises);
        } catch (err) {
            log.error('Error in poll loop', { error: err instanceof Error ? err.message : String(err) });
        }
    }

    // ─── Auto-Merge Loop ─────────────────────────────────────────────────

    /**
     * Find open PRs authored by the polling agent username that have all CI
     * checks passing, and squash-merge them automatically.
     */
    private async autoMergePRs(): Promise<void> {
        if (!this.running) return;

        try {
            // Gather unique repos from active polling configs
            const allConfigs = this.db.query(
                `SELECT repo, mention_username FROM mention_polling_configs WHERE status = 'active'`
            ).all() as Array<{ repo: string; mention_username: string }>;

            // Deduplicate by repo+username
            const seen = new Set<string>();
            const targets: Array<{ repo: string; username: string }> = [];
            for (const c of allConfigs) {
                const key = `${c.repo}:${c.mention_username}`;
                if (seen.has(key)) continue;
                seen.add(key);
                targets.push({ repo: c.repo, username: c.mention_username });
            }

            for (const { repo, username } of targets) {
                await this.autoMergeForRepo(repo, username);
            }
        } catch (err) {
            log.error('Error in auto-merge loop', { error: err instanceof Error ? err.message : String(err) });
        }
    }

    /**
     * Auto-merge passing PRs for a specific repo authored by the given username.
     */
    private async autoMergeForRepo(repo: string, username: string): Promise<void> {
        // List open PRs authored by the agent
        const searchQualifier = repo.includes('/') ? `repo:${repo}` : `org:${repo}`;
        const result = await this.runGh([
            'api', 'search/issues',
            '-X', 'GET',
            '-f', `q=${searchQualifier} is:pr is:open author:${username}`,
            '-f', 'per_page=20',
        ]);

        if (!result.ok || !result.stdout.trim()) return;

        const parsed = JSON.parse(result.stdout) as { items?: Array<Record<string, unknown>> };
        const prs = parsed.items ?? [];
        if (prs.length === 0) return;

        for (const pr of prs) {
            const prNumber = pr.number as number;
            const prUrl = (pr.html_url as string) ?? '';
            const prRepo = this.resolveFullRepo(repo, prUrl);

            // Check if all CI checks have passed
            const statusResult = await this.runGh([
                'pr', 'checks', String(prNumber),
                '--repo', prRepo,
                '--json', 'state',
                '--jq', '[.[].state] | if length == 0 then "none" elif all(. == "SUCCESS") then "pass" else "fail" end',
            ]);

            if (!statusResult.ok || statusResult.stdout.trim() !== 'pass') {
                continue;
            }

            // All checks pass — merge it
            const mergeResult = await this.runGh([
                'pr', 'merge', String(prNumber),
                '--repo', prRepo,
                '--squash',
                '--delete-branch',
            ]);

            if (mergeResult.ok) {
                log.info('Auto-merged PR', { repo: prRepo, number: prNumber });
            } else {
                log.debug('Failed to auto-merge PR', {
                    repo: prRepo, number: prNumber,
                    error: mergeResult.stderr,
                });
            }
        }
    }

    /**
     * Poll a single config for new @mentions.
     */
    private async pollConfig(config: MentionPollingConfig): Promise<void> {
        if (this.activePolls.has(config.id)) return;
        this.activePolls.add(config.id);

        const ctx = createEventContext('polling');
        return runWithEventContext(ctx, async () => {
        try {
            log.debug('Polling config', { id: config.id, repo: config.repo, username: config.mentionUsername, lastPollAt: config.lastPollAt, lastSeenId: config.lastSeenId, processedIds: config.processedIds.length });

            // Migration: seed processedIds from lastSeenId if the new column is empty
            // but lastSeenId exists (upgraded from position-based to set-based tracking).
            if (config.processedIds.length === 0 && config.lastSeenId) {
                config.processedIds = [config.lastSeenId];
                updateProcessedIds(this.db, config.id, config.processedIds);
                log.info('Migrated lastSeenId to processedIds', { configId: config.id, lastSeenId: config.lastSeenId });
            }

            // Fetch recent mentions from GitHub
            const mentions = await this.fetchMentions(config);
            log.debug('Fetch result', { configId: config.id, repo: config.repo, mentionsFound: mentions.length });

            // Update poll timestamp even if no mentions found
            if (mentions.length === 0) {
                updatePollState(this.db, config.id);
                return;
            }

            // Filter out already-processed mentions using the full ID set
            const newMentions = this.filterNewMentions(mentions, config.processedIds);
            if (newMentions.length === 0) {
                updatePollState(this.db, config.id);
                return;
            }

            log.info('Found new mentions', { configId: config.id, repo: config.repo, count: newMentions.length });

            // Deduplicate: collapse multiple mentions for the same issue number
            // (e.g. comment-123, issue-8, assigned-8 all for #8) into one.
            // We keep the first (newest, since mentions are sorted desc).
            const seenNumbers = new Set<number>();
            const dedupedMentions: DetectedMention[] = [];
            for (const m of newMentions) {
                if (!seenNumbers.has(m.number)) {
                    seenNumbers.add(m.number);
                    dedupedMentions.push(m);
                }
            }

            // Process each deduplicated mention and persist IDs immediately
            // to narrow the race window with concurrent poll cycles.
            // Cap at MAX_TRIGGERS_PER_CYCLE to prevent stampede.
            let triggeredThisCycle = 0;
            for (const mention of dedupedMentions) {
                if (triggeredThisCycle >= MAX_TRIGGERS_PER_CYCLE) {
                    log.info('Hit per-cycle trigger cap, deferring remaining mentions', {
                        configId: config.id, deferred: dedupedMentions.length - triggeredThisCycle,
                    });
                    break;
                }
                const triggered = await this.processMention(config, mention);
                if (triggered) {
                    triggeredThisCycle++;
                    // Collect ALL mention IDs for this issue number (comment-X, issue-N, assigned-N)
                    // so duplicates from other search paths don't reappear.
                    const relatedIds = newMentions.filter(m => m.number === mention.number).map(m => m.id);
                    config.processedIds = [...config.processedIds, ...relatedIds];
                    updateProcessedIds(this.db, config.id, config.processedIds);
                }
            }

            // Update lastSeenId for backward compat (processedIds is the real filter)
            const newestId = mentions[0].id; // mentions are sorted newest-first
            updatePollState(this.db, config.id, newestId);

        } catch (err) {
            log.error('Error polling config', {
                configId: config.id,
                repo: config.repo,
                error: err instanceof Error ? err.message : String(err),
            });
            // Still update poll timestamp to avoid hammering on errors
            updatePollState(this.db, config.id);
        } finally {
            this.activePolls.delete(config.id);
        }
        }); // runWithEventContext
    }

    // ─── GitHub API (via gh CLI) ────────────────────────────────────────────

    /**
     * Fetch recent comments/issues that mention the configured username.
     * Uses `gh api` to search for mentions.
     */
    private async fetchMentions(config: MentionPollingConfig): Promise<DetectedMention[]> {
        const mentions: DetectedMention[] = [];

        // Strategy: Use GitHub search API to find recent mentions in the repo.
        // We search for comments mentioning @username in the specific repo.
        // The search API is more efficient than listing all comments.
        // lastPollAt from SQLite is UTC but lacks the 'Z' suffix — append it so
        // JavaScript's Date parser treats it as UTC rather than local time.
        //
        // GitHub search `updated:` only supports date precision (no time), so we
        // subtract 1 day from lastPollAt to avoid missing mentions near midnight.
        // Duplicate prevention is handled by the processedIds set, not the date filter.
        const lastPollDate = config.lastPollAt
            ? new Date(config.lastPollAt.endsWith('Z') ? config.lastPollAt : config.lastPollAt + 'Z')
            : new Date(Date.now() - 24 * 60 * 60 * 1000);
        const paddedDate = new Date(lastPollDate.getTime() - 24 * 60 * 60 * 1000);
        const sinceDate = paddedDate.toISOString();

        // Search for issue comments mentioning the user
        if (this.shouldPollEventType(config, 'issue_comment')) {
            const commentMentions = await this.searchIssueMentions(config.repo, config.mentionUsername, sinceDate);
            mentions.push(...commentMentions);
        }

        // Search for new issues mentioning the user
        if (this.shouldPollEventType(config, 'issues')) {
            const issueMentions = await this.searchNewIssueMentions(config.repo, config.mentionUsername, sinceDate);
            mentions.push(...issueMentions);
        }

        // Search for issues/PRs assigned to the user
        const assignedIssues = await this.searchAssignedIssues(config.repo, config.mentionUsername, sinceDate);
        mentions.push(...assignedIssues);

        // Search for reviews on PRs authored by the user
        if (this.shouldPollEventType(config, 'pull_request_review_comment')) {
            const prReviewMentions = await this.searchAuthoredPRReviews(
                config.repo, config.mentionUsername, sinceDate
            );
            mentions.push(...prReviewMentions);
        }

        // Sort by creation time descending (newest first)
        mentions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        // Filter by allowed users if configured
        if (config.allowedUsers.length > 0) {
            const allowed = new Set(config.allowedUsers.map(u => u.toLowerCase()));
            return mentions.filter(m => allowed.has(m.sender.toLowerCase()));
        }

        return mentions;
    }

    /**
     * Search for issue/PR comments mentioning the username.
     */
    private async searchIssueMentions(
        repo: string,
        username: string,
        since: string,
    ): Promise<DetectedMention[]> {
        try {
            // Use `involves:` instead of `mentions:` because GitHub's search index
            // ignores self-mentions (when a user @mentions themselves in a comment).
            // `involves:` is a superset covering author, assignee, mentions, and commenter.
            // The downstream `fetchRecentComments` filters to only comments containing @username.
            const query = `${this.repoQualifier(repo)} involves:${username} updated:>=${since.split('T')[0]}`;
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
                // For each issue/PR that mentions us, fetch recent comments to find the actual mention
                const number = item.number as number;
                const isPR = !!(item.pull_request);
                // Resolve the actual owner/repo from the item URL (needed when config.repo is an org/user)
                const itemRepo = this.resolveFullRepo(repo, (item.html_url as string) ?? '');
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
    private async fetchRecentComments(
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

                // Check for @mention
                if (this.containsMention(body, username)) {
                    mentions.push({
                        id: `comment-${comment.id}`,
                        type: isPR ? 'issue_comment' : 'issue_comment',
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
     * Uses `involves:` instead of `mentions:` to catch self-mentions (see searchIssueMentions).
     */
    private async searchNewIssueMentions(
        repo: string,
        username: string,
        since: string,
    ): Promise<DetectedMention[]> {
        try {
            const sinceDate = since.split('T')[0];
            const query = `${this.repoQualifier(repo)} involves:${username} is:issue created:>=${sinceDate}`;
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

                if (this.containsMention(body, username)) {
                    const htmlUrl = (item.html_url as string) ?? '';
                    const itemRepo = this.resolveFullRepo(repo, htmlUrl);
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
    private async searchAssignedIssues(
        repo: string,
        username: string,
        since: string,
    ): Promise<DetectedMention[]> {
        try {
            const sinceDate = since.split('T')[0];
            const query = `${this.repoQualifier(repo)} assignee:${username} is:open updated:>=${sinceDate}`;
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

                // Don't skip self-authored for assignments — if someone assigns
                // the agent to its own issue, it should still act on it.

                const htmlUrl = (item.html_url as string) ?? '';
                const itemRepo = this.resolveFullRepo(repo, htmlUrl);
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
    private async searchAuthoredPRReviews(
        repo: string,
        username: string,
        since: string,
    ): Promise<DetectedMention[]> {
        try {
            const sinceDate = since.split('T')[0];
            const query = `${this.repoQualifier(repo)} is:pr is:open author:${username} updated:>=${sinceDate}`;
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
                const fullRepo = this.resolveFullRepo(repo, prHtmlUrl);

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
    private async fetchPRReviews(
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
    private async fetchPRReviewComments(
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

    // ─── Dependency Checking ─────────────────────────────────────────────────

    /** Parse `<!-- blocked-by: #123 #456 -->` markers from an issue body. */
    private parseBlockedBy(body: string): number[] {
        const match = body.match(/<!--\s*blocked-by:\s*(.*?)\s*-->/);
        if (!match) return [];
        return [...match[1].matchAll(/#(\d+)/g)].map(m => parseInt(m[1]));
    }

    /** Check whether a GitHub issue is still open (cached, 5-min TTL). */
    private async isIssueOpen(repo: string, issueNumber: number): Promise<boolean> {
        const cacheKey = `${repo}#${issueNumber}`;
        const cached = this.issueStateCache.get(cacheKey);
        if (cached && Date.now() - cached.checkedAt < MentionPollingService.ISSUE_STATE_TTL_MS) {
            return cached.open;
        }

        const result = await this.runGh([
            'api', `repos/${repo}/issues/${issueNumber}`, '--jq', '.state',
        ]);
        const open = result.ok && result.stdout.trim() === 'open';
        this.issueStateCache.set(cacheKey, { open, checkedAt: Date.now() });
        return open;
    }

    /** Fetch the body of a GitHub issue (needed when mention.body is a comment, not the issue). */
    private async getIssueBody(repo: string, issueNumber: number): Promise<string> {
        const result = await this.runGh([
            'api', `repos/${repo}/issues/${issueNumber}`, '--jq', '.body',
        ]);
        return result.ok ? result.stdout : '';
    }

    /**
     * Check whether a mention's issue has open blockers (via `<!-- blocked-by: ... -->` markers).
     * Returns the list of still-open blocker issue numbers (empty = unblocked).
     */
    private async checkDependencies(repo: string, mention: DetectedMention): Promise<number[]> {
        // For issue_comment mentions, mention.body is the comment text, not the issue body.
        // We need the issue body to find the blocked-by marker.
        const issueBody = mention.type === 'issue_comment'
            ? await this.getIssueBody(repo, mention.number)
            : mention.body;

        const blockers = this.parseBlockedBy(issueBody);
        if (blockers.length === 0) return [];

        const openBlockers: number[] = [];
        for (const blocker of blockers) {
            if (await this.isIssueOpen(repo, blocker)) {
                openBlockers.push(blocker);
            }
        }
        return openBlockers;
    }

    // ─── Trigger Logic ──────────────────────────────────────────────────────

    /**
     * Process a detected mention — create an agent session.
     * Returns true if a session was actually created, false if skipped.
     */
    private async processMention(config: MentionPollingConfig, mention: DetectedMention): Promise<boolean> {
        // Rate limit per mention ID — prevents re-triggering the same mention
        // within 60s, but allows different mentions on the same config concurrently.
        const rateLimitKey = `${config.id}:${mention.id}`;
        if (this.dedup.has(TRIGGER_DEDUP_NS, rateLimitKey)) {
            log.debug('Skipping mention due to rate limit', { configId: config.id, mentionId: mention.id });
            return false;
        }

        const agent = getAgent(this.db, config.agentId);
        if (!agent) {
            log.error('Agent not found for polling config', { configId: config.id, agentId: config.agentId });
            return false;
        }

        // Resolve the actual owner/repo from the mention URL
        const fullRepo = this.resolveFullRepo(config.repo, mention.htmlUrl);

        // Guard: skip only if there's a currently *running* session for the same issue.
        // Idle sessions have finished — follow-up comments are legitimate new work.
        // Dedup of the *same* comment is handled by processedIds, not this guard.
        const sessionPrefix = `Poll: ${fullRepo} #${mention.number}:`;
        const existing = this.db.query(
            `SELECT id FROM sessions WHERE name LIKE ? AND status = 'running'`
        ).get(sessionPrefix + '%') as { id: string } | null;
        if (existing) {
            log.debug('Running session already exists for issue', { number: mention.number, existingId: existing.id });
            return false;
        }

        // Dependency check: skip if the issue has open blockers.
        // Returning false keeps the mention unprocessed so it retries next cycle.
        const openBlockers = await this.checkDependencies(fullRepo, mention);
        if (openBlockers.length > 0) {
            log.info('Skipping mention — blocked by open issues', {
                number: mention.number, blockers: openBlockers,
            });
            return false;
        }

        // Always create an agent session — the session is responsible for both
        // replying on GitHub AND deciding whether to create a work task for code
        // changes. This ensures the person who mentioned us always gets a reply.
        const prompt = this.buildPrompt(config, mention);

        this.dedup.markSeen(TRIGGER_DEDUP_NS, rateLimitKey);

        try {
            const session = createSession(this.db, {
                projectId: config.projectId,
                agentId: config.agentId,
                name: `Poll: ${fullRepo} #${mention.number}: ${mention.title.slice(0, 40)}`,
                initialPrompt: prompt,
                source: 'agent',
            });

            this.processManager.startProcess(session, prompt, { schedulerMode: true });

            incrementPollingTriggerCount(this.db, config.id);
            log.info('Polling triggered agent session', { configId: config.id, sessionId: session.id, mention: mention.id });

            this.emit({ type: 'mention_poll_trigger', data: { configId: config.id, mention, sessionId: session.id } });
            return true;
        } catch (err) {
            log.error('Failed to create session from mention poll', { error: err instanceof Error ? err.message : String(err) });
            return false;
        }
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    /**
     * Build the GitHub search qualifier for the repo field.
     * If it contains a '/' it's a specific repo (repo:owner/name).
     * Otherwise it's an org or user — use org: which covers both.
     */
    private repoQualifier(repo: string): string {
        if (repo.includes('/')) return `repo:${repo}`;
        return `org:${repo}`;
    }

    /**
     * Resolve the full owner/repo from the mention's HTML URL when the config
     * repo is just an org/user name (no '/').
     * e.g. config.repo="CorvidLabs", htmlUrl="https://github.com/CorvidLabs/site/..."
     *  → "CorvidLabs/site"
     */
    private resolveFullRepo(configRepo: string, htmlUrl: string): string {
        if (configRepo.includes('/')) return configRepo;
        try {
            const url = new URL(htmlUrl);
            const parts = url.pathname.split('/').filter(Boolean);
            if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
        } catch { /* ignore */ }
        return configRepo;
    }

    private shouldPollEventType(config: MentionPollingConfig, type: string): boolean {
        // If no filter set, poll all types
        if (config.eventFilter.length === 0) return true;
        return config.eventFilter.includes(type as MentionPollingConfig['eventFilter'][number]);
    }

    private containsMention(body: string, username: string): boolean {
        const regex = new RegExp(`(?:^|\\s|[^\\w])@${escapeRegex(username)}(?:\\s|$|[^\\w])`, 'i');
        return regex.test(body);
    }

    private filterNewMentions(mentions: DetectedMention[], processedIds: string[]): DetectedMention[] {
        if (processedIds.length === 0) return mentions;

        // Filter out any mention whose ID is in the processed set.
        // This handles assignments correctly: even old issues that get newly
        // assigned will be processed, because their ID (assigned-N) won't be
        // in the set until we actually process them.
        const seen = new Set(processedIds);
        return mentions.filter(m => !seen.has(m.id));
    }

    private buildPrompt(config: MentionPollingConfig, mention: DetectedMention): string {
        // Resolve the actual owner/repo from the mention URL when config.repo is an org/user name.
        // e.g. htmlUrl "https://github.com/CorvidLabs/site/pull/22#..." → "CorvidLabs/site"
        const repo = this.resolveFullRepo(config.repo, mention.htmlUrl);

        // ── Review feedback prompt (PRs authored by the agent) ────────────────
        const isReviewFeedback = mention.id.startsWith('review-') || mention.id.startsWith('reviewcomment-');
        if (isReviewFeedback) {
            return this.buildReviewFeedbackPrompt(repo, mention);
        }

        const contextType = mention.isPullRequest ? 'PR' : 'Issue';
        const isAssignment = mention.type === 'assignment';
        // corvid_create_work_task only works for the platform's own repo
        const isHomeRepo = repo === 'CorvidLabs/corvid-agent';

        const triggerLabel = isAssignment ? 'assigned to you' : '@mention detected';
        const commentType = mention.type === 'issues' ? 'issue body'
            : isAssignment ? 'assignment' : 'comment';

        const context = [
            `## GitHub ${contextType} — ${triggerLabel} via polling`,
            ``,
            `**Repository:** ${repo}`,
            `**${contextType}:** #${mention.number} "${mention.title}"`,
            `**${isAssignment ? 'Assigned' : mention.type === 'issues' ? 'Opened' : 'Comment'} by:** @${mention.sender}`,
            `**URL:** ${mention.htmlUrl}`,
            ``,
            `### ${mention.type === 'issues' ? 'Issue Body' : isAssignment ? `${contextType} Description` : 'Comment'}`,
            '```',
            mention.body,
            '```',
        ].join('\n');

        const replyCmd = mention.isPullRequest
            ? `gh pr comment ${mention.number} --repo ${repo} --body "YOUR RESPONSE"`
            : `gh issue comment ${mention.number} --repo ${repo} --body "YOUR RESPONSE"`;

        // For external repos, give explicit instructions to clone and work there.
        // Use a unique path per issue to avoid conflicts when multiple sessions run concurrently.
        const repoName = repo.split('/')[1];
        const workDir = `/tmp/${repoName}-issue-${mention.number}`;
        const codeChangeInstructions = isHomeRepo
            ? `Use \`corvid_create_work_task\` to implement changes on a branch and open a PR.`
            : [
                `This issue is in the **${repo}** repository (not corvid-agent). Do NOT use \`corvid_create_work_task\` — that only works for corvid-agent.`,
                `Instead, to make code changes:`,
                `  1. Clone the repo: \`gh repo clone ${repo} ${workDir}\``,
                `  2. \`cd ${workDir}\``,
                `  3. Create a branch: \`git checkout -b fix/issue-${mention.number}\``,
                `  4. Make your changes`,
                `  5. Commit and push: \`git add -A && git commit -m "fix: ..." && git push -u origin fix/issue-${mention.number}\``,
                `  6. Create a PR: \`gh pr create --repo ${repo} --title "..." --body "Fixes #${mention.number}"\``,
            ].join('\n');

        const assignmentSteps = [
            `1. Read the ${contextType.toLowerCase()} description to understand what's being asked.`,
            `2. Analyze the request and determine the best approach.`,
            `3. If code changes are needed:\n${codeChangeInstructions}`,
            `4. Post a comment acknowledging the assignment and explaining your plan or findings using: \`${replyCmd}\``,
        ];

        // Detect review requests so we can give the model explicit steps
        const isReviewRequest = mention.isPullRequest &&
            /\breview\b/i.test(mention.body);

        const reviewSteps = [
            `1. Run this EXACT command to get the diff:\n   \`run_command({"command": "gh pr diff ${mention.number} --repo ${repo}"})\``,
            `2. Read the diff output. Note: bugs, style issues, missing edge cases.`,
            `3. Run this command to submit your review (replace YOUR_REVIEW with your findings):\n   \`run_command({"command": "gh pr review ${mention.number} --repo ${repo} --approve --body \\"YOUR_REVIEW\\""})\``,
            `   Use --request-changes instead of --approve if you found serious issues.`,
            ``,
            `IMPORTANT: You are ONLY reviewing. Do NOT clone the repo, edit files, run git commands, or make any code changes. Only run the two gh commands above.`,
        ];

        const mentionSteps = isReviewRequest ? reviewSteps : [
            `1. Read the mention to understand the request.`,
            `2. If the comment is a simple ping (like "@username" with no question), reply with a brief greeting and offer to help.`,
            `3. If code changes are requested:\n${codeChangeInstructions}`,
            `4. Post your reply using: \`${replyCmd}\``,
        ];

        const instructions = [
            ``,
            `## Instructions`,
            ``,
            isAssignment
                ? `You were assigned to the above GitHub ${contextType.toLowerCase()}. This is a NEW assignment that you have NOT responded to yet.`
                : `You were @mentioned in the above GitHub ${commentType}. This is a NEW mention that you have NOT responded to yet.`,
            `You MUST post a reply comment — do not skip this step.`,
            ``,
            `Steps:`,
            ...(isAssignment ? assignmentSteps : mentionSteps),
            ``,
            `Rules:`,
            `- You MUST run the \`gh\` command above to post a comment. This is mandatory — the user will not see your response otherwise.`,
            `- Before posting your comment, check if you or another agent already replied by running:`,
            `  \`gh issue view ${mention.number} --repo ${repo} --comments\``,
            `  If a substantive reply already exists (not just the original post), do NOT post a duplicate.`,
            `- Do NOT assume you have already replied. You have not. This is a fresh session created specifically for this ${isAssignment ? 'assignment' : 'mention'}.`,
            `- Be concise, helpful, and professional.`,
        ].join('\n');

        return context + instructions;
    }

    /**
     * Build a prompt for review feedback on a PR authored by the agent.
     * Unlike mention prompts, this checks out the existing PR branch and pushes fixes.
     */
    private buildReviewFeedbackPrompt(repo: string, mention: DetectedMention): string {
        const repoName = repo.split('/')[1];
        const workDir = `/tmp/${repoName}-pr-${mention.number}`;
        const replyCmd = `gh pr comment ${mention.number} --repo ${repo} --body "YOUR RESPONSE"`;

        const context = [
            `## GitHub PR Review Feedback — detected via polling`,
            ``,
            `**Repository:** ${repo}`,
            `**PR:** #${mention.number} "${mention.title}"`,
            `**Review by:** @${mention.sender}`,
            `**URL:** ${mention.htmlUrl}`,
            ``,
            `### Triggering Review/Comment`,
            '```',
            mention.body,
            '```',
        ].join('\n');

        const instructions = [
            ``,
            `## Instructions`,
            ``,
            `A reviewer left feedback on your PR #${mention.number}. This PR was authored by you.`,
            `You MUST address the feedback and reply — do not skip this step.`,
            ``,
            `Steps:`,
            `1. Clone the repo and check out the PR branch:`,
            `   \`gh repo clone ${repo} ${workDir} && cd ${workDir} && gh pr checkout ${mention.number}\``,
            `2. Read ALL review comments on this PR to understand the full feedback:`,
            `   \`gh pr view ${mention.number} --repo ${repo} --comments\``,
            `   \`gh api repos/${repo}/pulls/${mention.number}/reviews\``,
            `   \`gh api repos/${repo}/pulls/${mention.number}/comments\``,
            `3. Check recent commits to see if feedback has already been addressed:`,
            `   \`git log --oneline -5\``,
            `   If the feedback is already addressed by a recent commit, skip to step 6.`,
            `4. If changes are requested, make the fixes on the EXISTING branch:`,
            `   - Edit the relevant files`,
            `   - Commit: \`git add -A && git commit -m "address review feedback"\``,
            `   - Push to the existing branch: \`git push\``,
            `   Do NOT create a new PR — push to the existing branch.`,
            `5. If the review is an approval with no action items, skip to step 6.`,
            `6. Post a reply comment using: \`${replyCmd}\``,
            `   - If you made changes, summarize what you fixed.`,
            `   - If it was an approval, reply with a brief thank-you.`,
            `   - If feedback was already addressed, note that and point to the relevant commit.`,
            ``,
            `Rules:`,
            `- You MUST run the \`gh\` command above to post a comment. This is mandatory — the reviewer will not see your response otherwise.`,
            `- Before posting, check if you already replied by running:`,
            `  \`gh pr view ${mention.number} --repo ${repo} --comments\``,
            `  If a substantive reply already exists, do NOT post a duplicate.`,
            `- Do NOT create a new PR. Push fixes to the existing branch.`,
            `- Be concise, helpful, and professional.`,
        ].join('\n');

        return context + instructions;
    }

    private async runGh(args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string }> {
        if (!process.env.GH_TOKEN) {
            return { ok: false, stdout: '', stderr: 'GH_TOKEN not configured' };
        }

        try {
            const proc = Bun.spawn(['gh', ...args], {
                stdout: 'pipe',
                stderr: 'pipe',
                env: buildSafeGhEnv(),
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

    private emit(event: { type: string; data: unknown }): void {
        for (const cb of this.eventCallbacks) {
            try {
                cb(event as Parameters<PollingEventCallback>[0]);
            } catch (err) {
                log.error('Polling event callback error', { error: err instanceof Error ? err.message : String(err) });
            }
        }
    }
}

/** Escape special regex characters in a string. */
function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

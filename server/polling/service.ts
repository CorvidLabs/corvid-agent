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
import { buildSafeGhEnv } from '../lib/env';

const log = createLogger('MentionPoller');

/** How often we check which configs are due (main loop interval). */
const POLL_LOOP_INTERVAL_MS = 15_000; // 15 seconds

/** Max concurrent polls to avoid hammering the GitHub API. */
const MAX_CONCURRENT_POLLS = 3;

/** Rate limit: minimum gap between triggers for the same config. */
const MIN_TRIGGER_GAP_MS = 60_000;

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

export class MentionPollingService {
    private db: Database;
    private processManager: ProcessManager;
    private loopTimer: ReturnType<typeof setInterval> | null = null;
    private activePolls = new Set<string>(); // config IDs currently being polled
    private recentTriggers = new Map<string, number>(); // configId -> last trigger timestamp
    private eventCallbacks = new Set<PollingEventCallback>();
    private running = false;

    constructor(
        db: Database,
        processManager: ProcessManager,
        _workTaskService?: unknown,
    ) {
        this.db = db;
        this.processManager = processManager;
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
    }

    /** Stop the polling loop. */
    stop(): void {
        this.running = false;
        if (this.loopTimer) {
            clearInterval(this.loopTimer);
            this.loopTimer = null;
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

    /**
     * Poll a single config for new @mentions.
     */
    private async pollConfig(config: MentionPollingConfig): Promise<void> {
        if (this.activePolls.has(config.id)) return;
        this.activePolls.add(config.id);

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
            for (const mention of dedupedMentions) {
                await this.processMention(config, mention);
                // Collect ALL mention IDs for this issue number (comment-X, issue-N, assigned-N)
                // so duplicates from other search paths don't reappear.
                const relatedIds = newMentions.filter(m => m.number === mention.number).map(m => m.id);
                config.processedIds = [...config.processedIds, ...relatedIds];
                updateProcessedIds(this.db, config.id, config.processedIds);
            }

            // Also update lastSeenId to the newest for backward compat
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
            // Use the GitHub search API for issues/PRs mentioning the user in the repo
            // This finds issues/PRs where the user is mentioned (including in comments)
            const query = `${this.repoQualifier(repo)} mentions:${username} updated:>=${since.split('T')[0]}`;
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

                // Skip own comments (prevent infinite loops)
                if (commentUser.toLowerCase() === username.toLowerCase()) continue;

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
     */
    private async searchNewIssueMentions(
        repo: string,
        username: string,
        since: string,
    ): Promise<DetectedMention[]> {
        try {
            const sinceDate = since.split('T')[0];
            const query = `${this.repoQualifier(repo)} mentions:${username} is:issue created:>=${sinceDate}`;
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

                // Skip own issues
                if (sender.toLowerCase() === username.toLowerCase()) continue;

                if (this.containsMention(body, username)) {
                    mentions.push({
                        id: `issue-${item.number}`,
                        type: 'issues',
                        body,
                        sender,
                        number: item.number as number,
                        title: (item.title as string) ?? '',
                        htmlUrl: (item.html_url as string) ?? '',
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

                mentions.push({
                    id: `assigned-${item.number}`,
                    type: 'assignment',
                    body,
                    sender,
                    number: item.number as number,
                    title: (item.title as string) ?? '',
                    htmlUrl: (item.html_url as string) ?? '',
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

    // ─── Trigger Logic ──────────────────────────────────────────────────────

    /**
     * Process a detected mention — create an agent session.
     * Returns true if a session was actually created, false if skipped.
     */
    private async processMention(config: MentionPollingConfig, mention: DetectedMention): Promise<boolean> {
        // Rate limit per mention ID — prevents re-triggering the same mention
        // within 60s, but allows different mentions on the same config concurrently.
        const rateLimitKey = `${config.id}:${mention.id}`;
        const lastTrigger = this.recentTriggers.get(rateLimitKey);
        if (lastTrigger && (Date.now() - lastTrigger) < MIN_TRIGGER_GAP_MS) {
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
        const repoShortName = fullRepo.includes('/') ? fullRepo.split('/')[1] : fullRepo;

        // Guard: skip if there's already a running or recently completed session for this issue
        const sessionPrefix = `Poll: ${repoShortName} #${mention.number}:`;
        const existing = this.db.query(
            `SELECT id FROM sessions WHERE name LIKE ? AND status IN ('running', 'idle', 'completed') AND created_at > datetime('now', '-1 hour')`
        ).get(sessionPrefix + '%') as { id: string } | null;
        if (existing) {
            log.debug('Active session already exists for issue', { number: mention.number, existingId: existing.id });
            return false;
        }

        // Always create an agent session — the session is responsible for both
        // replying on GitHub AND deciding whether to create a work task for code
        // changes. This ensures the person who mentioned us always gets a reply.
        const prompt = this.buildPrompt(config, mention);

        this.recentTriggers.set(rateLimitKey, Date.now());

        try {
            const session = createSession(this.db, {
                projectId: config.projectId,
                agentId: config.agentId,
                name: `Poll: ${repoShortName} #${mention.number}: ${mention.title.slice(0, 40)}`,
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

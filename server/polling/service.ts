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
 *
 * Auto-merge, CI retry, and auto-update concerns are delegated to:
 * - ./auto-merge.ts — squash-merge passing PRs
 * - ./ci-retry.ts — spawn fix sessions for CI failures
 * - ./auto-update.ts — pull new commits and restart
 */

import type { Database } from 'bun:sqlite';
import type { MentionPollingConfig } from '../../shared/types';
import { getAgent } from '../db/agents';
import { isGitHubUserAllowed } from '../db/github-allowlist';
import {
  findDuePollingConfigs,
  incrementPollingTriggerCount,
  updatePollState,
  updateProcessedIds,
} from '../db/mention-polling';
import { isRepoBlocked } from '../db/repo-blocklist';
import { findSchedulesForEvent } from '../db/schedules';
import { createSession } from '../db/sessions';
import { isRepoOffLimits } from '../github/off-limits';
import { addIssueComment } from '../github/operations';
import { DedupService } from '../lib/dedup';
import { buildSafeGhEnv } from '../lib/env';
import { createLogger } from '../lib/logger';
import { scanGitHubContent } from '../lib/prompt-injection';
import { createEventContext, runWithEventContext } from '../observability/event-context';
import type { ProcessManager } from '../process/manager';
import type { SchedulerService } from '../scheduler/service';
import { AutoMergeService } from './auto-merge';
import { AutoUpdateService } from './auto-update';
import { CIRetryService } from './ci-retry';
import { type DetectedMention, filterNewMentions, GitHubSearcher, resolveFullRepo } from './github-searcher';

const log = createLogger('MentionPoller');
const TRIGGER_DEDUP_NS = 'polling:triggers';
const ACK_DEDUP_NS = 'polling:ack-comments';
const SESSION_DEDUP_NS = 'polling:session-dedup';

/** How often we check which configs are due (main loop interval). */
const POLL_LOOP_INTERVAL_MS = 15_000; // 15 seconds

/** Max concurrent polls to avoid hammering the GitHub API. */
const MAX_CONCURRENT_POLLS = 3;

/** Rate limit: minimum gap between triggers for the same config. */
const MIN_TRIGGER_GAP_MS = 60_000;

/** Max sessions spawned per config per poll cycle — prevents stampede. */
const MAX_TRIGGERS_PER_CYCLE = 5;

type PollingEventCallback = (event: { type: 'mention_poll_trigger'; data: unknown }) => void;

export class MentionPollingService {
  private db: Database;
  private processManager: ProcessManager;
  private loopTimer: ReturnType<typeof setInterval> | null = null;
  private activePolls = new Set<string>(); // config IDs currently being polled
  private dedup = DedupService.global();
  private schedulerService: SchedulerService | null = null;
  private eventCallbacks = new Set<PollingEventCallback>();
  private running = false;

  /** Cache: "owner/repo#123" → { open, checkedAt } */
  private issueStateCache = new Map<string, { open: boolean; checkedAt: number }>();
  private static readonly ISSUE_STATE_TTL_MS = 5 * 60 * 1000; // 5 min

  /** Extracted GitHub search module — handles mention/assignment/review searches. */
  private searcher: GitHubSearcher;

  /** Delegated sub-services. */
  private autoMerge: AutoMergeService;
  private ciRetry: CIRetryService;
  private autoUpdate: AutoUpdateService;

  constructor(db: Database, processManager: ProcessManager, _workTaskService?: unknown) {
    this.db = db;
    this.processManager = processManager;
    // Rate limit triggers: 60s TTL matches MIN_TRIGGER_GAP_MS, bounded at 500 entries
    this.dedup.register(TRIGGER_DEDUP_NS, { maxSize: 500, ttlMs: MIN_TRIGGER_GAP_MS });
    // Cross-config dedup for ack comments: same repo#number only gets one "looking into this"
    this.dedup.register(ACK_DEDUP_NS, { maxSize: 500, ttlMs: 5 * 60 * 1000 });
    // Cross-config dedup for sessions: same repo#number only gets one session across all configs
    this.dedup.register(SESSION_DEDUP_NS, { maxSize: 500, ttlMs: 5 * 60 * 1000 });
    this.searcher = new GitHubSearcher((args) => this.runGh(args));

    // Initialize sub-services
    this.autoMerge = new AutoMergeService(db, (args) => this.runGh(args));
    this.ciRetry = new CIRetryService(db, processManager, (args) => this.runGh(args));
    this.autoUpdate = new AutoUpdateService(db);
  }

  /** Set scheduler service for triggering event-based schedules. */
  setSchedulerService(service: SchedulerService): void {
    this.schedulerService = service;
  }

  /** Subscribe to polling events (for WebSocket broadcast). */
  onEvent(callback: PollingEventCallback): () => void {
    this.eventCallbacks.add(callback);
    return () => this.eventCallbacks.delete(callback);
  }

  /** Start the polling loop and all sub-services. */
  start(): void {
    if (this.running) return;
    this.running = true;

    log.info('Mention polling service started');

    // Run immediately on start, then on interval
    this.pollDueConfigs();
    this.loopTimer = setInterval(() => this.pollDueConfigs(), POLL_LOOP_INTERVAL_MS);

    // Start sub-services
    this.autoMerge.start();
    this.ciRetry.start();
    this.autoUpdate.start();
  }

  /** Stop the polling loop and all sub-services. */
  stop(): void {
    this.running = false;
    if (this.loopTimer) {
      clearInterval(this.loopTimer);
      this.loopTimer = null;
    }

    this.autoMerge.stop();
    this.ciRetry.stop();
    this.autoUpdate.stop();

    log.info('Mention polling service stopped');
  }

  /** Get polling stats for the dashboard. */
  getStats(): { isRunning: boolean; activeConfigs: number; totalConfigs: number; totalTriggers: number } {
    try {
      const row = this.db
        .query(`
                SELECT
                    COUNT(*) as total,
                    COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
                    COALESCE(SUM(trigger_count), 0) as triggers
                FROM mention_polling_configs
            `)
        .get() as { total: number; active: number; triggers: number } | null;
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

      // Clear the global review cache so each poll cycle gets fresh results
      this.searcher.clearGlobalReviewCache();

      // Process up to MAX_CONCURRENT_POLLS at once
      const batch = dueConfigs.filter((c) => !this.activePolls.has(c.id)).slice(0, MAX_CONCURRENT_POLLS);

      const promises = batch.map((config) => this.pollConfig(config));
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

    const ctx = createEventContext('polling');
    return runWithEventContext(ctx, async () => {
      try {
        log.debug('Polling config', {
          id: config.id,
          repo: config.repo,
          username: config.mentionUsername,
          lastPollAt: config.lastPollAt,
          lastSeenId: config.lastSeenId,
          processedIds: config.processedIds.length,
        });

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
        const newMentions = filterNewMentions(mentions, config.processedIds);
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
              configId: config.id,
              deferred: dedupedMentions.length - triggeredThisCycle,
            });
            break;
          }
          const triggered = await this.processMention(config, mention);
          if (triggered) {
            triggeredThisCycle++;
            // Collect ALL mention IDs for this issue number (comment-X, issue-N, assigned-N)
            // so duplicates from other search paths don't reappear.
            const relatedIds = newMentions.filter((m) => m.number === mention.number).map((m) => m.id);
            config.processedIds = [...config.processedIds, ...relatedIds];
            updateProcessedIds(this.db, config.id, config.processedIds);
          }
        }

        // Fire matching event-based schedules
        if (this.schedulerService && triggeredThisCycle > 0) {
          try {
            const matching = findSchedulesForEvent(this.db, 'github_poll', 'mention', config.repo);
            for (const schedule of matching) {
              this.schedulerService.triggerNow(schedule.id).catch((err) => {
                log.debug('Event-triggered schedule failed', {
                  scheduleId: schedule.id,
                  error: err instanceof Error ? err.message : String(err),
                });
              });
            }
          } catch (err) {
            log.debug('Failed to check event-based schedules', {
              error: err instanceof Error ? err.message : String(err),
            });
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
   * Delegates to the extracted GitHubSearcher module.
   */
  private async fetchMentions(config: MentionPollingConfig): Promise<DetectedMention[]> {
    return this.searcher.fetchMentions(config, (sender) => isGitHubUserAllowed(this.db, sender));
  }

  // ─── Dependency Checking ─────────────────────────────────────────────────

  /** Parse `<!-- blocked-by: #123 #456 -->` markers from an issue body. */
  private parseBlockedBy(body: string): number[] {
    const match = body.match(/<!--\s*blocked-by:\s*(.*?)\s*-->/);
    if (!match) return [];
    return [...match[1].matchAll(/#(\d+)/g)].map((m) => parseInt(m[1], 10));
  }

  /** Check whether a GitHub issue is still open (cached, 5-min TTL). */
  private async isIssueOpen(repo: string, issueNumber: number): Promise<boolean> {
    const cacheKey = `${repo}#${issueNumber}`;
    const cached = this.issueStateCache.get(cacheKey);
    if (cached && Date.now() - cached.checkedAt < MentionPollingService.ISSUE_STATE_TTL_MS) {
      return cached.open;
    }

    const result = await this.runGh(['api', `repos/${repo}/issues/${issueNumber}`, '--jq', '.state']);
    const open = result.ok && result.stdout.trim() === 'open';
    this.issueStateCache.set(cacheKey, { open, checkedAt: Date.now() });
    return open;
  }

  /** Fetch the assignee logins for a GitHub issue/PR. */
  private async getIssueAssignees(repo: string, issueNumber: number): Promise<string[]> {
    const result = await this.runGh(['api', `repos/${repo}/issues/${issueNumber}`, '--jq', '[.assignees[].login]']);
    if (!result.ok) return [];
    try {
      const parsed = JSON.parse(result.stdout);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /** Fetch the body of a GitHub issue (needed when mention.body is a comment, not the issue). */
  private async getIssueBody(repo: string, issueNumber: number): Promise<string> {
    const result = await this.runGh(['api', `repos/${repo}/issues/${issueNumber}`, '--jq', '.body']);
    return result.ok ? result.stdout : '';
  }

  /**
   * Check whether a mention's issue has open blockers (via `<!-- blocked-by: ... -->` markers).
   * Returns the list of still-open blocker issue numbers (empty = unblocked).
   */
  private async checkDependencies(repo: string, mention: DetectedMention): Promise<number[]> {
    // For issue_comment mentions, mention.body is the comment text, not the issue body.
    // We need the issue body to find the blocked-by marker.
    const issueBody = mention.type === 'issue_comment' ? await this.getIssueBody(repo, mention.number) : mention.body;

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
      log.debug('Skipping mention — rate limit dedup', {
        configId: config.id,
        mentionId: mention.id,
        number: mention.number,
      });
      return false;
    }

    const agent = getAgent(this.db, config.agentId);
    if (!agent) {
      log.error('Agent not found for polling config', { configId: config.id, agentId: config.agentId });
      return false;
    }

    // Resolve the actual owner/repo from the mention URL
    const fullRepo = resolveFullRepo(config.repo, mention.htmlUrl);

    // Repo blocklist guard: skip mentions from repos that don't want our contributions
    if (isRepoBlocked(this.db, fullRepo) || isRepoOffLimits(fullRepo)) {
      log.info('Skipping mention — repo is blocklisted or off-limits', { repo: fullRepo, number: mention.number });
      return false;
    }

    // Guard: skip only if there's a currently *running* session for the same issue.
    // Idle sessions have finished — follow-up comments are legitimate new work.
    // Dedup of the *same* comment is handled by processedIds, not this guard.
    const sessionPrefix = `Poll: ${fullRepo} #${mention.number}:`;
    const existing = this.db
      .query(`SELECT id FROM sessions WHERE name LIKE ? AND status = 'running'`)
      .get(`${sessionPrefix}%`) as { id: string } | null;
    if (existing) {
      log.debug('Skipping mention — running session exists', {
        number: mention.number,
        existingId: existing.id,
        mentionId: mention.id,
      });
      return false;
    }

    // Cross-config dedup: if another config already triggered a session for the
    // same repo#number within the TTL window, skip. This prevents multiple
    // polling configs from independently reacting to the same PR review/comment.
    const sessionDedupKey = `${fullRepo}#${mention.number}`;
    if (this.dedup.has(SESSION_DEDUP_NS, sessionDedupKey)) {
      log.debug('Skipping mention — cross-config session dedup', {
        configId: config.id,
        mentionId: mention.id,
        number: mention.number,
        repo: fullRepo,
      });
      return false;
    }

    // Dependency check: skip if the issue has open blockers.
    // Returning false keeps the mention unprocessed so it retries next cycle.
    const openBlockers = await this.checkDependencies(fullRepo, mention);
    if (openBlockers.length > 0) {
      log.info('Skipping mention — blocked by open issues', {
        number: mention.number,
        blockers: openBlockers,
      });
      return false;
    }

    // Human-assignment guard: skip if the issue/PR is assigned to someone
    // other than the bot. Respect human ownership — only work on things
    // assigned to us, mentioned on, or explicitly requested.
    const isAssignment = mention.type === 'assignment';
    const isPullRequest = mention.type === 'pull_request' || mention.type === 'review_request';
    if (!isAssignment && !isPullRequest) {
      const assignees = await this.getIssueAssignees(fullRepo, mention.number);
      const botUsername = config.mentionUsername;
      const assignedToOthers = assignees.filter((a) => a !== botUsername);
      if (assignedToOthers.length > 0 && !assignees.includes(botUsername)) {
        log.info('Skipping mention — issue assigned to human(s)', {
          number: mention.number,
          assignees: assignedToOthers,
        });
        return false;
      }
    }

    // Block mentions with HIGH/CRITICAL injection confidence before creating a session.
    // Skip injection scanning for mentions authored by the bot itself — its own
    // issues legitimately contain code blocks, shell commands, and SQL.
    if (mention.sender !== config.mentionUsername) {
      const injectionScan = scanGitHubContent(mention.body);
      if (injectionScan.blocked) {
        log.warn('Blocked mention: prompt injection detected', {
          configId: config.id,
          mentionId: mention.id,
          sender: mention.sender,
          confidence: injectionScan.confidence,
          patterns: injectionScan.matches.map((m) => m.pattern),
        });
        // Mark as processed to prevent infinite retry loop
        return true;
      }
    }

    // Always create an agent session — the session is responsible for both
    // replying on GitHub AND deciding whether to create a work task for code
    // changes. This ensures the person who mentioned us always gets a reply.
    const prompt = this.buildPrompt(config, mention);

    this.dedup.markSeen(TRIGGER_DEDUP_NS, rateLimitKey);
    this.dedup.markSeen(SESSION_DEDUP_NS, sessionDedupKey);

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

      // Post an immediate acknowledgment on GitHub and subscribe
      // to session end events to guarantee a follow-up comment.
      const agentName = getAgent(this.db, config.agentId)?.name ?? 'corvid-agent';

      // Skip ack when the agent is the PR/issue author (no need to announce
      // "looking into this" on your own PR), and cross-config dedup so
      // multiple configs polling the same mention only post one ack.
      const ackKey = `${fullRepo}#${mention.number}`;
      const isOwnPR = mention.sender.toLowerCase() === config.mentionUsername.toLowerCase();
      if (!isOwnPR && !this.dedup.has(ACK_DEDUP_NS, ackKey)) {
        this.dedup.markSeen(ACK_DEDUP_NS, ackKey);
        const ackBody = `👋 **${agentName}** is looking into this.`;
        addIssueComment(fullRepo, mention.number, ackBody).catch((err) => {
          log.warn('Failed to post acknowledgment comment', {
            repo: fullRepo,
            number: mention.number,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }

      // Guarantee follow-up: when the session ends (success or failure),
      // post a completion comment. This fires even if the agent itself
      // forgot to comment, crashed, or timed out.
      this.subscribeForCompletion(session.id, fullRepo, mention.number, agentName);

      this.emit({ type: 'mention_poll_trigger', data: { configId: config.id, mention, sessionId: session.id } });
      return true;
    } catch (err) {
      log.error('Failed to create session from mention poll', {
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  // ─── Session completion tracking ──────────────────────────────────────────

  /**
   * Subscribe to a session's end events and post a GitHub comment on failure.
   * On normal exit the agent itself posts a substantive reply, so no extra
   * comment is needed. On error or manual stop, post a follow-up so the
   * issue doesn't go silent after the acknowledgment.
   */
  private subscribeForCompletion(sessionId: string, repo: string, issueNumber: number, agentName: string): void {
    let fired = false;
    const postCompletion = (body: string) => {
      if (fired) return;
      fired = true;
      addIssueComment(repo, issueNumber, body).catch((err) => {
        log.warn('Failed to post completion comment', {
          repo,
          number: issueNumber,
          sessionId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    };

    this.processManager.subscribe(sessionId, (_sid, event) => {
      if (event.type === 'session_error') {
        const errMsg = (event as { error?: { message?: string } }).error?.message ?? 'unknown error';
        postCompletion(`⚠️ **${agentName}** ran into an issue while working on this: ${errMsg}`);
      } else if (event.type === 'session_stopped') {
        postCompletion(`🛑 **${agentName}**'s session was stopped before completion.`);
      }
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private buildPrompt(config: MentionPollingConfig, mention: DetectedMention): string {
    // Resolve the actual owner/repo from the mention URL when config.repo is an org/user name.
    // e.g. htmlUrl "https://github.com/CorvidLabs/site/pull/22#..." → "CorvidLabs/site"
    const repo = resolveFullRepo(config.repo, mention.htmlUrl);

    // ── Review feedback prompt (PRs authored by the agent) ────────────────
    const isReviewFeedback = mention.id.startsWith('review-') || mention.id.startsWith('reviewcomment-');
    if (isReviewFeedback) {
      return this.buildReviewFeedbackPrompt(repo, mention);
    }

    const contextType = mention.isPullRequest ? 'PR' : 'Issue';
    const isAssignment = mention.type === 'assignment';
    const isPullRequestReview = mention.type === 'pull_request' || mention.type === 'review_request';
    // corvid_create_work_task only works for the platform's own repo
    const homeRepo =
      process.env.GITHUB_OWNER && process.env.GITHUB_REPO
        ? `${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}`
        : '';
    const isHomeRepo = homeRepo !== '' && repo === homeRepo;

    const triggerLabel = isAssignment
      ? 'assigned to you'
      : isPullRequestReview
        ? 'review requested'
        : '@mention detected';
    const commentType =
      mention.type === 'issues'
        ? 'issue body'
        : isAssignment
          ? 'assignment'
          : isPullRequestReview
            ? 'PR description'
            : 'comment';

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
    const isReviewRequest = isPullRequestReview || (mention.isPullRequest && /\breview\b/i.test(mention.body));

    const reviewSteps = [
      `1. Run this EXACT command to get the diff:\n   \`run_command({"command": "gh pr diff ${mention.number} --repo ${repo}"})\``,
      `2. Read the diff output. Note: bugs, style issues, missing edge cases.`,
      `3. Run this command to submit your review (replace YOUR_REVIEW with your findings):\n   \`run_command({"command": "gh pr review ${mention.number} --repo ${repo} --approve --body \\"YOUR_REVIEW\\""})\``,
      `   Use --request-changes instead of --approve if you found serious issues.`,
      ``,
      `IMPORTANT: You are ONLY reviewing. Do NOT clone the repo, edit files, run git commands, or make any code changes. Only run the two gh commands above.`,
    ];

    const mentionSteps = isReviewRequest
      ? reviewSteps
      : [
          `1. Read the mention to understand the request.`,
          `2. If the comment is a simple ping (like "@username" with no question), reply with a brief greeting and offer to help.`,
          `3. If code changes are requested:\n${codeChangeInstructions}`,
          `4. Post your reply using: \`${replyCmd}\``,
        ];

    // Scan for social engineering / injection in the mention body
    const scan = scanGitHubContent(mention.body);
    const warningBlock = scan.warning ? `\n\n${scan.warning}\n` : '';

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

    return context + warningBlock + instructions;
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

    // Scan for social engineering / injection in the review body
    const scan = scanGitHubContent(mention.body);
    const warningBlock = scan.warning ? `\n\n${scan.warning}\n` : '';

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

    return context + warningBlock + instructions;
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

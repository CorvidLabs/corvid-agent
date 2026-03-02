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
import type { SchedulerService } from '../scheduler/service';
import type { MentionPollingConfig } from '../../shared/types';
import { findSchedulesForEvent } from '../db/schedules';
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
import { scanGitHubContent } from '../lib/prompt-injection';
import { DedupService } from '../lib/dedup';
import { buildSafeGhEnv } from '../lib/env';
import { createEventContext, runWithEventContext } from '../observability/event-context';
import { isGitHubUserAllowed } from '../db/github-allowlist';
import {
    GitHubSearcher,
    filterNewMentions,
    resolveFullRepo,
    type DetectedMention,
} from './github-searcher';

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

// DetectedMention type imported from ./github-searcher

type PollingEventCallback = (event: {
    type: 'mention_poll_trigger';
    data: unknown;
}) => void;

/** How often to check for mergeable PRs (auto-merge loop). */
const AUTO_MERGE_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

/** How often to check for CI-failed PRs and spawn fix sessions. */
const CI_RETRY_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

/** Cooldown per PR before spawning another CI-fix session. */
const CI_RETRY_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

/** How often to check if origin/main has new commits. */
const AUTO_UPDATE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export class MentionPollingService {
    private db: Database;
    private processManager: ProcessManager;
    private loopTimer: ReturnType<typeof setInterval> | null = null;
    private autoMergeTimer: ReturnType<typeof setInterval> | null = null;
    private ciRetryTimer: ReturnType<typeof setInterval> | null = null;
    private autoUpdateTimer: ReturnType<typeof setInterval> | null = null;
    /** Tracks last CI-fix session spawn time per "repo#number" to enforce cooldown. */
    private ciRetryLastSpawn = new Map<string, number>();
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

    constructor(
        db: Database,
        processManager: ProcessManager,
        _workTaskService?: unknown,
    ) {
        this.db = db;
        this.processManager = processManager;
        // Rate limit triggers: 60s TTL matches MIN_TRIGGER_GAP_MS, bounded at 500 entries
        this.dedup.register(TRIGGER_DEDUP_NS, { maxSize: 500, ttlMs: MIN_TRIGGER_GAP_MS });
        this.searcher = new GitHubSearcher((args) => this.runGh(args));
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

        // CI retry loop: spawn fix sessions for PRs with failed CI
        this.ciRetryTimer = setInterval(() => this.retryFailedCIPRs(), CI_RETRY_INTERVAL_MS);

        // Auto-update loop: pull new commits and restart when sessions are idle
        this.autoUpdateTimer = setInterval(() => this.checkForUpdates(), AUTO_UPDATE_INTERVAL_MS);
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
        if (this.ciRetryTimer) {
            clearInterval(this.ciRetryTimer);
            this.ciRetryTimer = null;
        }
        if (this.autoUpdateTimer) {
            clearInterval(this.autoUpdateTimer);
            this.autoUpdateTimer = null;
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
            const prRepo = resolveFullRepo(repo, prUrl);

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

    // ─── CI Retry Loop ─────────────────────────────────────────────────

    /**
     * Find open PRs authored by the agent with failed CI and spawn sessions
     * to fix them. Runs every 10 minutes with a 30-minute per-PR cooldown.
     */
    private async retryFailedCIPRs(): Promise<void> {
        if (!this.running) return;

        try {
            const allConfigs = this.db.query(
                `SELECT repo, mention_username, agent_id, project_id FROM mention_polling_configs WHERE status = 'active'`
            ).all() as Array<{ repo: string; mention_username: string; agent_id: string; project_id: string }>;

            const seen = new Set<string>();
            for (const c of allConfigs) {
                const key = `${c.repo}:${c.mention_username}`;
                if (seen.has(key)) continue;
                seen.add(key);
                await this.retryFailedCIForRepo(c.repo, c.mention_username, c.agent_id, c.project_id);
            }
        } catch (err) {
            log.error('Error in CI retry loop', { error: err instanceof Error ? err.message : String(err) });
        }
    }

    /**
     * For a specific repo, find open PRs by the agent with failed CI and spawn fix sessions.
     */
    private async retryFailedCIForRepo(
        repo: string, username: string, agentId: string, projectId: string,
    ): Promise<void> {
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

        for (const pr of prs) {
            const prNumber = pr.number as number;
            const prTitle = (pr.title as string) ?? '';
            const prUrl = (pr.html_url as string) ?? '';
            const prRepo = resolveFullRepo(repo, prUrl);
            const cooldownKey = `${prRepo}#${prNumber}`;

            // Enforce cooldown
            const lastSpawn = this.ciRetryLastSpawn.get(cooldownKey);
            if (lastSpawn && Date.now() - lastSpawn < CI_RETRY_COOLDOWN_MS) continue;

            // Skip if there's already a running session for this PR
            const sessionPrefix = `Poll: ${prRepo} #${prNumber}:`;
            const existing = this.db.query(
                `SELECT id FROM sessions WHERE name LIKE ? AND status = 'running'`
            ).get(sessionPrefix + '%') as { id: string } | null;
            if (existing) continue;

            // Check CI status — only act on failures (not pending/success)
            const statusResult = await this.runGh([
                'pr', 'checks', String(prNumber),
                '--repo', prRepo,
                '--json', 'state,name',
                '--jq', '[.[] | {name, state}]',
            ]);

            if (!statusResult.ok || !statusResult.stdout.trim()) continue;

            const checks = JSON.parse(statusResult.stdout) as Array<{ name: string; state: string }>;
            const hasFailure = checks.some(c => c.state === 'FAILURE');
            const hasPending = checks.some(c => c.state === 'PENDING' || c.state === 'QUEUED' || c.state === 'IN_PROGRESS');
            if (!hasFailure || hasPending) continue;

            // Get failed check names for the prompt
            const failedChecks = checks.filter(c => c.state === 'FAILURE').map(c => c.name);

            log.info('Spawning CI-fix session for failing PR', {
                repo: prRepo, number: prNumber, failedChecks,
            });

            this.ciRetryLastSpawn.set(cooldownKey, Date.now());
            await this.spawnCIFixSession(prRepo, prNumber, prTitle, failedChecks, agentId, projectId);
        }
    }

    /**
     * Create a session that checks out a PR branch and fixes CI failures.
     */
    private async spawnCIFixSession(
        repo: string, prNumber: number, prTitle: string,
        failedChecks: string[], agentId: string, projectId: string,
    ): Promise<void> {
        const repoName = repo.split('/')[1];
        const workDir = `/tmp/${repoName}-pr-${prNumber}`;
        const isHomeRepo = repo === 'CorvidLabs/corvid-agent';

        const cloneStep = isHomeRepo
            ? `1. Use \`corvid_create_work_task\` is NOT appropriate here — you need to fix an existing PR branch.\n   Clone the repo: \`gh repo clone ${repo} ${workDir} && cd ${workDir} && gh pr checkout ${prNumber}\``
            : `1. Clone the repo and check out the PR branch:\n   \`gh repo clone ${repo} ${workDir} && cd ${workDir} && gh pr checkout ${prNumber}\``;

        const prompt = [
            `## CI Fix — PR #${prNumber} has failing checks`,
            ``,
            `**Repository:** ${repo}`,
            `**PR:** #${prNumber} "${prTitle}"`,
            `**Failing checks:** ${failedChecks.join(', ')}`,
            ``,
            `## Instructions`,
            ``,
            `PR #${prNumber} was authored by you and has CI failures that need to be fixed.`,
            ``,
            `Steps:`,
            cloneStep,
            `2. Read the CI failure logs:`,
            `   \`gh pr checks ${prNumber} --repo ${repo}\``,
            `   For each failed check, get the log URL and investigate.`,
            `3. Read the PR diff to understand what was changed:`,
            `   \`gh pr diff ${prNumber} --repo ${repo}\``,
            `4. Run the failing checks locally to reproduce:`,
            `   \`bunx tsc --noEmit --skipLibCheck\``,
            `   \`bun test\``,
            `5. Fix the issues on the existing branch:`,
            `   - Edit the relevant files`,
            `   - Commit: \`git add -A && git commit -m "fix: resolve CI failures"\``,
            `   - Push to the existing branch: \`git push\``,
            `6. Do NOT create a new PR. Push fixes to the existing branch.`,
            `7. After pushing, verify the checks are running:`,
            `   \`gh pr checks ${prNumber} --repo ${repo}\``,
            ``,
            `Rules:`,
            `- Do NOT create a new PR — fix the existing one.`,
            `- Do NOT close or abandon the PR.`,
            `- Focus on making CI pass, not on adding new features.`,
            `- If a test is genuinely wrong (testing incorrect behavior), fix the test.`,
            `- If the code is wrong, fix the code.`,
        ].join('\n');

        try {
            const session = createSession(this.db, {
                projectId,
                agentId,
                name: `Poll: ${repo} #${prNumber}: ${prTitle.slice(0, 40)}`,
                initialPrompt: prompt,
                source: 'agent',
            });

            this.processManager.startProcess(session, prompt, { schedulerMode: true });
            log.info('CI-fix session created', { repo, prNumber, sessionId: session.id });
        } catch (err) {
            log.error('Failed to create CI-fix session', {
                repo, prNumber,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    // ─── Auto-Update Loop ──────────────────────────────────────────────

    /**
     * Check if origin/main has new commits. If so, wait for all running
     * sessions to finish, pull the changes, and exit so the wrapper
     * script restarts the server with the new code.
     */
    private async checkForUpdates(): Promise<void> {
        if (!this.running) return;

        try {
            // Fetch latest from origin
            const fetchResult = Bun.spawnSync(['git', 'fetch', 'origin', 'main'], {
                cwd: import.meta.dir + '/..',
                stdout: 'pipe', stderr: 'pipe',
            });
            if (fetchResult.exitCode !== 0) return;

            // Only auto-update if we're on the main branch
            const currentBranch = Bun.spawnSync(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], {
                cwd: import.meta.dir + '/..',
                stdout: 'pipe',
            }).stdout.toString().trim();

            if (currentBranch !== 'main') {
                log.debug('Skipping auto-update — not on main branch', { branch: currentBranch });
                return;
            }

            // Compare local main with origin/main
            const localHash = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], {
                cwd: import.meta.dir + '/..',
                stdout: 'pipe',
            }).stdout.toString().trim();

            const remoteHash = Bun.spawnSync(['git', 'rev-parse', 'origin/main'], {
                cwd: import.meta.dir + '/..',
                stdout: 'pipe',
            }).stdout.toString().trim();

            if (localHash === remoteHash) return;

            log.info('New commits detected on origin/main', { local: localHash.slice(0, 8), remote: remoteHash.slice(0, 8) });

            // Check for running sessions — wait for them to finish
            const running = this.db.query(
                `SELECT COUNT(*) as count FROM sessions WHERE status = 'running' AND pid IS NOT NULL`
            ).get() as { count: number } | null;

            const activeCount = running?.count ?? 0;
            if (activeCount > 0) {
                log.info('Deferring auto-update — waiting for active sessions to finish', { activeCount });
                return;
            }

            // No active sessions — pull and restart
            log.info('No active sessions — pulling and restarting');

            const pullResult = Bun.spawnSync(['git', 'pull', '--rebase', 'origin', 'main'], {
                cwd: import.meta.dir + '/..',
                stdout: 'pipe', stderr: 'pipe',
            });

            if (pullResult.exitCode !== 0) {
                log.error('Git pull failed', { stderr: pullResult.stderr.toString().trim() });
                return;
            }

            // Check if bun.lock changed — if so, install updated dependencies
            // before restarting to avoid running with stale node_modules.
            const lockDiff = Bun.spawnSync(
                ['git', 'diff', localHash, 'HEAD', '--name-only', '--', 'bun.lock', 'package.json'],
                { cwd: import.meta.dir + '/..', stdout: 'pipe' },
            );
            const changedFiles = lockDiff.stdout.toString().trim();
            if (changedFiles) {
                log.info('Dependencies changed — running bun install', { changedFiles });
                const installResult = Bun.spawnSync(
                    ['bun', 'install', '--frozen-lockfile', '--ignore-scripts'],
                    { cwd: import.meta.dir + '/..', stdout: 'pipe', stderr: 'pipe' },
                );
                if (installResult.exitCode !== 0) {
                    log.error('bun install failed after pull — reverting', {
                        stderr: installResult.stderr.toString().trim(),
                    });
                    // Roll back to the known-good commit so we don't run with mismatched code + deps
                    Bun.spawnSync(['git', 'reset', '--hard', localHash], {
                        cwd: import.meta.dir + '/..',
                        stdout: 'pipe', stderr: 'pipe',
                    });
                    return;
                }
                log.info('bun install completed successfully');
            }

            // Verify pull actually advanced HEAD to origin/main
            const newLocalHash = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], {
                cwd: import.meta.dir + '/..',
                stdout: 'pipe',
            }).stdout.toString().trim();

            if (newLocalHash === localHash) {
                log.warn('Git pull did not advance HEAD — skipping restart to avoid loop', {
                    hash: localHash.slice(0, 8),
                });
                return;
            }

            log.info('Git pull successful — exiting for restart', {
                oldHash: localHash.slice(0, 8),
                newHash: newLocalHash.slice(0, 8),
            });
            // Exit with code 75 (EX_TEMPFAIL) to signal "restart me"
            // The run-loop.sh wrapper and launchd both treat non-zero as restartable
            process.exit(75);
        } catch (err) {
            log.error('Error in auto-update check', { error: err instanceof Error ? err.message : String(err) });
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

            // Fire matching event-based schedules
            if (this.schedulerService && triggeredThisCycle > 0) {
                try {
                    const matching = findSchedulesForEvent(this.db, 'github_poll', 'mention', config.repo);
                    for (const schedule of matching) {
                        this.schedulerService.triggerNow(schedule.id).catch((err) => {
                            log.debug('Event-triggered schedule failed', {
                                scheduleId: schedule.id, error: err instanceof Error ? err.message : String(err),
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
        const fullRepo = resolveFullRepo(config.repo, mention.htmlUrl);

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

        // Block mentions with HIGH/CRITICAL injection confidence before creating a session
        const injectionScan = scanGitHubContent(mention.body);
        if (injectionScan.blocked) {
            log.warn('Blocked mention: prompt injection detected', {
                configId: config.id, mentionId: mention.id,
                sender: mention.sender, confidence: injectionScan.confidence,
                patterns: injectionScan.matches.map(m => m.pattern),
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
    // repoQualifier, resolveFullRepo, shouldPollEventType, containsMention,
    // filterNewMentions, and escapeRegex are now in ./github-searcher.ts

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

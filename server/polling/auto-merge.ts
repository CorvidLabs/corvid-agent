/**
 * AutoMergeService — squash-merges open PRs authored by the agent that have all CI checks passing.
 *
 * Extracted from MentionPollingService to isolate auto-merge concerns.
 * Runs on a 2-minute interval, scanning active polling configs for repos to check.
 */

import type { Database } from 'bun:sqlite';
import { createLogger } from '../lib/logger';
import { resolveFullRepo } from './github-searcher';
import { isRepoBlocked } from '../db/repo-blocklist';
import { isProtectedPath } from '../process/protected-paths';
import { scanDiff as scanFetchDiff } from '../lib/fetch-detector';
import { scanDiff as scanCodeDiff } from '../lib/code-scanner';

const log = createLogger('AutoMerge');

/** How often to check for mergeable PRs. */
export const AUTO_MERGE_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

export type RunGhFn = (args: string[]) => Promise<{ ok: boolean; stdout: string; stderr: string }>;

export class AutoMergeService {
    private db: Database;
    private runGh: RunGhFn;
    private timer: ReturnType<typeof setInterval> | null = null;
    private running = false;
    /** Track PRs we've already flagged to avoid spamming comments. */
    private flaggedPRs = new Set<string>();

    constructor(db: Database, runGh: RunGhFn) {
        this.db = db;
        this.runGh = runGh;
    }

    start(): void {
        if (this.running) return;
        this.running = true;
        this.checkAll();
        this.timer = setInterval(() => this.checkAll(), AUTO_MERGE_INTERVAL_MS);
    }

    stop(): void {
        this.running = false;
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    /**
     * Find open PRs authored by the polling agent username that have all CI
     * checks passing, and squash-merge them automatically.
     */
    async checkAll(): Promise<void> {
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
                if (isRepoBlocked(this.db, repo)) {
                    log.debug('Skipping auto-merge — repo is blocklisted', { repo });
                    continue;
                }
                await this.mergeForRepo(repo, username);
            }
        } catch (err) {
            log.error('Error in auto-merge loop', { error: err instanceof Error ? err.message : String(err) });
        }
    }

    /**
     * Validate a PR's diff for security issues before auto-merging.
     * Returns: 'skip' if diff couldn't be fetched (retry next cycle),
     *          a rejection reason string if blocked,
     *          or null if safe to merge.
     */
    async validateDiff(repo: string, prNumber: number): Promise<string | 'skip' | null> {
        // Get the PR diff
        const diffResult = await this.runGh([
            'api', `repos/${repo}/pulls/${prNumber}`,
            '-H', 'Accept: application/vnd.github.diff',
        ]);

        if (!diffResult.ok || !diffResult.stdout.trim()) {
            // Transient failure (rate limit, network) — skip this cycle rather than
            // flagging the PR with a scary comment. We'll retry next cycle.
            log.debug('Could not retrieve PR diff — skipping security check this cycle', {
                repo, prNumber, stderr: diffResult.stderr?.slice(0, 200),
            });
            return 'skip';
        }

        const diff = diffResult.stdout;
        const issues: string[] = [];

        // 1. Check for protected file modifications
        const protectedFiles: string[] = [];
        for (const line of diff.split('\n')) {
            if (line.startsWith('+++ b/')) {
                const filePath = line.slice(6);
                if (isProtectedPath(filePath)) {
                    protectedFiles.push(filePath);
                }
            }
        }
        if (protectedFiles.length > 0) {
            issues.push(`**Protected files modified:** ${protectedFiles.join(', ')}`);
        }

        // 2. Check for unapproved external fetch calls
        const fetchResult = scanFetchDiff(diff);
        if (fetchResult.hasUnapprovedFetches) {
            const domains = fetchResult.findings.map((f) => `${f.domain} (${f.pattern})`);
            issues.push(`**Unapproved external domains:** ${domains.join(', ')}`);
        }

        // 3. Check for malicious code patterns
        const codeResult = scanCodeDiff(diff);
        if (codeResult.hasCriticalFindings) {
            const patterns = codeResult.findings
                .filter((f) => f.severity === 'critical')
                .map((f) => `${f.pattern}${f.file ? ` in ${f.file}` : ''}`);
            issues.push(`**Suspicious code patterns:** ${patterns.join(', ')}`);
        }

        if (issues.length > 0) {
            return issues.join('\n');
        }

        return null;
    }

    /**
     * Check if we've already posted a security-scan comment on this PR.
     * Prevents duplicate comments across server restarts.
     */
    private async hasSecurityComment(repo: string, prNumber: number): Promise<boolean> {
        const result = await this.runGh([
            'pr', 'view', String(prNumber),
            '--repo', repo,
            '--json', 'comments',
            '--jq', '.comments[].body',
        ]);
        if (!result.ok) return false;
        return result.stdout.includes('Auto-merge blocked — security scan failed');
    }

    /**
     * Auto-merge passing PRs for a specific repo authored by the given username.
     */
    private async mergeForRepo(repo: string, username: string): Promise<void> {
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

            // All checks pass — run security validation on the diff before merging
            const prKey = `${prRepo}#${prNumber}`;
            const rejection = await this.validateDiff(prRepo, prNumber);
            if (rejection === 'skip') {
                log.debug('Skipping PR — diff unavailable this cycle', { repo: prRepo, number: prNumber });
                continue;
            }
            if (rejection) {
                log.warn('Auto-merge blocked by security scan', {
                    repo: prRepo, number: prNumber, reason: rejection,
                });
                // Only post the comment once per PR — check in-memory set first,
                // then fall back to checking existing comments on the PR (survives restarts)
                if (!this.flaggedPRs.has(prKey)) {
                    const alreadyCommented = await this.hasSecurityComment(prRepo, prNumber);
                    if (!alreadyCommented) {
                        await this.runGh([
                            'pr', 'comment', String(prNumber),
                            '--repo', prRepo,
                            '--body', `⚠️ **Auto-merge blocked — security scan failed**\n\n${rejection}\n\nThis PR requires manual review before merging.`,
                        ]);
                    }
                    this.flaggedPRs.add(prKey);
                }
                continue;
            }

            // Security scan passed — merge it
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
}

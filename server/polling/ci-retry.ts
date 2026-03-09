/**
 * CIRetryService — spawns fix sessions for PRs authored by the agent with failed CI.
 *
 * Extracted from MentionPollingService to isolate CI retry concerns.
 * Runs on a 10-minute interval with a 30-minute per-PR cooldown.
 */

import type { Database } from 'bun:sqlite';
import type { ProcessManager } from '../process/manager';
import { createLogger } from '../lib/logger';
import { createSession } from '../db/sessions';
import { resolveFullRepo } from './github-searcher';

const log = createLogger('CIRetry');

/** How often to check for CI-failed PRs and spawn fix sessions. */
export const CI_RETRY_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

/** Cooldown per PR before spawning another CI-fix session. */
export const CI_RETRY_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

export type RunGhFn = (args: string[]) => Promise<{ ok: boolean; stdout: string; stderr: string }>;

export class CIRetryService {
    private db: Database;
    private processManager: ProcessManager;
    private runGh: RunGhFn;
    private timer: ReturnType<typeof setInterval> | null = null;
    private running = false;
    /** Tracks last CI-fix session spawn time per "repo#number" to enforce cooldown. */
    private lastSpawn = new Map<string, number>();

    constructor(db: Database, processManager: ProcessManager, runGh: RunGhFn) {
        this.db = db;
        this.processManager = processManager;
        this.runGh = runGh;
    }

    start(): void {
        if (this.running) return;
        this.running = true;
        // Don't run immediately on start — wait for the first interval
        this.timer = setInterval(() => this.checkAll(), CI_RETRY_INTERVAL_MS);
    }

    stop(): void {
        this.running = false;
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    /**
     * Find open PRs authored by the agent with failed CI and spawn sessions
     * to fix them.
     */
    async checkAll(): Promise<void> {
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
                await this.retryForRepo(c.repo, c.mention_username, c.agent_id, c.project_id);
            }
        } catch (err) {
            log.error('Error in CI retry loop', { error: err instanceof Error ? err.message : String(err) });
        }
    }

    /**
     * For a specific repo, find open PRs by the agent with failed CI and spawn fix sessions.
     */
    private async retryForRepo(
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
            const lastSpawn = this.lastSpawn.get(cooldownKey);
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

            this.lastSpawn.set(cooldownKey, Date.now());
            await this.spawnFixSession(prRepo, prNumber, prTitle, failedChecks, agentId, projectId);
        }
    }

    /**
     * Create a session that checks out a PR branch and fixes CI failures.
     */
    private async spawnFixSession(
        repo: string, prNumber: number, prTitle: string,
        failedChecks: string[], agentId: string, projectId: string,
    ): Promise<void> {
        const repoName = repo.split('/')[1];
        const workDir = `${require('node:os').tmpdir()}/${repoName}-pr-${prNumber}`;
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
            `   \`bun x tsc --noEmit --skipLibCheck\``,
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
}

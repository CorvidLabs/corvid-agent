/**
 * SchedulerService — cron/interval-based automation engine for agent schedules.
 *
 * Polls for due schedules every 30 seconds, executes their actions,
 * and manages approval workflows for PR submissions.
 */

import type { Database } from 'bun:sqlite';
import type { ProcessManager } from '../process/manager';
import type { WorkTaskService } from '../work/service';
import type { AgentMessenger } from '../algochat/agent-messenger';
import type {
    AgentSchedule,
    ScheduleAction,
    ScheduleExecution,
    ScheduleActionType,
} from '../../shared/types';
import {
    listDueSchedules,
    updateScheduleLastRun,
    updateScheduleNextRun,
    updateSchedule,
    getSchedule,
    createExecution,
    updateExecutionStatus,
    getExecution,
    resolveScheduleApproval,
} from '../db/schedules';
import { getAgent } from '../db/agents';
import { createSession } from '../db/sessions';
import * as github from '../github/operations';
import { launchCouncil } from '../routes/councils';
import { getNextCronDate } from './cron-parser';
import { createLogger } from '../lib/logger';

const log = createLogger('Scheduler');

const POLL_INTERVAL_MS = 30_000; // Check for due schedules every 30s
const MAX_CONCURRENT_EXECUTIONS = 2;
const MAX_CONSECUTIVE_FAILURES = 5;
const MIN_SCHEDULE_INTERVAL_MS = 300_000; // 5 minutes

type ScheduleEventCallback = (event: {
    type: 'schedule_update' | 'schedule_execution_update' | 'schedule_approval_request';
    data: unknown;
}) => void;

/**
 * Validate that a schedule doesn't fire more often than every 5 minutes.
 * Throws an Error if the schedule is too frequent.
 */
export function validateScheduleFrequency(cronExpression?: string | null, intervalMs?: number | null): void {
    if (intervalMs !== undefined && intervalMs !== null) {
        if (intervalMs < MIN_SCHEDULE_INTERVAL_MS) {
            throw new Error(`Schedule interval too short: ${intervalMs}ms. Minimum is ${MIN_SCHEDULE_INTERVAL_MS}ms (5 minutes).`);
        }
    }

    if (cronExpression) {
        const now = new Date();
        try {
            const first = getNextCronDate(cronExpression, now);
            const second = getNextCronDate(cronExpression, first);
            const gapMs = second.getTime() - first.getTime();
            if (gapMs < MIN_SCHEDULE_INTERVAL_MS) {
                throw new Error(
                    `Cron expression "${cronExpression}" fires every ${Math.round(gapMs / 1000)}s. ` +
                    `Minimum interval is 5 minutes.`
                );
            }
        } catch (err) {
            if (err instanceof Error && err.message.includes('Minimum interval')) throw err;
            if (err instanceof Error && err.message.includes('fires every')) throw err;
            throw new Error(`Invalid cron expression: ${cronExpression}`);
        }
    }
}

export class SchedulerService {
    private db: Database;
    private processManager: ProcessManager;
    private workTaskService: WorkTaskService | null;
    private agentMessenger: AgentMessenger | null;
    private pollTimer: ReturnType<typeof setInterval> | null = null;
    private runningExecutions = new Set<string>();
    private eventCallbacks = new Set<ScheduleEventCallback>();
    private consecutiveFailures = new Map<string, number>();

    constructor(
        db: Database,
        processManager: ProcessManager,
        workTaskService?: WorkTaskService | null,
        agentMessenger?: AgentMessenger | null,
    ) {
        this.db = db;
        this.processManager = processManager;
        this.workTaskService = workTaskService ?? null;
        this.agentMessenger = agentMessenger ?? null;
    }

    /** Update the agent messenger (set after async AlgoChat init). */
    setAgentMessenger(messenger: AgentMessenger): void {
        this.agentMessenger = messenger;
    }

    /** Start the scheduler polling loop. */
    start(): void {
        if (this.pollTimer) return;
        log.info('Scheduler started', { pollIntervalMs: POLL_INTERVAL_MS });

        // Initialize next_run_at for schedules that don't have one yet
        this.initializeNextRuns();

        this.pollTimer = setInterval(() => this.tick(), POLL_INTERVAL_MS);
        // Run once immediately
        this.tick();
    }

    /** Stop the scheduler. */
    stop(): void {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
        log.info('Scheduler stopped');
    }

    /** Get scheduler stats for the health endpoint. */
    getStats(): {
        running: boolean;
        activeSchedules: number;
        pausedSchedules: number;
        runningExecutions: number;
        maxConcurrent: number;
        recentFailures: number;
    } {
        const activeRow = this.db.query(
            `SELECT COUNT(*) as count FROM agent_schedules WHERE status = 'active'`
        ).get() as { count: number };
        const pausedRow = this.db.query(
            `SELECT COUNT(*) as count FROM agent_schedules WHERE status = 'paused'`
        ).get() as { count: number };
        const failureRow = this.db.query(
            `SELECT COUNT(*) as count FROM schedule_executions WHERE status = 'failed' AND started_at >= datetime('now', '-24 hours')`
        ).get() as { count: number };

        return {
            running: this.pollTimer !== null,
            activeSchedules: activeRow.count,
            pausedSchedules: pausedRow.count,
            runningExecutions: this.runningExecutions.size,
            maxConcurrent: MAX_CONCURRENT_EXECUTIONS,
            recentFailures: failureRow.count,
        };
    }

    /** Subscribe to schedule events (for WebSocket broadcast). */
    onEvent(callback: ScheduleEventCallback): () => void {
        this.eventCallbacks.add(callback);
        return () => this.eventCallbacks.delete(callback);
    }

    /** Resolve an approval request for a schedule execution. */
    resolveApproval(executionId: string, approved: boolean): ScheduleExecution | null {
        const execution = resolveScheduleApproval(this.db, executionId, approved);
        if (!execution) return null;

        this.emit({
            type: 'schedule_execution_update',
            data: execution,
        });

        // If approved, actually execute the action
        if (approved) {
            const schedule = getSchedule(this.db, execution.scheduleId);
            if (schedule) {
                this.executeApprovedAction(execution, schedule);
            }
        }

        return execution;
    }

    // ─── Internal ────────────────────────────────────────────────────────────

    private initializeNextRuns(): void {
        const schedules = this.db.query(
            `SELECT * FROM agent_schedules WHERE status = 'active' AND next_run_at IS NULL`
        ).all() as Record<string, unknown>[];

        for (const row of schedules) {
            const id = row.id as string;
            const cronExpr = row.cron_expression as string | null;
            const intervalMs = row.interval_ms as number | null;

            const nextRun = this.calculateNextRun(cronExpr, intervalMs);
            if (nextRun) {
                updateScheduleNextRun(this.db, id, nextRun);
            }
        }
    }

    private async tick(): Promise<void> {
        if (this.runningExecutions.size >= MAX_CONCURRENT_EXECUTIONS) {
            log.debug('Max concurrent executions reached, skipping tick');
            return;
        }

        const dueSchedules = listDueSchedules(this.db);
        if (dueSchedules.length === 0) return;

        log.info(`Processing ${dueSchedules.length} due schedule(s)`);

        for (const schedule of dueSchedules) {
            if (this.runningExecutions.size >= MAX_CONCURRENT_EXECUTIONS) break;

            // Check if max executions reached
            if (schedule.maxExecutions !== null && schedule.executionCount >= schedule.maxExecutions) {
                updateSchedule(this.db, schedule.id, { status: 'completed' });
                const updated = getSchedule(this.db, schedule.id);
                if (updated) this.emit({ type: 'schedule_update', data: updated });
                continue;
            }

            await this.executeSchedule(schedule);
        }
    }

    private async executeSchedule(schedule: AgentSchedule): Promise<void> {
        const agent = getAgent(this.db, schedule.agentId);
        if (!agent) {
            log.warn('Schedule agent not found', { scheduleId: schedule.id, agentId: schedule.agentId });
            return;
        }

        // Update last run and calculate next run
        updateScheduleLastRun(this.db, schedule.id);
        const nextRun = this.calculateNextRun(schedule.cronExpression, schedule.intervalMs);
        updateScheduleNextRun(this.db, schedule.id, nextRun);

        // Emit schedule update
        const updatedSchedule = getSchedule(this.db, schedule.id);
        if (updatedSchedule) this.emit({ type: 'schedule_update', data: updatedSchedule });

        // Execute each action in the schedule
        for (const action of schedule.actions) {
            if (this.runningExecutions.size >= MAX_CONCURRENT_EXECUTIONS) break;

            const configSnapshot = {
                actions: schedule.actions,
                approvalPolicy: schedule.approvalPolicy,
                cronExpression: schedule.cronExpression,
                intervalMs: schedule.intervalMs,
            };

            const execution = createExecution(
                this.db,
                schedule.id,
                schedule.agentId,
                action.type,
                action as unknown as Record<string, unknown>,
                configSnapshot,
            );

            this.emit({ type: 'schedule_execution_update', data: execution });

            // Check if this action needs approval
            if (this.needsApproval(schedule, action)) {
                updateExecutionStatus(this.db, execution.id, 'awaiting_approval');
                const updated = getExecution(this.db, execution.id);
                this.emit({
                    type: 'schedule_approval_request',
                    data: {
                        executionId: execution.id,
                        scheduleId: schedule.id,
                        agentId: schedule.agentId,
                        actionType: action.type,
                        description: action.description ?? `${action.type} on ${action.repos?.join(', ') ?? 'N/A'}`,
                    },
                });
                if (updated) this.emit({ type: 'schedule_execution_update', data: updated });
                continue;
            }

            // Execute immediately
            this.runAction(execution.id, schedule, action);
        }
    }

    private needsApproval(schedule: AgentSchedule, action: ScheduleAction): boolean {
        if (schedule.approvalPolicy === 'auto') return false;

        // Actions that modify external repos always need approval unless auto
        const destructiveActions: ScheduleActionType[] = [
            'work_task',
            'github_suggest',
            'fork_repo',
        ];

        if (schedule.approvalPolicy === 'owner_approve') {
            return destructiveActions.includes(action.type);
        }

        // council_approve: all actions need approval
        return true;
    }

    private async runAction(executionId: string, schedule: AgentSchedule, action: ScheduleAction): Promise<void> {
        this.runningExecutions.add(executionId);

        try {
            switch (action.type) {
                case 'star_repo':
                    await this.execStarRepos(executionId, action);
                    break;
                case 'fork_repo':
                    await this.execForkRepos(executionId, action);
                    break;
                case 'review_prs':
                    await this.execReviewPrs(executionId, schedule, action);
                    break;
                case 'work_task':
                    await this.execWorkTask(executionId, schedule, action);
                    break;
                case 'council_launch':
                    await this.execCouncilLaunch(executionId, schedule, action);
                    break;
                case 'send_message':
                    await this.execSendMessage(executionId, schedule, action);
                    break;
                case 'github_suggest':
                    await this.execGithubSuggest(executionId, schedule, action);
                    break;
                case 'custom':
                    await this.execCustom(executionId, schedule, action);
                    break;
                default:
                    updateExecutionStatus(this.db, executionId, 'failed', {
                        result: `Unknown action type: ${action.type}`,
                    });
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            log.error('Schedule action failed', { executionId, actionType: action.type, error: message });
            updateExecutionStatus(this.db, executionId, 'failed', { result: message });
        } finally {
            this.runningExecutions.delete(executionId);
            const updated = getExecution(this.db, executionId);
            if (updated) {
                this.emit({ type: 'schedule_execution_update', data: updated });

                // Track consecutive failures for auto-pause
                if (updated.status === 'failed') {
                    const count = (this.consecutiveFailures.get(schedule.id) ?? 0) + 1;
                    this.consecutiveFailures.set(schedule.id, count);

                    if (count >= MAX_CONSECUTIVE_FAILURES) {
                        log.warn('Auto-pausing schedule after consecutive failures', {
                            scheduleId: schedule.id,
                            failures: count,
                        });
                        updateSchedule(this.db, schedule.id, { status: 'paused' });
                        this.consecutiveFailures.delete(schedule.id);
                        const pausedSchedule = getSchedule(this.db, schedule.id);
                        if (pausedSchedule) this.emit({ type: 'schedule_update', data: pausedSchedule });
                    }
                } else if (updated.status === 'completed') {
                    this.consecutiveFailures.delete(schedule.id);
                }
            }
        }
    }

    private async executeApprovedAction(execution: ScheduleExecution, schedule: AgentSchedule): Promise<void> {
        const action = execution.actionInput as unknown as ScheduleAction;
        // Re-set status to running
        updateExecutionStatus(this.db, execution.id, 'running');
        const updated = getExecution(this.db, execution.id);
        if (updated) this.emit({ type: 'schedule_execution_update', data: updated });

        await this.runAction(execution.id, schedule, action);
    }

    // ─── Action Executors ────────────────────────────────────────────────────

    private async execStarRepos(executionId: string, action: ScheduleAction): Promise<void> {
        if (!action.repos?.length) {
            updateExecutionStatus(this.db, executionId, 'failed', { result: 'No repos specified' });
            return;
        }

        const results: string[] = [];
        for (const repo of action.repos) {
            const r = await github.starRepo(repo);
            results.push(r.message);
        }

        updateExecutionStatus(this.db, executionId, 'completed', {
            result: results.join('\n'),
        });
    }

    private async execForkRepos(executionId: string, action: ScheduleAction): Promise<void> {
        if (!action.repos?.length) {
            updateExecutionStatus(this.db, executionId, 'failed', { result: 'No repos specified' });
            return;
        }

        const results: string[] = [];
        for (const repo of action.repos) {
            const r = await github.forkRepo(repo);
            results.push(r.message);
        }

        updateExecutionStatus(this.db, executionId, 'completed', {
            result: results.join('\n'),
        });
    }

    private async execReviewPrs(executionId: string, schedule: AgentSchedule, action: ScheduleAction): Promise<void> {
        if (!action.repos?.length) {
            updateExecutionStatus(this.db, executionId, 'failed', { result: 'No repos specified' });
            return;
        }

        const agent = getAgent(this.db, schedule.agentId);
        if (!agent) {
            updateExecutionStatus(this.db, executionId, 'failed', { result: 'Agent not found' });
            return;
        }

        const maxPrs = action.maxPrs ?? 5;
        const results: string[] = [];

        for (const repo of action.repos) {
            const prList = await github.listOpenPrs(repo, maxPrs);
            if (!prList.ok) {
                results.push(`${repo}: Failed to list PRs — ${prList.error}`);
                continue;
            }

            if (prList.prs.length === 0) {
                results.push(`${repo}: No open PRs`);
                continue;
            }

            // Create a session for the agent to review the PRs
            const prSummary = prList.prs.map((pr) =>
                `- #${pr.number}: "${pr.title}" by ${pr.author} (+${pr.additions}/-${pr.deletions}, ${pr.changedFiles} files)`
            ).join('\n');

            const prompt = `You are reviewing open pull requests for ${repo}.\n\n` +
                `## Open PRs\n${prSummary}\n\n` +
                `## Instructions\n` +
                `1. For each PR, use \`gh pr diff <number> --repo ${repo}\` to review the changes.\n` +
                `2. Analyze code quality, potential issues, and improvements.\n` +
                `3. Leave a helpful review comment using \`gh pr comment <number> --repo ${repo} --body "..."\`\n` +
                `4. Summarize your review findings at the end.`;

            const projectId = action.projectId ?? agent.defaultProjectId;
            if (!projectId) {
                results.push(`${repo}: No project configured for agent`);
                continue;
            }

            const session = createSession(this.db, {
                projectId,
                agentId: schedule.agentId,
                name: `Scheduled PR Review: ${repo}`,
                initialPrompt: prompt,
                source: 'agent',
            });

            updateExecutionStatus(this.db, executionId, 'running', { sessionId: session.id });
            this.processManager.startProcess(session, prompt, { schedulerMode: true });
            results.push(`${repo}: Reviewing ${prList.prs.length} PR(s) in session ${session.id}`);
        }

        // Mark completed (the session may still be running)
        updateExecutionStatus(this.db, executionId, 'completed', {
            result: results.join('\n'),
        });
    }

    private async execWorkTask(executionId: string, schedule: AgentSchedule, action: ScheduleAction): Promise<void> {
        if (!this.workTaskService) {
            updateExecutionStatus(this.db, executionId, 'failed', { result: 'Work task service not available' });
            return;
        }

        if (!action.description) {
            updateExecutionStatus(this.db, executionId, 'failed', { result: 'No description provided' });
            return;
        }

        try {
            const task = await this.workTaskService.create({
                agentId: schedule.agentId,
                description: action.description,
                projectId: action.projectId,
                source: 'agent',
            });

            updateExecutionStatus(this.db, executionId, 'completed', {
                result: `Work task created: ${task.id} (branch: ${task.branchName ?? 'pending'})`,
                workTaskId: task.id,
                sessionId: task.sessionId ?? undefined,
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            updateExecutionStatus(this.db, executionId, 'failed', { result: message });
        }
    }

    private async execCouncilLaunch(executionId: string, _schedule: AgentSchedule, action: ScheduleAction): Promise<void> {
        if (!action.councilId || !action.projectId || !action.description) {
            updateExecutionStatus(this.db, executionId, 'failed', {
                result: 'councilId, projectId, and description are required for council_launch',
            });
            return;
        }

        try {
            const result = launchCouncil(
                this.db,
                this.processManager,
                action.councilId,
                action.projectId,
                action.description,
                this.agentMessenger,
            );
            updateExecutionStatus(this.db, executionId, 'completed', {
                result: `Council launched: ${result.launchId} (${result.sessionIds.length} agents)`,
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            updateExecutionStatus(this.db, executionId, 'failed', { result: message });
        }
    }

    private async execSendMessage(executionId: string, schedule: AgentSchedule, action: ScheduleAction): Promise<void> {
        if (!action.toAgentId || !action.message) {
            updateExecutionStatus(this.db, executionId, 'failed', {
                result: 'toAgentId and message are required for send_message',
            });
            return;
        }

        if (!this.agentMessenger) {
            updateExecutionStatus(this.db, executionId, 'failed', { result: 'Agent messenger not available' });
            return;
        }

        try {
            const { response, threadId } = await this.agentMessenger.invokeAndWait({
                fromAgentId: schedule.agentId,
                toAgentId: action.toAgentId,
                content: action.message,
            });

            updateExecutionStatus(this.db, executionId, 'completed', {
                result: `Message sent. Response: ${response.slice(0, 500)}... [thread: ${threadId}]`,
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            updateExecutionStatus(this.db, executionId, 'failed', { result: message });
        }
    }

    private async execGithubSuggest(executionId: string, schedule: AgentSchedule, action: ScheduleAction): Promise<void> {
        if (!action.repos?.length) {
            updateExecutionStatus(this.db, executionId, 'failed', { result: 'No repos specified' });
            return;
        }

        const agent = getAgent(this.db, schedule.agentId);
        if (!agent) {
            updateExecutionStatus(this.db, executionId, 'failed', { result: 'Agent not found' });
            return;
        }

        const projectId = action.projectId ?? agent.defaultProjectId;
        if (!projectId) {
            updateExecutionStatus(this.db, executionId, 'failed', { result: 'No project configured for agent' });
            return;
        }

        // Create a session for the agent to analyze repos and suggest improvements
        const repoList = action.repos.join(', ');
        const prompt = `You are analyzing the following repositories for potential improvements: ${repoList}\n\n` +
            `## Instructions\n` +
            `1. For each repo, examine the codebase structure, README, issues, and recent PRs.\n` +
            `2. Identify potential improvements: documentation, code quality, performance, testing, CI/CD.\n` +
            `3. Prioritize suggestions by impact and feasibility.\n` +
            `4. For each suggestion, provide a clear description of the change.\n` +
            (action.autoCreatePr
                ? `5. If you have high-confidence suggestions, create work tasks using corvid_create_work_task.\n`
                : `5. Summarize your findings — do NOT create PRs automatically.\n`) +
            `\nBe thorough but focused. Quality over quantity.`;

        const session = createSession(this.db, {
            projectId,
            agentId: schedule.agentId,
            name: `Scheduled Suggestions: ${repoList.slice(0, 50)}`,
            initialPrompt: prompt,
            source: 'agent',
        });

        updateExecutionStatus(this.db, executionId, 'running', { sessionId: session.id });
        this.processManager.startProcess(session, prompt, { schedulerMode: true });

        updateExecutionStatus(this.db, executionId, 'completed', {
            result: `Analysis session started: ${session.id}`,
            sessionId: session.id,
        });
    }

    private async execCustom(executionId: string, schedule: AgentSchedule, action: ScheduleAction): Promise<void> {
        if (!action.prompt) {
            updateExecutionStatus(this.db, executionId, 'failed', { result: 'No prompt provided for custom action' });
            return;
        }

        const agent = getAgent(this.db, schedule.agentId);
        if (!agent) {
            updateExecutionStatus(this.db, executionId, 'failed', { result: 'Agent not found' });
            return;
        }

        const projectId = action.projectId ?? agent.defaultProjectId;
        if (!projectId) {
            updateExecutionStatus(this.db, executionId, 'failed', { result: 'No project configured for agent' });
            return;
        }

        const session = createSession(this.db, {
            projectId,
            agentId: schedule.agentId,
            name: `Scheduled Custom: ${action.prompt.slice(0, 50)}`,
            initialPrompt: action.prompt,
            source: 'agent',
        });

        updateExecutionStatus(this.db, executionId, 'running', { sessionId: session.id });
        this.processManager.startProcess(session, action.prompt, { schedulerMode: true });

        updateExecutionStatus(this.db, executionId, 'completed', {
            result: `Custom action session started: ${session.id}`,
            sessionId: session.id,
        });
    }

    // ─── Cron helpers ────────────────────────────────────────────────────────

    private calculateNextRun(cronExpression: string | null, intervalMs: number | null): string | null {
        if (cronExpression) {
            try {
                const next = getNextCronDate(cronExpression);
                return next.toISOString();
            } catch (err) {
                log.warn('Invalid cron expression', { cronExpression, error: String(err) });
                return null;
            }
        }

        if (intervalMs && intervalMs > 0) {
            return new Date(Date.now() + intervalMs).toISOString();
        }

        return null;
    }

    private emit(event: { type: string; data: unknown }): void {
        for (const cb of this.eventCallbacks) {
            try {
                cb(event as Parameters<ScheduleEventCallback>[0]);
            } catch (err) {
                log.error('Schedule event callback error', { error: err instanceof Error ? err.message : String(err) });
            }
        }
    }
}

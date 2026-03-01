/**
 * SchedulerService — cron/interval-based automation engine for agent schedules.
 *
 * Polls for due schedules every 30 seconds, executes their actions,
 * and manages approval workflows for PR submissions.
 */

import type { Database } from 'bun:sqlite';
import type { ProcessManager } from '../process/manager';
import type { WorkTaskService } from '../work/service';
import type { AutonomousLoopService } from '../improvement/service';
import type { AgentMessenger } from '../algochat/agent-messenger';
import type { ReputationScorer } from '../reputation/scorer';
import type { ReputationAttestation } from '../reputation/attestation';
import type { NotificationService } from '../notifications/service';
import { summarizeOldMemories } from '../memory/summarizer';
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
import { NotFoundError, ValidationError } from '../lib/errors';
import { recordAudit } from '../db/audit';
import { createEventContext, runWithEventContext } from '../observability/event-context';

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
            throw new ValidationError(`Schedule interval too short: ${intervalMs}ms. Minimum is ${MIN_SCHEDULE_INTERVAL_MS}ms (5 minutes).`);
        }
    }

    if (cronExpression) {
        const now = new Date();
        try {
            const first = getNextCronDate(cronExpression, now);
            const second = getNextCronDate(cronExpression, first);
            const gapMs = second.getTime() - first.getTime();
            if (gapMs < MIN_SCHEDULE_INTERVAL_MS) {
                throw new ValidationError(
                    `Cron expression "${cronExpression}" fires every ${Math.round(gapMs / 1000)}s. ` +
                    `Minimum interval is 5 minutes.`
                );
            }
        } catch (err) {
            if (err instanceof ValidationError) throw err;
            throw new ValidationError(`Invalid cron expression: ${cronExpression}`);
        }
    }
}

export class SchedulerService {
    private db: Database;
    private processManager: ProcessManager;
    private workTaskService: WorkTaskService | null;
    private agentMessenger: AgentMessenger | null;
    private improvementLoopService: AutonomousLoopService | null = null;
    private reputationScorer: ReputationScorer | null = null;
    private reputationAttestation: ReputationAttestation | null = null;
    private notificationService: NotificationService | null = null;
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

    /** Set the improvement loop service (set after service initialization). */
    setImprovementLoopService(service: AutonomousLoopService): void {
        this.improvementLoopService = service;
    }

    /** Set reputation services (for attestation publishing schedule). */
    setReputationServices(scorer: ReputationScorer, attestation: ReputationAttestation): void {
        this.reputationScorer = scorer;
        this.reputationAttestation = attestation;
    }

    /** Set notification service (for approval request notifications). */
    setNotificationService(service: NotificationService): void {
        this.notificationService = service;
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

    /** Manually trigger a schedule to run now (ignoring cron/interval timing). */
    async triggerNow(scheduleId: string): Promise<void> {
        const schedule = getSchedule(this.db, scheduleId);
        if (!schedule) throw new NotFoundError('Schedule', scheduleId);
        if (schedule.status !== 'active') throw new ValidationError('Schedule is not active', { scheduleId, status: schedule.status });
        await this.executeSchedule(schedule);
    }

    /** Cancel a running execution. Returns the cancelled execution or null if not cancellable. */
    cancelExecution(executionId: string): ScheduleExecution | null {
        const execution = getExecution(this.db, executionId);
        if (!execution || execution.status !== 'running') return null;

        // Stop the process if a session exists
        if (execution.sessionId) {
            try {
                this.processManager.stopProcess(execution.sessionId);
            } catch {
                // Best-effort stop
            }
        }

        // Remove from running set
        this.runningExecutions.delete(executionId);

        // Update status
        updateExecutionStatus(this.db, executionId, 'cancelled', {
            result: 'Cancelled by user',
        });

        const updated = getExecution(this.db, executionId);
        if (updated) {
            this.emit({ type: 'schedule_execution_update', data: updated });
        }
        return updated;
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
        const ctx = createEventContext('scheduler');
        return runWithEventContext(ctx, async () => {
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

            // Audit log the schedule execution
            recordAudit(
                this.db,
                'schedule_execute',
                schedule.agentId,
                'schedule_execution',
                execution.id,
                `Executing action: ${action.type} for schedule "${schedule.name}"`,
            );

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

                // Push approval notification to all configured channels
                if (this.notificationService) {
                    const desc = action.description ?? `${action.type} on ${action.repos?.join(', ') ?? 'N/A'}`;
                    this.notificationService.notify({
                        agentId: schedule.agentId,
                        title: `Approval needed: ${schedule.name}`,
                        message: `Schedule "${schedule.name}" wants to run ${action.type}:\n${desc}\n\nApprove in the dashboard.`,
                        level: 'warning',
                    }).catch(err => log.warn('Approval notification failed', {
                        scheduleId: schedule.id,
                        error: err instanceof Error ? err.message : String(err),
                    }));
                }

                continue;
            }

            // Notify start
            this.notifyScheduleEvent(schedule, 'started', `Schedule "${schedule.name}" started: ${action.type}`);

            // Execute immediately
            this.runAction(execution.id, schedule, action);
        }
        }); // runWithEventContext
    }

    private needsApproval(schedule: AgentSchedule, action: ScheduleAction): boolean {
        if (schedule.approvalPolicy === 'auto') return false;

        // Actions that modify external repos always need approval unless auto
        const destructiveActions: ScheduleActionType[] = [
            'work_task',
            'github_suggest',
            'fork_repo',
            'codebase_review',
            'dependency_audit',
            'improvement_loop',
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
                case 'codebase_review':
                    await this.execCodebaseReview(executionId, schedule, action);
                    break;
                case 'dependency_audit':
                    await this.execDependencyAudit(executionId, schedule, action);
                    break;
                case 'improvement_loop':
                    await this.execImprovementLoop(executionId, schedule, action);
                    break;
                case 'memory_maintenance':
                    await this.execMemoryMaintenance(executionId, schedule);
                    break;
                case 'reputation_attestation':
                    await this.execReputationAttestation(executionId, schedule);
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

                // Notify completion/failure
                const resultSnippet = updated.result ? updated.result.slice(0, 200) : '';
                if (updated.status === 'completed') {
                    this.notifyScheduleEvent(schedule, 'completed',
                        `Schedule "${schedule.name}" completed (${action.type}): ${resultSnippet}`);
                } else if (updated.status === 'failed') {
                    this.notifyScheduleEvent(schedule, 'failed',
                        `Schedule "${schedule.name}" FAILED (${action.type}): ${resultSnippet}`);
                }

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

    private async execCodebaseReview(executionId: string, schedule: AgentSchedule, action: ScheduleAction): Promise<void> {
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

        const prompt = `You are performing an automated codebase review.\n\n` +
            `## Instructions\n` +
            `1. Run \`bunx tsc --noEmit 2>&1\` and collect any TypeScript errors.\n` +
            `2. Run \`bun test 2>&1 | tail -50\` and collect any test failures.\n` +
            `3. Search for TODO, FIXME, and HACK comments in the source code.\n` +
            `4. Identify files over 500 lines that may need refactoring.\n` +
            `5. Prioritize findings by severity (type errors > test failures > code smells).\n` +
            `6. Create 1-3 work tasks via corvid_create_work_task for the most impactful fixes.\n` +
            `7. Use corvid_notify_owner to report a summary of findings and created tasks.\n\n` +
            `${action.description ? `Context: ${action.description}\n\n` : ''}` +
            `Focus on actionable improvements. Quality over quantity.`;

        const session = createSession(this.db, {
            projectId,
            agentId: schedule.agentId,
            name: `Scheduled Codebase Review`,
            initialPrompt: prompt,
            source: 'agent',
        });

        updateExecutionStatus(this.db, executionId, 'running', { sessionId: session.id });
        this.processManager.startProcess(session, prompt, { schedulerMode: true });

        updateExecutionStatus(this.db, executionId, 'completed', {
            result: `Codebase review session started: ${session.id}`,
            sessionId: session.id,
        });
    }

    private async execDependencyAudit(executionId: string, schedule: AgentSchedule, action: ScheduleAction): Promise<void> {
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

        const prompt = `You are performing an automated dependency audit.\n\n` +
            `## Instructions\n` +
            `1. Check for outdated dependencies: \`bun outdated 2>&1\` (or \`npm outdated 2>&1\` as fallback).\n` +
            `2. Check for known vulnerabilities: \`bun audit 2>&1\` (or \`npm audit 2>&1\` as fallback).\n` +
            `3. Review \`package.json\` for pinning issues (exact versions vs ranges).\n` +
            `4. Identify any deprecated or unmaintained packages.\n` +
            `5. Create work tasks via corvid_create_work_task for critical updates (security vulnerabilities, major version bumps).\n` +
            `6. Use corvid_notify_owner to report a summary of findings and recommendations.\n\n` +
            `${action.description ? `Context: ${action.description}\n\n` : ''}` +
            `Prioritize security fixes over feature updates.`;

        const session = createSession(this.db, {
            projectId,
            agentId: schedule.agentId,
            name: `Scheduled Dependency Audit`,
            initialPrompt: prompt,
            source: 'agent',
        });

        updateExecutionStatus(this.db, executionId, 'running', { sessionId: session.id });
        this.processManager.startProcess(session, prompt, { schedulerMode: true });

        updateExecutionStatus(this.db, executionId, 'completed', {
            result: `Dependency audit session started: ${session.id}`,
            sessionId: session.id,
        });
    }

    private async execImprovementLoop(executionId: string, schedule: AgentSchedule, action: ScheduleAction): Promise<void> {
        if (!this.improvementLoopService) {
            updateExecutionStatus(this.db, executionId, 'failed', { result: 'Improvement loop service not configured' });
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

        updateExecutionStatus(this.db, executionId, 'running');

        const result = await this.improvementLoopService.run(schedule.agentId, projectId, {
            maxTasks: action.maxImprovementTasks ?? 3,
            focusArea: action.focusArea,
        });

        updateExecutionStatus(this.db, executionId, 'completed', {
            result: `Improvement loop session started: ${result.sessionId}. ` +
                `Health: ${result.health.tscErrorCount} tsc errors, ${result.health.testFailureCount} test failures. ` +
                `Reputation: ${result.reputationScore} (${result.trustLevel}). ` +
                `Max tasks: ${result.maxTasksAllowed}.`,
            sessionId: result.sessionId,
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

    private async execMemoryMaintenance(executionId: string, schedule: AgentSchedule): Promise<void> {
        try {
            const archived = summarizeOldMemories(this.db, schedule.agentId, 30);
            updateExecutionStatus(this.db, executionId, 'completed', {
                result: `Memory maintenance completed: ${archived} memories archived and summarized.`,
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            updateExecutionStatus(this.db, executionId, 'failed', { result: message });
        }
    }

    private async execReputationAttestation(executionId: string, schedule: AgentSchedule): Promise<void> {
        if (!this.reputationScorer || !this.reputationAttestation) {
            updateExecutionStatus(this.db, executionId, 'failed', {
                result: 'Reputation services not configured',
            });
            return;
        }

        try {
            const score = this.reputationScorer.computeScore(schedule.agentId);
            const hash = await this.reputationAttestation.createAttestation(score);

            // Attempt on-chain publish via agent messenger
            let txid: string | null = null;
            if (this.agentMessenger) {
                try {
                    const note = `corvid-reputation:${schedule.agentId}:${hash}`;
                    txid = await this.agentMessenger.sendOnChainToSelf(schedule.agentId, note);
                    if (txid) {
                        this.reputationAttestation.publishOnChain(
                            schedule.agentId, hash, async () => txid!,
                        );
                    }
                } catch {
                    // On-chain publish is best-effort
                }
            }

            this.reputationScorer.setAttestationHash(schedule.agentId, hash);

            updateExecutionStatus(this.db, executionId, 'completed', {
                result: `Attestation created: hash=${hash.slice(0, 16)}... score=${score.overallScore} trust=${score.trustLevel}${txid ? ` txid=${txid}` : ' (off-chain)'}`,
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            updateExecutionStatus(this.db, executionId, 'failed', { result: message });
        }
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

    /** Send best-effort on-chain notification to the schedule's notifyAddress. */
    private notifyScheduleEvent(
        schedule: AgentSchedule,
        event: 'started' | 'completed' | 'failed',
        message: string,
    ): void {
        if (!schedule.notifyAddress || !this.agentMessenger) return;

        this.agentMessenger.sendNotificationToAddress(
            schedule.agentId,
            schedule.notifyAddress,
            `[schedule:${event}] ${message}`,
        ).catch((err) => {
            log.debug('Schedule notification send failed', {
                scheduleId: schedule.id,
                notifyAddress: schedule.notifyAddress,
                error: err instanceof Error ? err.message : String(err),
            });
        });
    }
}

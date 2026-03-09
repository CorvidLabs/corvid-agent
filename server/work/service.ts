import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import type { Database } from 'bun:sqlite';
import type { ProcessManager } from '../process/manager';
import type { WorkTask, CreateWorkTaskInput } from '../../shared/types';
import type { ClaudeStreamEvent } from '../process/types';
import { extractContentText } from '../process/types';
import { getAgent } from '../db/agents';
import { getProject } from '../db/projects';
import { createSession } from '../db/sessions';
import {
    createWorkTaskAtomic,
    getWorkTask,
    getActiveWorkTasks,
    updateWorkTaskStatus,
    listWorkTasks as dbListWorkTasks,
    cleanupStaleWorkTasks,
    resetWorkTaskForRetry,
    getActiveTaskForProject,
    pauseWorkTask,
    resumePausedTask,
    getTasksPausedBy,
    dequeueNextTask,
    countQueuedTasks,
} from '../db/work-tasks';
import { createLogger } from '../lib/logger';
import { recordAudit } from '../db/audit';
import { NotFoundError, ValidationError, ConflictError } from '../lib/errors';
import { isRepoOffLimits } from '../github/off-limits';
import { searchOpenPrsForIssue } from '../github/operations';
import { runBunInstall, runValidation } from './validation';
import type { AgentMessenger } from '../algochat/agent-messenger';
import type { AstParserService } from '../ast/service';
import { generateRepoMap, extractRelevantSymbols } from './repo-map';

const log = createLogger('WorkTaskService');

const PR_URL_REGEX = /https:\/\/github\.com\/[^\s]+\/pull\/\d+/;

const WORK_MAX_ITERATIONS = parseInt(process.env.WORK_MAX_ITERATIONS ?? '3', 10);

type CompletionCallback = (task: WorkTask) => void;

const DRAIN_TIMEOUT_MS = parseInt(process.env.WORK_DRAIN_TIMEOUT_MS ?? '300000', 10); // 5 minutes
const DRAIN_POLL_INTERVAL_MS = 10_000; // 10 seconds

export class WorkTaskService {
    private db: Database;
    private processManager: ProcessManager;
    private astParserService: AstParserService | null;
    private agentMessenger: AgentMessenger | null = null;
    private completionCallbacks: Map<string, Set<CompletionCallback>> = new Map();
    private _shuttingDown = false;

    /** True when the service is draining — no new tasks accepted. */
    get shuttingDown(): boolean {
        return this._shuttingDown;
    }

    constructor(db: Database, processManager: ProcessManager, astParserService?: AstParserService) {
        this.db = db;
        this.processManager = processManager;
        this.astParserService = astParserService ?? null;
    }

    /** Set the agent messenger (set after async AlgoChat init). */
    setAgentMessenger(messenger: AgentMessenger): void {
        this.agentMessenger = messenger;
    }

    /**
     * Recover tasks left in active states from a previous unclean shutdown.
     * Cleans up stale worktrees, then resets and retries interrupted tasks.
     */
    async recoverStaleTasks(): Promise<void> {
        const staleTasks = cleanupStaleWorkTasks(this.db);
        if (staleTasks.length === 0) return;

        log.info('Recovering stale work tasks', { count: staleTasks.length });

        // Clean up any leftover worktrees first
        for (const task of staleTasks) {
            if (task.worktreeDir) {
                await this.cleanupWorktree(task.id);
            }
        }

        // Reset interrupted tasks to pending and re-execute them
        for (const task of staleTasks) {
            try {
                // If already at max iterations, don't retry — leave as failed
                if ((task.iterationCount || 0) >= WORK_MAX_ITERATIONS) {
                    log.warn('Interrupted task at max iterations — not retrying', {
                        taskId: task.id,
                        iterationCount: task.iterationCount,
                        maxIterations: WORK_MAX_ITERATIONS,
                    });
                    continue;
                }

                const agent = getAgent(this.db, task.agentId);
                const project = getProject(this.db, task.projectId);
                if (!agent || !project || !project.workingDir) {
                    log.warn('Cannot retry interrupted task: agent or project missing', { taskId: task.id });
                    continue;
                }

                resetWorkTaskForRetry(this.db, task.id);
                log.info('Retrying interrupted work task', { taskId: task.id, description: task.description.slice(0, 80) });

                const resetTask = getWorkTask(this.db, task.id);
                if (!resetTask) continue;

                // Fire-and-forget: execute in background so recovery doesn't block startup
                this.executeTask(resetTask, agent, project).catch((err) => {
                    log.error('Failed to retry interrupted work task', {
                        taskId: task.id,
                        error: err instanceof Error ? err.message : String(err),
                    });
                });
            } catch (err) {
                log.error('Failed to reset interrupted work task for retry', {
                    taskId: task.id,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }
    }

    /**
     * Recover tasks that were interrupted by a previous unclean shutdown.
     * Unlike recoverStaleTasks (which always retries), this method only
     * requeues a task if its worktree directory still exists on disk and
     * its iteration_count is below WORK_MAX_ITERATIONS. Otherwise the
     * task is left as failed.
     */
    async recoverInterruptedTasks(): Promise<void> {
        const staleTasks = cleanupStaleWorkTasks(this.db);
        if (staleTasks.length === 0) return;

        log.info('Recovering interrupted work tasks', { count: staleTasks.length });

        for (const task of staleTasks) {
            try {
                const worktreeExists = task.worktreeDir ? existsSync(task.worktreeDir) : false;
                const canRetry = (task.iterationCount ?? 0) < WORK_MAX_ITERATIONS;

                if (!worktreeExists || !canRetry) {
                    log.info('Skipping recovery for task (worktree missing or max iterations reached)', {
                        taskId: task.id,
                        worktreeExists,
                        iterationCount: task.iterationCount,
                    });
                    // Already marked failed by cleanupStaleWorkTasks — clean up worktree if present
                    if (task.worktreeDir) {
                        await this.cleanupWorktree(task.id);
                    }
                    continue;
                }

                const agent = getAgent(this.db, task.agentId);
                const project = getProject(this.db, task.projectId);
                if (!agent || !project || !project.workingDir) {
                    log.warn('Cannot recover interrupted task: agent or project missing', { taskId: task.id });
                    continue;
                }

                resetWorkTaskForRetry(this.db, task.id);
                log.info('Requeuing interrupted work task', {
                    taskId: task.id,
                    iterationCount: task.iterationCount,
                    description: task.description.slice(0, 80),
                });

                const resetTask = getWorkTask(this.db, task.id);
                if (!resetTask) continue;

                // Fire-and-forget so recovery doesn't block startup
                this.executeTask(resetTask, agent, project).catch((err) => {
                    log.error('Failed to recover interrupted work task', {
                        taskId: task.id,
                        error: err instanceof Error ? err.message : String(err),
                    });
                });
            } catch (err) {
                log.error('Error during work task recovery', {
                    taskId: task.id,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }
    }

    /**
     * Drain running tasks during graceful shutdown.
     * Sets the shuttingDown flag to block new task creation, then waits
     * up to DRAIN_TIMEOUT_MS for all active tasks to complete, polling
     * every DRAIN_POLL_INTERVAL_MS.
     */
    async drainRunningTasks(pollIntervalMs: number = DRAIN_POLL_INTERVAL_MS): Promise<void> {
        this._shuttingDown = true;

        const activeTasks = getActiveWorkTasks(this.db);
        if (activeTasks.length === 0) {
            log.info('No active work tasks to drain');
            return;
        }

        log.info('Draining active work tasks', { count: activeTasks.length });
        const deadline = Date.now() + DRAIN_TIMEOUT_MS;

        while (Date.now() < deadline) {
            const remaining = getActiveWorkTasks(this.db);
            if (remaining.length === 0) {
                log.info('All work tasks drained successfully');
                return;
            }

            log.info('Waiting for work tasks to complete', {
                remaining: remaining.length,
                timeLeftMs: deadline - Date.now(),
            });

            await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        }

        // Timeout reached — mark remaining active tasks as failed
        const timedOut = getActiveWorkTasks(this.db);
        if (timedOut.length > 0) {
            log.warn('Drain timeout reached, marking remaining tasks as failed', { count: timedOut.length });
            for (const task of timedOut) {
                updateWorkTaskStatus(this.db, task.id, 'failed', {
                    error: 'Interrupted by server shutdown (drain timeout)',
                });
            }
        }
    }

    /**
     * Resolve the base directory for git worktrees.
     * Defaults to a `.corvid-worktrees` sibling directory next to the project.
     */
    private getWorktreeBaseDir(projectWorkingDir: string): string {
        return process.env.WORKTREE_BASE_DIR
            ?? resolve(dirname(projectWorkingDir), '.corvid-worktrees');
    }

    async create(input: CreateWorkTaskInput, tenantId?: string): Promise<WorkTask> {
        if (this._shuttingDown) {
            throw new ValidationError('Server is shutting down — new work tasks are not accepted');
        }

        // Validate agent exists
        const agent = getAgent(this.db, input.agentId, tenantId);
        if (!agent) {
            throw new NotFoundError('Agent', input.agentId);
        }

        // Resolve projectId
        const projectId = input.projectId ?? agent.defaultProjectId;
        if (!projectId) {
            throw new NotFoundError('Project', 'defaultProjectId', { agentId: input.agentId });
        }

        // Validate project exists with a workingDir
        const project = getProject(this.db, projectId, tenantId);
        if (!project) {
            throw new NotFoundError('Project', projectId);
        }
        if (!project.workingDir) {
            throw new ValidationError('Project has no workingDir', { projectId });
        }

        // Resolve repo slug from git remote (used for off-limits check and dedup)
        let repoSlug: string | null = null;
        try {
            const proc = Bun.spawn(['git', 'remote', 'get-url', 'origin'], {
                cwd: project.workingDir, stdout: 'pipe', stderr: 'pipe',
            });
            const remoteUrl = (await new Response(proc.stdout).text()).trim();
            const match = remoteUrl.match(/github\.com[:/]([^/]+\/[^/.]+)/);
            if (match) repoSlug = match[1];
        } catch {
            // Non-git directories or missing remote — allow (local-only projects)
        }

        // Check if the project's repo is off-limits
        if (repoSlug && isRepoOffLimits(repoSlug)) {
            throw new ValidationError(
                `Repository ${repoSlug} is off-limits — contributions are not allowed`,
                { projectId, repo: repoSlug },
            );
        }

        // Dedup check: if description references a GitHub issue (#NNN), skip if an open PR already exists
        if (repoSlug) {
            const issueMatch = input.description.match(/#(\d+)/);
            if (issueMatch) {
                const issueNumber = parseInt(issueMatch[1], 10);
                try {
                    const search = await searchOpenPrsForIssue(repoSlug, issueNumber);
                    if (search.ok && search.prs.length > 0) {
                        const existingPr = search.prs[0];
                        log.info('Skipping work task — PR already addresses issue', {
                            issueNumber,
                            existingPr: existingPr.number,
                            prUrl: existingPr.url,
                            repo: repoSlug,
                        });
                        throw new ConflictError(
                            `Skipping work task — PR #${existingPr.number} already addresses issue #${issueNumber}`,
                            { issueNumber, existingPr: existingPr.number, prUrl: existingPr.url },
                        );
                    }
                } catch (err) {
                    if (err instanceof ConflictError) throw err;
                    // Non-fatal: if we can't check, proceed with task creation
                    log.warn('Failed to check for existing PRs', {
                        issueNumber,
                        error: err instanceof Error ? err.message : String(err),
                    });
                }
            }
        }

        const priority = input.priority ?? 2;

        // Check if there's an active task on this project
        const activeTask = getActiveTaskForProject(this.db, projectId);

        if (activeTask && activeTask.priority <= priority) {
            // Active task has equal or higher priority — queue the new task
            const task = createWorkTaskAtomic(this.db, {
                agentId: input.agentId,
                projectId,
                description: input.description,
                source: input.source,
                sourceId: input.sourceId,
                requesterInfo: input.requesterInfo,
                priority,
                tenantId,
            });
            if (!task) {
                throw new ConflictError('Another task is already active on project', { projectId });
            }

            // Mark as queued (waiting for active task to finish)
            updateWorkTaskStatus(this.db, task.id, 'queued');

            log.info('Work task queued behind active task', {
                taskId: task.id,
                activeTaskId: activeTask.id,
                taskPriority: priority,
                activePriority: activeTask.priority,
            });

            this.emitCreationNotifications(task, input);
            return getWorkTask(this.db, task.id) ?? task;
        }

        if (activeTask && priority < activeTask.priority) {
            // New task has HIGHER priority — preempt the active task
            log.info('Preempting lower-priority task', {
                preemptingPriority: priority,
                preemptedTaskId: activeTask.id,
                preemptedPriority: activeTask.priority,
            });

            // Stop the running session if active
            if (activeTask.sessionId && this.processManager.isRunning(activeTask.sessionId)) {
                this.processManager.stopProcess(activeTask.sessionId);
            }

            // Create new task (we bypass atomic check since we're handling concurrency ourselves)
            const { createWorkTask } = await import('../db/work-tasks');
            const task = createWorkTask(this.db, {
                agentId: input.agentId,
                projectId,
                description: input.description,
                source: input.source,
                sourceId: input.sourceId,
                requesterInfo: input.requesterInfo,
                priority,
                tenantId,
            });

            // Pause the preempted task
            pauseWorkTask(this.db, activeTask.id, task.id);

            log.info('Work task created with preemption', {
                taskId: task.id,
                preemptedTaskId: activeTask.id,
                priority,
            });

            this.emitCreationNotifications(task, input);
            return this.executeTask(task, agent, project);
        }

        // No active task — run immediately
        const task = createWorkTaskAtomic(this.db, {
            agentId: input.agentId,
            projectId,
            description: input.description,
            source: input.source,
            sourceId: input.sourceId,
            requesterInfo: input.requesterInfo,
            priority,
            tenantId,
        });
        if (!task) {
            throw new ConflictError('Another task is already active on project', { projectId });
        }

        log.info('Work task created', { taskId: task.id, agentId: input.agentId, projectId, priority });

        this.emitCreationNotifications(task, input);
        return this.executeTask(task, agent, project);
    }

    private emitCreationNotifications(task: WorkTask, input: CreateWorkTaskInput): void {
        // Fire-and-forget AlgoChat notification for task creation
        if (this.agentMessenger) {
            const snippet = input.description.slice(0, 100);
            const priorityLabel = ['P0', 'P1', 'P2', 'P3'][task.priority];
            this.agentMessenger.sendOnChainToSelf(input.agentId, `[WORK_TASK:created:${priorityLabel}] ${snippet}`).catch(() => {});
        }

        recordAudit(
            this.db,
            'work_task_create',
            input.agentId,
            'work_task',
            task.id,
            `Created work task (P${task.priority}): ${input.description.slice(0, 200)}`,
        );
    }

    /**
     * Execute a pending work task: create worktree, install deps, start session.
     * Shared by both `create` (new tasks) and `recoverStaleTasks` (retried tasks).
     */
    private async executeTask(task: WorkTask, agent: { id: string; name: string }, project: { id: string; workingDir: string }): Promise<WorkTask> {
        // Generate branch name
        const agentSlug = agent.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const taskSlug = task.description.slice(0, 40).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const timestamp = Date.now().toString(36);
        const suffix = crypto.randomUUID().slice(0, 6);
        const branchName = `agent/${agentSlug}/${taskSlug}-${timestamp}-${suffix}`;

        // Update status to branching
        updateWorkTaskStatus(this.db, task.id, 'branching');

        // Create git worktree (isolated directory — does not touch the main working tree)
        const worktreeBase = this.getWorktreeBaseDir(project.workingDir);
        const worktreeDir = resolve(worktreeBase, task.id);

        try {
            const worktreeProc = Bun.spawn(
                ['git', 'worktree', 'add', '-b', branchName, worktreeDir],
                {
                    cwd: project.workingDir,
                    stdout: 'pipe',
                    stderr: 'pipe',
                },
            );
            const stderr = await new Response(worktreeProc.stderr).text();
            const exitCode = await worktreeProc.exited;

            if (exitCode !== 0) {
                updateWorkTaskStatus(this.db, task.id, 'failed', {
                    error: `Failed to create worktree: ${stderr.trim()}`,
                });
                const failed = getWorkTask(this.db, task.id);
                return failed ?? task;
            }
        } catch (err) {
            updateWorkTaskStatus(this.db, task.id, 'failed', {
                error: `Failed to create worktree: ${err instanceof Error ? err.message : String(err)}`,
            });
            const failed = getWorkTask(this.db, task.id);
            return failed ?? task;
        }

        // Install dependencies in the worktree (worktrees don't share node_modules).
        try {
            await runBunInstall(worktreeDir);
        } catch (err) {
            log.warn('Failed to install dependencies in worktree', {
                taskId: task.id,
                error: err instanceof Error ? err.message : String(err),
            });
            // Non-fatal — the agent session may still succeed if deps are available
        }

        // Update status to running with iteration count 1
        updateWorkTaskStatus(this.db, task.id, 'running', {
            branchName,
            worktreeDir,
            iterationCount: 1,
        });

        // Generate repo map for structural awareness (best-effort)
        const repoMap = this.astParserService
            ? await generateRepoMap(this.astParserService, worktreeDir)
            : null;

        // Extract relevant symbols based on task description keywords
        const relevantSymbols = this.astParserService
            ? extractRelevantSymbols(this.astParserService, worktreeDir, task.description)
            : null;

        // Build work prompt
        const prompt = this.buildWorkPrompt(branchName, task.description, repoMap ?? undefined, relevantSymbols ?? undefined);

        // Create session with workDir pointing to the worktree
        const session = createSession(this.db, {
            projectId: project.id,
            agentId: agent.id,
            name: `Work: ${task.description.slice(0, 60)}`,
            initialPrompt: prompt,
            source: task.source ?? 'web',
            workDir: worktreeDir,
        });

        updateWorkTaskStatus(this.db, task.id, 'running', { sessionId: session.id, branchName });

        // Subscribe for completion
        this.subscribeForCompletion(task.id, session.id);

        // Start the process
        this.processManager.startProcess(session, prompt);

        log.info('Work task running', {
            taskId: task.id,
            sessionId: session.id,
            branchName,
            worktreeDir,
        });

        const updated = getWorkTask(this.db, task.id);
        return updated ?? task;
    }

    getTask(id: string, tenantId?: string): WorkTask | null {
        return getWorkTask(this.db, id, tenantId);
    }

    listTasks(agentId?: string, tenantId?: string): WorkTask[] {
        return dbListWorkTasks(this.db, agentId, tenantId);
    }

    /**
     * Retry a failed work task: reset it to pending and re-execute from scratch.
     */
    async retryTask(id: string, tenantId?: string): Promise<WorkTask | null> {
        if (this._shuttingDown) {
            throw new ValidationError('Server is shutting down — retries are not accepted');
        }

        const task = getWorkTask(this.db, id, tenantId);
        if (!task) return null;

        if (task.status !== 'failed') {
            throw new ValidationError('Only failed tasks can be retried', { taskId: id, status: task.status });
        }

        const agent = getAgent(this.db, task.agentId, tenantId);
        if (!agent) {
            throw new NotFoundError('Agent', task.agentId);
        }

        const project = getProject(this.db, task.projectId, tenantId);
        if (!project || !project.workingDir) {
            throw new NotFoundError('Project', task.projectId);
        }

        if (task.worktreeDir) {
            await this.cleanupWorktree(task.id);
        }

        resetWorkTaskForRetry(this.db, task.id);

        log.info('Retrying failed work task', { taskId: task.id, description: task.description.slice(0, 80) });

        recordAudit(
            this.db,
            'work_task_retry',
            task.agentId,
            'work_task',
            task.id,
            `Retried work task: ${task.description.slice(0, 200)}`,
        );

        const resetTask = getWorkTask(this.db, task.id);
        if (!resetTask) return null;

        return this.executeTask(resetTask, agent, project);
    }

    async cancelTask(id: string): Promise<WorkTask | null> {
        const task = getWorkTask(this.db, id);
        if (!task) return null;

        if (task.sessionId && this.processManager.isRunning(task.sessionId)) {
            this.processManager.stopProcess(task.sessionId);
        }

        updateWorkTaskStatus(this.db, id, 'failed', { error: 'Cancelled by user' });

        // Clean up worktree
        await this.cleanupWorktree(id);

        const cancelled = getWorkTask(this.db, id);

        // Process queue — resume paused tasks and dequeue next
        if (cancelled) {
            this.processQueue(cancelled).catch((err) => {
                log.error('Failed to process queue after cancel', {
                    taskId: id,
                    error: err instanceof Error ? err.message : String(err),
                });
            });
        }

        return cancelled;
    }

    onComplete(taskId: string, callback: CompletionCallback): void {
        let callbacks = this.completionCallbacks.get(taskId);
        if (!callbacks) {
            callbacks = new Set();
            this.completionCallbacks.set(taskId, callbacks);
        }
        callbacks.add(callback);
    }

    private subscribeForCompletion(taskId: string, sessionId: string): void {
        let responseBuffer = '';

        const callback = (sid: string, event: ClaudeStreamEvent) => {
            if (sid !== sessionId) return;

            if (event.type === 'assistant' && event.message?.content) {
                responseBuffer += extractContentText(event.message.content);
            }

            if (event.type === 'result' || event.type === 'session_exited') {
                this.processManager.unsubscribe(sessionId, callback);

                const fullOutput = responseBuffer.trim();

                // Run post-session validation
                this.handleSessionEnd(taskId, fullOutput);
            }
        };

        this.processManager.subscribe(sessionId, callback);
    }

    private async handleSessionEnd(taskId: string, sessionOutput: string): Promise<void> {
        const task = getWorkTask(this.db, taskId);
        if (!task || !task.projectId) return;

        // Use the worktree directory for validation (or fall back to project dir)
        const validationDir = task.worktreeDir ?? getProject(this.db, task.projectId)?.workingDir;
        if (!validationDir) {
            await this.finalizeTask(taskId, sessionOutput);
            return;
        }

        // Set status to validating
        updateWorkTaskStatus(this.db, taskId, 'validating');
        log.info('Running post-session validation', { taskId });

        const validation = await runValidation(validationDir);
        const iteration = task.iterationCount || 1;

        if (validation.passed) {
            log.info('Validation passed', { taskId, iteration });
            await this.finalizeTask(taskId, sessionOutput);
            return;
        }

        log.warn('Validation failed', { taskId, iteration, maxIterations: WORK_MAX_ITERATIONS });

        if (iteration >= WORK_MAX_ITERATIONS) {
            // Max iterations reached — fail the task
            updateWorkTaskStatus(this.db, taskId, 'failed', {
                error: `Validation failed after ${iteration} iteration(s):\n${validation.output.slice(0, 2000)}`,
                summary: sessionOutput.slice(-500).trim(),
            });
            await this.cleanupWorktree(taskId);
            this.notifyCallbacks(taskId);
            return;
        }

        // Spawn a follow-up iteration — increment iteration count in DB
        updateWorkTaskStatus(this.db, taskId, 'running', { iterationCount: iteration + 1 });

        const branchName = task.branchName ?? 'unknown';
        const iterationPrompt = this.buildIterationPrompt(branchName, validation.output);

        const session = createSession(this.db, {
            projectId: task.projectId,
            agentId: task.agentId,
            name: `Work iteration ${iteration + 1}: ${task.description.slice(0, 40)}`,
            initialPrompt: iterationPrompt,
            source: task.source,
            workDir: task.worktreeDir ?? undefined,
        });

        updateWorkTaskStatus(this.db, taskId, 'running', { sessionId: session.id });

        // Subscribe and start the new session
        this.subscribeForCompletion(taskId, session.id);
        this.processManager.startProcess(session, iterationPrompt);

        log.info('Spawned iteration session', {
            taskId,
            sessionId: session.id,
            iteration: iteration + 1,
        });
    }

    private async finalizeTask(taskId: string, sessionOutput: string): Promise<void> {
        let prUrl = sessionOutput.match(PR_URL_REGEX)?.[0] ?? null;

        // Service-level fallback: if the agent didn't produce a PR URL (common with
        // Ollama models), push the branch and create the PR ourselves.
        if (!prUrl) {
            prUrl = await this.createPrFallback(taskId, sessionOutput);
        }

        if (prUrl) {
            const summary = sessionOutput.slice(-500).trim();
            updateWorkTaskStatus(this.db, taskId, 'completed', { prUrl, summary });
            log.info('Work task completed with PR', { taskId, prUrl });

            recordAudit(this.db, 'work_task_complete', 'system', 'work_task', taskId, `Completed with PR: ${prUrl}`);
        } else {
            updateWorkTaskStatus(this.db, taskId, 'failed', {
                error: 'Session completed but no PR URL was found in output and service-level PR creation failed',
                summary: sessionOutput.slice(-500).trim(),
            });
            log.warn('Work task completed without PR URL', { taskId });
        }

        // Clean up the worktree (the branch persists for PR purposes)
        await this.cleanupWorktree(taskId);

        // Notify callbacks
        this.notifyCallbacks(taskId);
    }

    /**
     * Fallback PR creation: push the branch and run `gh pr create` at the service level.
     * Called when the agent session completed successfully (validation passed) but
     * did not output a PR URL — common with Ollama models that struggle with gh CLI.
     */
    private async createPrFallback(taskId: string, sessionOutput: string): Promise<string | null> {
        const task = getWorkTask(this.db, taskId);
        if (!task?.branchName || !task.worktreeDir) return null;

        const cwd = task.worktreeDir;

        try {
            // Ensure all changes are committed (agent may have left unstaged changes)
            const statusProc = Bun.spawn(['git', 'diff', '--quiet'], { cwd, stdout: 'pipe', stderr: 'pipe' });
            await statusProc.exited;
            if (await statusProc.exited !== 0) {
                // There are uncommitted changes — commit them
                const addProc = Bun.spawn(['git', 'add', '-A'], { cwd, stdout: 'pipe', stderr: 'pipe' });
                await addProc.exited;
                const commitProc = Bun.spawn(
                    ['git', 'commit', '-m', `Work task: ${task.description.slice(0, 60)}`],
                    { cwd, stdout: 'pipe', stderr: 'pipe' },
                );
                await commitProc.exited;
            }

            // Push the branch
            log.info('Fallback: pushing branch', { taskId, branch: task.branchName });
            const pushProc = Bun.spawn(
                ['git', 'push', '-u', 'origin', task.branchName],
                { cwd, stdout: 'pipe', stderr: 'pipe' },
            );
            const pushStderr = await new Response(pushProc.stderr).text();
            const pushExit = await pushProc.exited;

            if (pushExit !== 0) {
                log.warn('Fallback: git push failed', { taskId, stderr: pushStderr.trim() });
                return null;
            }

            // Create PR via gh CLI
            const title = `[Agent] ${task.description.slice(0, 60)}`;
            const body = `Automated work task.\n\n**Description:** ${task.description}\n\n**Summary:** ${sessionOutput.slice(-300).trim()}`;
            log.info('Fallback: creating PR', { taskId, branch: task.branchName });

            const prProc = Bun.spawn(
                ['gh', 'pr', 'create', '--title', title, '--body', body, '--head', task.branchName],
                { cwd, stdout: 'pipe', stderr: 'pipe' },
            );
            const prStdout = await new Response(prProc.stdout).text();
            const prStderr = await new Response(prProc.stderr).text();
            const prExit = await prProc.exited;

            if (prExit !== 0) {
                log.warn('Fallback: gh pr create failed', { taskId, stderr: prStderr.trim() });
                return null;
            }

            const prUrl = prStdout.match(PR_URL_REGEX)?.[0] ?? null;
            if (prUrl) {
                log.info('Fallback: PR created successfully', { taskId, prUrl });
            }
            return prUrl;
        } catch (err) {
            log.warn('Fallback PR creation error', {
                taskId,
                error: err instanceof Error ? err.message : String(err),
            });
            return null;
        }
    }

    private notifyCallbacks(taskId: string): void {
        const task = getWorkTask(this.db, taskId);
        if (task) {
            // Fire-and-forget AlgoChat notification for task completion/failure
            if (this.agentMessenger && task.agentId) {
                const msg = task.status === 'completed'
                    ? `[WORK_TASK:completed] ${task.prUrl ? `PR: ${task.prUrl}` : task.description.slice(0, 100)}`
                    : `[WORK_TASK:failed] ${(task.error ?? task.description).slice(0, 100)}`;
                this.agentMessenger.sendOnChainToSelf(task.agentId, msg).catch(() => {});
            }

            const callbacks = this.completionCallbacks.get(taskId);
            if (callbacks) {
                for (const cb of callbacks) {
                    try {
                        cb(task);
                    } catch (err) {
                        log.error('Completion callback error', {
                            taskId,
                            error: err instanceof Error ? err.message : String(err),
                        });
                    }
                }
                this.completionCallbacks.delete(taskId);
            }

            // Resume paused tasks and process queue
            this.processQueue(task).catch((err) => {
                log.error('Failed to process queue after task completion', {
                    taskId,
                    error: err instanceof Error ? err.message : String(err),
                });
            });
        }
    }

    /**
     * After a task completes or fails, resume any tasks it paused
     * and dequeue the next highest-priority task for the project.
     */
    private async processQueue(completedTask: WorkTask): Promise<void> {
        if (this._shuttingDown) return;

        // Resume tasks that were paused by this task
        const pausedTasks = getTasksPausedBy(this.db, completedTask.id);
        for (const paused of pausedTasks) {
            resumePausedTask(this.db, paused.id);
            log.info('Resumed paused task', { taskId: paused.id, resumedAfter: completedTask.id });
        }

        // Dequeue next task for this project (highest priority first)
        const next = dequeueNextTask(this.db, completedTask.projectId);
        if (!next) return;

        const agent = getAgent(this.db, next.agentId);
        const project = getProject(this.db, next.projectId);
        if (!agent || !project || !project.workingDir) {
            log.warn('Cannot dequeue task: agent or project missing', { taskId: next.id });
            updateWorkTaskStatus(this.db, next.id, 'failed', {
                error: 'Agent or project missing when dequeuing',
            });
            return;
        }

        log.info('Dequeuing next task from priority queue', {
            taskId: next.id,
            priority: next.priority,
            queuedRemaining: countQueuedTasks(this.db, next.projectId),
        });

        this.executeTask(next, agent, project).catch((err) => {
            log.error('Failed to execute dequeued task', {
                taskId: next.id,
                error: err instanceof Error ? err.message : String(err),
            });
        });
    }

    private buildIterationPrompt(branchName: string, validationOutput: string): string {
        return `You are on branch "${branchName}". A previous session made changes but validation failed.

## Validation Errors
\`\`\`
${validationOutput}
\`\`\`

## Instructions
1. Read the errors above carefully.
2. Fix the TypeScript and/or test failures on this branch.
3. Commit your fixes with clear messages.
4. Verify your changes work:
   bun x tsc --noEmit --skipLibCheck
   bun test
   Fix any remaining issues.
5. If a PR already exists, push your fixes. If not, create one:
   gh pr create --title "<concise title>" --body "<summary of changes>"
6. Output the PR URL as the final line of your response.

Important: You MUST ensure all validation passes and output the PR URL.`;
    }

    /**
     * Remove the git worktree for a task. The branch itself is kept
     * (it's needed for PRs and review).
     */
    private async cleanupWorktree(taskId: string): Promise<void> {
        const task = getWorkTask(this.db, taskId);
        if (!task?.worktreeDir) return;

        const project = getProject(this.db, task.projectId);
        if (!project?.workingDir) return;

        try {
            const proc = Bun.spawn(
                ['git', 'worktree', 'remove', '--force', task.worktreeDir],
                {
                    cwd: project.workingDir,
                    stdout: 'pipe',
                    stderr: 'pipe',
                },
            );
            const stderr = await new Response(proc.stderr).text();
            const exitCode = await proc.exited;

            if (exitCode !== 0) {
                log.warn('Failed to remove worktree', { taskId, worktreeDir: task.worktreeDir, stderr: stderr.trim() });
            } else {
                log.info('Removed worktree', { taskId, worktreeDir: task.worktreeDir });
            }
        } catch (err) {
            log.warn('Error removing worktree', {
                taskId,
                worktreeDir: task.worktreeDir,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    private buildWorkPrompt(branchName: string, description: string, repoMap?: string, relevantSymbols?: string): string {
        const repoMapSection = repoMap
            ? `\n## Repository Map\nTop-level exported symbols per file (with line ranges):\n\`\`\`\n${repoMap}\`\`\`\n`
            : '';

        const relevantSymbolsSection = relevantSymbols
            ? `\n## Relevant Symbols\nSymbols matching keywords from the task description — likely starting points:\n\`\`\`\n${relevantSymbols}\n\`\`\`\nUse \`corvid_code_symbols\` and \`corvid_find_references\` tools for deeper exploration of these symbols.\n`
            : '';

        return `You are working on a task. A git branch "${branchName}" has been created and checked out.

## Task
${description}
${repoMapSection}${relevantSymbolsSection}
## Instructions
1. Explore the codebase as needed to understand the context.
2. Implement the changes on this branch.
3. Commit with clear, descriptive messages as you go.
4. Verify your changes work:
   bun x tsc --noEmit --skipLibCheck
   bun test
   Fix any issues before creating the PR.
5. When done, create a PR:
   gh pr create --title "<concise title>" --body "<summary of changes>"
6. Output the PR URL as the final line of your response.

Important: You MUST create a PR when finished. The PR URL will be captured to report back to the requester.`;
    }

}

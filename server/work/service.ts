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
    updateWorkTaskStatus,
    listWorkTasks as dbListWorkTasks,
    cleanupStaleWorkTasks,
} from '../db/work-tasks';
import { createLogger } from '../lib/logger';

const log = createLogger('WorkTaskService');

const PR_URL_REGEX = /https:\/\/github\.com\/[^\s]+\/pull\/\d+/;

const WORK_MAX_ITERATIONS = parseInt(process.env.WORK_MAX_ITERATIONS ?? '3', 10);

type CompletionCallback = (task: WorkTask) => void;

export class WorkTaskService {
    private db: Database;
    private processManager: ProcessManager;
    private completionCallbacks: Map<string, Set<CompletionCallback>> = new Map();

    constructor(db: Database, processManager: ProcessManager) {
        this.db = db;
        this.processManager = processManager;
    }

    /**
     * Recover tasks left in active states from a previous unclean shutdown.
     * Marks them as failed and attempts to restore their original branches.
     */
    async recoverStaleTasks(): Promise<void> {
        const staleTasks = cleanupStaleWorkTasks(this.db);
        if (staleTasks.length === 0) return;

        log.info('Recovering stale work tasks', { count: staleTasks.length });

        for (const task of staleTasks) {
            if (task.originalBranch) {
                const project = getProject(this.db, task.projectId);
                if (project?.workingDir) {
                    try {
                        await this.checkoutBranch(project.workingDir, task.originalBranch);
                        log.info('Restored branch for stale task', { taskId: task.id, branch: task.originalBranch });
                    } catch (err) {
                        log.warn('Failed to restore branch for stale task', {
                            taskId: task.id,
                            branch: task.originalBranch,
                            error: err instanceof Error ? err.message : String(err),
                        });
                    }
                }
            }
        }
    }

    async create(input: CreateWorkTaskInput): Promise<WorkTask> {
        // Validate agent exists
        const agent = getAgent(this.db, input.agentId);
        if (!agent) {
            throw new Error(`Agent ${input.agentId} not found`);
        }

        // Resolve projectId
        const projectId = input.projectId ?? agent.defaultProjectId;
        if (!projectId) {
            throw new Error('No projectId provided and agent has no defaultProjectId');
        }

        // Validate project exists with a workingDir
        const project = getProject(this.db, projectId);
        if (!project) {
            throw new Error(`Project ${projectId} not found`);
        }
        if (!project.workingDir) {
            throw new Error(`Project ${projectId} has no workingDir`);
        }

        // Atomic insert — fails if a concurrent active task exists on this project
        const task = createWorkTaskAtomic(this.db, {
            agentId: input.agentId,
            projectId,
            description: input.description,
            source: input.source,
            sourceId: input.sourceId,
            requesterInfo: input.requesterInfo,
        });
        if (!task) {
            throw new Error(`Another task is already active on project ${projectId}`);
        }

        log.info('Work task created', { taskId: task.id, agentId: input.agentId, projectId });

        // Generate branch name
        const agentSlug = agent.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const taskSlug = input.description.slice(0, 40).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const timestamp = Date.now().toString(36);
        const suffix = crypto.randomUUID().slice(0, 6);
        const branchName = `agent/${agentSlug}/${taskSlug}-${timestamp}-${suffix}`;

        // Update status to branching
        updateWorkTaskStatus(this.db, task.id, 'branching');

        // Check for dirty working directory
        try {
            const statusProc = Bun.spawn(['git', 'status', '--porcelain'], {
                cwd: project.workingDir,
                stdout: 'pipe',
                stderr: 'pipe',
            });
            const statusOutput = await new Response(statusProc.stdout).text();
            await statusProc.exited;

            if (statusOutput.trim()) {
                updateWorkTaskStatus(this.db, task.id, 'failed', {
                    error: `Working directory is dirty. Please commit or stash changes first.\n${statusOutput.trim()}`,
                });
                const failed = getWorkTask(this.db, task.id);
                return failed ?? task;
            }
        } catch (err) {
            updateWorkTaskStatus(this.db, task.id, 'failed', {
                error: `Failed to check git status: ${err instanceof Error ? err.message : String(err)}`,
            });
            const failed = getWorkTask(this.db, task.id);
            return failed ?? task;
        }

        // Capture the current branch before checkout and persist to DB
        try {
            const currentBranch = await this.getCurrentBranch(project.workingDir);
            updateWorkTaskStatus(this.db, task.id, 'branching', { originalBranch: currentBranch });
        } catch {
            // Non-fatal — worst case we can't restore after completion
            log.warn('Could not determine current branch', { taskId: task.id });
        }

        // Create git branch
        try {
            const branchProc = Bun.spawn(['git', 'checkout', '-b', branchName], {
                cwd: project.workingDir,
                stdout: 'pipe',
                stderr: 'pipe',
            });
            const stderr = await new Response(branchProc.stderr).text();
            const exitCode = await branchProc.exited;

            if (exitCode !== 0) {
                updateWorkTaskStatus(this.db, task.id, 'failed', {
                    error: `Failed to create branch: ${stderr.trim()}`,
                });
                const failed = getWorkTask(this.db, task.id);
                return failed ?? task;
            }
        } catch (err) {
            updateWorkTaskStatus(this.db, task.id, 'failed', {
                error: `Failed to create branch: ${err instanceof Error ? err.message : String(err)}`,
            });
            const failed = getWorkTask(this.db, task.id);
            return failed ?? task;
        }

        // Update status to running with iteration count 1
        updateWorkTaskStatus(this.db, task.id, 'running', { branchName, iterationCount: 1 });

        // Build work prompt
        const prompt = this.buildWorkPrompt(branchName, input.description);

        // Create session
        const session = createSession(this.db, {
            projectId,
            agentId: input.agentId,
            name: `Work: ${input.description.slice(0, 60)}`,
            initialPrompt: prompt,
            source: input.source ?? 'web',
        });

        updateWorkTaskStatus(this.db, task.id, 'running', { sessionId: session.id, branchName });

        // Subscribe for completion
        this.subscribeForCompletion(task.id, session.id);

        // Start the process
        this.processManager.startProcess(session, prompt);

        log.info('Work task running', { taskId: task.id, sessionId: session.id, branchName });

        const updated = getWorkTask(this.db, task.id);
        return updated ?? task;
    }

    getTask(id: string): WorkTask | null {
        return getWorkTask(this.db, id);
    }

    listTasks(agentId?: string): WorkTask[] {
        return dbListWorkTasks(this.db, agentId);
    }

    async cancelTask(id: string): Promise<WorkTask | null> {
        const task = getWorkTask(this.db, id);
        if (!task) return null;

        if (task.sessionId && this.processManager.isRunning(task.sessionId)) {
            this.processManager.stopProcess(task.sessionId);
        }

        updateWorkTaskStatus(this.db, id, 'failed', { error: 'Cancelled by user' });

        // Restore original branch (awaited)
        await this.restoreOriginalBranch(id);

        return getWorkTask(this.db, id);
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

        const project = getProject(this.db, task.projectId);
        if (!project?.workingDir) {
            await this.finalizeTask(taskId, sessionOutput);
            return;
        }

        // Set status to validating
        updateWorkTaskStatus(this.db, taskId, 'validating');
        log.info('Running post-session validation', { taskId });

        const validation = await this.runValidation(project.workingDir);
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
            await this.restoreOriginalBranch(taskId);
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
        const prMatch = sessionOutput.match(PR_URL_REGEX);

        if (prMatch) {
            const prUrl = prMatch[0];
            const summary = sessionOutput.slice(-500).trim();
            updateWorkTaskStatus(this.db, taskId, 'completed', { prUrl, summary });
            log.info('Work task completed with PR', { taskId, prUrl });
        } else {
            updateWorkTaskStatus(this.db, taskId, 'failed', {
                error: 'Session completed but no PR URL was found in output',
                summary: sessionOutput.slice(-500).trim(),
            });
            log.warn('Work task completed without PR URL', { taskId });
        }

        // Restore original branch (awaited)
        await this.restoreOriginalBranch(taskId);

        // Notify callbacks
        this.notifyCallbacks(taskId);
    }

    private notifyCallbacks(taskId: string): void {
        const task = getWorkTask(this.db, taskId);
        if (task) {
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
        }
    }

    private async runValidation(workingDir: string): Promise<{ passed: boolean; output: string }> {
        const outputs: string[] = [];
        let passed = true;

        // Run TypeScript check
        try {
            const tscProc = Bun.spawn(['bunx', 'tsc', '--noEmit', '--skipLibCheck'], {
                cwd: workingDir,
                stdout: 'pipe',
                stderr: 'pipe',
            });
            const tscStdout = await new Response(tscProc.stdout).text();
            const tscStderr = await new Response(tscProc.stderr).text();
            const tscExit = await tscProc.exited;

            const tscOutput = (tscStdout + tscStderr).trim();
            if (tscExit !== 0) {
                passed = false;
                outputs.push(`=== TypeScript Check Failed (exit ${tscExit}) ===\n${tscOutput}`);
            } else {
                outputs.push('=== TypeScript Check Passed ===');
            }
        } catch (err) {
            passed = false;
            outputs.push(`=== TypeScript Check Error ===\n${err instanceof Error ? err.message : String(err)}`);
        }

        // Run tests
        try {
            const testProc = Bun.spawn(['bun', 'test'], {
                cwd: workingDir,
                stdout: 'pipe',
                stderr: 'pipe',
            });
            const testStdout = await new Response(testProc.stdout).text();
            const testStderr = await new Response(testProc.stderr).text();
            const testExit = await testProc.exited;

            const testOutput = (testStdout + testStderr).trim();
            if (testExit !== 0) {
                passed = false;
                outputs.push(`=== Tests Failed (exit ${testExit}) ===\n${testOutput}`);
            } else {
                outputs.push('=== Tests Passed ===');
            }
        } catch (err) {
            passed = false;
            outputs.push(`=== Test Runner Error ===\n${err instanceof Error ? err.message : String(err)}`);
        }

        return { passed, output: outputs.join('\n\n') };
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
   bunx tsc --noEmit --skipLibCheck
   bun test
   Fix any remaining issues.
5. If a PR already exists, push your fixes. If not, create one:
   gh pr create --title "<concise title>" --body "<summary of changes>"
6. Output the PR URL as the final line of your response.

Important: You MUST ensure all validation passes and output the PR URL.`;
    }

    private async getCurrentBranch(workingDir: string): Promise<string> {
        const proc = Bun.spawn(['git', 'branch', '--show-current'], {
            cwd: workingDir,
            stdout: 'pipe',
            stderr: 'pipe',
        });
        const stdout = await new Response(proc.stdout).text();
        const exitCode = await proc.exited;

        if (exitCode !== 0) {
            throw new Error('Failed to get current branch');
        }
        return stdout.trim();
    }

    private async checkoutBranch(workingDir: string, branchName: string): Promise<void> {
        const proc = Bun.spawn(['git', 'checkout', branchName], {
            cwd: workingDir,
            stdout: 'pipe',
            stderr: 'pipe',
        });
        const stderr = await new Response(proc.stderr).text();
        const exitCode = await proc.exited;

        if (exitCode !== 0) {
            log.warn('Failed to checkout branch', { branchName, stderr: stderr.trim() });
        }
    }

    private async restoreOriginalBranch(taskId: string): Promise<void> {
        const task = getWorkTask(this.db, taskId);
        if (!task?.originalBranch) return;

        const project = getProject(this.db, task.projectId);
        if (!project?.workingDir) return;

        try {
            await this.checkoutBranch(project.workingDir, task.originalBranch);
            log.info('Restored original branch', { taskId, branch: task.originalBranch });
        } catch (err) {
            log.warn('Failed to restore original branch', {
                taskId,
                branch: task.originalBranch,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    private buildWorkPrompt(branchName: string, description: string): string {
        return `You are working on a task. A git branch "${branchName}" has been created and checked out.

## Task
${description}

## Instructions
1. Explore the codebase as needed to understand the context.
2. Implement the changes on this branch.
3. Commit with clear, descriptive messages as you go.
4. Verify your changes work:
   bunx tsc --noEmit --skipLibCheck
   bun test
   Fix any issues before creating the PR.
5. When done, create a PR:
   gh pr create --title "<concise title>" --body "<summary of changes>"
6. Output the PR URL as the final line of your response.

Important: You MUST create a PR when finished. The PR URL will be captured to report back to the requester.`;
    }
}

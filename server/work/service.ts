import type { Database } from 'bun:sqlite';
import type { ProcessManager } from '../process/manager';
import type { WorkTask, CreateWorkTaskInput } from '../../shared/types';
import type { ClaudeStreamEvent } from '../process/types';
import { extractContentText } from '../process/types';
import { getAgent } from '../db/agents';
import { getProject } from '../db/projects';
import { createSession } from '../db/sessions';
import {
    createWorkTask,
    getWorkTask,
    updateWorkTaskStatus,
    listWorkTasks as dbListWorkTasks,
} from '../db/work-tasks';
import { createLogger } from '../lib/logger';

const log = createLogger('WorkTaskService');

const PR_URL_REGEX = /https:\/\/github\.com\/[^\s]+\/pull\/\d+/;

type CompletionCallback = (task: WorkTask) => void;

export class WorkTaskService {
    private db: Database;
    private processManager: ProcessManager;
    private completionCallbacks: Map<string, Set<CompletionCallback>> = new Map();

    constructor(db: Database, processManager: ProcessManager) {
        this.db = db;
        this.processManager = processManager;
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

        // Check for concurrent tasks on the same project
        const existingTasks = dbListWorkTasks(this.db);
        const concurrentTask = existingTasks.find(
            (t) => t.projectId === projectId && (t.status === 'branching' || t.status === 'running'),
        );
        if (concurrentTask) {
            throw new Error(`Another task is already ${concurrentTask.status} on project ${projectId} (task ${concurrentTask.id})`);
        }

        // Insert work_tasks row
        const task = createWorkTask(this.db, {
            agentId: input.agentId,
            projectId,
            description: input.description,
            source: input.source,
            sourceId: input.sourceId,
            requesterInfo: input.requesterInfo,
        });

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

        // Update status to running
        updateWorkTaskStatus(this.db, task.id, 'running', { branchName });

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

    cancelTask(id: string): WorkTask | null {
        const task = getWorkTask(this.db, id);
        if (!task) return null;

        if (task.sessionId && this.processManager.isRunning(task.sessionId)) {
            this.processManager.stopProcess(task.sessionId);
        }

        updateWorkTaskStatus(this.db, id, 'failed', { error: 'Cancelled by user' });
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
                const prMatch = fullOutput.match(PR_URL_REGEX);

                if (prMatch) {
                    const prUrl = prMatch[0];
                    // Extract a summary from the last portion of output
                    const summary = fullOutput.slice(-500).trim();
                    updateWorkTaskStatus(this.db, taskId, 'completed', { prUrl, summary });
                    log.info('Work task completed with PR', { taskId, prUrl });
                } else {
                    updateWorkTaskStatus(this.db, taskId, 'failed', {
                        error: 'Session completed but no PR URL was found in output',
                        summary: fullOutput.slice(-500).trim(),
                    });
                    log.warn('Work task completed without PR URL', { taskId });
                }

                // Notify callbacks
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
        };

        this.processManager.subscribe(sessionId, callback);
    }

    private buildWorkPrompt(branchName: string, description: string): string {
        return `You are working on a task. A git branch "${branchName}" has been created and checked out.

## Task
${description}

## Instructions
1. Explore the codebase as needed to understand the context.
2. Implement the changes on this branch.
3. Commit with clear, descriptive messages as you go.
4. When done, create a PR:
   gh pr create --title "<concise title>" --body "<summary of changes>"
5. Output the PR URL as the final line of your response.

Important: You MUST create a PR when finished. The PR URL will be captured to report back to the requester.`;
    }
}

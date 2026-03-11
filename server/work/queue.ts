import type { Database } from 'bun:sqlite';
import type { WorkTaskService } from './service';
import type { WorkTask, CreateWorkTaskInput } from '../../shared/types';
import {
    countActiveTasks,
    countPendingTasks,
    dispatchCandidates,
    getActiveTasksByProject,
    updateWorkTaskStatus,
} from '../db/work-tasks';
import { writeTransaction } from '../db/pool';
import { getAgent } from '../db/agents';
import { getProject } from '../db/projects';
import { createLogger } from '../lib/logger';

const log = createLogger('TaskQueueService');

export interface TaskQueueConfig {
    /** Max concurrent active tasks across all projects. Default: 2 */
    maxConcurrency: number;
    /** Polling interval in ms. Default: 5000 */
    pollIntervalMs: number;
}

const DEFAULT_CONFIG: TaskQueueConfig = {
    maxConcurrency: parseInt(process.env.TASK_QUEUE_MAX_CONCURRENCY ?? '2', 10),
    pollIntervalMs: parseInt(process.env.TASK_QUEUE_POLL_INTERVAL_MS ?? '5000', 10),
};

type QueueChangeListener = (activeCount: number, pendingCount: number) => void;

export class TaskQueueService {
    private db: Database;
    private workTaskService: WorkTaskService;
    private config: TaskQueueConfig;
    private timer: ReturnType<typeof setInterval> | null = null;
    private _running = false;
    private queueChangeListeners: Set<QueueChangeListener> = new Set();

    constructor(
        db: Database,
        workTaskService: WorkTaskService,
        config?: Partial<TaskQueueConfig>,
    ) {
        this.db = db;
        this.workTaskService = workTaskService;
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /** Start the polling dispatch loop. */
    start(): void {
        if (this._running) return;
        this._running = true;
        log.info('TaskQueueService started', {
            maxConcurrency: this.config.maxConcurrency,
            pollIntervalMs: this.config.pollIntervalMs,
        });
        this.timer = setInterval(() => {
            this.tick().catch((err) => {
                log.error('Dispatch tick error', {
                    error: err instanceof Error ? err.message : String(err),
                });
            });
        }, this.config.pollIntervalMs);
    }

    /** Stop polling. If drain=true, waits for active tasks to finish via WorkTaskService. */
    async stop(drain = false): Promise<void> {
        this._running = false;
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        if (drain) {
            await this.workTaskService.drainRunningTasks();
        }
        log.info('TaskQueueService stopped');
    }

    /**
     * Enqueue a new work task. The task is persisted with status='pending'
     * and the dispatch loop will promote it when capacity is available.
     */
    async enqueue(input: CreateWorkTaskInput, tenantId?: string): Promise<WorkTask> {
        if (this.workTaskService.shuttingDown) {
            const { ValidationError } = await import('../lib/errors');
            throw new ValidationError('Server is shutting down — new work tasks are not accepted');
        }

        // Delegate validation (agent, project, off-limits, dedup) to WorkTaskService.create
        // but we want to just persist as pending, not immediately execute.
        // To avoid duplicating validation, we call the service's validation logic.
        const task = await this.workTaskService.create(input, tenantId);

        // If the task was already executed immediately by create() (no active task on project),
        // it won't be in 'pending' state — the dispatch loop won't touch it.
        // This is fine — the queue service wraps create() and lets it handle
        // the simple case, while the dispatch loop handles overflow.

        this.notifyQueueChange();
        return task;
    }

    /** Current number of active (branching/running/validating) tasks. */
    get activeCount(): number {
        return countActiveTasks(this.db);
    }

    /** Current number of pending tasks waiting for dispatch. */
    get pendingCount(): number {
        return countPendingTasks(this.db);
    }

    /** Whether the dispatch loop is running. */
    get running(): boolean {
        return this._running;
    }

    /** Get queue status for the status endpoint. */
    getQueueStatus(): {
        activeCount: number;
        pendingCount: number;
        maxConcurrency: number;
        activeByProject: Record<string, string>;
    } {
        return {
            activeCount: this.activeCount,
            pendingCount: this.pendingCount,
            maxConcurrency: this.config.maxConcurrency,
            activeByProject: getActiveTasksByProject(this.db),
        };
    }

    /** Register a listener for queue changes (used for WebSocket broadcasting). */
    onQueueChange(listener: QueueChangeListener): void {
        this.queueChangeListeners.add(listener);
    }

    /** Remove a queue change listener. */
    offQueueChange(listener: QueueChangeListener): void {
        this.queueChangeListeners.delete(listener);
    }

    /**
     * Core dispatch tick. Called every pollIntervalMs.
     * Finds pending tasks eligible for execution and promotes them.
     */
    private async tick(): Promise<void> {
        const active = countActiveTasks(this.db);
        if (active >= this.config.maxConcurrency) return;

        const available = this.config.maxConcurrency - active;

        // Use BEGIN IMMEDIATE to prevent two ticks from racing on the same candidates
        const candidates = writeTransaction(this.db, (txDb) => {
            const tasks = dispatchCandidates(txDb, available);

            // Promote each candidate to 'branching' atomically
            for (const task of tasks) {
                updateWorkTaskStatus(txDb, task.id, 'branching');
            }

            return tasks;
        });

        if (candidates.length === 0) return;

        log.info('Dispatching tasks from queue', {
            count: candidates.length,
            taskIds: candidates.map((t: WorkTask) => t.id),
            activeAfter: active + candidates.length,
            maxConcurrency: this.config.maxConcurrency,
        });

        // Fire-and-forget: execute each promoted candidate
        for (const task of candidates) {
            this.executePromoted(task).catch((err) => {
                log.error('Failed to execute promoted task', {
                    taskId: task.id,
                    error: err instanceof Error ? err.message : String(err),
                });
            });
        }

        this.notifyQueueChange();
    }

    /**
     * Execute a task that was promoted from pending to branching by the dispatch loop.
     * Resolves agent/project and delegates to WorkTaskService.executeTask().
     */
    private async executePromoted(task: WorkTask): Promise<void> {
        const agent = getAgent(this.db, task.agentId);
        const project = getProject(this.db, task.projectId);

        if (!agent || !project || !project.workingDir) {
            log.warn('Cannot execute promoted task: agent or project missing', {
                taskId: task.id,
                agentId: task.agentId,
                projectId: task.projectId,
            });
            updateWorkTaskStatus(this.db, task.id, 'failed', {
                error: 'Agent or project missing at dispatch time',
            });
            return;
        }

        await this.workTaskService.executeTask(task, agent, project);
    }

    private notifyQueueChange(): void {
        if (this.queueChangeListeners.size === 0) return;
        const active = this.activeCount;
        const pending = this.pendingCount;
        for (const listener of this.queueChangeListeners) {
            try {
                listener(active, pending);
            } catch (err) {
                log.error('Queue change listener error', {
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }
    }
}

import { existsSync } from 'node:fs';
import type { Database } from 'bun:sqlite';
import type { WorkTask } from '../../shared/types';
import {
    cleanupStaleWorkTasks,
    getWorkTask,
    resetWorkTaskForRetry,
    getTerminalTasksWithWorktrees,
    clearWorktreeDir,
} from '../db/work-tasks';
import { getAgent } from '../db/agents';
import { getProject } from '../db/projects';
import { removeWorktree, pruneWorktrees } from '../lib/worktree';
import { createLogger } from '../lib/logger';

const log = createLogger('WorkTaskService');

const WORK_MAX_ITERATIONS = parseInt(process.env.WORK_MAX_ITERATIONS ?? '3', 10);

export interface RecoveryContext {
    db: Database;
    executeTask: (task: WorkTask, agent: { id: string; name: string }, project: { id: string; workingDir: string }) => Promise<WorkTask>;
    cleanupWorktree: (taskId: string) => Promise<void>;
}

/**
 * Recover tasks left in active states from a previous unclean shutdown.
 * Cleans up stale worktrees, then resets and retries interrupted tasks.
 */
export async function recoverStaleTasks(ctx: RecoveryContext): Promise<void> {
    const staleTasks = cleanupStaleWorkTasks(ctx.db);
    if (staleTasks.length === 0) return;

    log.info('Recovering stale work tasks', { count: staleTasks.length });

    // Clean up any leftover worktrees first
    for (const task of staleTasks) {
        if (task.worktreeDir) {
            await ctx.cleanupWorktree(task.id);
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

            const agent = getAgent(ctx.db, task.agentId);
            const project = getProject(ctx.db, task.projectId);
            if (!agent || !project || !project.workingDir) {
                log.warn('Cannot retry interrupted task: agent or project missing', { taskId: task.id });
                continue;
            }

            resetWorkTaskForRetry(ctx.db, task.id);
            log.info('Retrying interrupted work task', { taskId: task.id, description: task.description.slice(0, 80) });

            const resetTask = getWorkTask(ctx.db, task.id);
            if (!resetTask) continue;

            // Fire-and-forget: execute in background so recovery doesn't block startup
            ctx.executeTask(resetTask, agent, project).catch((err) => {
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
export async function recoverInterruptedTasks(ctx: RecoveryContext): Promise<void> {
    const staleTasks = cleanupStaleWorkTasks(ctx.db);
    if (staleTasks.length === 0) return;

    log.info('Recovering interrupted work tasks', { count: staleTasks.length });

    for (const task of staleTasks) {
        try {
            const worktreeExists = task.worktreeDir ? existsSync(task.worktreeDir) : false;
            const canRetry = (task.iterationCount ?? 0) < WORK_MAX_ITERATIONS;
            const neverStarted = !task.worktreeDir && (task.iterationCount ?? 0) === 0;

            // Tasks that never actually started (no worktree, iteration 0) should
            // always be requeued — they were just in 'branching' when the restart hit.
            if (neverStarted && canRetry) {
                resetWorkTaskForRetry(ctx.db, task.id);
                log.info('Requeuing task that never started', {
                    taskId: task.id,
                    description: task.description.slice(0, 80),
                });
                continue;
            }

            if (!worktreeExists || !canRetry) {
                log.info('Skipping recovery for task (worktree missing or max iterations reached)', {
                    taskId: task.id,
                    worktreeExists,
                    iterationCount: task.iterationCount,
                });
                // Already marked failed by cleanupStaleWorkTasks — clean up worktree if present
                if (task.worktreeDir) {
                    await ctx.cleanupWorktree(task.id);
                }
                continue;
            }

            const agent = getAgent(ctx.db, task.agentId);
            const project = getProject(ctx.db, task.projectId);
            if (!agent || !project || !project.workingDir) {
                log.warn('Cannot recover interrupted task: agent or project missing', { taskId: task.id });
                continue;
            }

            resetWorkTaskForRetry(ctx.db, task.id);
            log.info('Requeuing interrupted work task', {
                taskId: task.id,
                iterationCount: task.iterationCount,
                description: task.description.slice(0, 80),
            });

            const resetTask = getWorkTask(ctx.db, task.id);
            if (!resetTask) continue;

            // Fire-and-forget so recovery doesn't block startup
            ctx.executeTask(resetTask, agent, project).catch((err) => {
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
 * Clean up worktrees for tasks in terminal states (completed/failed) that
 * were not properly cleaned up. Also runs `git worktree prune` to clear
 * stale git-internal worktree references.
 */
export async function pruneStaleWorktrees(db: Database): Promise<void> {
    const stale = getTerminalTasksWithWorktrees(db);
    if (stale.length > 0) {
        log.info('Pruning stale worktrees from terminal tasks', { count: stale.length });
    }

    const projectDirs = new Set<string>();

    for (const task of stale) {
        try {
            const project = getProject(db, task.projectId);
            if (project?.workingDir) {
                projectDirs.add(project.workingDir);
                await removeWorktree(project.workingDir, task.worktreeDir!);
            }
            clearWorktreeDir(db, task.id);
        } catch (err) {
            log.warn('Failed to prune stale worktree', {
                taskId: task.id,
                worktreeDir: task.worktreeDir,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    // Run git worktree prune on each affected project to clean up
    // git-internal references for directories already deleted on disk.
    for (const dir of projectDirs) {
        await pruneWorktrees(dir);
    }

    if (stale.length > 0) {
        log.info('Stale worktree pruning complete', { cleaned: stale.length });
    }
}

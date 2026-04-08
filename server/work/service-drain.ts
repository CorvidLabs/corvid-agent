import type { Database } from 'bun:sqlite';
import { getActiveWorkTasks, updateWorkTaskStatus } from '../db/work-tasks';
import { createLogger } from '../lib/logger';

const log = createLogger('WorkTaskService');

const DRAIN_TIMEOUT_MS = parseInt(process.env.WORK_DRAIN_TIMEOUT_MS ?? '300000', 10); // 5 minutes
export const DRAIN_POLL_INTERVAL_MS = 10_000; // 10 seconds

export interface DrainContext {
    db: Database;
    cleanupWorktree: (taskId: string) => Promise<void>;
}

/**
 * Drain running tasks during graceful shutdown.
 * Sets the shuttingDown flag to block new task creation, then waits
 * up to DRAIN_TIMEOUT_MS for all active tasks to complete, polling
 * every DRAIN_POLL_INTERVAL_MS.
 */
export async function drainRunningTasks(
    ctx: DrainContext,
    pollIntervalMs: number = DRAIN_POLL_INTERVAL_MS,
): Promise<void> {
    const activeTasks = getActiveWorkTasks(ctx.db);
    if (activeTasks.length === 0) {
        log.info('No active work tasks to drain');
        return;
    }

    log.info('Draining active work tasks', { count: activeTasks.length });
    const deadline = Date.now() + DRAIN_TIMEOUT_MS;

    while (Date.now() < deadline) {
        const remaining = getActiveWorkTasks(ctx.db);
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

    // Timeout reached — mark remaining active tasks as failed and clean up worktrees
    const timedOut = getActiveWorkTasks(ctx.db);
    if (timedOut.length > 0) {
        log.warn('Drain timeout reached, marking remaining tasks as failed', { count: timedOut.length });
        for (const task of timedOut) {
            updateWorkTaskStatus(ctx.db, task.id, 'failed', {
                error: 'Interrupted by server shutdown (drain timeout)',
            });
            if (task.worktreeDir) {
                await ctx.cleanupWorktree(task.id);
            }
        }
    }
}

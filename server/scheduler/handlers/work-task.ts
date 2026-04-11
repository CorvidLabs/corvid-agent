/**
 * Work task schedule action handler.
 *
 * Handles two kinds of conflict from WorkTaskService.create():
 *
 * 1. **Permanent (skip)** — dedup/flock checks determined the work is already
 *    covered (e.g. "An active work task already addresses issue #X. Skipping.").
 *    These are marked as 'completed' so they don't trigger the consecutive-
 *    failure auto-pause and correctly reflect that no action was needed.
 *
 * 2. **Transient** — a generic concurrency collision ("already active") that
 *    may clear up after backoff. Retried with exponential delays.
 */
import type { AgentSchedule, ScheduleAction } from '../../../shared/types';
import { updateExecutionStatus } from '../../db/schedules';
import { ConflictError } from '../../lib/errors';
import { createLogger } from '../../lib/logger';
import type { HandlerContext } from './types';

const log = createLogger('SchedulerWorkTask');

/** Retry delays in ms: 30s, 2min, 5min, 10min */
const RETRY_DELAYS = [30_000, 120_000, 300_000, 600_000];
const MAX_ATTEMPTS = RETRY_DELAYS.length + 1;

/**
 * Permanent skip conflicts are intentional dedup/flock rejections where the
 * work is already being handled. Retrying them is pointless.
 */
function isPermanentSkip(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  return msg.includes('Skipping') || msg.includes('already addresses') || msg.includes('already working');
}

function isTransientConflict(err: unknown): boolean {
  if (isPermanentSkip(err)) return false;
  return err instanceof ConflictError || (err instanceof Error && err.message.includes('already active'));
}

export async function execWorkTask(
  ctx: HandlerContext,
  executionId: string,
  schedule: AgentSchedule,
  action: ScheduleAction,
): Promise<void> {
  if (!ctx.workTaskService) {
    updateExecutionStatus(ctx.db, executionId, 'failed', { result: 'Work task service not available' });
    return;
  }

  if (!action.description) {
    updateExecutionStatus(ctx.db, executionId, 'failed', { result: 'No description provided' });
    return;
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const task = await ctx.workTaskService.create({
        agentId: schedule.agentId,
        description: action.description,
        projectId: action.projectId,
        source: 'agent',
      });

      const status = task.status === 'queued' ? 'queued behind active task' : `branch: ${task.branchName ?? 'pending'}`;
      updateExecutionStatus(ctx.db, executionId, 'completed', {
        result: `Work task created: ${task.id} (${status})`,
        workTaskId: task.id,
        sessionId: task.sessionId ?? undefined,
      });
      return;
    } catch (err) {
      // Permanent skip: work is already covered — mark completed, don't retry.
      if (isPermanentSkip(err)) {
        const message = err instanceof Error ? err.message : String(err);
        log.info('Work task skipped — already covered', { executionId, reason: message });
        updateExecutionStatus(ctx.db, executionId, 'completed', {
          result: `Skipped: ${message}`,
        });
        return;
      }

      // Transient conflict: retry with backoff.
      if (isTransientConflict(err) && attempt < MAX_ATTEMPTS) {
        const delay = RETRY_DELAYS[attempt - 1];
        log.info('Work task conflict — retrying after backoff', {
          executionId,
          attempt,
          delayMs: delay,
          error: err instanceof Error ? err.message : String(err),
        });
        await Bun.sleep(delay);
        continue;
      }

      const message = err instanceof Error ? err.message : String(err);
      updateExecutionStatus(ctx.db, executionId, 'failed', { result: message });
      return;
    }
  }
}

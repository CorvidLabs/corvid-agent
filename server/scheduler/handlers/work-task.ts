/**
 * Work task schedule action handler.
 * Retries on conflict errors (e.g. another task active on the same project)
 * with exponential backoff to avoid daily triage failures from transient collisions.
 */
import type { AgentSchedule, ScheduleAction } from '../../../shared/types';
import { updateExecutionStatus } from '../../db/schedules';
import { ConflictError } from '../../lib/errors';
import { createLogger } from '../../lib/logger';
import type { HandlerContext } from './types';

const log = createLogger('SchedulerWorkTask');

/** Retry delays in ms: 30s, 2min, 5min */
const RETRY_DELAYS = [30_000, 120_000, 300_000];
const MAX_ATTEMPTS = RETRY_DELAYS.length + 1;

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
      const isConflict =
        err instanceof ConflictError || (err instanceof Error && err.message.includes('already active'));

      if (isConflict && attempt < MAX_ATTEMPTS) {
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

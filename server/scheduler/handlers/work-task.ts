/**
 * Work task schedule action handler.
 */
import type { AgentSchedule, ScheduleAction } from '../../../shared/types';
import { updateExecutionStatus } from '../../db/schedules';
import type { HandlerContext } from './types';

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

    try {
        const task = await ctx.workTaskService.create({
            agentId: schedule.agentId,
            description: action.description,
            projectId: action.projectId,
            source: 'agent',
        });

        updateExecutionStatus(ctx.db, executionId, 'completed', {
            result: `Work task created: ${task.id} (branch: ${task.branchName ?? 'pending'})`,
            workTaskId: task.id,
            sessionId: task.sessionId ?? undefined,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        updateExecutionStatus(ctx.db, executionId, 'failed', { result: message });
    }
}

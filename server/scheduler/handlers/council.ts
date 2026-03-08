/**
 * Council and messaging schedule action handlers: council_launch, send_message.
 */
import type { AgentSchedule, ScheduleAction } from '../../../shared/types';
import { updateExecutionStatus } from '../../db/schedules';
import { launchCouncil } from '../../routes/councils';
import type { HandlerContext } from './types';

export async function execCouncilLaunch(
    ctx: HandlerContext,
    executionId: string,
    _schedule: AgentSchedule,
    action: ScheduleAction,
): Promise<void> {
    if (!action.councilId || !action.projectId || !action.description) {
        updateExecutionStatus(ctx.db, executionId, 'failed', {
            result: 'councilId, projectId, and description are required for council_launch',
        });
        return;
    }

    try {
        const result = launchCouncil(
            ctx.db,
            ctx.processManager,
            action.councilId,
            action.projectId,
            action.description,
            ctx.agentMessenger,
        );
        updateExecutionStatus(ctx.db, executionId, 'completed', {
            result: `Council launched: ${result.launchId} (${result.sessionIds.length} agents)`,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        updateExecutionStatus(ctx.db, executionId, 'failed', { result: message });
    }
}

export async function execSendMessage(
    ctx: HandlerContext,
    executionId: string,
    schedule: AgentSchedule,
    action: ScheduleAction,
): Promise<void> {
    if (!action.toAgentId || !action.message) {
        updateExecutionStatus(ctx.db, executionId, 'failed', {
            result: 'toAgentId and message are required for send_message',
        });
        return;
    }

    if (!ctx.agentMessenger) {
        updateExecutionStatus(ctx.db, executionId, 'failed', { result: 'Agent messenger not available' });
        return;
    }

    try {
        const { response, threadId } = await ctx.agentMessenger.invokeAndWait({
            fromAgentId: schedule.agentId,
            toAgentId: action.toAgentId,
            content: action.message,
        });

        updateExecutionStatus(ctx.db, executionId, 'completed', {
            result: `Message sent. Response: ${response.slice(0, 500)}... [thread: ${threadId}]`,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        updateExecutionStatus(ctx.db, executionId, 'failed', { result: message });
    }
}

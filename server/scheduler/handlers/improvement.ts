/**
 * Improvement loop schedule action handler.
 */
import type { AgentSchedule, ScheduleAction } from '../../../shared/types';
import { getAgent } from '../../db/agents';
import { updateExecutionStatus } from '../../db/schedules';
import type { HandlerContext } from './types';
import { resolveProjectId } from './utils';

export async function execImprovementLoop(
  ctx: HandlerContext,
  executionId: string,
  schedule: AgentSchedule,
  action: ScheduleAction,
): Promise<void> {
  if (!ctx.improvementLoopService) {
    updateExecutionStatus(ctx.db, executionId, 'failed', { result: 'Improvement loop service not configured' });
    return;
  }

  const tenantId = ctx.resolveScheduleTenantId(schedule.agentId);
  const agent = getAgent(ctx.db, schedule.agentId, tenantId);
  if (!agent) {
    updateExecutionStatus(ctx.db, executionId, 'failed', { result: 'Agent not found' });
    return;
  }

  const projectId = resolveProjectId(ctx.db, tenantId, agent, action.projectId);
  if (!projectId) {
    updateExecutionStatus(ctx.db, executionId, 'failed', { result: 'No project configured for agent' });
    return;
  }

  updateExecutionStatus(ctx.db, executionId, 'running');

  const result = await ctx.improvementLoopService.run(schedule.agentId, projectId, {
    maxTasks: action.maxImprovementTasks ?? 3,
    focusArea: action.focusArea,
  });

  updateExecutionStatus(ctx.db, executionId, 'completed', {
    result:
      `Improvement loop session started: ${result.sessionId}. ` +
      `Health: ${result.health.tscErrorCount} tsc errors, ${result.health.testFailureCount} test failures. ` +
      `Reputation: ${result.reputationScore} (${result.trustLevel}). ` +
      `Max tasks: ${result.maxTasksAllowed}.`,
    sessionId: result.sessionId,
  });
}

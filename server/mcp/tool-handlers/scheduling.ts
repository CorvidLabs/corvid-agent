import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpToolContext } from './types';
import { textResult, errorResult } from './types';
import { listSchedules, getSchedule, createSchedule, updateSchedule, listExecutions } from '../../db/schedules';
import { validateScheduleFrequency } from '../../scheduler/service';
import { createLogger } from '../../lib/logger';

const log = createLogger('McpToolHandlers');

export async function handleManageSchedule(
    ctx: McpToolContext,
    args: {
        action: 'list' | 'create' | 'update' | 'get' | 'pause' | 'resume' | 'history';
        name?: string;
        description?: string;
        cron_expression?: string;
        interval_minutes?: number;
        schedule_actions?: Array<{ type: string; repos?: string[]; description?: string; project_id?: string; to_agent_id?: string; message?: string; prompt?: string }>;
        approval_policy?: string;
        max_executions?: number;
        agent_id?: string;
        schedule_id?: string;
        output_destinations?: Array<{ type: string; target: string; format?: string }>;
    },
): Promise<CallToolResult> {
    try {
        switch (args.action) {
            case 'list': {
                // If agent_id provided, filter to that agent; otherwise return all schedules
                const schedules = listSchedules(ctx.db, args.agent_id);
                if (schedules.length === 0) return textResult('No schedules found.');
                const lines = schedules.map((s) =>
                    `- [${s.agentId.slice(0, 8)}] ${s.name} [${s.id}] status=${s.status} executions=${s.executionCount}${s.nextRunAt ? ` next=${s.nextRunAt}` : ''}`
                );
                const header = args.agent_id ? `Schedules for agent ${args.agent_id}:` : `All schedules (${schedules.length}):`;
                return textResult(`${header}\n\n${lines.join('\n')}`);
            }

            case 'create': {
                if (!args.name || !args.schedule_actions?.length) {
                    return errorResult('name and schedule_actions are required to create a schedule');
                }
                if (!args.cron_expression && !args.interval_minutes) {
                    return errorResult('Either cron_expression or interval_minutes is required');
                }

                const intervalMs = args.interval_minutes ? args.interval_minutes * 60 * 1000 : undefined;
                validateScheduleFrequency(args.cron_expression, intervalMs);

                const actions = args.schedule_actions.map((a) => ({
                    type: a.type as import('../../../shared/types').ScheduleActionType,
                    repos: a.repos,
                    description: a.description,
                    projectId: a.project_id,
                    toAgentId: a.to_agent_id,
                    message: a.message,
                    prompt: a.prompt,
                }));

                const outputDestinations = args.output_destinations?.map((d) => ({
                    type: d.type as import('../../../shared/types').ScheduleOutputDestinationType,
                    target: d.target,
                    format: d.format as import('../../../shared/types').ScheduleOutputFormat | undefined,
                }));

                const schedule = createSchedule(ctx.db, {
                    agentId: args.agent_id ?? ctx.agentId,
                    name: args.name,
                    description: args.description,
                    cronExpression: args.cron_expression,
                    intervalMs: intervalMs,
                    actions,
                    approvalPolicy: (args.approval_policy as 'auto' | 'owner_approve' | 'council_approve') ?? 'owner_approve',
                    outputDestinations,
                });

                return textResult(
                    `Schedule created!\n` +
                    `  ID: ${schedule.id}\n` +
                    `  Name: ${schedule.name}\n` +
                    `  Status: ${schedule.status}\n` +
                    `  Next run: ${schedule.nextRunAt ?? 'pending calculation'}`,
                );
            }

            case 'get': {
                if (!args.schedule_id) return errorResult('schedule_id is required for get');
                const schedule = getSchedule(ctx.db, args.schedule_id);
                if (!schedule) return errorResult('Schedule not found');

                const details = [
                    `**${schedule.name}** [${schedule.id}]`,
                    `  Agent: ${schedule.agentId}`,
                    `  Status: ${schedule.status}`,
                    `  Description: ${schedule.description || '(none)'}`,
                    `  Cron: ${schedule.cronExpression || '(none)'}`,
                    schedule.intervalMs ? `  Interval: ${schedule.intervalMs / 60000}m` : null,
                    `  Approval: ${schedule.approvalPolicy}`,
                    `  Executions: ${schedule.executionCount}${schedule.maxExecutions ? `/${schedule.maxExecutions}` : ''}`,
                    schedule.maxBudgetPerRun ? `  Max budget/run: $${schedule.maxBudgetPerRun}` : null,
                    `  Execution mode: ${schedule.executionMode}`,
                    `  Last run: ${schedule.lastRunAt ?? 'never'}`,
                    `  Next run: ${schedule.nextRunAt ?? 'pending'}`,
                    `  Created: ${schedule.createdAt}`,
                    `  Updated: ${schedule.updatedAt}`,
                    `  Actions: ${JSON.stringify(schedule.actions, null, 2)}`,
                    schedule.outputDestinations ? `  Output destinations: ${JSON.stringify(schedule.outputDestinations, null, 2)}` : null,
                    schedule.triggerEvents ? `  Trigger events: ${JSON.stringify(schedule.triggerEvents, null, 2)}` : null,
                    schedule.pipelineSteps ? `  Pipeline steps: ${JSON.stringify(schedule.pipelineSteps, null, 2)}` : null,
                    schedule.notifyAddress ? `  Notify: ${schedule.notifyAddress}` : null,
                ].filter(Boolean).join('\n');

                return textResult(details);
            }

            case 'update': {
                if (!args.schedule_id) return errorResult('schedule_id is required for update');

                const updateInput: import('../../../shared/types').UpdateScheduleInput = {};
                const changedFields: string[] = [];

                if (args.agent_id !== undefined) { updateInput.agentId = args.agent_id; changedFields.push('agent_id'); }
                if (args.name !== undefined) { updateInput.name = args.name; changedFields.push('name'); }
                if (args.description !== undefined) { updateInput.description = args.description; changedFields.push('description'); }
                if (args.cron_expression !== undefined) { updateInput.cronExpression = args.cron_expression; changedFields.push('cron_expression'); }
                if (args.interval_minutes !== undefined) {
                    updateInput.intervalMs = args.interval_minutes * 60 * 1000;
                    changedFields.push('interval_minutes');
                }
                if (args.schedule_actions !== undefined) {
                    updateInput.actions = args.schedule_actions.map((a) => ({
                        type: a.type as import('../../../shared/types').ScheduleActionType,
                        repos: a.repos,
                        description: a.description,
                        projectId: a.project_id,
                        toAgentId: a.to_agent_id,
                        message: a.message,
                        prompt: a.prompt,
                    }));
                    changedFields.push('schedule_actions');
                }
                if (args.approval_policy !== undefined) {
                    updateInput.approvalPolicy = args.approval_policy as 'auto' | 'owner_approve' | 'council_approve';
                    changedFields.push('approval_policy');
                }
                if (args.max_executions !== undefined) {
                    updateInput.maxExecutions = args.max_executions;
                    changedFields.push('max_executions');
                }
                if (args.output_destinations !== undefined) {
                    updateInput.outputDestinations = args.output_destinations.map((d) => ({
                        type: d.type as import('../../../shared/types').ScheduleOutputDestinationType,
                        target: d.target,
                        format: d.format as import('../../../shared/types').ScheduleOutputFormat | undefined,
                    }));
                    changedFields.push('output_destinations');
                }

                if (changedFields.length === 0) {
                    return errorResult('No fields to update. Provide at least one of: agent_id, name, description, cron_expression, interval_minutes, schedule_actions, approval_policy, max_executions');
                }

                // Validate frequency if timing changed
                if (updateInput.cronExpression !== undefined || updateInput.intervalMs !== undefined) {
                    const existing = updateSchedule(ctx.db, args.schedule_id, {});
                    if (!existing) return errorResult('Schedule not found');
                    const cron = updateInput.cronExpression ?? existing.cronExpression;
                    const interval = updateInput.intervalMs ?? existing.intervalMs ?? undefined;
                    validateScheduleFrequency(cron || undefined, interval);
                }

                const updated = updateSchedule(ctx.db, args.schedule_id, updateInput);
                if (!updated) return errorResult('Schedule not found');

                return textResult(
                    `Schedule "${updated.name}" [${updated.id}] updated.\n` +
                    `  Changed: ${changedFields.join(', ')}`,
                );
            }

            case 'pause': {
                if (!args.schedule_id) return errorResult('schedule_id is required');
                const updated = updateSchedule(ctx.db, args.schedule_id, { status: 'paused' });
                if (!updated) return errorResult('Schedule not found');
                return textResult(`Schedule "${updated.name}" paused.`);
            }

            case 'resume': {
                if (!args.schedule_id) return errorResult('schedule_id is required');
                const updated = updateSchedule(ctx.db, args.schedule_id, { status: 'active' });
                if (!updated) return errorResult('Schedule not found');
                return textResult(`Schedule "${updated.name}" resumed.`);
            }

            case 'history': {
                const scheduleId = args.schedule_id;
                const executions = listExecutions(ctx.db, scheduleId, 20);
                if (executions.length === 0) return textResult('No executions found.');
                const lines = executions.map((e) =>
                    `- [${e.id.slice(0, 8)}] ${e.actionType} status=${e.status} ${e.startedAt}${e.result ? ` — ${e.result.slice(0, 100)}` : ''}`
                );
                return textResult(`Recent executions:\n\n${lines.join('\n')}`);
            }

            default:
                return errorResult(`Unknown action: ${args.action}. Use list, create, get, update, pause, resume, or history.`);
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('MCP manage_schedule failed', { error: message });
        return errorResult(`Failed to manage schedule: ${message}`);
    }
}

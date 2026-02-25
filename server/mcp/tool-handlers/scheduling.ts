import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpToolContext } from './types';
import { textResult, errorResult } from './types';
import { listSchedules, createSchedule, updateSchedule, listExecutions } from '../../db/schedules';
import { validateScheduleFrequency } from '../../scheduler/service';
import { createLogger } from '../../lib/logger';

const log = createLogger('McpToolHandlers');

export async function handleManageSchedule(
    ctx: McpToolContext,
    args: {
        action: 'list' | 'create' | 'pause' | 'resume' | 'history';
        name?: string;
        description?: string;
        cron_expression?: string;
        interval_minutes?: number;
        schedule_actions?: Array<{ type: string; repos?: string[]; description?: string; project_id?: string; to_agent_id?: string; message?: string; prompt?: string }>;
        approval_policy?: string;
        schedule_id?: string;
    },
): Promise<CallToolResult> {
    try {
        switch (args.action) {
            case 'list': {
                const schedules = listSchedules(ctx.db, ctx.agentId);
                if (schedules.length === 0) return textResult('No schedules found.');
                const lines = schedules.map((s) =>
                    `- ${s.name} [${s.id}] status=${s.status} executions=${s.executionCount}${s.nextRunAt ? ` next=${s.nextRunAt}` : ''}`
                );
                return textResult(`Your schedules:\n\n${lines.join('\n')}`);
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

                const schedule = createSchedule(ctx.db, {
                    agentId: ctx.agentId,
                    name: args.name,
                    description: args.description,
                    cronExpression: args.cron_expression,
                    intervalMs: intervalMs,
                    actions,
                    approvalPolicy: (args.approval_policy as 'auto' | 'owner_approve' | 'council_approve') ?? 'owner_approve',
                });

                return textResult(
                    `Schedule created!\n` +
                    `  ID: ${schedule.id}\n` +
                    `  Name: ${schedule.name}\n` +
                    `  Status: ${schedule.status}\n` +
                    `  Next run: ${schedule.nextRunAt ?? 'pending calculation'}`,
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
                return errorResult(`Unknown action: ${args.action}. Use list, create, pause, resume, or history.`);
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('MCP manage_schedule failed', { error: message });
        return errorResult(`Failed to manage schedule: ${message}`);
    }
}

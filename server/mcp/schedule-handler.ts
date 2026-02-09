/**
 * MCP tool handler for corvid_manage_schedule.
 *
 * Allows agents to manage their own schedules via MCP.
 * Enforces: no custom type from agents, force approval for write schedules,
 * agent_id = self only, max schedules per agent.
 */

import type { Database } from 'bun:sqlite';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Cron } from 'croner';
import {
    createSchedule,
    listSchedules,
    getSchedule,
    updateSchedule,
    listScheduleRuns,
    countSchedulesByAgent,
} from '../db/schedules';
import { WRITE_ACTION_TYPES } from '../scheduler/types';
import type { ActionType } from '../scheduler/types';
import { createLogger } from '../lib/logger';

const log = createLogger('McpScheduleHandler');

const VALID_ACTION_TYPES: ReadonlySet<string> = new Set([
    'star_repos', 'fork_repos', 'review_prs', 'work_on_repo',
    'suggest_improvements', 'council_review', 'custom',
]);

const MIN_INTERVAL_MINUTES = parseInt(process.env.SCHEDULER_MIN_INTERVAL_MINUTES ?? '5', 10);
const MAX_SCHEDULES_PER_AGENT = parseInt(process.env.SCHEDULER_MAX_SCHEDULES_PER_AGENT ?? '10', 10);

function textResult(text: string): CallToolResult {
    return { content: [{ type: 'text', text }] };
}

function errorResult(text: string): CallToolResult {
    return { content: [{ type: 'text', text }], isError: true };
}

function validateCronInterval(cronExpression: string): string | null {
    try {
        const cron = new Cron(cronExpression);
        const runs: Date[] = [];
        let cursor: Date | null = new Date();
        for (let i = 0; i < 2 && cursor; i++) {
            cursor = cron.nextRun(cursor);
            if (cursor) {
                runs.push(new Date(cursor.getTime()));
                cursor = new Date(cursor.getTime() + 1);
            }
        }
        if (runs.length < 2) return 'Cron expression does not produce at least 2 future runs.';
        const gapMs = runs[1].getTime() - runs[0].getTime();
        if (gapMs < MIN_INTERVAL_MINUTES * 60 * 1000) {
            return `Cron interval too short: ${Math.round(gapMs / 60000)} min (minimum ${MIN_INTERVAL_MINUTES} min).`;
        }
        return null;
    } catch {
        return 'Invalid cron expression.';
    }
}

export interface ManageScheduleContext {
    agentId: string;
    db: Database;
}

export async function handleManageSchedule(
    ctx: ManageScheduleContext,
    args: {
        action: string;
        name?: string;
        action_type?: string;
        cron_expression?: string;
        action_config?: Record<string, unknown>;
        schedule_id?: string;
        requires_approval?: boolean;
        max_budget_usd?: number;
        daily_budget_usd?: number;
    },
): Promise<CallToolResult> {
    try {
        switch (args.action) {
            case 'create':
                return handleCreate(ctx, args);
            case 'list':
                return handleList(ctx);
            case 'pause':
                return handlePauseResume(ctx, args, 'paused');
            case 'resume':
                return handlePauseResume(ctx, args, 'active');
            case 'history':
                return handleHistory(ctx, args);
            default:
                return errorResult(
                    `Unknown action: "${args.action}". Valid actions: create, list, pause, resume, history`,
                );
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('corvid_manage_schedule failed', { error: message, action: args.action });
        return errorResult(`Schedule management failed: ${message}`);
    }
}

function handleCreate(
    ctx: ManageScheduleContext,
    args: {
        name?: string;
        action_type?: string;
        cron_expression?: string;
        action_config?: Record<string, unknown>;
        requires_approval?: boolean;
        max_budget_usd?: number;
        daily_budget_usd?: number;
    },
): CallToolResult {
    // Validate required fields
    if (!args.name) return errorResult('name is required for create action.');
    if (!args.action_type) return errorResult('action_type is required for create action.');
    if (!args.cron_expression) return errorResult('cron_expression is required for create action.');

    // Validate action type
    if (!VALID_ACTION_TYPES.has(args.action_type)) {
        return errorResult(`Invalid action_type: "${args.action_type}". Valid types: ${[...VALID_ACTION_TYPES].join(', ')}`);
    }

    // Agents cannot create custom schedules
    if (args.action_type === 'custom') {
        return errorResult('Agents cannot create schedules with custom action type.');
    }

    // Validate cron interval
    const cronErr = validateCronInterval(args.cron_expression);
    if (cronErr) return errorResult(cronErr);

    // Max schedules per agent
    const count = countSchedulesByAgent(ctx.db, ctx.agentId);
    if (count >= MAX_SCHEDULES_PER_AGENT) {
        return errorResult(`You have reached the maximum of ${MAX_SCHEDULES_PER_AGENT} schedules.`);
    }

    // Force approval for write actions
    const actionType = args.action_type as ActionType;
    const requiresApproval = WRITE_ACTION_TYPES.has(actionType) ? true : (args.requires_approval ?? false);

    // Compute next run
    let nextRunAt: string | null = null;
    try {
        const cron = new Cron(args.cron_expression);
        const next = cron.nextRun(new Date());
        nextRunAt = next ? next.toISOString() : null;
    } catch { /* already validated */ }

    const id = crypto.randomUUID();
    const schedule = createSchedule(ctx.db, {
        id,
        name: args.name,
        actionType,
        cronExpression: args.cron_expression,
        agentId: ctx.agentId,
        actionConfig: args.action_config ?? {},
        source: 'agent',
        requiresApproval,
        maxBudgetUsd: args.max_budget_usd,
        dailyBudgetUsd: args.daily_budget_usd,
        nextRunAt,
    });

    log.info('Agent created schedule via MCP', {
        agentId: ctx.agentId,
        scheduleId: schedule.id,
        actionType: schedule.actionType,
    });

    return textResult(
        `Schedule created.\n` +
        `  ID: ${schedule.id}\n` +
        `  Name: ${schedule.name}\n` +
        `  Action: ${schedule.actionType}\n` +
        `  Cron: ${schedule.cronExpression}\n` +
        `  Next run: ${schedule.nextRunAt ?? 'not scheduled'}\n` +
        `  Requires approval: ${schedule.requiresApproval}`
    );
}

function handleList(ctx: ManageScheduleContext): CallToolResult {
    const schedules = listSchedules(ctx.db, { agentId: ctx.agentId });

    if (schedules.length === 0) {
        return textResult('No schedules found.');
    }

    const lines = schedules.map((s) =>
        `- [${s.status}] ${s.name} (${s.actionType}, ${s.cronExpression}) ID: ${s.id}`
    );

    return textResult(`Your schedules (${schedules.length}):\n\n${lines.join('\n')}`);
}

function handlePauseResume(
    ctx: ManageScheduleContext,
    args: { schedule_id?: string },
    newStatus: 'active' | 'paused',
): CallToolResult {
    if (!args.schedule_id) {
        return errorResult('schedule_id is required for pause/resume.');
    }

    const schedule = getSchedule(ctx.db, args.schedule_id);
    if (!schedule) return errorResult('Schedule not found.');

    // Agents can only manage their own schedules
    if (schedule.agentId !== ctx.agentId) {
        return errorResult('You can only manage your own schedules.');
    }

    const extras: Record<string, unknown> = {};
    if (newStatus === 'active' && schedule.status === 'error') {
        extras.consecutiveFailures = 0;
    }
    if (newStatus === 'active') {
        try {
            const cron = new Cron(schedule.cronExpression);
            const next = cron.nextRun(new Date());
            extras.nextRunAt = next ? next.toISOString() : null;
        } catch { /* ignore */ }
    }

    updateSchedule(ctx.db, args.schedule_id, { status: newStatus, ...extras });

    const action = newStatus === 'active' ? 'resumed' : 'paused';
    return textResult(`Schedule "${schedule.name}" ${action}.`);
}

function handleHistory(
    ctx: ManageScheduleContext,
    args: { schedule_id?: string },
): CallToolResult {
    if (!args.schedule_id) {
        return errorResult('schedule_id is required for history.');
    }

    const schedule = getSchedule(ctx.db, args.schedule_id);
    if (!schedule) return errorResult('Schedule not found.');

    // Agents can only view their own schedules
    if (schedule.agentId !== ctx.agentId) {
        return errorResult('You can only view your own schedules.');
    }

    const runs = listScheduleRuns(ctx.db, args.schedule_id, { limit: 10 });

    if (runs.length === 0) {
        return textResult(`No runs yet for schedule "${schedule.name}".`);
    }

    const lines = runs.map((r) =>
        `- [${r.status}] ${r.createdAt}${r.costUsd ? ` ($${r.costUsd.toFixed(4)})` : ''}${r.error ? ` Error: ${r.error.slice(0, 100)}` : ''}`
    );

    return textResult(
        `Recent runs for "${schedule.name}" (${runs.length}):\n\n${lines.join('\n')}`
    );
}

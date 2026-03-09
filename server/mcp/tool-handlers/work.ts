import type { Database } from 'bun:sqlite';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpToolContext } from './types';
import { textResult, errorResult } from './types';
import { createLogger } from '../../lib/logger';
import { queryCount } from '../../db/types';

const log = createLogger('McpToolHandlers');

// Rate limiter for corvid_create_work_task (persisted via DB)
const WORK_TASK_MAX_PER_DAY = parseInt(process.env.WORK_TASK_MAX_PER_DAY ?? '100', 10);

function checkWorkTaskRateLimit(db: Database, agentId: string): boolean {
    return queryCount(db, "SELECT COUNT(*) as cnt FROM work_tasks WHERE agent_id = ? AND date(created_at) = date('now')", agentId) < WORK_TASK_MAX_PER_DAY;
}

export async function handleCreateWorkTask(
    ctx: McpToolContext,
    args: { description: string; project_id?: string; priority?: number },
): Promise<CallToolResult> {
    if (!ctx.workTaskService) {
        return errorResult('Work task service is not available.');
    }

    if (!checkWorkTaskRateLimit(ctx.db, ctx.agentId)) {
        return errorResult(`Rate limit exceeded: maximum ${WORK_TASK_MAX_PER_DAY} work tasks per day.`);
    }

    // Validate priority if provided
    const priority = args.priority !== undefined
        ? (Number.isInteger(args.priority) && args.priority >= 0 && args.priority <= 3 ? args.priority as 0 | 1 | 2 | 3 : undefined)
        : undefined;
    if (args.priority !== undefined && priority === undefined) {
        return errorResult('Invalid priority: must be 0 (P0/critical), 1 (P1/high), 2 (P2/normal), or 3 (P3/low).');
    }

    try {
        ctx.emitStatus?.('Creating work task...');

        const task = await ctx.workTaskService.create({
            agentId: ctx.agentId,
            description: args.description,
            projectId: args.project_id,
            source: 'agent',
            priority,
        });

        const priorityLabel = ['P0 (critical)', 'P1 (high)', 'P2 (normal)', 'P3 (low)'][task.priority];
        log.info('MCP create_work_task succeeded', {
            agentId: ctx.agentId,
            taskId: task.id,
            status: task.status,
            priority: task.priority,
        });

        return textResult(
            `Work task created.\n` +
            `  ID: ${task.id}\n` +
            `  Status: ${task.status}\n` +
            `  Priority: ${priorityLabel}\n` +
            `  Branch: ${task.branchName ?? '(pending)'}`,
        );
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('MCP create_work_task failed', { error: message });
        return errorResult(`Failed to create work task: ${message}`);
    }
}

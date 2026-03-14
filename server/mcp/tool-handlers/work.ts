import type { Database } from 'bun:sqlite';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpToolContext } from './types';
import { textResult, errorResult } from './types';
import { createLogger } from '../../lib/logger';
import { queryCount } from '../../db/types';
import { getProjectByName, listProjects } from '../../db/projects';

const log = createLogger('McpToolHandlers');

// Rate limiter for corvid_create_work_task (persisted via DB)
const WORK_TASK_MAX_PER_DAY = parseInt(process.env.WORK_TASK_MAX_PER_DAY ?? '100', 10);

/** Map user-facing tier labels to internal ModelTier values. */
const TIER_MAP: Record<string, string> = {
    heavy: 'opus',
    standard: 'sonnet',
    light: 'haiku',
    opus: 'opus',
    sonnet: 'sonnet',
    haiku: 'haiku',
};

function checkWorkTaskRateLimit(db: Database, agentId: string): boolean {
    return queryCount(db, "SELECT COUNT(*) as cnt FROM work_tasks WHERE agent_id = ? AND date(created_at) = date('now')", agentId) < WORK_TASK_MAX_PER_DAY;
}

export async function handleCreateWorkTask(
    ctx: McpToolContext,
    args: { description: string; project_id?: string; project_name?: string; model_tier?: string },
): Promise<CallToolResult> {
    if (!ctx.workTaskService) {
        return errorResult('Work task service is not available.');
    }

    if (!checkWorkTaskRateLimit(ctx.db, ctx.agentId)) {
        return errorResult(`Rate limit exceeded: maximum ${WORK_TASK_MAX_PER_DAY} work tasks per day.`);
    }

    // Validate model_tier if provided
    if (args.model_tier && !TIER_MAP[args.model_tier]) {
        return errorResult(
            `Invalid model_tier "${args.model_tier}". Valid values: heavy, standard, light (or opus, sonnet, haiku).`,
        );
    }

    try {
        // Resolve project_name to project_id if needed
        let projectId = args.project_id;
        if (!projectId && args.project_name) {
            const project = getProjectByName(ctx.db, args.project_name);
            if (!project) {
                const allProjects = listProjects(ctx.db);
                const names = allProjects.map((p) => p.name).join(', ');
                return errorResult(
                    `No project found with name "${args.project_name}". ` +
                    `Available projects: ${names || '(none)'}`,
                );
            }
            projectId = project.id;
        }

        ctx.emitStatus?.('Creating work task...');

        const task = await ctx.workTaskService.create({
            agentId: ctx.agentId,
            description: args.description,
            projectId,
            source: 'agent',
            modelTier: args.model_tier ? TIER_MAP[args.model_tier] : undefined,
        });

        log.info('MCP create_work_task succeeded', {
            agentId: ctx.agentId,
            taskId: task.id,
            status: task.status,
            modelTier: args.model_tier ?? 'auto',
        });

        return textResult(
            `Work task created.\n` +
            `  ID: ${task.id}\n` +
            `  Project: ${task.projectId}\n` +
            `  Status: ${task.status}\n` +
            `  Branch: ${task.branchName ?? '(pending)'}\n` +
            `  Model tier: ${args.model_tier ?? 'auto'}`,
        );
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('MCP create_work_task failed', { error: message });
        return errorResult(`Failed to create work task: ${message}`);
    }
}

export async function handleCheckWorkStatus(
    ctx: McpToolContext,
    args: { task_id: string },
): Promise<CallToolResult> {
    if (!ctx.workTaskService) {
        return errorResult('Work task service is not available.');
    }

    const task = ctx.workTaskService.getTask(args.task_id);
    if (!task) {
        return errorResult(`Work task "${args.task_id}" not found.`);
    }

    const lines = [
        `Work Task: ${task.id}`,
        `  Status: ${task.status}`,
        `  Project: ${task.projectId}`,
        `  Branch: ${task.branchName ?? '(none)'}`,
        `  Iteration: ${task.iterationCount}`,
        `  Created: ${task.createdAt}`,
    ];
    if (task.prUrl) lines.push(`  PR: ${task.prUrl}`);
    if (task.error) lines.push(`  Error: ${task.error}`);
    if (task.completedAt) lines.push(`  Completed: ${task.completedAt}`);

    return textResult(lines.join('\n'));
}

export async function handleListWorkTasks(
    ctx: McpToolContext,
    args: { status?: string; limit?: number },
): Promise<CallToolResult> {
    if (!ctx.workTaskService) {
        return errorResult('Work task service is not available.');
    }

    let tasks = ctx.workTaskService.listTasks(ctx.agentId);

    // Filter by status if provided
    if (args.status) {
        tasks = tasks.filter((t) => t.status === args.status);
    }

    // Limit results
    const limit = Math.min(args.limit ?? 20, 50);
    tasks = tasks.slice(0, limit);

    if (tasks.length === 0) {
        return textResult(args.status
            ? `No work tasks with status "${args.status}".`
            : 'No work tasks found.');
    }

    const lines = tasks.map((t) => {
        const parts = [`${t.id} [${t.status}] ${t.description.slice(0, 80)}`];
        if (t.prUrl) parts.push(`  PR: ${t.prUrl}`);
        if (t.error) parts.push(`  Error: ${t.error.slice(0, 100)}`);
        return parts.join('\n');
    });

    return textResult(`Work tasks (${tasks.length}):\n\n${lines.join('\n\n')}`);
}

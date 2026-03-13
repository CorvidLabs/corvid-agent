import type { Database } from 'bun:sqlite';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpToolContext } from './types';
import { textResult, errorResult } from './types';
import { createLogger } from '../../lib/logger';
import { queryCount } from '../../db/types';
import { getProjectByName, listProjects } from '../../db/projects';
import { ConflictError } from '../../lib/errors';

const log = createLogger('McpToolHandlers');

// Rate limiter for corvid_create_work_task (persisted via DB)
const WORK_TASK_MAX_PER_DAY = parseInt(process.env.WORK_TASK_MAX_PER_DAY ?? '100', 10);

function checkWorkTaskRateLimit(db: Database, agentId: string): boolean {
    return queryCount(db, "SELECT COUNT(*) as cnt FROM work_tasks WHERE agent_id = ? AND date(created_at) = date('now')", agentId) < WORK_TASK_MAX_PER_DAY;
}

export async function handleCreateWorkTask(
    ctx: McpToolContext,
    args: { description: string; project_id?: string; project_name?: string; issue_ref?: { repo: string; number: number } },
): Promise<CallToolResult> {
    if (!ctx.workTaskService) {
        return errorResult('Work task service is not available.');
    }

    if (!checkWorkTaskRateLimit(ctx.db, ctx.agentId)) {
        return errorResult(`Rate limit exceeded: maximum ${WORK_TASK_MAX_PER_DAY} work tasks per day.`);
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
            issueRef: args.issue_ref,
        });

        log.info('MCP create_work_task succeeded', {
            agentId: ctx.agentId,
            taskId: task.id,
            status: task.status,
        });

        return textResult(
            `Work task created.\n` +
            `  ID: ${task.id}\n` +
            `  Project: ${task.projectId}\n` +
            `  Status: ${task.status}\n` +
            `  Branch: ${task.branchName ?? '(pending)'}`,
        );
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (err instanceof ConflictError) {
            // Surface deduplication conflicts as structured responses (not failures)
            const ctx_info = err.context as Record<string, unknown> | undefined;
            const prUrl = ctx_info?.prUrl as string | undefined;
            const existingTaskId = ctx_info?.existingTaskId as string | undefined;
            let detail = message;
            if (prUrl) detail += `\n  Existing PR: ${prUrl}`;
            if (existingTaskId) detail += `\n  Existing task ID: ${existingTaskId}`;
            log.info('MCP create_work_task rejected (duplicate)', { error: message, prUrl, existingTaskId });
            return errorResult(detail);
        }
        log.error('MCP create_work_task failed', { error: message });
        return errorResult(`Failed to create work task: ${message}`);
    }
}

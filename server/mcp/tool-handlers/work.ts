import type { Database } from 'bun:sqlite';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { getAgent } from '../../db/agents';
import { getProjectByName, listProjects } from '../../db/projects';
import { getSession } from '../../db/sessions';
import { queryCount } from '../../db/types';
import { createLogger } from '../../lib/logger';
import type { McpToolContext } from './types';
import { errorResult, textResult } from './types';

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
  return (
    queryCount(
      db,
      "SELECT COUNT(*) as cnt FROM work_tasks WHERE agent_id = ? AND date(created_at) = date('now')",
      agentId,
    ) < WORK_TASK_MAX_PER_DAY
  );
}

export async function handleCreateWorkTask(
  ctx: McpToolContext,
  args: {
    description: string;
    project_id?: string;
    project_name?: string;
    model_tier?: string;
    agent_id?: string;
    min_trust_level?: string;
  },
): Promise<CallToolResult> {
  if (!ctx.workTaskService) {
    return errorResult('Work task service is not available.');
  }

  // Resolve target agent: use explicit agent_id if provided, otherwise the calling agent
  const targetAgentId = args.agent_id ?? ctx.agentId;

  // Validate that the target agent exists (especially important when delegating)
  if (args.agent_id) {
    const targetAgent = getAgent(ctx.db, args.agent_id);
    if (!targetAgent) {
      return errorResult(`Agent not found: "${args.agent_id}". Use corvid_list_agents to discover available agents.`);
    }
  }

  if (!checkWorkTaskRateLimit(ctx.db, targetAgentId)) {
    return errorResult(`Rate limit exceeded: maximum ${WORK_TASK_MAX_PER_DAY} work tasks per day.`);
  }

  // Validate model_tier if provided
  if (args.model_tier && !TIER_MAP[args.model_tier]) {
    return errorResult(
      `Invalid model_tier "${args.model_tier}". Valid values: heavy, standard, light (or opus, sonnet, haiku).`,
    );
  }

  // Validate min_trust_level if provided
  const VALID_TRUST_LEVELS = ['low', 'medium', 'high', 'verified'] as const;
  type ValidTrustLevel = (typeof VALID_TRUST_LEVELS)[number];
  const minTrustLevel: ValidTrustLevel | undefined = args.min_trust_level
    ? (VALID_TRUST_LEVELS as readonly string[]).includes(args.min_trust_level)
      ? (args.min_trust_level as ValidTrustLevel)
      : undefined
    : undefined;
  if (args.min_trust_level && !minTrustLevel) {
    return errorResult(
      `Invalid min_trust_level "${args.min_trust_level}". Valid values: ${VALID_TRUST_LEVELS.join(', ')}.`,
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
          `No project found with name "${args.project_name}". ` + `Available projects: ${names || '(none)'}`,
        );
      }
      projectId = project.id;
    }
    // Prefer the chat session's project when the agent omits project args (Discord threads, etc.)
    if (!projectId && ctx.sessionId) {
      const sess = getSession(ctx.db, ctx.sessionId);
      if (sess?.projectId) projectId = sess.projectId;
    }

    ctx.emitStatus?.('Creating work task...');

    const task = await ctx.workTaskService.create({
      agentId: targetAgentId,
      description: args.description,
      projectId,
      source: 'agent',
      modelTier: args.model_tier ? TIER_MAP[args.model_tier] : undefined,
      minTrustLevel,
    });

    log.info('MCP create_work_task succeeded', {
      agentId: targetAgentId,
      delegatedBy: args.agent_id ? ctx.agentId : undefined,
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

export async function handleCheckWorkStatus(ctx: McpToolContext, args: { task_id: string }): Promise<CallToolResult> {
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

export async function handleEscalateWorkTask(
  ctx: McpToolContext,
  args: { task_id: string; action: 'retry' | 'retry_opus' | 'cancel' },
): Promise<CallToolResult> {
  if (!ctx.workTaskService) {
    return errorResult('Work task service is not available.');
  }

  try {
    const result = await ctx.workTaskService.escalateResume(args.task_id, args.action);
    if (!result) return errorResult(`Work task "${args.task_id}" not found.`);

    const message =
      args.action === 'cancel'
        ? `Task cancelled. Status: failed.`
        : `Task resumed. Status: ${result.status}. Use corvid_check_work_status to monitor progress.`;

    return textResult(message);
  } catch (err) {
    log.error('MCP work_task_escalate failed', {
      taskId: args.task_id,
      action: args.action,
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResult(err instanceof Error ? err.message : String(err));
  }
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
    return textResult(args.status ? `No work tasks with status "${args.status}".` : 'No work tasks found.');
  }

  const lines = tasks.map((t) => {
    const parts = [`${t.id} [${t.status}] ${t.description.slice(0, 80)}`];
    if (t.prUrl) parts.push(`  PR: ${t.prUrl}`);
    if (t.error) parts.push(`  Error: ${t.error.slice(0, 100)}`);
    return parts.join('\n');
  });

  return textResult(`Work tasks (${tasks.length}):\n\n${lines.join('\n\n')}`);
}

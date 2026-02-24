import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpToolContext } from './types';
import { textResult, errorResult } from './types';
import { listWorkflows, createWorkflow, updateWorkflow, getWorkflow, listWorkflowRuns, getWorkflowRun } from '../../db/workflows';
import { createLogger } from '../../lib/logger';

const log = createLogger('McpToolHandlers');

export async function handleManageWorkflow(
    ctx: McpToolContext,
    args: {
        action: 'list' | 'create' | 'get' | 'activate' | 'pause' | 'trigger' | 'runs' | 'run_status';
        workflow_id?: string;
        run_id?: string;
        name?: string;
        description?: string;
        nodes?: Array<{ id: string; type: string; label: string; config?: Record<string, unknown>; position?: { x: number; y: number } }>;
        edges?: Array<{ id: string; sourceNodeId: string; targetNodeId: string; condition?: string; label?: string }>;
        default_project_id?: string;
        max_concurrency?: number;
        input?: Record<string, unknown>;
    },
): Promise<CallToolResult> {
    try {
        switch (args.action) {
            case 'list': {
                const workflows = listWorkflows(ctx.db, ctx.agentId);
                if (workflows.length === 0) return textResult('No workflows found.');
                const lines = workflows.map((w) =>
                    `- ${w.name} [${w.id}] status=${w.status} nodes=${w.nodes.length} edges=${w.edges.length}`
                );
                return textResult(`Your workflows:\n\n${lines.join('\n')}`);
            }

            case 'create': {
                if (!args.name || !args.nodes?.length) {
                    return errorResult('name and nodes are required to create a workflow');
                }

                const hasStart = args.nodes.some((n) => n.type === 'start');
                if (!hasStart) {
                    return errorResult('Workflow must have at least one start node');
                }

                const nodes = args.nodes.map((n) => ({
                    id: n.id,
                    type: n.type as import('../../../shared/types').WorkflowNodeType,
                    label: n.label,
                    config: n.config ?? {},
                    position: n.position,
                }));

                const edges = (args.edges ?? []).map((e) => ({
                    id: e.id,
                    sourceNodeId: e.sourceNodeId,
                    targetNodeId: e.targetNodeId,
                    condition: e.condition,
                    label: e.label,
                }));

                const workflow = createWorkflow(ctx.db, {
                    agentId: ctx.agentId,
                    name: args.name,
                    description: args.description,
                    nodes,
                    edges,
                    defaultProjectId: args.default_project_id,
                    maxConcurrency: args.max_concurrency,
                });

                return textResult(
                    `Workflow created!\n` +
                    `  ID: ${workflow.id}\n` +
                    `  Name: ${workflow.name}\n` +
                    `  Status: ${workflow.status} (use activate to enable)\n` +
                    `  Nodes: ${workflow.nodes.length}\n` +
                    `  Edges: ${workflow.edges.length}`,
                );
            }

            case 'get': {
                if (!args.workflow_id) return errorResult('workflow_id is required');
                const workflow = getWorkflow(ctx.db, args.workflow_id);
                if (!workflow) return errorResult('Workflow not found');

                const nodeList = workflow.nodes.map((n) => `  - ${n.id}: ${n.type} "${n.label}"`).join('\n');
                const edgeList = workflow.edges.map((e) =>
                    `  - ${e.sourceNodeId} → ${e.targetNodeId}${e.condition ? ` (${e.condition})` : ''}`
                ).join('\n');

                return textResult(
                    `Workflow: ${workflow.name} [${workflow.id}]\n` +
                    `Status: ${workflow.status}\n` +
                    `Description: ${workflow.description}\n\n` +
                    `Nodes:\n${nodeList}\n\n` +
                    `Edges:\n${edgeList}`,
                );
            }

            case 'activate': {
                if (!args.workflow_id) return errorResult('workflow_id is required');
                const updated = updateWorkflow(ctx.db, args.workflow_id, { status: 'active' });
                if (!updated) return errorResult('Workflow not found');
                return textResult(`Workflow "${updated.name}" activated. It can now be triggered.`);
            }

            case 'pause': {
                if (!args.workflow_id) return errorResult('workflow_id is required');
                const updated = updateWorkflow(ctx.db, args.workflow_id, { status: 'paused' });
                if (!updated) return errorResult('Workflow not found');
                return textResult(`Workflow "${updated.name}" paused.`);
            }

            case 'trigger': {
                if (!args.workflow_id) return errorResult('workflow_id is required');
                if (!ctx.workflowService) return errorResult('Workflow service not available');

                const run = await ctx.workflowService.triggerWorkflow(args.workflow_id, args.input ?? {});
                return textResult(
                    `Workflow triggered!\n` +
                    `  Run ID: ${run.id}\n` +
                    `  Status: ${run.status}\n` +
                    `  Current nodes: ${run.currentNodeIds.join(', ')}`,
                );
            }

            case 'runs': {
                const runs = listWorkflowRuns(ctx.db, args.workflow_id, 20);
                if (runs.length === 0) return textResult('No workflow runs found.');
                const lines = runs.map((r) =>
                    `- [${r.id.slice(0, 8)}] workflow=${r.workflowId.slice(0, 8)} status=${r.status} started=${r.startedAt}${r.error ? ` error="${r.error.slice(0, 80)}"` : ''}`
                );
                return textResult(`Recent workflow runs:\n\n${lines.join('\n')}`);
            }

            case 'run_status': {
                if (!args.run_id) return errorResult('run_id is required');
                const run = getWorkflowRun(ctx.db, args.run_id);
                if (!run) return errorResult('Run not found');

                const nodeLines = run.nodeRuns.map((nr) =>
                    `  - ${nr.nodeId} (${nr.nodeType}): ${nr.status}${nr.error ? ` — ${nr.error.slice(0, 80)}` : ''}${nr.sessionId ? ` session=${nr.sessionId.slice(0, 8)}` : ''}`
                );

                return textResult(
                    `Workflow Run: ${run.id}\n` +
                    `Status: ${run.status}\n` +
                    `Started: ${run.startedAt}\n` +
                    `Completed: ${run.completedAt ?? 'in progress'}\n` +
                    `Current nodes: ${run.currentNodeIds.join(', ') || 'none'}\n\n` +
                    `Node executions:\n${nodeLines.join('\n') || '  (none yet)'}`,
                );
            }

            default:
                return errorResult(`Unknown action: ${args.action}. Use list, create, get, activate, pause, trigger, runs, or run_status.`);
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('MCP manage_workflow failed', { error: message });
        return errorResult(`Failed to manage workflow: ${message}`);
    }
}

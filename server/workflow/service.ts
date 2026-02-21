/**
 * WorkflowService — graph-based workflow orchestration engine.
 *
 * Executes workflow graphs by traversing nodes (agent sessions, work tasks,
 * conditions, delays, etc.) and following edges to determine the next steps.
 * Supports parallel execution, conditional branching, and data passing between nodes.
 */

import type { Database } from 'bun:sqlite';
import type { ProcessManager } from '../process/manager';
import type { WorkTaskService } from '../work/service';
import type { AgentMessenger } from '../algochat/agent-messenger';
import type {
    WorkflowRun,
    WorkflowNode,
    WorkflowEdge,
    WorkflowNodeRun,
} from '../../shared/types';
import {
    getWorkflow,
    createWorkflowRun,
    getWorkflowRun,
    listActiveRuns,
    updateWorkflowRunStatus,
    createNodeRun,
    updateNodeRunStatus,
    getNodeRunByNodeId,
    listNodeRuns,
} from '../db/workflows';
import { getAgent } from '../db/agents';
import { createSession, getSession } from '../db/sessions';
import { createLogger } from '../lib/logger';
import { createEventContext, runWithEventContext } from '../observability/event-context';

const log = createLogger('Workflow');

const POLL_INTERVAL_MS = 5_000; // Check for runnable nodes every 5s
const MAX_CONCURRENT_NODES = 4;
const MAX_NODE_RUNS_PER_WORKFLOW = 100; // Safety limit

type WorkflowEventCallback = (event: {
    type: 'workflow_update' | 'workflow_run_update' | 'workflow_node_update';
    data: unknown;
}) => void;

export class WorkflowService {
    private db: Database;
    private processManager: ProcessManager;
    private workTaskService: WorkTaskService | null;
    private agentMessenger: AgentMessenger | null;
    private pollTimer: ReturnType<typeof setInterval> | null = null;
    private eventCallbacks = new Set<WorkflowEventCallback>();
    private runningNodes = new Set<string>(); // node run IDs currently executing

    constructor(
        db: Database,
        processManager: ProcessManager,
        workTaskService?: WorkTaskService | null,
        agentMessenger?: AgentMessenger | null,
    ) {
        this.db = db;
        this.processManager = processManager;
        this.workTaskService = workTaskService ?? null;
        this.agentMessenger = agentMessenger ?? null;
    }

    /** Update the agent messenger (set after async AlgoChat init). */
    setAgentMessenger(messenger: AgentMessenger): void {
        this.agentMessenger = messenger;
    }

    /** Start the workflow execution polling loop. */
    start(): void {
        if (this.pollTimer) return;
        log.info('Workflow service started', { pollIntervalMs: POLL_INTERVAL_MS });

        // Recover any stale running runs on startup
        this.recoverStaleRuns();

        this.pollTimer = setInterval(() => this.tick(), POLL_INTERVAL_MS);
        // Run once immediately
        this.tick();
    }

    /** Stop the workflow service. */
    stop(): void {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
        log.info('Workflow service stopped');
    }

    /** Subscribe to workflow events (for WebSocket broadcast). */
    onEvent(callback: WorkflowEventCallback): () => void {
        this.eventCallbacks.add(callback);
        return () => this.eventCallbacks.delete(callback);
    }

    /** Trigger a workflow execution. */
    async triggerWorkflow(
        workflowId: string,
        input: Record<string, unknown> = {},
    ): Promise<WorkflowRun> {
        const ctx = createEventContext('workflow');
        return runWithEventContext(ctx, async () => {
        const workflow = getWorkflow(this.db, workflowId);
        if (!workflow) throw new Error(`Workflow not found: ${workflowId}`);
        if (workflow.status !== 'active') {
            throw new Error(`Workflow is not active (status: ${workflow.status}). Activate it first.`);
        }

        // Validate the graph has a start node
        const startNode = workflow.nodes.find((n) => n.type === 'start');
        if (!startNode) throw new Error('Workflow has no start node');

        // Create the run with a snapshot of the current graph
        const run = createWorkflowRun(
            this.db,
            workflowId,
            workflow.agentId,
            input,
            { nodes: workflow.nodes, edges: workflow.edges },
        );

        log.info('Workflow run started', { runId: run.id, workflowId, workflowName: workflow.name });

        this.emit({ type: 'workflow_run_update', data: run });

        // Create and execute the start node
        const startNodeRun = createNodeRun(this.db, run.id, startNode.id, startNode.type, input);
        updateNodeRunStatus(this.db, startNodeRun.id, 'completed', { output: input });

        this.emit({ type: 'workflow_node_update', data: { ...startNodeRun, status: 'completed', output: input } });

        // Update current node IDs and advance
        updateWorkflowRunStatus(this.db, run.id, 'running', { currentNodeIds: [startNode.id] });

        // Immediately try to advance to next nodes
        await this.advanceRun(run.id);

        return getWorkflowRun(this.db, run.id)!;
        }); // runWithEventContext
    }

    /** Pause a running workflow. */
    pauseRun(runId: string): boolean {
        const run = getWorkflowRun(this.db, runId);
        if (!run || run.status !== 'running') return false;
        updateWorkflowRunStatus(this.db, runId, 'paused');
        this.emit({ type: 'workflow_run_update', data: { ...run, status: 'paused' } });
        log.info('Workflow run paused', { runId });
        return true;
    }

    /** Resume a paused workflow. */
    async resumeRun(runId: string): Promise<boolean> {
        const run = getWorkflowRun(this.db, runId);
        if (!run || run.status !== 'paused') return false;
        updateWorkflowRunStatus(this.db, runId, 'running');
        this.emit({ type: 'workflow_run_update', data: { ...run, status: 'running' } });
        log.info('Workflow run resumed', { runId });
        await this.advanceRun(runId);
        return true;
    }

    /** Cancel a running/paused workflow. */
    cancelRun(runId: string): boolean {
        const run = getWorkflowRun(this.db, runId);
        if (!run || (run.status !== 'running' && run.status !== 'paused')) return false;
        updateWorkflowRunStatus(this.db, runId, 'cancelled', { error: 'Cancelled by user' });
        this.emit({ type: 'workflow_run_update', data: { ...run, status: 'cancelled' } });
        log.info('Workflow run cancelled', { runId });
        return true;
    }

    /** Get service stats for the health endpoint. */
    getStats(): {
        running: boolean;
        activeRuns: number;
        runningNodes: number;
        totalWorkflows: number;
        hasMessenger: boolean;
    } {
        const activeRow = this.db.query(
            `SELECT COUNT(*) as count FROM workflow_runs WHERE status IN ('running', 'paused')`
        ).get() as { count: number };
        const totalRow = this.db.query(
            `SELECT COUNT(*) as count FROM workflows`
        ).get() as { count: number };

        return {
            running: this.pollTimer !== null,
            activeRuns: activeRow.count,
            runningNodes: this.runningNodes.size,
            totalWorkflows: totalRow.count,
            hasMessenger: this.agentMessenger !== null,
        };
    }

    // ─── Internal ────────────────────────────────────────────────────────────

    /** Recover runs that were 'running' when the server shut down. */
    private recoverStaleRuns(): void {
        const staleRuns = listActiveRuns(this.db);
        for (const run of staleRuns) {
            if (run.status === 'running') {
                log.info('Recovering stale workflow run', { runId: run.id });
                // Don't fail them — try to advance; nodes that were mid-execution
                // will be detected and re-processed in the next tick
            }
        }
    }

    /** Main tick — check all active runs for nodes that can be advanced. */
    private async tick(): Promise<void> {
        const activeRuns = listActiveRuns(this.db);
        for (const run of activeRuns) {
            if (run.status !== 'running') continue;
            try {
                await this.advanceRun(run.id);
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                log.error('Error advancing workflow run', { runId: run.id, error: message });
            }
        }
    }

    /**
     * Advance a workflow run: find nodes whose predecessors are complete,
     * and execute them.
     */
    private async advanceRun(runId: string): Promise<void> {
        const run = getWorkflowRun(this.db, runId);
        if (!run || run.status !== 'running') return;

        const { nodes, edges } = run.workflowSnapshot;
        const nodeRuns = listNodeRuns(this.db, runId);
        const nodeRunMap = new Map(nodeRuns.map((nr) => [nr.nodeId, nr]));

        // Find nodes that are ready to execute
        const readyNodes: WorkflowNode[] = [];

        for (const node of nodes) {
            // Skip if already has a node run that's not pending
            const existing = nodeRunMap.get(node.id);
            if (existing && existing.status !== 'pending') continue;

            // Skip start nodes (already handled)
            if (node.type === 'start') continue;

            // Check if all predecessors are complete
            const incomingEdges = edges.filter((e) => e.targetNodeId === node.id);
            if (incomingEdges.length === 0) continue; // Unreachable node

            // For join nodes: ALL predecessors must be complete
            // For other nodes: ANY predecessor must be complete (parallel paths)
            if (node.type === 'join') {
                const allComplete = incomingEdges.every((edge) => {
                    const predRun = nodeRunMap.get(edge.sourceNodeId);
                    return predRun && predRun.status === 'completed';
                });
                if (!allComplete) continue;
            } else {
                // Check if at least one predecessor completed and edges match
                const anyReady = incomingEdges.some((edge) => {
                    const predRun = nodeRunMap.get(edge.sourceNodeId);
                    if (!predRun || predRun.status !== 'completed') return false;

                    // For condition nodes, check the edge condition matches output
                    if (edge.condition) {
                        const predNode = nodes.find((n) => n.id === edge.sourceNodeId);
                        if (predNode?.type === 'condition') {
                            const condResult = predRun.output?.conditionResult;
                            return String(condResult) === edge.condition;
                        }
                    }
                    return true;
                });
                if (!anyReady) continue;
            }

            readyNodes.push(node);
        }

        if (readyNodes.length === 0) {
            // Check if the workflow is complete (all end nodes reached or no more work)
            this.checkRunCompletion(runId, run, nodes, nodeRunMap);
            return;
        }

        // Safety: don't exceed max node runs
        if (nodeRuns.length >= MAX_NODE_RUNS_PER_WORKFLOW) {
            log.warn('Max node runs exceeded, failing workflow', { runId, count: nodeRuns.length });
            updateWorkflowRunStatus(this.db, runId, 'failed', {
                error: `Max node runs (${MAX_NODE_RUNS_PER_WORKFLOW}) exceeded`,
            });
            this.emit({ type: 'workflow_run_update', data: { ...run, status: 'failed' } });
            return;
        }

        // Execute ready nodes (respecting concurrency)
        const currentRunning = this.runningNodes.size;
        const available = Math.max(0, MAX_CONCURRENT_NODES - currentRunning);

        for (const node of readyNodes.slice(0, available)) {
            // Gather input from predecessors
            const input = this.gatherNodeInput(node, edges, nodeRunMap, run.input);

            // Create or get existing pending node run
            let nodeRun = nodeRunMap.get(node.id);
            if (!nodeRun) {
                nodeRun = createNodeRun(this.db, runId, node.id, node.type, input);
            }

            // Execute the node asynchronously
            this.executeNode(runId, node, nodeRun, input);
        }

        // Update current node IDs
        const currentNodeIds = readyNodes.map((n) => n.id);
        updateWorkflowRunStatus(this.db, runId, 'running', { currentNodeIds });
    }

    /** Gather input for a node from its predecessors' outputs. */
    private gatherNodeInput(
        node: WorkflowNode,
        edges: WorkflowEdge[],
        nodeRunMap: Map<string, WorkflowNodeRun>,
        workflowInput: Record<string, unknown>,
    ): Record<string, unknown> {
        const incomingEdges = edges.filter((e) => e.targetNodeId === node.id);
        const predecessorOutputs: Record<string, unknown>[] = [];

        for (const edge of incomingEdges) {
            const predRun = nodeRunMap.get(edge.sourceNodeId);
            if (predRun?.output) {
                predecessorOutputs.push(predRun.output);
            }
        }

        // Merge predecessor outputs (last one wins for conflicts)
        const merged: Record<string, unknown> = { ...workflowInput };
        for (const output of predecessorOutputs) {
            Object.assign(merged, output);
        }

        // Add special "prev" key with the most recent predecessor's output
        if (predecessorOutputs.length > 0) {
            merged.prev = predecessorOutputs[predecessorOutputs.length - 1];
        }

        return merged;
    }

    /** Execute a single node asynchronously. */
    private async executeNode(
        runId: string,
        node: WorkflowNode,
        nodeRun: WorkflowNodeRun,
        input: Record<string, unknown>,
    ): Promise<void> {
        this.runningNodes.add(nodeRun.id);
        updateNodeRunStatus(this.db, nodeRun.id, 'running');
        this.emit({ type: 'workflow_node_update', data: { ...nodeRun, status: 'running' } });

        try {
            const output = await this.executeNodeByType(runId, node, input);
            updateNodeRunStatus(this.db, nodeRun.id, 'completed', { output });
            this.emit({ type: 'workflow_node_update', data: { ...nodeRun, status: 'completed', output } });
            log.info('Node completed', { runId, nodeId: node.id, nodeType: node.type });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            updateNodeRunStatus(this.db, nodeRun.id, 'failed', { error: message });
            this.emit({ type: 'workflow_node_update', data: { ...nodeRun, status: 'failed', error: message } });
            log.error('Node failed', { runId, nodeId: node.id, nodeType: node.type, error: message });

            // Fail the entire run on node failure
            updateWorkflowRunStatus(this.db, runId, 'failed', { error: `Node "${node.label}" failed: ${message}` });
            const run = getWorkflowRun(this.db, runId);
            if (run) this.emit({ type: 'workflow_run_update', data: run });
        } finally {
            this.runningNodes.delete(nodeRun.id);
            // Try to advance the run (next nodes may be ready now)
            try {
                await this.advanceRun(runId);
            } catch {
                // Errors in advance are logged by advanceRun itself
            }
        }
    }

    /** Execute a node based on its type. */
    private async executeNodeByType(
        runId: string,
        node: WorkflowNode,
        input: Record<string, unknown>,
    ): Promise<Record<string, unknown>> {
        switch (node.type) {
            case 'start':
                return input;

            case 'end':
                return { completed: true, ...input };

            case 'agent_session':
                return this.executeAgentSession(runId, node, input);

            case 'work_task':
                return this.executeWorkTask(runId, node, input);

            case 'condition':
                return this.executeCondition(node, input);

            case 'delay':
                return this.executeDelay(node);

            case 'transform':
                return this.executeTransform(node, input);

            case 'parallel':
                // Parallel node is a pass-through — branches are handled by graph edges
                return input;

            case 'join':
                // Join node merges all inputs — already handled by gatherNodeInput
                return input;

            case 'webhook_wait':
                // Mark as waiting — will be completed externally
                throw new Error('webhook_wait nodes are completed externally via the API');

            default:
                throw new Error(`Unknown node type: ${node.type}`);
        }
    }

    /** Execute an agent_session node by spawning a session. */
    private async executeAgentSession(
        runId: string,
        node: WorkflowNode,
        input: Record<string, unknown>,
    ): Promise<Record<string, unknown>> {
        const config = node.config;
        const run = getWorkflowRun(this.db, runId);
        if (!run) throw new Error('Run not found');

        const workflow = getWorkflow(this.db, run.workflowId);
        const agentId = config.agentId ?? workflow?.agentId;
        if (!agentId) throw new Error('No agent ID configured for agent_session node');

        const agent = getAgent(this.db, agentId);
        if (!agent) throw new Error(`Agent not found: ${agentId}`);

        const projectId = config.projectId ?? workflow?.defaultProjectId;
        if (!projectId) throw new Error('No project ID configured for agent_session node');

        // Resolve template variables in the prompt
        const prompt = this.resolveTemplate(config.prompt ?? 'Execute workflow step', input);

        const session = createSession(this.db, {
            projectId,
            agentId,
            name: `Workflow: ${node.label}`,
            initialPrompt: prompt,
            source: 'agent',
        });

        // Update the node run with the session ID
        const nodeRun = getNodeRunByNodeId(this.db, runId, node.id);
        if (nodeRun) {
            updateNodeRunStatus(this.db, nodeRun.id, 'running', { sessionId: session.id });
        }

        // Start the session and wait for completion
        this.processManager.startProcess(session, prompt);

        // Poll for session completion
        const result = await this.waitForSession(session.id, config.maxTurns ?? 50);

        return {
            sessionId: session.id,
            output: result,
        };
    }

    /** Execute a work_task node. */
    private async executeWorkTask(
        runId: string,
        node: WorkflowNode,
        input: Record<string, unknown>,
    ): Promise<Record<string, unknown>> {
        if (!this.workTaskService) {
            throw new Error('Work task service not available');
        }

        const config = node.config;
        const run = getWorkflowRun(this.db, runId);
        if (!run) throw new Error('Run not found');

        const workflow = getWorkflow(this.db, run.workflowId);
        const description = this.resolveTemplate(config.description ?? 'Workflow work task', input);

        const task = await this.workTaskService.create({
            agentId: workflow?.agentId ?? run.agentId,
            description,
            projectId: config.projectId ?? workflow?.defaultProjectId ?? undefined,
            source: 'agent',
        });

        // Update the node run with the work task ID
        const nodeRun = getNodeRunByNodeId(this.db, runId, node.id);
        if (nodeRun) {
            updateNodeRunStatus(this.db, nodeRun.id, 'running', { workTaskId: task.id });
        }

        return {
            workTaskId: task.id,
            branchName: task.branchName,
            status: task.status,
        };
    }

    /** Evaluate a condition node. */
    private executeCondition(
        node: WorkflowNode,
        input: Record<string, unknown>,
    ): Record<string, unknown> {
        const expression = node.config.expression ?? 'true';

        try {
            // Simple expression evaluation with prev/input context
            // Supports: prev.output.includes('success'), input.count > 5, etc.
            const result = this.evaluateExpression(expression, input);
            return { conditionResult: Boolean(result) };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            log.warn('Condition evaluation failed, defaulting to false', { expression, error: message });
            return { conditionResult: false };
        }
    }

    /** Execute a delay node. */
    private async executeDelay(node: WorkflowNode): Promise<Record<string, unknown>> {
        const delayMs = node.config.delayMs ?? 1000;
        const capped = Math.min(delayMs, 3600_000); // Max 1 hour
        await new Promise((resolve) => setTimeout(resolve, capped));
        return { delayed: true, delayMs: capped };
    }

    /** Execute a transform node. */
    private executeTransform(
        node: WorkflowNode,
        input: Record<string, unknown>,
    ): Record<string, unknown> {
        const template = node.config.template ?? '{{prev}}';
        const result = this.resolveTemplate(template, input);
        return { transformed: result, ...input };
    }

    /** Check if a workflow run is complete (all end nodes reached). */
    private checkRunCompletion(
        runId: string,
        run: WorkflowRun,
        nodes: WorkflowNode[],
        nodeRunMap: Map<string, WorkflowNodeRun>,
    ): void {
        const endNodes = nodes.filter((n) => n.type === 'end');

        // If there are no end nodes, check if all nodes with no outgoing edges are complete
        if (endNodes.length === 0) {
            const { edges } = run.workflowSnapshot;
            const terminalNodes = nodes.filter((n) => {
                return !edges.some((e) => e.sourceNodeId === n.id);
            });

            const allTerminalComplete = terminalNodes.every((n) => {
                const nr = nodeRunMap.get(n.id);
                return nr && (nr.status === 'completed' || nr.status === 'failed' || nr.status === 'skipped');
            });

            if (allTerminalComplete && terminalNodes.length > 0) {
                this.completeRun(runId, run, nodeRunMap);
            }
            return;
        }

        // Check if all end nodes are complete
        const allEndNodesComplete = endNodes.every((n) => {
            const nr = nodeRunMap.get(n.id);
            return nr && nr.status === 'completed';
        });

        // Or at least one end node is complete (for conditional flows where not all ends are reached)
        const anyEndNodeComplete = endNodes.some((n) => {
            const nr = nodeRunMap.get(n.id);
            return nr && nr.status === 'completed';
        });

        // Check if there are any still-running or pending nodes
        const hasActiveNodes = Array.from(nodeRunMap.values()).some(
            (nr) => nr.status === 'running' || nr.status === 'pending' || nr.status === 'waiting'
        );

        if ((allEndNodesComplete || (anyEndNodeComplete && !hasActiveNodes))) {
            this.completeRun(runId, run, nodeRunMap);
        }
    }

    /** Mark a run as completed and gather final output. */
    private completeRun(
        runId: string,
        _run: WorkflowRun,
        nodeRunMap: Map<string, WorkflowNodeRun>,
    ): void {
        // Gather output from end nodes (or last completed nodes)
        const endNodeOutputs: Record<string, unknown> = {};
        for (const [_nodeId, nodeRun] of nodeRunMap) {
            if (nodeRun.status === 'completed' && nodeRun.output) {
                Object.assign(endNodeOutputs, nodeRun.output);
            }
        }

        updateWorkflowRunStatus(this.db, runId, 'completed', { output: endNodeOutputs });
        const updatedRun = getWorkflowRun(this.db, runId);
        if (updatedRun) {
            this.emit({ type: 'workflow_run_update', data: updatedRun });
        }
        log.info('Workflow run completed', { runId });
    }

    // ─── Utility ────────────────────────────────────────────────────────────

    /** Resolve {{var}} template strings with input data. */
    private resolveTemplate(template: string, data: Record<string, unknown>): string {
        return template.replace(/\{\{([^}]+)\}\}/g, (_, path: string) => {
            const parts = path.trim().split('.');
            let value: unknown = data;
            for (const part of parts) {
                if (value === null || value === undefined) return '';
                value = (value as Record<string, unknown>)[part];
            }
            if (value === undefined || value === null) return '';
            return typeof value === 'object' ? JSON.stringify(value) : String(value);
        });
    }

    /** Evaluate a simple expression in a safe manner. */
    private evaluateExpression(expression: string, context: Record<string, unknown>): boolean {
        // Simple evaluation: support basic comparisons and includes
        // This is intentionally limited to prevent arbitrary code execution

        const prev = context.prev as Record<string, unknown> | undefined;
        const input = context;

        // Handle common patterns
        if (expression === 'true') return true;
        if (expression === 'false') return false;

        // includes() pattern: "prev.output.includes('success')"
        const includesMatch = expression.match(/^([a-zA-Z_.]+)\.includes\(['"](.+)['"]\)$/);
        if (includesMatch) {
            const value = this.resolvePath(includesMatch[1], { prev, input, ...context });
            return typeof value === 'string' && value.includes(includesMatch[2]);
        }

        // Comparison pattern: "input.count > 5"
        const compMatch = expression.match(/^([a-zA-Z_.]+)\s*(===|!==|==|!=|>=|<=|>|<)\s*(.+)$/);
        if (compMatch) {
            const left = this.resolvePath(compMatch[1], { prev, input, ...context });
            const op = compMatch[2];
            let right: unknown = compMatch[3].trim();
            // Try to parse right side as number or boolean
            if (right === 'true') right = true;
            else if (right === 'false') right = false;
            else if (!isNaN(Number(right))) right = Number(right);
            else if ((right as string).startsWith("'") || (right as string).startsWith('"')) {
                right = (right as string).slice(1, -1);
            }

            switch (op) {
                case '===': case '==': return left === right;
                case '!==': case '!=': return left !== right;
                case '>': return Number(left) > Number(right);
                case '<': return Number(left) < Number(right);
                case '>=': return Number(left) >= Number(right);
                case '<=': return Number(left) <= Number(right);
            }
        }

        // Truthy check: "prev.output"
        const pathValue = this.resolvePath(expression, { prev, input, ...context });
        return Boolean(pathValue);
    }

    /** Resolve a dot-separated path like "prev.output.status" from an object. */
    private resolvePath(path: string, context: Record<string, unknown>): unknown {
        const parts = path.split('.');
        let value: unknown = context;
        for (const part of parts) {
            if (value === null || value === undefined) return undefined;
            value = (value as Record<string, unknown>)[part];
        }
        return value;
    }

    /** Wait for a session to finish (poll every 2s). */
    private async waitForSession(sessionId: string, maxTurns: number): Promise<string> {
        const maxWaitMs = maxTurns * 30_000; // Rough estimate: 30s per turn
        const startTime = Date.now();
        const pollMs = 2_000;

        while (Date.now() - startTime < maxWaitMs) {
            const session = getSession(this.db, sessionId);
            if (!session) throw new Error(`Session ${sessionId} not found`);

            if (session.status === 'stopped' || session.status === 'idle') {
                // Session completed — gather the last assistant message as output
                const messages = this.db.query(
                    `SELECT content FROM session_messages WHERE session_id = ? AND role = 'assistant' ORDER BY id DESC LIMIT 1`
                ).get(sessionId) as { content: string } | null;
                return messages?.content ?? 'Session completed with no output';
            }

            if (session.status === 'error') {
                throw new Error(`Session ${sessionId} ended with error`);
            }

            await new Promise((resolve) => setTimeout(resolve, pollMs));
        }

        throw new Error(`Session ${sessionId} timed out after ${Math.round(maxWaitMs / 1000)}s`);
    }

    /** Emit an event to all registered callbacks. */
    private emit(event: { type: string; data: unknown }): void {
        for (const cb of this.eventCallbacks) {
            try {
                cb(event as Parameters<WorkflowEventCallback>[0]);
            } catch (err) {
                log.error('Workflow event callback error', { error: err instanceof Error ? err.message : String(err) });
            }
        }
    }
}

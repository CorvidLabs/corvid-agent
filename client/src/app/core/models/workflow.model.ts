export type WorkflowStatus = 'draft' | 'active' | 'running' | 'paused' | 'completed' | 'failed';

export type WorkflowNodeType =
    | 'start'
    | 'agent_session'
    | 'work_task'
    | 'condition'
    | 'delay'
    | 'webhook_wait'
    | 'transform'
    | 'parallel'
    | 'join'
    | 'end';

export type WorkflowRunStatus = 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

export type WorkflowNodeRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'waiting';

export interface WorkflowNodeConfig {
    // agent_session
    agentId?: string;
    projectId?: string;
    prompt?: string;            // Supports {{prev.output}} template vars
    maxTurns?: number;

    // work_task
    description?: string;       // Supports template vars

    // condition
    expression?: string;        // JS-like expression: "prev.output.includes('success')"

    // delay
    delayMs?: number;

    // webhook_wait
    webhookEvent?: string;      // Event type to wait for
    timeoutMs?: number;         // Max wait time

    // transform
    template?: string;          // Template string with {{var}} placeholders

    // parallel
    branchCount?: number;       // Number of parallel branches (inferred from edges)
}

export interface WorkflowNode {
    id: string;
    type: WorkflowNodeType;
    label: string;
    config: WorkflowNodeConfig;
    position?: { x: number; y: number };
}

export interface WorkflowEdge {
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
    condition?: string;
    label?: string;
}

export interface Workflow {
    id: string;
    agentId: string;
    name: string;
    description: string;
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    status: WorkflowStatus;
    defaultProjectId: string | null;
    maxConcurrency: number;
    createdAt: string;
    updatedAt: string;
}

export interface WorkflowRun {
    id: string;
    workflowId: string;
    agentId: string;
    status: WorkflowRunStatus;
    input: Record<string, unknown>;
    output: Record<string, unknown> | null;
    workflowSnapshot: { nodes: WorkflowNode[]; edges: WorkflowEdge[] };
    nodeRuns: WorkflowNodeRun[];
    currentNodeIds: string[];
    error: string | null;
    startedAt: string;
    completedAt: string | null;
}

export interface WorkflowNodeRun {
    id: string;
    runId: string;
    nodeId: string;
    nodeType: WorkflowNodeType;
    status: WorkflowNodeRunStatus;
    input: Record<string, unknown>;
    output: Record<string, unknown> | null;
    sessionId: string | null;
    workTaskId: string | null;
    error: string | null;
    startedAt: string | null;
    completedAt: string | null;
}

export interface CreateWorkflowInput {
    agentId: string;
    name: string;
    description?: string;
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    defaultProjectId?: string;
    maxConcurrency?: number;
}

export interface UpdateWorkflowInput {
    name?: string;
    description?: string;
    nodes?: WorkflowNode[];
    edges?: WorkflowEdge[];
    status?: WorkflowStatus;
    defaultProjectId?: string | null;
    maxConcurrency?: number;
}

export type WorkflowStatus = 'active' | 'paused' | 'archived';
export type WorkflowNodeType = 'start' | 'end' | 'action' | 'condition' | 'parallel' | 'join' | 'approval' | 'delay';
export type WorkflowRunStatus = 'running' | 'completed' | 'failed' | 'suspended' | 'cancelled';
export type WorkflowNodeExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'waiting_approval' | 'waiting_delay' | 'waiting_join';

export interface WorkflowNodeConfig {
    actionType?: string;
    actionPayload?: Record<string, unknown>;
    conditionExpr?: string;
    delayMs?: number;
    approvalPrompt?: string;
    projectId?: string;
    joinCount?: number;
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
    label?: string;
    condition?: string;
}

export interface Workflow {
    id: string;
    agentId: string;
    name: string;
    description: string;
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    defaultProjectId: string | null;
    status: WorkflowStatus;
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
    context: Record<string, unknown>;
    error: string | null;
    startedAt: string;
    completedAt: string | null;
}

export interface WorkflowNodeExecution {
    id: string;
    runId: string;
    nodeId: string;
    nodeType: WorkflowNodeType;
    status: WorkflowNodeExecutionStatus;
    input: Record<string, unknown>;
    output: Record<string, unknown> | null;
    error: string | null;
    startedAt: string;
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
    defaultProjectId?: string | null;
    status?: WorkflowStatus;
    maxConcurrency?: number;
}

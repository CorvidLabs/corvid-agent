export type ScheduleStatus = 'active' | 'paused' | 'completed' | 'failed';

export type ScheduleActionType =
    | 'star_repo'
    | 'fork_repo'
    | 'review_prs'
    | 'work_task'
    | 'council_launch'
    | 'send_message'
    | 'github_suggest'
    | 'codebase_review'
    | 'dependency_audit'
    | 'improvement_loop'
    | 'memory_maintenance'
    | 'reputation_attestation'
    | 'custom';

export type ScheduleApprovalPolicy = 'auto' | 'owner_approve' | 'council_approve';

export interface ScheduleTriggerEvent {
    source: 'github_webhook' | 'github_poll';
    event: string;
    repo?: string;
}

export interface ScheduleAction {
    type: ScheduleActionType;
    repos?: string[];
    description?: string;
    projectId?: string;
    councilId?: string;
    toAgentId?: string;
    message?: string;
    maxPrs?: number;
    autoCreatePr?: boolean;
    prompt?: string;
    maxImprovementTasks?: number;
    focusArea?: string;
}

export interface AgentSchedule {
    id: string;
    agentId: string;
    name: string;
    description: string;
    cronExpression: string;
    intervalMs: number | null;
    actions: ScheduleAction[];
    approvalPolicy: ScheduleApprovalPolicy;
    status: ScheduleStatus;
    maxExecutions: number | null;
    executionCount: number;
    maxBudgetPerRun: number | null;
    triggerEvents: ScheduleTriggerEvent[] | null;
    lastRunAt: string | null;
    nextRunAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export type ScheduleExecutionStatus = 'running' | 'completed' | 'failed' | 'cancelled' | 'awaiting_approval' | 'approved' | 'denied';

export interface ScheduleExecution {
    id: string;
    scheduleId: string;
    agentId: string;
    status: ScheduleExecutionStatus;
    actionType: ScheduleActionType;
    actionInput: Record<string, unknown>;
    result: string | null;
    sessionId: string | null;
    workTaskId: string | null;
    costUsd: number;
    startedAt: string;
    completedAt: string | null;
}

export interface CreateScheduleInput {
    agentId: string;
    name: string;
    description?: string;
    cronExpression?: string;
    intervalMs?: number;
    actions: ScheduleAction[];
    approvalPolicy?: ScheduleApprovalPolicy;
    maxExecutions?: number;
    maxBudgetPerRun?: number;
    triggerEvents?: ScheduleTriggerEvent[];
}

export interface UpdateScheduleInput {
    name?: string;
    description?: string;
    cronExpression?: string;
    intervalMs?: number;
    actions?: ScheduleAction[];
    approvalPolicy?: ScheduleApprovalPolicy;
    status?: ScheduleStatus;
    maxExecutions?: number;
    maxBudgetPerRun?: number;
    triggerEvents?: ScheduleTriggerEvent[] | null;
}

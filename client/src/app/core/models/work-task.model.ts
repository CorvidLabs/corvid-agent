export type WorkTaskStatus = 'pending' | 'queued' | 'branching' | 'running' | 'validating' | 'completed' | 'failed' | 'paused' | 'escalation_needed';
export type WorkTaskSource = 'web' | 'algochat' | 'agent' | 'discord' | 'telegram';

export interface WorkTask {
    id: string;
    agentId: string;
    projectId: string;
    sessionId: string | null;
    source: WorkTaskSource;
    sourceId: string | null;
    requesterInfo: Record<string, unknown>;
    description: string;
    branchName: string | null;
    status: WorkTaskStatus;
    priority: number;
    prUrl: string | null;
    summary: string | null;
    error: string | null;
    originalBranch: string | null;
    worktreeDir: string | null;
    iterationCount: number;
    maxRetries: number;
    retryCount: number;
    retryBackoff: 'fixed' | 'linear' | 'exponential';
    lastRetryAt: string | null;
    preemptedBy: string | null;
    queuedAt: string | null;
    createdAt: string;
    completedAt: string | null;
}

export interface CreateWorkTaskInput {
    agentId: string;
    description: string;
    projectId?: string;
}

export type WorkTaskStatus = 'pending' | 'queued' | 'branching' | 'running' | 'validating' | 'completed' | 'failed' | 'paused';
export type WorkTaskSource = 'web' | 'algochat' | 'agent' | 'discord' | 'telegram';
export type RetryBackoff = 'fixed' | 'linear' | 'exponential';

/** P0 = critical (highest), P3 = low (lowest). Default is P2. */
export type WorkTaskPriority = 0 | 1 | 2 | 3;

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
    priority: WorkTaskPriority;
    prUrl: string | null;
    summary: string | null;
    error: string | null;
    originalBranch: string | null;
    worktreeDir: string | null;
    iterationCount: number;
    maxRetries: number;
    retryCount: number;
    retryBackoff: RetryBackoff;
    lastRetryAt: string | null;
    preemptedBy: string | null;
    createdAt: string;
    completedAt: string | null;
}

export interface WorkTaskDependency {
    id: number;
    taskId: string;
    dependsOnTaskId: string;
    createdAt: string;
}

export interface CreateWorkTaskInput {
    agentId: string;
    description: string;
    projectId?: string;
    source?: WorkTaskSource;
    sourceId?: string;
    requesterInfo?: Record<string, unknown>;
    priority?: WorkTaskPriority;
    maxRetries?: number;
    retryBackoff?: RetryBackoff;
    dependsOn?: string[];
}

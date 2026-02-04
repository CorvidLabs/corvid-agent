export type WorkTaskStatus = 'pending' | 'branching' | 'running' | 'validating' | 'completed' | 'failed';
export type WorkTaskSource = 'web' | 'algochat' | 'agent';

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
    prUrl: string | null;
    summary: string | null;
    error: string | null;
    originalBranch: string | null;
    worktreeDir: string | null;
    iterationCount: number;
    createdAt: string;
    completedAt: string | null;
}

export interface CreateWorkTaskInput {
    agentId: string;
    description: string;
    projectId?: string;
}

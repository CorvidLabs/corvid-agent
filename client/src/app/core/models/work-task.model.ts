export type WorkTaskStatus = 'pending' | 'branching' | 'running' | 'completed' | 'failed';
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
    createdAt: string;
    completedAt: string | null;
}

export interface CreateWorkTaskInput {
    agentId: string;
    description: string;
    projectId?: string;
}

export type SessionStatus = 'idle' | 'loading' | 'running' | 'thinking' | 'tool_use' | 'paused' | 'stopped' | 'error';
export type SessionSource = 'web' | 'algochat' | 'agent' | 'telegram' | 'discord' | 'slack';

export interface Session {
    id: string;
    projectId: string | null;
    agentId: string | null;
    name: string;
    status: SessionStatus;
    source: SessionSource;
    initialPrompt: string;
    pid: number | null;
    totalCostUsd: number;
    totalAlgoSpent: number;
    totalTurns: number;
    councilLaunchId: string | null;
    councilRole: 'member' | 'reviewer' | 'chairman' | 'discusser' | null;
    workDir: string | null;
    creditsConsumed: number;
    createdAt: string;
    updatedAt: string;
}

export interface SessionMessage {
    id: number;
    sessionId: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    costUsd: number;
    timestamp: string;
}

export interface CreateSessionInput {
    projectId?: string | null;
    agentId?: string;
    name?: string;
    initialPrompt?: string;
    source?: SessionSource;
    councilLaunchId?: string;
    councilRole?: 'member' | 'reviewer' | 'chairman' | 'discusser';
    workDir?: string;
}

export interface UpdateSessionInput {
    name?: string;
    status?: SessionStatus;
}

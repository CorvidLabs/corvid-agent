export type SessionStatus = 'idle' | 'running' | 'paused' | 'stopped' | 'error';
export type SessionSource = 'web' | 'algochat';

export interface Session {
    id: string;
    projectId: string;
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
    projectId: string;
    agentId?: string;
    name?: string;
    initialPrompt?: string;
    source?: SessionSource;
}

export interface AlgoChatStatus {
    enabled: boolean;
    address: string | null;
    network: string;
    syncInterval: number;
    activeConversations: number;
}

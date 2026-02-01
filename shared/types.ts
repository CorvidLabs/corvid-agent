export interface Project {
    id: string;
    name: string;
    description: string;
    workingDir: string;
    claudeMd: string;
    envVars: Record<string, string>;
    createdAt: string;
    updatedAt: string;
}

export interface Agent {
    id: string;
    name: string;
    description: string;
    systemPrompt: string;
    appendPrompt: string;
    model: string;
    allowedTools: string;
    disallowedTools: string;
    permissionMode: 'default' | 'plan' | 'auto-edit' | 'full-auto';
    maxBudgetUsd: number | null;
    algochatEnabled: boolean;
    algochatAuto: boolean;
    customFlags: Record<string, string>;
    createdAt: string;
    updatedAt: string;
}

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
    totalTurns: number;
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

export interface AlgoChatConversation {
    id: string;
    participantAddr: string;
    agentId: string | null;
    sessionId: string | null;
    lastRound: number;
    createdAt: string;
}

export type AlgoChatNetwork = 'localnet' | 'testnet' | 'mainnet';

export interface AlgoChatStatus {
    enabled: boolean;
    address: string | null;
    network: AlgoChatNetwork;
    syncInterval: number;
    activeConversations: number;
}

export interface CreateProjectInput {
    name: string;
    description?: string;
    workingDir: string;
    claudeMd?: string;
    envVars?: Record<string, string>;
}

export interface UpdateProjectInput {
    name?: string;
    description?: string;
    workingDir?: string;
    claudeMd?: string;
    envVars?: Record<string, string>;
}

export interface CreateAgentInput {
    name: string;
    description?: string;
    systemPrompt?: string;
    appendPrompt?: string;
    model?: string;
    allowedTools?: string;
    disallowedTools?: string;
    permissionMode?: Agent['permissionMode'];
    maxBudgetUsd?: number | null;
    algochatEnabled?: boolean;
    algochatAuto?: boolean;
    customFlags?: Record<string, string>;
}

export interface UpdateAgentInput extends Partial<CreateAgentInput> {}

export interface CreateSessionInput {
    projectId: string;
    agentId?: string;
    name?: string;
    initialPrompt?: string;
    source?: SessionSource;
}

export interface UpdateSessionInput {
    name?: string;
    status?: SessionStatus;
}

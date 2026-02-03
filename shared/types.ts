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
    defaultProjectId: string | null;
    walletAddress: string | null;
    walletFundedAlgo: number;
    createdAt: string;
    updatedAt: string;
}

export type SessionStatus = 'idle' | 'running' | 'paused' | 'stopped' | 'error';
export type SessionSource = 'web' | 'algochat' | 'agent';

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
    defaultProjectId?: string | null;
}

export interface UpdateAgentInput extends Partial<CreateAgentInput> {}

export interface CreateSessionInput {
    projectId: string;
    agentId?: string;
    name?: string;
    initialPrompt?: string;
    source?: SessionSource;
    councilLaunchId?: string;
    councilRole?: 'member' | 'reviewer' | 'chairman' | 'discusser';
}

export interface UpdateSessionInput {
    name?: string;
    status?: SessionStatus;
}

export type AgentMessageStatus = 'pending' | 'sent' | 'processing' | 'completed' | 'failed';

export interface AgentMessage {
    id: string;
    fromAgentId: string;
    toAgentId: string;
    content: string;
    paymentMicro: number;
    txid: string | null;
    status: AgentMessageStatus;
    response: string | null;
    responseTxid: string | null;
    sessionId: string | null;
    threadId: string | null;
    createdAt: string;
    completedAt: string | null;
}

// MARK: - Councils

export interface Council {
    id: string;
    name: string;
    description: string;
    chairmanAgentId: string | null;
    agentIds: string[];
    discussionRounds: number;
    createdAt: string;
    updatedAt: string;
}

export interface CreateCouncilInput {
    name: string;
    description?: string;
    agentIds: string[];
    chairmanAgentId?: string;
    discussionRounds?: number;
}

export interface UpdateCouncilInput {
    name?: string;
    description?: string;
    agentIds?: string[];
    chairmanAgentId?: string | null;
    discussionRounds?: number;
}

export type CouncilStage = 'responding' | 'discussing' | 'reviewing' | 'synthesizing' | 'complete';

export interface CouncilLaunch {
    id: string;
    councilId: string;
    projectId: string;
    prompt: string;
    stage: CouncilStage;
    synthesis: string | null;
    sessionIds: string[];
    currentDiscussionRound: number;
    totalDiscussionRounds: number;
    createdAt: string;
}

export interface LaunchCouncilInput {
    projectId: string;
    prompt: string;
}

export type CouncilLogLevel = 'info' | 'warn' | 'error' | 'stage';

export interface CouncilLaunchLog {
    id: number;
    launchId: string;
    level: CouncilLogLevel;
    message: string;
    detail: string | null;
    createdAt: string;
}

export interface CouncilDiscussionMessage {
    id: number;
    launchId: string;
    agentId: string;
    agentName: string;
    round: number;
    content: string;
    txid: string | null;
    sessionId: string | null;
    createdAt: string;
}

// MARK: - Agent Memories

export interface AgentMemory {
    id: string;
    agentId: string;
    key: string;
    content: string;
    txid: string | null;
    createdAt: string;
    updatedAt: string;
}

// MARK: - Work Tasks

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
    source?: WorkTaskSource;
    sourceId?: string;
    requesterInfo?: Record<string, unknown>;
}

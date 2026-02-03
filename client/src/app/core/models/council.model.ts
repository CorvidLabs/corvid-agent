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

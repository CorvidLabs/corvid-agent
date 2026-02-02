export interface Council {
    id: string;
    name: string;
    description: string;
    chairmanAgentId: string | null;
    agentIds: string[];
    createdAt: string;
    updatedAt: string;
}

export interface CreateCouncilInput {
    name: string;
    description?: string;
    agentIds: string[];
    chairmanAgentId?: string;
}

export interface UpdateCouncilInput {
    name?: string;
    description?: string;
    agentIds?: string[];
    chairmanAgentId?: string | null;
}

export type CouncilStage = 'responding' | 'reviewing' | 'synthesizing' | 'complete';

export interface CouncilLaunch {
    id: string;
    councilId: string;
    projectId: string;
    prompt: string;
    stage: CouncilStage;
    synthesis: string | null;
    sessionIds: string[];
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

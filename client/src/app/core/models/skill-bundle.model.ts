export interface SkillBundle {
    id: string;
    name: string;
    description: string;
    tools: string[];
    promptAdditions: string;
    preset: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface CreateSkillBundleInput {
    name: string;
    description?: string;
    tools?: string[];
    promptAdditions?: string;
}

export interface UpdateSkillBundleInput {
    name?: string;
    description?: string;
    tools?: string[];
    promptAdditions?: string;
}

export interface AgentSkillAssignment {
    agentId: string;
    bundleId: string;
    sortOrder: number;
}

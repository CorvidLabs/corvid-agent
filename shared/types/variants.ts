export interface AgentVariant {
    id: string;
    name: string;
    description: string;
    skillBundleIds: string[];
    personaIds: string[];
    preset: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface CreateVariantInput {
    name: string;
    description?: string;
    skillBundleIds?: string[];
    personaIds?: string[];
    preset?: boolean;
}

export interface UpdateVariantInput {
    name?: string;
    description?: string;
    skillBundleIds?: string[];
    personaIds?: string[];
    preset?: boolean;
}

export interface AgentVariantAssignment {
    agentId: string;
    variantId: string;
    createdAt: string;
}

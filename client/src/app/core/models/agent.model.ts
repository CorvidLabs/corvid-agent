export type PermissionMode = 'default' | 'plan' | 'auto-edit' | 'full-auto';

export interface Agent {
    id: string;
    name: string;
    description: string;
    systemPrompt: string;
    appendPrompt: string;
    model: string;
    provider?: string;
    allowedTools: string;
    disallowedTools: string;
    permissionMode: PermissionMode;
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

export interface CreateAgentInput {
    name: string;
    description?: string;
    systemPrompt?: string;
    appendPrompt?: string;
    model?: string;
    provider?: string;
    allowedTools?: string;
    disallowedTools?: string;
    permissionMode?: PermissionMode;
    maxBudgetUsd?: number | null;
    algochatEnabled?: boolean;
    algochatAuto?: boolean;
    customFlags?: Record<string, string>;
    defaultProjectId?: string | null;
}

export type UpdateAgentInput = Partial<CreateAgentInput>;

export interface ProviderInfo {
    type: string;
    name: string;
    executionMode: string;
    models: string[];
    defaultModel: string;
    supportsTools: boolean;
    supportsStreaming: boolean;
}

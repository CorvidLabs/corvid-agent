import type { VoicePreset } from './voice';

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
    permissionMode: 'default' | 'plan' | 'auto-edit' | 'full-auto';
    maxBudgetUsd: number | null;
    algochatEnabled: boolean;
    algochatAuto: boolean;
    customFlags: Record<string, string>;
    defaultProjectId: string | null;
    mcpToolPermissions: string[] | null;
    voiceEnabled: boolean;
    voicePreset: VoicePreset;
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
    permissionMode?: Agent['permissionMode'];
    maxBudgetUsd?: number | null;
    algochatEnabled?: boolean;
    algochatAuto?: boolean;
    customFlags?: Record<string, string>;
    defaultProjectId?: string | null;
    mcpToolPermissions?: string[] | null;
    voiceEnabled?: boolean;
    voicePreset?: VoicePreset;
}

export interface UpdateAgentInput extends Partial<CreateAgentInput> {}

import type { VoicePreset } from './voice';

export type ConversationMode = 'private' | 'allowlist' | 'public';

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
    displayColor: string | null;
    displayIcon: string | null;
    avatarUrl: string | null;
    conversationMode: ConversationMode;
    conversationRateLimitWindow: number;
    conversationRateLimitMax: number;
    disabled: boolean;
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
    displayColor?: string | null;
    displayIcon?: string | null;
    avatarUrl?: string | null;
    conversationMode?: ConversationMode;
    conversationRateLimitWindow?: number;
    conversationRateLimitMax?: number;
    disabled?: boolean;
}

export interface UpdateAgentInput extends Partial<CreateAgentInput> {}

// Conversation access control types
export type DenyReason = 'private' | 'not_on_allowlist' | 'blocked' | 'rate_limited' | 'agent_disabled';

export interface ConversationAccessResult {
    allowed: boolean;
    reason: DenyReason | null;
}

export interface AgentAllowlistEntry {
    agentId: string;
    address: string;
    label: string;
    createdAt: string;
}

export interface AgentBlocklistEntry {
    agentId: string;
    address: string;
    reason: string;
    createdAt: string;
}

export interface RateLimitStatus {
    allowed: boolean;
    remaining: number;
    resetsAt: string;
}

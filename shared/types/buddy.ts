/** Buddy mode types — paired agent collaboration. */

export type BuddyRole = 'reviewer' | 'collaborator' | 'validator';
export type BuddySessionStatus = 'active' | 'completed' | 'failed';
export type BuddySource = 'web' | 'discord' | 'algochat' | 'cli' | 'agent';

export interface BuddyPairing {
    id: string;
    agentId: string;
    buddyAgentId: string;
    enabled: boolean;
    maxRounds: number;
    buddyRole: BuddyRole;
    createdAt: string;
    updatedAt: string;
}

export interface BuddySession {
    id: string;
    workTaskId: string | null;
    sessionId: string | null;
    leadAgentId: string;
    buddyAgentId: string;
    source: BuddySource;
    sourceId: string | null;
    prompt: string;
    status: BuddySessionStatus;
    currentRound: number;
    maxRounds: number;
    createdAt: string;
    completedAt: string | null;
}

export interface BuddyMessage {
    id: string;
    buddySessionId: string;
    agentId: string;
    round: number;
    role: 'lead' | 'buddy';
    content: string;
    createdAt: string;
}

export interface CreateBuddySessionInput {
    leadAgentId: string;
    buddyAgentId: string;
    prompt: string;
    source: BuddySource;
    sourceId?: string;
    workTaskId?: string;
    sessionId?: string;
    maxRounds?: number;
}

/** Default read-only tools for buddy review sessions. */
export const BUDDY_DEFAULT_TOOLS = ['Read', 'Glob', 'Grep'] as const;

export interface BuddyConfig {
    buddyAgentId: string;
    maxRounds?: number;
    role?: BuddyRole;
    /** Tools the buddy can use. Defaults to BUDDY_DEFAULT_TOOLS (read-only). */
    toolAllowList?: string[];
}

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

/** Event emitted after each agent turn in a buddy session. */
export interface BuddyRoundEvent {
    buddySessionId: string;
    agentId: string;
    agentName: string;
    role: 'lead' | 'buddy';
    round: number;
    maxRounds: number;
    content: string;
    /** True only when the buddy approves (LGTM) on their final turn. */
    approved: boolean;
}

/** Callback invoked after each agent turn — used for Discord visibility. */
export type BuddyRoundCallback = (event: BuddyRoundEvent) => Promise<void>;

export interface CreateBuddySessionInput {
    leadAgentId: string;
    buddyAgentId: string;
    prompt: string;
    source: BuddySource;
    sourceId?: string;
    workTaskId?: string;
    sessionId?: string;
    maxRounds?: number;
    /** Optional callback for posting round outputs to Discord or other channels. */
    onRoundComplete?: BuddyRoundCallback;
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

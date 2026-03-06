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

// ─── Governance types ─────────────────────────────────────────────────────────

export type GovernanceVoteType = 'standard' | 'governance';

export type GovernanceVoteStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'awaiting_human';

export interface CouncilGovernanceVote {
    id: number;
    launchId: string;
    /** The governance tier this vote targets (0, 1, or 2). */
    governanceTier: number;
    /** Paths affected by the proposed change. */
    affectedPaths: string[];
    /** Status of the governance vote. */
    status: GovernanceVoteStatus;
    /** Individual votes from council members. */
    votes: CouncilMemberVote[];
    /** Whether a human has approved (required for Layer 1). */
    humanApproved: boolean;
    humanApprovedBy: string | null;
    humanApprovedAt: string | null;
    createdAt: string;
    resolvedAt: string | null;
}

export interface CouncilMemberVote {
    id: number;
    governanceVoteId: number;
    agentId: string;
    vote: 'approve' | 'reject' | 'abstain';
    reason: string;
    createdAt: string;
}

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
    chatSessionId: string | null;
    /** Whether this launch is a governance vote. */
    voteType: GovernanceVoteType;
    /** Governance tier of the vote (0, 1, or 2). Null for standard launches. */
    governanceTier: number | null;
    createdAt: string;
}

export interface LaunchCouncilInput {
    projectId: string;
    prompt: string;
    /** Whether this is a governance vote (with tier-aware quorum rules). */
    voteType?: GovernanceVoteType;
    /** Paths affected by the proposed change (for governance votes). */
    affectedPaths?: string[];
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

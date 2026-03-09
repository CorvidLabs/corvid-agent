export type ProposalStatus = 'draft' | 'open' | 'voting' | 'decided' | 'enacted';
export type ProposalDecision = 'approved' | 'rejected' | null;
export type GovernanceVoteOption = 'approve' | 'reject' | 'abstain';
export type GovernanceVoteStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'awaiting_human';

export interface GovernanceProposal {
    id: string;
    councilId: string;
    title: string;
    description: string;
    authorId: string;
    status: ProposalStatus;
    decision: ProposalDecision;
    governanceTier: number;
    affectedPaths: string[];
    quorumThreshold: number | null;
    minimumVoters: number | null;
    launchId: string | null;
    createdAt: string;
    updatedAt: string;
    decidedAt: string | null;
    enactedAt: string | null;
}

export interface CreateProposalInput {
    councilId: string;
    title: string;
    description?: string;
    authorId: string;
    governanceTier?: number;
    affectedPaths?: string[];
    quorumThreshold?: number | null;
    minimumVoters?: number | null;
}

export interface UpdateProposalInput {
    title?: string;
    description?: string;
    affectedPaths?: string[];
    quorumThreshold?: number | null;
    minimumVoters?: number | null;
}

export interface WeightedVoteRecord {
    agentId: string;
    vote: GovernanceVoteOption;
    reason: string;
    votedAt: string;
    weight: number;
}

export interface WeightedGovernanceVoteCheck {
    passed: boolean;
    approvalRatio: number;
    weightedApprovalRatio: number;
    requiredThreshold: number;
    awaitingHumanApproval: boolean;
    reason: string;
    voteWeights: { agentId: string; vote: string; weight: number }[];
}

export interface GovernanceVoteStatusResponse {
    governanceVoteId: number;
    launchId: string;
    governanceTier: number;
    status: GovernanceVoteStatus;
    affectedPaths: string[];
    humanApproved: boolean;
    humanApprovedBy: string | null;
    votes: WeightedVoteRecord[];
    evaluation: WeightedGovernanceVoteCheck;
    totalMembers: number;
}

export interface CastVoteResponse {
    ok: true;
    vote: GovernanceVoteOption;
    agentId: string;
    evaluation: WeightedGovernanceVoteCheck;
}

export interface GovernanceTierInfo {
    tier: number;
    label: string;
    description: string;
    quorumThreshold: number;
    requiresHumanApproval: boolean;
    allowsAutomation: boolean;
}

export const GOVERNANCE_TIERS: Record<number, GovernanceTierInfo> = {
    0: {
        tier: 0,
        label: 'Constitutional',
        description: 'Core system integrity — human-only commits',
        quorumThreshold: 1.0,
        requiresHumanApproval: true,
        allowsAutomation: false,
    },
    1: {
        tier: 1,
        label: 'Structural',
        description: 'System configuration — supermajority + human approval',
        quorumThreshold: 0.75,
        requiresHumanApproval: true,
        allowsAutomation: false,
    },
    2: {
        tier: 2,
        label: 'Operational',
        description: 'Day-to-day operations — council majority sufficient',
        quorumThreshold: 0.5,
        requiresHumanApproval: false,
        allowsAutomation: true,
    },
};

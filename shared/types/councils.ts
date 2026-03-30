export type CouncilOnChainMode = 'off' | 'attestation' | 'full';

export type CouncilQuorumType = 'majority' | 'supermajority' | 'unanimous';

export interface Council {
  id: string;
  name: string;
  description: string;
  chairmanAgentId: string | null;
  agentIds: string[];
  discussionRounds: number;
  onChainMode: CouncilOnChainMode;
  /** Quorum type: majority (50%), supermajority (75%), unanimous (100%). */
  quorumType: CouncilQuorumType;
  /** Custom quorum threshold (0.0–1.0). Overrides governance tier default when set. */
  quorumThreshold: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCouncilInput {
  name: string;
  description?: string;
  agentIds: string[];
  chairmanAgentId?: string;
  discussionRounds?: number;
  onChainMode?: CouncilOnChainMode;
  quorumType?: CouncilQuorumType;
  quorumThreshold?: number | null;
}

export interface UpdateCouncilInput {
  name?: string;
  description?: string;
  agentIds?: string[];
  chairmanAgentId?: string | null;
  discussionRounds?: number;
  onChainMode?: CouncilOnChainMode;
  quorumType?: CouncilQuorumType;
  quorumThreshold?: number | null;
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
  /** On-chain txid for synthesis attestation (set when onChainMode is 'attestation'). */
  synthesisTxid: string | null;
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

// ─── Governance Proposals ────────────────────────────────────────────────────

/**
 * Proposal lifecycle:
 *   draft → open → voting → decided → enacted
 *
 * - draft: author is still editing, not yet visible to voters
 * - open: visible for discussion but voting hasn't started
 * - voting: votes are being collected
 * - decided: vote concluded (approved/rejected), awaiting enactment
 * - enacted: approved proposal has been applied
 */
export type ProposalStatus = 'draft' | 'open' | 'voting' | 'decided' | 'enacted';

export type ProposalDecision = 'approved' | 'rejected' | null;

export interface GovernanceProposal {
  id: string;
  councilId: string;
  title: string;
  description: string;
  /** Who created the proposal (agent or human identifier). */
  authorId: string;
  /** Current lifecycle status. */
  status: ProposalStatus;
  /** Decision after voting concludes (null while voting or before). */
  decision: ProposalDecision;
  /** Governance tier this proposal targets (0, 1, or 2). */
  governanceTier: number;
  /** Paths affected by the proposed change. */
  affectedPaths: string[];
  /** Minimum percentage of weighted votes required to pass (0.0–1.0). Overrides council/tier default. */
  quorumThreshold: number | null;
  /** Minimum number of voters required for a valid vote (regardless of weight). */
  minimumVoters: number | null;
  /** Optional council launch ID if a council deliberation was started for this proposal. */
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

/** Structured error emitted when a council agent fails mid-session. */
export interface CouncilAgentError {
  launchId: string;
  agentId: string;
  agentName: string;
  errorType: 'spawn_error' | 'timeout' | 'crash' | 'unknown';
  severity: 'info' | 'warning' | 'error' | 'fatal';
  message: string;
  stage: string;
  sessionId?: string;
  round?: number;
}

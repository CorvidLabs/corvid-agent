/**
 * Council Governance — tiered permission architecture for council jurisdiction.
 *
 * Three-layer model:
 *   Layer 0 (Constitutional): NO council jurisdiction, human-only commits
 *   Layer 1 (Structural): supermajority + human approval required
 *   Layer 2 (Operational): council majority sufficient
 *
 * Prevents recursive governance vulnerability where councils vote on
 * changes to the system that runs the council itself.
 *
 * @see https://github.com/CorvidLabs/corvid-agent/issues/590
 */

import { createLogger } from '../lib/logger';

const log = createLogger('Governance');

// ─── Governance tiers ─────────────────────────────────────────────────────────

export type GovernanceTier = 0 | 1 | 2;

export interface GovernanceTierInfo {
    tier: GovernanceTier;
    label: string;
    description: string;
    /** Minimum fraction of votes required (0.0–1.0). */
    quorumThreshold: number;
    /** Whether human approval is required after the vote passes. */
    requiresHumanApproval: boolean;
    /** Whether automated workflows (schedulers, work tasks) may modify paths at this tier. */
    allowsAutomation: boolean;
}

export const GOVERNANCE_TIERS: Record<GovernanceTier, GovernanceTierInfo> = {
    0: {
        tier: 0,
        label: 'Constitutional',
        description: 'Core system integrity — NO council jurisdiction, human-only commits',
        quorumThreshold: 1.0,
        requiresHumanApproval: true,
        allowsAutomation: false,
    },
    1: {
        tier: 1,
        label: 'Structural',
        description: 'System configuration — supermajority + human approval required',
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

// ─── Protected path → tier mapping ────────────────────────────────────────────

/**
 * Layer 0 paths — constitutional, NO council jurisdiction.
 * Matched by basename (exact) or substring.
 */
export const LAYER_0_BASENAMES = new Set([
    'spending.ts',        // Spending limit enforcement
    'sdk-process.ts',     // Session execution engine
    'manager.ts',         // Process manager
    'sdk-tools.ts',       // MCP tool permission filtering
    'tool-handlers.ts',   // Tool handler implementations
    'schema.ts',          // Database schema
    'broker.ts',          // Permission broker
    'governance.ts',      // This file (self-referential protection)
]);

export const LAYER_0_SUBSTRINGS = [
    'server/councils/',           // Council orchestration code
    'server/permissions/',        // Permission broker system
    'server/algochat/spending',   // Spending limit enforcement
    'server/process/protected-paths', // The allowlist itself
    'server/middleware/guards',   // Authentication & authorization guards
    '.env',                       // Environment secrets
    'corvid-agent.db',            // Database file
    'wallet-keystore.json',       // Wallet keys
];

/**
 * Layer 1 paths — structural, supermajority + human approval.
 * Matched by basename or substring.
 */
export const LAYER_1_BASENAMES = new Set([
    'package.json',       // Dependency changes
    'CLAUDE.md',          // Agent system instructions
    'tsconfig.json',      // TypeScript config
]);

export const LAYER_1_SUBSTRINGS = [
    'server/db/migrations/',      // Database schema changes
    'server/mcp/',                // MCP tool definitions
    'server/providers/',          // Provider configurations (rate limits, budgets)
    'server/lib/validation',      // Input validation schemas
];

// ─── Path classification ──────────────────────────────────────────────────────

/**
 * Classify a file path into its governance tier.
 * Returns the most restrictive (lowest number) tier that matches.
 */
export function classifyPath(filePath: string): GovernanceTier {
    const normalized = filePath.replace(/\\/g, '/');
    const basename = normalized.split('/').pop() ?? '';

    // Layer 0 checks
    if (LAYER_0_BASENAMES.has(basename)) return 0;
    if (LAYER_0_SUBSTRINGS.some((sub) => normalized.includes(sub))) return 0;

    // Layer 1 checks
    if (LAYER_1_BASENAMES.has(basename)) return 1;
    if (LAYER_1_SUBSTRINGS.some((sub) => normalized.includes(sub))) return 1;

    // Everything else is Layer 2 (operational)
    return 2;
}

/**
 * Classify multiple paths and return the most restrictive tier.
 */
export function classifyPaths(filePaths: string[]): GovernanceTier {
    if (filePaths.length === 0) return 2;
    let mostRestrictive: GovernanceTier = 2;
    for (const p of filePaths) {
        const tier = classifyPath(p);
        if (tier < mostRestrictive) mostRestrictive = tier;
        if (tier === 0) return 0; // Can't get more restrictive
    }
    return mostRestrictive;
}

// ─── Impact assessment ────────────────────────────────────────────────────────

export interface GovernanceImpact {
    /** The most restrictive tier affected. */
    tier: GovernanceTier;
    /** Human-readable tier label. */
    tierLabel: string;
    /** Paths that triggered the tier classification, grouped by tier. */
    affectedPaths: { path: string; tier: GovernanceTier }[];
    /** Whether this action is blocked from automation. */
    blockedFromAutomation: boolean;
    /** Whether human approval is required. */
    requiresHumanApproval: boolean;
    /** Quorum threshold for council vote. */
    quorumThreshold: number;
}

/**
 * Assess the governance impact of a set of file changes.
 * Used by work task validation and council vote classification.
 */
export function assessImpact(filePaths: string[]): GovernanceImpact {
    const affectedPaths = filePaths.map((path) => ({
        path,
        tier: classifyPath(path),
    }));

    const tier = classifyPaths(filePaths);
    const tierInfo = GOVERNANCE_TIERS[tier];

    return {
        tier,
        tierLabel: tierInfo.label,
        affectedPaths,
        blockedFromAutomation: !tierInfo.allowsAutomation,
        requiresHumanApproval: tierInfo.requiresHumanApproval,
        quorumThreshold: tierInfo.quorumThreshold,
    };
}

// ─── Council vote validation ──────────────────────────────────────────────────

export type GovernanceVoteStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'awaiting_human';

export interface GovernanceVoteRecord {
    agentId: string;
    vote: 'approve' | 'reject' | 'abstain';
    reason: string;
    votedAt: string;
}

export interface GovernanceVoteCheck {
    /** Whether the vote passes at the required tier. */
    passed: boolean;
    /** Current approval ratio (0.0–1.0). */
    approvalRatio: number;
    /** Required threshold for this tier. */
    requiredThreshold: number;
    /** Whether human approval is still needed after vote passes. */
    awaitingHumanApproval: boolean;
    /** Reason for pass/fail. */
    reason: string;
}

/**
 * Evaluate whether a governance vote has met the quorum requirements for its tier.
 */
export function evaluateVote(
    tier: GovernanceTier,
    totalMembers: number,
    votes: GovernanceVoteRecord[],
    humanApproved: boolean = false,
): GovernanceVoteCheck {
    const tierInfo = GOVERNANCE_TIERS[tier];

    // Layer 0 — NEVER passes via council vote
    if (tier === 0) {
        return {
            passed: false,
            approvalRatio: 0,
            requiredThreshold: 1.0,
            awaitingHumanApproval: false,
            reason: 'Layer 0 (Constitutional) changes cannot be approved by council — human-only commits required',
        };
    }

    if (totalMembers === 0) {
        return {
            passed: false,
            approvalRatio: 0,
            requiredThreshold: tierInfo.quorumThreshold,
            awaitingHumanApproval: false,
            reason: 'No council members to vote',
        };
    }

    const approveCount = votes.filter((v) => v.vote === 'approve').length;
    const rejectCount = votes.filter((v) => v.vote === 'reject').length;
    const totalVotes = approveCount + rejectCount; // Abstentions don't count

    if (totalVotes === 0) {
        return {
            passed: false,
            approvalRatio: 0,
            requiredThreshold: tierInfo.quorumThreshold,
            awaitingHumanApproval: false,
            reason: 'No votes cast yet',
        };
    }

    const approvalRatio = approveCount / totalMembers;
    const meetsThreshold = approvalRatio >= tierInfo.quorumThreshold;

    if (!meetsThreshold) {
        return {
            passed: false,
            approvalRatio,
            requiredThreshold: tierInfo.quorumThreshold,
            awaitingHumanApproval: false,
            reason: `Approval ratio ${(approvalRatio * 100).toFixed(0)}% below ${(tierInfo.quorumThreshold * 100).toFixed(0)}% threshold`,
        };
    }

    // Threshold met — check if human approval is needed
    if (tierInfo.requiresHumanApproval && !humanApproved) {
        return {
            passed: false,
            approvalRatio,
            requiredThreshold: tierInfo.quorumThreshold,
            awaitingHumanApproval: true,
            reason: `Vote passed (${(approvalRatio * 100).toFixed(0)}%) but awaiting human approval`,
        };
    }

    return {
        passed: true,
        approvalRatio,
        requiredThreshold: tierInfo.quorumThreshold,
        awaitingHumanApproval: false,
        reason: `Approved: ${(approvalRatio * 100).toFixed(0)}% approval meets ${tierInfo.label} tier threshold`,
    };
}

// ─── Weighted vote evaluation ─────────────────────────────────────────────────

/** A vote record with an associated reputation weight (0–100). */
export interface WeightedVoteRecord extends GovernanceVoteRecord {
    /** Reputation score of the voting agent (0–100). Default 50 if unavailable. */
    weight: number;
}

export interface WeightedGovernanceVoteCheck extends GovernanceVoteCheck {
    /** Weighted approval ratio (sum of approve weights / total weights). */
    weightedApprovalRatio: number;
    /** Individual vote weights used in the calculation. */
    voteWeights: { agentId: string; vote: string; weight: number }[];
}

/**
 * Evaluate a governance vote using reputation-weighted voting.
 *
 * Each agent's vote is weighted by their reputation score. An agent with
 * score 90 has more influence than one with score 30. Abstentions are
 * excluded from the total weight pool (same as unweighted evaluation).
 *
 * Falls back to unweighted evaluation if no weights are provided.
 */
export function evaluateWeightedVote(
    tier: GovernanceTier,
    totalMembers: number,
    votes: WeightedVoteRecord[],
    humanApproved: boolean = false,
    customThreshold?: number | null,
): WeightedGovernanceVoteCheck {
    const tierInfo = GOVERNANCE_TIERS[tier];
    const threshold = customThreshold ?? tierInfo.quorumThreshold;

    // Layer 0 — NEVER passes via council vote
    if (tier === 0) {
        return {
            passed: false,
            approvalRatio: 0,
            weightedApprovalRatio: 0,
            requiredThreshold: 1.0,
            awaitingHumanApproval: false,
            reason: 'Layer 0 (Constitutional) changes cannot be approved by council — human-only commits required',
            voteWeights: votes.map((v) => ({ agentId: v.agentId, vote: v.vote, weight: v.weight })),
        };
    }

    if (totalMembers === 0) {
        return {
            passed: false,
            approvalRatio: 0,
            weightedApprovalRatio: 0,
            requiredThreshold: threshold,
            awaitingHumanApproval: false,
            reason: 'No council members to vote',
            voteWeights: [],
        };
    }

    // Filter out abstentions for weight calculation
    const activeVotes = votes.filter((v) => v.vote !== 'abstain');
    const voteWeights = votes.map((v) => ({ agentId: v.agentId, vote: v.vote, weight: v.weight }));

    if (activeVotes.length === 0) {
        return {
            passed: false,
            approvalRatio: 0,
            weightedApprovalRatio: 0,
            requiredThreshold: threshold,
            awaitingHumanApproval: false,
            reason: 'No votes cast yet',
            voteWeights,
        };
    }

    // Weighted calculation: sum weights of approvals / sum weights of all members
    // (not just active voters — abstaining reduces approval ratio, same as unweighted)
    const totalWeight = votes.reduce((sum, v) => sum + v.weight, 0);
    const approveWeight = votes.filter((v) => v.vote === 'approve').reduce((sum, v) => sum + v.weight, 0);

    const weightedApprovalRatio = totalWeight > 0 ? approveWeight / totalWeight : 0;

    // Also compute unweighted ratio for backward compatibility
    const approveCount = votes.filter((v) => v.vote === 'approve').length;
    const approvalRatio = approveCount / totalMembers;

    const meetsThreshold = weightedApprovalRatio >= threshold;

    if (!meetsThreshold) {
        return {
            passed: false,
            approvalRatio,
            weightedApprovalRatio,
            requiredThreshold: threshold,
            awaitingHumanApproval: false,
            reason: `Weighted approval ${(weightedApprovalRatio * 100).toFixed(0)}% below ${(threshold * 100).toFixed(0)}% threshold`,
            voteWeights,
        };
    }

    // Threshold met — check if human approval is needed
    if (tierInfo.requiresHumanApproval && !humanApproved) {
        return {
            passed: false,
            approvalRatio,
            weightedApprovalRatio,
            requiredThreshold: threshold,
            awaitingHumanApproval: true,
            reason: `Weighted vote passed (${(weightedApprovalRatio * 100).toFixed(0)}%) but awaiting human approval`,
            voteWeights,
        };
    }

    log.info('Governance vote passed (weighted)', {
        tier,
        weightedApprovalRatio: `${(weightedApprovalRatio * 100).toFixed(0)}%`,
        threshold: `${(threshold * 100).toFixed(0)}%`,
        approveWeight,
        totalWeight,
    });

    return {
        passed: true,
        approvalRatio,
        weightedApprovalRatio,
        requiredThreshold: threshold,
        awaitingHumanApproval: false,
        reason: `Approved: ${(weightedApprovalRatio * 100).toFixed(0)}% weighted approval meets ${tierInfo.label} tier threshold`,
        voteWeights,
    };
}

// ─── Automation enforcement ───────────────────────────────────────────────────

export interface AutomationCheckResult {
    allowed: boolean;
    tier: GovernanceTier;
    reason: string;
    blockedPaths: string[];
}

// ─── Proposal quorum evaluation ───────────────────────────────────────────────

export interface ProposalQuorumConfig {
    /** Fraction of weighted approvals required (0.0–1.0). Falls back to governance tier default. */
    threshold: number;
    /** Minimum number of voters (non-abstaining) for a valid quorum. */
    minVoters: number;
}

export interface ProposalQuorumCheck {
    /** Whether the proposal vote passes. */
    passed: boolean;
    /** Weighted approval ratio (sum of approve weights / total weights). */
    weightedApprovalRatio: number;
    /** Required threshold. */
    requiredThreshold: number;
    /** Number of non-abstaining voters. */
    voterCount: number;
    /** Minimum voters required. */
    requiredMinVoters: number;
    /** Whether human approval is still needed. */
    awaitingHumanApproval: boolean;
    /** Reason for pass/fail. */
    reason: string;
}

/**
 * Evaluate whether a proposal vote meets quorum requirements.
 *
 * Combines weighted voting (reputation-based), configurable threshold,
 * and minimum voter requirements.
 */
export function evaluateProposalQuorum(
    tier: GovernanceTier,
    votes: { vote: 'approve' | 'reject' | 'abstain'; weight: number }[],
    config: ProposalQuorumConfig,
    humanApproved: boolean = false,
): ProposalQuorumCheck {
    const tierInfo = GOVERNANCE_TIERS[tier];

    // Layer 0 — NEVER passes via council vote
    if (tier === 0) {
        return {
            passed: false,
            weightedApprovalRatio: 0,
            requiredThreshold: 1.0,
            voterCount: 0,
            requiredMinVoters: config.minVoters,
            awaitingHumanApproval: false,
            reason: 'Layer 0 (Constitutional) changes cannot be approved by proposal — human-only commits required',
        };
    }

    const activeVotes = votes.filter((v) => v.vote !== 'abstain');
    const voterCount = activeVotes.length;

    // Check minimum voters
    if (voterCount < config.minVoters) {
        return {
            passed: false,
            weightedApprovalRatio: 0,
            requiredThreshold: config.threshold,
            voterCount,
            requiredMinVoters: config.minVoters,
            awaitingHumanApproval: false,
            reason: `Insufficient voters: ${voterCount} of ${config.minVoters} required`,
        };
    }

    if (activeVotes.length === 0) {
        return {
            passed: false,
            weightedApprovalRatio: 0,
            requiredThreshold: config.threshold,
            voterCount: 0,
            requiredMinVoters: config.minVoters,
            awaitingHumanApproval: false,
            reason: 'No votes cast yet',
        };
    }

    // Weighted calculation
    const totalWeight = votes.reduce((sum, v) => sum + v.weight, 0);
    const approveWeight = votes.filter((v) => v.vote === 'approve').reduce((sum, v) => sum + v.weight, 0);
    const weightedApprovalRatio = totalWeight > 0 ? approveWeight / totalWeight : 0;

    const meetsThreshold = weightedApprovalRatio >= config.threshold;

    if (!meetsThreshold) {
        return {
            passed: false,
            weightedApprovalRatio,
            requiredThreshold: config.threshold,
            voterCount,
            requiredMinVoters: config.minVoters,
            awaitingHumanApproval: false,
            reason: `Weighted approval ${(weightedApprovalRatio * 100).toFixed(0)}% below ${(config.threshold * 100).toFixed(0)}% threshold`,
        };
    }

    // Threshold met — check if human approval is needed
    if (tierInfo.requiresHumanApproval && !humanApproved) {
        return {
            passed: false,
            weightedApprovalRatio,
            requiredThreshold: config.threshold,
            voterCount,
            requiredMinVoters: config.minVoters,
            awaitingHumanApproval: true,
            reason: `Weighted vote passed (${(weightedApprovalRatio * 100).toFixed(0)}%) but awaiting human approval`,
        };
    }

    return {
        passed: true,
        weightedApprovalRatio,
        requiredThreshold: config.threshold,
        voterCount,
        requiredMinVoters: config.minVoters,
        awaitingHumanApproval: false,
        reason: `Approved: ${(weightedApprovalRatio * 100).toFixed(0)}% weighted approval meets ${tierInfo.label} tier threshold`,
    };
}

/**
 * Resolve the effective quorum config for a proposal.
 *
 * Priority: proposal-level overrides > council-level > governance tier defaults.
 */
export function resolveQuorumConfig(
    tier: GovernanceTier,
    proposalThreshold: number | null,
    proposalMinVoters: number | null,
    councilThreshold: number | null,
): ProposalQuorumConfig {
    const tierInfo = GOVERNANCE_TIERS[tier];
    return {
        threshold: proposalThreshold ?? councilThreshold ?? tierInfo.quorumThreshold,
        minVoters: proposalMinVoters ?? 1,
    };
}

// ─── Proposal lifecycle validation ────────────────────────────────────────────

const VALID_TRANSITIONS: Record<string, string[]> = {
    draft: ['open'],
    open: ['voting', 'draft'],
    voting: ['decided'],
    decided: ['enacted'],
    enacted: [],
};

/**
 * Check if a proposal status transition is valid.
 */
export function isValidTransition(from: string, to: string): boolean {
    return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ─── Automation enforcement ───────────────────────────────────────────────────

/**
 * Check whether an automated workflow (scheduler, work task) may modify a set of paths.
 * Layer 0 and Layer 1 paths are blocked from automated modification.
 */
export function checkAutomationAllowed(filePaths: string[]): AutomationCheckResult {
    const blockedPaths: string[] = [];
    let mostRestrictiveTier: GovernanceTier = 2;

    for (const path of filePaths) {
        const tier = classifyPath(path);
        const tierInfo = GOVERNANCE_TIERS[tier];
        if (!tierInfo.allowsAutomation) {
            blockedPaths.push(path);
        }
        if (tier < mostRestrictiveTier) mostRestrictiveTier = tier;
    }

    if (blockedPaths.length > 0) {
        const tierInfo = GOVERNANCE_TIERS[mostRestrictiveTier];
        log.warn('Automation blocked by governance tier', {
            tier: mostRestrictiveTier,
            tierLabel: tierInfo.label,
            blockedPaths,
        });
        return {
            allowed: false,
            tier: mostRestrictiveTier,
            reason: `${tierInfo.label} (Layer ${mostRestrictiveTier}) paths cannot be modified by automated workflows`,
            blockedPaths,
        };
    }

    return {
        allowed: true,
        tier: mostRestrictiveTier,
        reason: 'All paths are within automation-allowed tiers',
        blockedPaths: [],
    };
}

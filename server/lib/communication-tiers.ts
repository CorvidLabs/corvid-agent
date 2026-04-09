/**
 * Communication tier system — role-based hierarchy that controls which agents
 * can message which other agents.
 *
 * This is separate from the model capability tier (agent-tiers.ts). An agent
 * could run on a powerful model but still be junior in the org hierarchy.
 *
 * Hierarchy (messages flow downward):
 *   - top:    Can message anyone (top, mid, bottom)
 *   - mid:    Can message same tier + below (mid, bottom)
 *   - bottom: Can message same tier only (bottom)
 *
 * @module
 */

import { createLogger } from './logger';

const log = createLogger('CommunicationTiers');

// ─── Tier definitions ────────────────────────────────────────────────────

export type CommunicationTier = 'top' | 'mid' | 'bottom';

/**
 * Numeric rank for each tier (higher = more authority).
 * top can reach down to mid and bottom; mid can reach down to bottom.
 */
const TIER_RANK: Record<CommunicationTier, number> = {
  top: 3,
  mid: 2,
  bottom: 1,
};

// ─── Agent → tier mapping ────────────────────────────────────────────────

/**
 * Role-based communication tier assignments.
 *
 * Keyed by lowercase agent name. Agents not listed here default to 'bottom'
 * (conservative — new agents must be explicitly promoted).
 */
const AGENT_COMMUNICATION_TIERS: Record<string, CommunicationTier> = {
  // Top tier — lead/chairman, can message anyone
  corvidagent: 'top',

  // Mid tier — capable agents that receive delegated work
  rook: 'mid',
  jackdaw: 'mid',
  kite: 'mid',
  condor: 'mid',

  // Bottom tier — juniors, scouts, first responders
  magpie: 'bottom',
  starling: 'bottom',
  merlin: 'bottom',
};

// ─── Public API ──────────────────────────────────────────────────────────

/**
 * Get the communication tier for an agent by name.
 * Returns 'bottom' for unknown agents (safe default).
 */
export function getCommunicationTier(agentName: string): CommunicationTier {
  return AGENT_COMMUNICATION_TIERS[agentName.toLowerCase()] ?? 'bottom';
}

/**
 * Check whether an agent is allowed to message another agent based on
 * the communication hierarchy.
 *
 * Rules:
 *   - top → can message anyone
 *   - mid → can message mid or bottom
 *   - bottom → can message bottom only
 *
 * @returns null if allowed, or an error message string if blocked.
 */
export function checkCommunicationTier(fromAgentName: string, toAgentName: string): string | null {
  const fromTier = getCommunicationTier(fromAgentName);
  const toTier = getCommunicationTier(toAgentName);

  const fromRank = TIER_RANK[fromTier];
  const toRank = TIER_RANK[toTier];

  // Can message same tier or below
  if (fromRank >= toRank) {
    return null;
  }

  log.warn('Communication tier violation', {
    from: fromAgentName,
    fromTier,
    to: toAgentName,
    toTier,
  });

  return (
    `Communication tier violation: ${fromAgentName} (${fromTier}) cannot message ` +
    `${toAgentName} (${toTier}). Messages flow downward — ${fromTier}-tier agents ` +
    `can only message agents at the same tier or below.`
  );
}

/**
 * Get the rate limit overrides appropriate for a communication tier.
 * Higher tiers get more messaging capacity.
 */
export function getTierMessageLimits(tier: CommunicationTier): {
  maxMessagesPerSession: number;
  maxUniqueTargetsPerSession: number;
} {
  switch (tier) {
    case 'top':
      return { maxMessagesPerSession: 20, maxUniqueTargetsPerSession: 10 };
    case 'mid':
      return { maxMessagesPerSession: 10, maxUniqueTargetsPerSession: 5 };
    case 'bottom':
      return { maxMessagesPerSession: 5, maxUniqueTargetsPerSession: 2 };
  }
}

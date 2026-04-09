/**
 * Reputation Guard — Trust-level gating for work task creation.
 *
 * Prevents blacklisted or untrusted agents from creating work tasks.
 * Part of the v1.0 mainnet roadmap for on-chain accountability and
 * multi-agent coordination (issues #1458.5, #1459).
 *
 * Trust hierarchy (lowest → highest):
 *   blacklisted → untrusted → low → medium → high → verified
 *
 * Only 'blacklisted' and 'untrusted' agents are blocked. Agents with
 * 'low' trust and above may create work tasks — this is intentionally
 * permissive so new agents can start earning reputation through work.
 */

import { createLogger } from '../lib/logger';
import type { ReputationScorer } from '../reputation/scorer';
import type { TrustLevel } from '../reputation/types';

const log = createLogger('ReputationGuard');

/** Minimum trust level required to create a work task. */
export const MIN_TRUST_FOR_WORK_TASK: TrustLevel = 'low';

/** Trust levels that are blocked from creating work tasks. */
const BLOCKED_TRUST_LEVELS = new Set<TrustLevel>(['blacklisted', 'untrusted']);

export interface ReputationGuardResult {
  blocked: boolean;
  reason?: string;
  trustLevel?: TrustLevel;
}

/**
 * Check whether an agent's reputation permits work task creation.
 *
 * Gracefully handles missing scorer — if no scorer is available, the check
 * is skipped and the task is allowed (preserves existing behavior).
 *
 * @param scorer - The reputation scorer, or null/undefined if unavailable
 * @param agentId - The agent requesting the work task
 * @param context - Optional context string for log messages (e.g. task description snippet)
 */
export function checkReputationForWorkTask(
  scorer: ReputationScorer | null | undefined,
  agentId: string,
  context?: string,
): ReputationGuardResult {
  if (!scorer) {
    return { blocked: false };
  }

  let trustLevel: TrustLevel;
  try {
    const score = scorer.computeScore(agentId);
    trustLevel = score.trustLevel;
  } catch (err) {
    // Scoring failure is non-fatal — allow the task
    log.warn('Reputation check failed — allowing task by default', {
      agentId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { blocked: false };
  }

  if (BLOCKED_TRUST_LEVELS.has(trustLevel)) {
    const reason =
      `Agent "${agentId}" has trust level "${trustLevel}" and is not permitted to ` +
      `create work tasks. Minimum required: "${MIN_TRUST_FOR_WORK_TASK}". ` +
      `Build reputation by completing sessions and passing security checks.`;

    log.warn('Reputation guard triggered — blocking work task creation', {
      agentId,
      trustLevel,
      context,
    });

    return { blocked: true, reason, trustLevel };
  }

  log.debug('Reputation guard passed', { agentId, trustLevel });
  return { blocked: false, trustLevel };
}

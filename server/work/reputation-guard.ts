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
 * By default, only 'blacklisted' and 'untrusted' agents are blocked.
 * Callers may raise the bar per-task by passing minTrustLevel — useful
 * when delegating high-stakes work that should only go to trusted agents.
 */

import { createLogger } from '../lib/logger';
import type { ReputationScorer } from '../reputation/scorer';
import type { TrustLevel } from '../reputation/types';

const log = createLogger('ReputationGuard');

/** Minimum trust level required to create a work task (default, when no per-task override). */
export const MIN_TRUST_FOR_WORK_TASK: TrustLevel = 'low';

/**
 * Ordered trust levels from least to most trusted.
 * 'blacklisted' is a special revocation state — treated as below 'untrusted'.
 */
const TRUST_LEVEL_ORDER: TrustLevel[] = ['blacklisted', 'untrusted', 'low', 'medium', 'high', 'verified'];

/** Return true if `actual` meets or exceeds `required`. */
export function meetsMinTrustLevel(actual: TrustLevel, required: TrustLevel): boolean {
  return TRUST_LEVEL_ORDER.indexOf(actual) >= TRUST_LEVEL_ORDER.indexOf(required);
}

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
 * @param minTrustLevel - Minimum trust level required for this task (defaults to MIN_TRUST_FOR_WORK_TASK)
 */
export function checkReputationForWorkTask(
  scorer: ReputationScorer | null | undefined,
  agentId: string,
  context?: string,
  minTrustLevel: TrustLevel = MIN_TRUST_FOR_WORK_TASK,
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

  if (!meetsMinTrustLevel(trustLevel, minTrustLevel)) {
    const reason =
      `Agent "${agentId}" has trust level "${trustLevel}" and does not meet the ` +
      `required minimum of "${minTrustLevel}" for this work task. ` +
      `Build reputation by completing sessions and passing security checks.`;

    log.warn('Reputation guard triggered — blocking work task creation', {
      agentId,
      trustLevel,
      minTrustLevel,
      context,
    });

    return { blocked: true, reason, trustLevel };
  }

  log.debug('Reputation guard passed', { agentId, trustLevel, minTrustLevel });
  return { blocked: false, trustLevel };
}

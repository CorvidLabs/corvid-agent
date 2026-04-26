/**
 * Council reputation gate — filters agent lists by minimum trust level.
 *
 * Extracted to a non-constitutional file so callers (routes, MCP handlers,
 * scheduler) can apply trust-level filtering before invoking launchCouncil.
 */

import type { ReputationScorer } from '../reputation/scorer';
import type { TrustLevel } from '../reputation/types';
import { meetsMinTrustLevel } from '../work/reputation-guard';

export interface FilterResult {
  eligible: string[];
  excluded: string[];
}

/**
 * Partition agentIds into eligible and excluded sets based on minTrustLevel.
 *
 * Scoring failures are non-fatal — an agent that throws is included by default.
 */
export function filterAgentsByTrustLevel(
  agentIds: string[],
  minTrustLevel: TrustLevel,
  scorer: ReputationScorer,
): FilterResult {
  const eligible: string[] = [];
  const excluded: string[] = [];

  for (const agentId of agentIds) {
    try {
      const score = scorer.computeScore(agentId);
      if (meetsMinTrustLevel(score.trustLevel, minTrustLevel)) {
        eligible.push(agentId);
      } else {
        excluded.push(agentId);
      }
    } catch {
      // Scoring failure is non-fatal — include agent by default
      eligible.push(agentId);
    }
  }

  return { eligible, excluded };
}

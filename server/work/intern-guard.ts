/**
 * Intern Model PR Guard — Issue #1542
 *
 * Prevents intern-tier models (local Ollama and other low-capability external
 * models) from performing git push or PR creation. These models lack the
 * reliability required for autonomous code publication.
 *
 * Background: Issue #1536 — an intern model pushed broken code directly,
 * bypassing the review gate. This guard closes that path.
 */

import { getModelPricing } from '../providers/cost-table';
import { createLogger } from '../lib/logger';

const log = createLogger('InternGuard');

/**
 * Returns true if the given model identifier is classified as intern-tier.
 *
 * Intern-tier criteria (any one is sufficient):
 *   1. The model name is literally 'intern' (explicit designation)
 *   2. The model is an Ollama local model (provider='ollama', isCloud != true)
 *   3. The model is not found in the cost table and its name contains
 *      known intern-tier provider patterns (e.g. 'ollama/')
 */
export function isInternTierModel(model: string): boolean {
  if (!model) return false;

  // Explicit intern designation
  if (model === 'intern') return true;

  const pricing = getModelPricing(model);

  if (pricing) {
    // Local Ollama models (not cloud) are intern-tier
    return pricing.provider === 'ollama' && pricing.isCloud !== true;
  }

  // Unknown model — apply heuristic based on name patterns
  // Ollama models are typically specified as 'name:tag' or 'ollama/name'
  const lower = model.toLowerCase();
  return (
    lower.startsWith('ollama/') ||
    lower.includes(':latest') ||
    (lower.includes(':') &&
      !lower.includes('-') &&
      !lower.includes('claude') &&
      !lower.includes('gpt') &&
      !lower.includes('gemini'))
  );
}

export interface InternGuardResult {
  blocked: boolean;
  reason?: string;
}

/**
 * Check whether a git push or PR creation should be blocked for the given
 * model. Logs a warning when blocked.
 *
 * @param model - The agent's model identifier
 * @param context - Optional context string for log messages (e.g. task ID)
 */
export function checkInternPrGuard(model: string, context?: string): InternGuardResult {
  if (!isInternTierModel(model)) {
    return { blocked: false };
  }

  const reason =
    `Intern-tier model "${model}" is not permitted to run git push or create PRs ` +
    `(issue #1542). Push access requires a Sonnet-tier or higher model.`;

  log.warn('Intern model PR guard triggered — blocking push/PR', {
    model,
    context,
  });

  return { blocked: true, reason };
}

/**
 * Memory temporal decay — older memories get lower relevance scores.
 *
 * Prevents stale memories from dominating search results while
 * still keeping them accessible at reduced priority.
 */

import type { ScoredMemory } from './semantic-search';

/**
 * Compute a decay multiplier based on memory age.
 *
 * - <7 days:   1.0 (no decay)
 * - 7-30 days: 0.8
 * - 30-90 days: 0.6
 * - 90+ days:  0.4
 */
export function computeDecayMultiplier(updatedAt: string, now?: Date): number {
    const updated = new Date(updatedAt).getTime();
    const current = (now ?? new Date()).getTime();
    const daysSinceUpdate = (current - updated) / (1000 * 60 * 60 * 24);

    if (daysSinceUpdate < 7) return 1.0;
    if (daysSinceUpdate < 30) return 0.8;
    if (daysSinceUpdate < 90) return 0.6;
    return 0.4;
}

/**
 * Apply temporal decay to scored memory results, re-sort by decayed score.
 */
export function applyDecay(results: ScoredMemory[], now?: Date): ScoredMemory[] {
    const decayed = results.map((r) => ({
        ...r,
        score: r.score * computeDecayMultiplier(r.memory.updatedAt, now),
    }));

    decayed.sort((a, b) => b.score - a.score);
    return decayed;
}

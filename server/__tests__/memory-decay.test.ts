import { describe, it, expect } from 'bun:test';
import { computeDecayMultiplier, applyDecay } from '../memory/decay';
import type { AgentMemory } from '../../shared/types';

const now = new Date('2026-01-15T00:00:00Z');
const twoDaysAgo = '2026-01-13T00:00:00Z';
const twoWeeksAgo = '2026-01-01T00:00:00Z';
const twoMonthsAgo = '2025-11-15T00:00:00Z';
const sixMonthsAgo = '2025-07-15T00:00:00Z';

function makeMemory(updatedAt: string, id = 'mem-1'): AgentMemory {
    return {
        id,
        agentId: 'agent-1',
        key: `key-${id}`,
        content: 'test content',
        txid: null,
        status: 'confirmed',
        createdAt: updatedAt,
        updatedAt,
    };
}

describe('memory decay', () => {
    describe('computeDecayMultiplier', () => {
        it('returns 1.0 for recent memories (< 7 days)', () => {
            expect(computeDecayMultiplier(twoDaysAgo, now)).toBe(1.0);
        });

        it('returns 0.8 for memories 7-30 days old', () => {
            expect(computeDecayMultiplier(twoWeeksAgo, now)).toBe(0.8);
        });

        it('returns 0.6 for memories 30-90 days old', () => {
            expect(computeDecayMultiplier(twoMonthsAgo, now)).toBe(0.6);
        });

        it('returns 0.4 for memories older than 90 days', () => {
            expect(computeDecayMultiplier(sixMonthsAgo, now)).toBe(0.4);
        });
    });

    describe('applyDecay', () => {
        it('re-sorts results after applying decay so old high-scoring memories drop below recent ones', () => {
            const results = [
                { memory: makeMemory(sixMonthsAgo, 'old-high'), score: 1.0, source: 'fts5' as const },
                { memory: makeMemory(twoDaysAgo, 'new-low'), score: 0.5, source: 'fts5' as const },
            ];

            const decayed = applyDecay(results, now);

            // Old high-scorer: 1.0 * 0.4 = 0.4
            // Recent low-scorer: 0.5 * 1.0 = 0.5
            expect(decayed[0].memory.id).toBe('new-low');
            expect(decayed[0].score).toBeCloseTo(0.5, 5);
            expect(decayed[1].memory.id).toBe('old-high');
            expect(decayed[1].score).toBeCloseTo(0.4, 5);
        });
    });
});

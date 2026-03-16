import { test, expect, describe } from 'bun:test';
import { computeDecayMultiplier, applyDecay } from '../memory/decay';
import type { ScoredMemory } from '../memory/semantic-search';
import type { AgentMemory } from '../../shared/types';

/** Create a minimal AgentMemory with a given updatedAt timestamp. */
function makeMemory(updatedAt: string): AgentMemory {
    return {
        id: 'mem-1',
        agentId: 'agent-1',
        key: 'test-key',
        content: 'test content',
        txid: null,
        status: 'confirmed',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt,
    };
}

/** Pin "now" for deterministic date arithmetic. */
const NOW = new Date('2026-03-16T12:00:00.000Z');

/** Return an ISO date string N days before NOW. */
function daysAgo(days: number): string {
    const d = new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
    return d.toISOString();
}

describe('computeDecayMultiplier', () => {
    test('returns 1.0 for memory updated today (0 days)', () => {
        expect(computeDecayMultiplier(daysAgo(0), NOW)).toBe(1.0);
    });

    test('returns 1.0 for memory updated 6 days ago (boundary)', () => {
        expect(computeDecayMultiplier(daysAgo(6), NOW)).toBe(1.0);
    });

    test('returns 0.8 for memory updated 7 days ago (boundary)', () => {
        expect(computeDecayMultiplier(daysAgo(7), NOW)).toBe(0.8);
    });

    test('returns 0.8 for memory updated 29 days ago', () => {
        expect(computeDecayMultiplier(daysAgo(29), NOW)).toBe(0.8);
    });

    test('returns 0.6 for memory updated 30 days ago (boundary)', () => {
        expect(computeDecayMultiplier(daysAgo(30), NOW)).toBe(0.6);
    });

    test('returns 0.6 for memory updated 89 days ago', () => {
        expect(computeDecayMultiplier(daysAgo(89), NOW)).toBe(0.6);
    });

    test('returns 0.4 for memory updated 90 days ago (boundary)', () => {
        expect(computeDecayMultiplier(daysAgo(90), NOW)).toBe(0.4);
    });

    test('returns 0.4 for memory updated 365 days ago', () => {
        expect(computeDecayMultiplier(daysAgo(365), NOW)).toBe(0.4);
    });
});

describe('applyDecay', () => {
    test('re-sorts results by decayed score', () => {
        // Old memory with high raw score vs recent memory with lower raw score
        const oldHighScore: ScoredMemory = {
            memory: makeMemory(daysAgo(100)), // 90+ days -> 0.4 multiplier
            score: 1.0,
            source: 'fts5',
        };
        const recentLowScore: ScoredMemory = {
            memory: makeMemory(daysAgo(1)), // <7 days -> 1.0 multiplier
            score: 0.5,
            source: 'tfidf',
        };

        // Before decay: oldHighScore (1.0) > recentLowScore (0.5)
        // After decay: recentLowScore (0.5 * 1.0 = 0.5) > oldHighScore (1.0 * 0.4 = 0.4)
        const result = applyDecay([oldHighScore, recentLowScore], NOW);

        expect(result).toHaveLength(2);
        expect(result[0].score).toBe(0.5);
        expect(result[0].memory.updatedAt).toBe(recentLowScore.memory.updatedAt);
        expect(result[1].score).toBeCloseTo(0.4, 10);
        expect(result[1].memory.updatedAt).toBe(oldHighScore.memory.updatedAt);
    });

    test('empty array returns empty array', () => {
        const result = applyDecay([], NOW);
        expect(result).toEqual([]);
    });

    test('preserves all other fields on ScoredMemory', () => {
        const original: ScoredMemory = {
            memory: makeMemory(daysAgo(0)),
            score: 0.9,
            source: 'combined',
        };

        const result = applyDecay([original], NOW);

        expect(result).toHaveLength(1);
        expect(result[0].memory.id).toBe('mem-1');
        expect(result[0].memory.agentId).toBe('agent-1');
        expect(result[0].memory.key).toBe('test-key');
        expect(result[0].memory.content).toBe('test content');
        expect(result[0].memory.txid).toBeNull();
        expect(result[0].memory.status).toBe('confirmed');
        expect(result[0].source).toBe('combined');
        // Score should remain unchanged (multiplier is 1.0 for today)
        expect(result[0].score).toBe(0.9);
    });
});

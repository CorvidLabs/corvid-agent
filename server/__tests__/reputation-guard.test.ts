/**
 * Tests for reputation-guard.ts — Issues #1458.5, #1459
 *
 * Verifies that reputation-gated work task creation correctly blocks
 * blacklisted/untrusted agents and permits agents with sufficient trust.
 */

import { describe, expect, test } from 'bun:test';
import type { ReputationScorer } from '../reputation/scorer';
import type { ReputationScore, TrustLevel } from '../reputation/types';
import { checkReputationForWorkTask, MIN_TRUST_FOR_WORK_TASK } from '../work/reputation-guard';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeMockScorer(trustLevel: TrustLevel): ReputationScorer {
  const score: ReputationScore = {
    agentId: 'test-agent',
    overallScore: 50,
    trustLevel,
    components: {
      taskCompletion: 50,
      peerRating: 50,
      creditPattern: 50,
      securityCompliance: 50,
      activityLevel: 50,
    },
    attestationHash: null,
    computedAt: new Date().toISOString(),
    hasActivity: true,
  };
  return { computeScore: (_agentId: string) => score } as unknown as ReputationScorer;
}

function makeThrowingScorer(): ReputationScorer {
  return {
    computeScore: (_agentId: string) => {
      throw new Error('DB unavailable');
    },
  } as unknown as ReputationScorer;
}

// ─── MIN_TRUST_FOR_WORK_TASK ──────────────────────────────────────────────────

describe('MIN_TRUST_FOR_WORK_TASK', () => {
  test('is "low"', () => {
    expect(MIN_TRUST_FOR_WORK_TASK).toBe('low');
  });
});

// ─── Blocked trust levels ─────────────────────────────────────────────────────

describe('checkReputationForWorkTask — blocked', () => {
  test('blocks agents with trust level "blacklisted"', () => {
    const scorer = makeMockScorer('blacklisted');
    const result = checkReputationForWorkTask(scorer, 'agent-123', 'fix bug');
    expect(result.blocked).toBe(true);
    expect(result.trustLevel).toBe('blacklisted');
    expect(result.reason).toBeDefined();
    expect(result.reason).toContain('blacklisted');
    expect(result.reason).toContain('agent-123');
  });

  test('blocks agents with trust level "untrusted"', () => {
    const scorer = makeMockScorer('untrusted');
    const result = checkReputationForWorkTask(scorer, 'new-agent', 'add feature');
    expect(result.blocked).toBe(true);
    expect(result.trustLevel).toBe('untrusted');
    expect(result.reason).toBeDefined();
    expect(result.reason).toContain('untrusted');
  });

  test('reason message includes minimum trust level', () => {
    const scorer = makeMockScorer('blacklisted');
    const result = checkReputationForWorkTask(scorer, 'agent-x');
    expect(result.reason).toContain(MIN_TRUST_FOR_WORK_TASK);
  });
});

// ─── Permitted trust levels ───────────────────────────────────────────────────

describe('checkReputationForWorkTask — permitted', () => {
  test('allows agents with trust level "low"', () => {
    const scorer = makeMockScorer('low');
    const result = checkReputationForWorkTask(scorer, 'new-agent');
    expect(result.blocked).toBe(false);
    expect(result.trustLevel).toBe('low');
  });

  test('allows agents with trust level "medium"', () => {
    const scorer = makeMockScorer('medium');
    const result = checkReputationForWorkTask(scorer, 'agent-m');
    expect(result.blocked).toBe(false);
  });

  test('allows agents with trust level "high"', () => {
    const scorer = makeMockScorer('high');
    const result = checkReputationForWorkTask(scorer, 'agent-h');
    expect(result.blocked).toBe(false);
  });

  test('allows agents with trust level "verified"', () => {
    const scorer = makeMockScorer('verified');
    const result = checkReputationForWorkTask(scorer, 'trusted-agent');
    expect(result.blocked).toBe(false);
    expect(result.trustLevel).toBe('verified');
  });
});

// ─── Graceful degradation ─────────────────────────────────────────────────────

describe('checkReputationForWorkTask — graceful degradation', () => {
  test('allows task when scorer is null', () => {
    const result = checkReputationForWorkTask(null, 'any-agent');
    expect(result.blocked).toBe(false);
  });

  test('allows task when scorer is undefined', () => {
    const result = checkReputationForWorkTask(undefined, 'any-agent');
    expect(result.blocked).toBe(false);
  });

  test('allows task when scorer.computeScore throws', () => {
    const scorer = makeThrowingScorer();
    const result = checkReputationForWorkTask(scorer, 'agent-err');
    expect(result.blocked).toBe(false);
  });
});

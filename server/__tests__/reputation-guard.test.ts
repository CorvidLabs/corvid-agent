/**
 * Tests for reputation-guard.ts — Issues #1458.5, #1459
 *
 * Verifies that reputation-gated work task creation correctly blocks
 * agents that don't meet the required trust threshold and permits those
 * that do. Also covers per-task minTrustLevel overrides.
 */

import { describe, expect, test } from 'bun:test';
import type { ReputationScorer } from '../reputation/scorer';
import type { ReputationScore, TrustLevel } from '../reputation/types';
import { checkReputationForWorkTask, MIN_TRUST_FOR_WORK_TASK, meetsMinTrustLevel } from '../work/reputation-guard';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeMockScorer(trustLevel: TrustLevel, overallScore = 50): ReputationScorer {
  const score: ReputationScore = {
    agentId: 'test-agent',
    overallScore,
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

// ─── meetsMinTrustLevel ───────────────────────────────────────────────────────

describe('meetsMinTrustLevel', () => {
  test('verified meets all levels', () => {
    expect(meetsMinTrustLevel('verified', 'verified')).toBe(true);
    expect(meetsMinTrustLevel('verified', 'high')).toBe(true);
    expect(meetsMinTrustLevel('verified', 'medium')).toBe(true);
    expect(meetsMinTrustLevel('verified', 'low')).toBe(true);
    expect(meetsMinTrustLevel('verified', 'untrusted')).toBe(true);
  });

  test('high meets high and below', () => {
    expect(meetsMinTrustLevel('high', 'verified')).toBe(false);
    expect(meetsMinTrustLevel('high', 'high')).toBe(true);
    expect(meetsMinTrustLevel('high', 'medium')).toBe(true);
    expect(meetsMinTrustLevel('high', 'low')).toBe(true);
  });

  test('medium meets medium and below', () => {
    expect(meetsMinTrustLevel('medium', 'high')).toBe(false);
    expect(meetsMinTrustLevel('medium', 'medium')).toBe(true);
    expect(meetsMinTrustLevel('medium', 'low')).toBe(true);
  });

  test('low meets low and below', () => {
    expect(meetsMinTrustLevel('low', 'medium')).toBe(false);
    expect(meetsMinTrustLevel('low', 'low')).toBe(true);
    expect(meetsMinTrustLevel('low', 'untrusted')).toBe(true);
  });

  test('untrusted does not meet low', () => {
    expect(meetsMinTrustLevel('untrusted', 'low')).toBe(false);
    expect(meetsMinTrustLevel('untrusted', 'untrusted')).toBe(true);
  });

  test('blacklisted does not meet untrusted', () => {
    expect(meetsMinTrustLevel('blacklisted', 'untrusted')).toBe(false);
    expect(meetsMinTrustLevel('blacklisted', 'blacklisted')).toBe(true);
  });
});

// ─── Blocked trust levels (default threshold) ─────────────────────────────────

describe('checkReputationForWorkTask — blocked (default threshold)', () => {
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

// ─── Permitted trust levels (default threshold) ───────────────────────────────

describe('checkReputationForWorkTask — permitted (default threshold)', () => {
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

// ─── Per-task minTrustLevel override ─────────────────────────────────────────

describe('checkReputationForWorkTask — per-task minTrustLevel', () => {
  test('medium threshold blocks low-trust agent', () => {
    const scorer = makeMockScorer('low');
    const result = checkReputationForWorkTask(scorer, 'agent-low', 'security audit', 'medium');
    expect(result.blocked).toBe(true);
    expect(result.trustLevel).toBe('low');
    expect(result.reason).toContain('"low"');
    expect(result.reason).toContain('"medium"');
  });

  test('medium threshold allows medium-trust agent', () => {
    const scorer = makeMockScorer('medium');
    const result = checkReputationForWorkTask(scorer, 'agent-med', 'security audit', 'medium');
    expect(result.blocked).toBe(false);
    expect(result.trustLevel).toBe('medium');
  });

  test('high threshold blocks medium-trust agent', () => {
    const scorer = makeMockScorer('medium');
    const result = checkReputationForWorkTask(scorer, 'agent-med', 'mainnet deployment', 'high');
    expect(result.blocked).toBe(true);
    expect(result.trustLevel).toBe('medium');
    expect(result.reason).toContain('"high"');
  });

  test('high threshold allows high-trust agent', () => {
    const scorer = makeMockScorer('high');
    const result = checkReputationForWorkTask(scorer, 'agent-hi', 'mainnet deployment', 'high');
    expect(result.blocked).toBe(false);
  });

  test('verified threshold blocks high-trust agent', () => {
    const scorer = makeMockScorer('high');
    const result = checkReputationForWorkTask(scorer, 'agent-hi', 'critical system change', 'verified');
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('"verified"');
  });

  test('verified threshold allows verified agent', () => {
    const scorer = makeMockScorer('verified');
    const result = checkReputationForWorkTask(scorer, 'trusted-agent', 'critical system change', 'verified');
    expect(result.blocked).toBe(false);
  });

  test('low threshold still blocks untrusted agent', () => {
    const scorer = makeMockScorer('untrusted');
    const result = checkReputationForWorkTask(scorer, 'new-agent', 'trivial task', 'low');
    expect(result.blocked).toBe(true);
  });

  test('low threshold allows low-trust agent (same as default)', () => {
    const scorer = makeMockScorer('low');
    const result = checkReputationForWorkTask(scorer, 'agent-low', 'trivial task', 'low');
    expect(result.blocked).toBe(false);
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

  test('null scorer allows even with high minTrustLevel', () => {
    const result = checkReputationForWorkTask(null, 'any-agent', undefined, 'verified');
    expect(result.blocked).toBe(false);
  });
});

/**
 * Tests for council reputation gating — issue #1458
 *
 * Verifies that filterAgentsByTrustLevel correctly partitions agent lists
 * by minimum trust level, and that createCouncil persists minTrustLevel.
 *
 * Note: the filtering is applied by callers (routes, MCP handlers, scheduler)
 * before invoking launchCouncil, keeping the constitutional layer unmodified.
 */

import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createCouncil } from '../db/councils';
import { runMigrations } from '../db/schema';
import { filterAgentsByTrustLevel } from '../councils/reputation-gate';
import type { ReputationScorer } from '../reputation/scorer';
import type { ReputationScore, TrustLevel } from '../reputation/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeScorerWithLevels(levels: Record<string, TrustLevel>): ReputationScorer {
  return {
    computeScore: (agentId: string): ReputationScore => {
      const trustLevel = levels[agentId] ?? 'untrusted';
      return {
        agentId,
        overallScore: trustLevel === 'high' ? 80 : trustLevel === 'medium' ? 60 : trustLevel === 'low' ? 40 : 10,
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
    },
  } as unknown as ReputationScorer;
}

const AGENT_A = 'agent-a';
const AGENT_B = 'agent-b';
const AGENT_C = 'agent-c';

// ─── filterAgentsByTrustLevel tests ───────────────────────────────────────────

describe('filterAgentsByTrustLevel', () => {
  it('includes all agents when all meet the threshold', () => {
    const scorer = makeScorerWithLevels({ [AGENT_A]: 'high', [AGENT_B]: 'high', [AGENT_C]: 'high' });
    const { eligible, excluded } = filterAgentsByTrustLevel([AGENT_A, AGENT_B, AGENT_C], 'medium', scorer);
    expect(eligible).toHaveLength(3);
    expect(excluded).toHaveLength(0);
  });

  it('excludes agents below minTrustLevel', () => {
    // agentA=low (excluded), agentB=medium (included), agentC=high (included)
    const scorer = makeScorerWithLevels({ [AGENT_A]: 'low', [AGENT_B]: 'medium', [AGENT_C]: 'high' });
    const { eligible, excluded } = filterAgentsByTrustLevel([AGENT_A, AGENT_B, AGENT_C], 'medium', scorer);
    expect(eligible).toHaveLength(2);
    expect(excluded).toHaveLength(1);
    expect(excluded[0]).toBe(AGENT_A);
  });

  it('returns empty eligible list when all agents are below threshold', () => {
    const scorer = makeScorerWithLevels({ [AGENT_A]: 'low', [AGENT_B]: 'medium' });
    const { eligible, excluded } = filterAgentsByTrustLevel([AGENT_A, AGENT_B], 'verified', scorer);
    expect(eligible).toHaveLength(0);
    expect(excluded).toHaveLength(2);
  });

  it('includes agents when scorer throws (non-fatal)', () => {
    const throwingScorer = {
      computeScore: (_agentId: string) => {
        throw new Error('DB offline');
      },
    } as unknown as ReputationScorer;

    const { eligible, excluded } = filterAgentsByTrustLevel([AGENT_A], 'high', throwingScorer);
    expect(eligible).toHaveLength(1);
    expect(excluded).toHaveLength(0);
  });

  it('returns eligible === agentIds when list is empty', () => {
    const scorer = makeScorerWithLevels({});
    const { eligible, excluded } = filterAgentsByTrustLevel([], 'medium', scorer);
    expect(eligible).toHaveLength(0);
    expect(excluded).toHaveLength(0);
  });
});

// ─── createCouncil — minTrustLevel persistence ────────────────────────────────

describe('createCouncil — minTrustLevel persistence', () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('stores and retrieves minTrustLevel', () => {
    const council = createCouncil(db, {
      name: 'Gated Council',
      agentIds: [],
      minTrustLevel: 'medium',
    });

    expect(council.minTrustLevel).toBe('medium');
  });

  it('defaults minTrustLevel to null', () => {
    const council = createCouncil(db, {
      name: 'Open Council',
      agentIds: [],
    });

    expect(council.minTrustLevel).toBeNull();
  });
});

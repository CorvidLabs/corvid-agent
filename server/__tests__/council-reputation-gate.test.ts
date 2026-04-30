/**
 * Tests for council reputation gating — issue #1458
 *
 * Verifies that launchCouncil filters out agents below the council's
 * minTrustLevel when a reputationScorer is provided.
 */

import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { launchCouncil } from '../councils/discussion';
import { createAgent } from '../db/agents';
import { createCouncil, getCouncilLaunchLogs } from '../db/councils';
import { createProject } from '../db/projects';
import { runMigrations } from '../db/schema';
import type { ProcessManager } from '../process/manager';
import type { ReputationScorer } from '../reputation/scorer';
import type { ReputationScore, TrustLevel } from '../reputation/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

function makeMockPM(): ProcessManager {
  return {
    subscribe: mock(() => {}),
    unsubscribe: mock(() => {}),
    isRunning: mock(() => false),
    stopProcess: mock(() => {}),
    startProcess: mock(() => {}),
    sendMessage: mock(() => true),
  } as unknown as ProcessManager;
}

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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('launchCouncil — reputation gating', () => {
  let db: Database;
  let pm: ProcessManager;
  let projectId: string;
  let agentA: string;
  let agentB: string;
  let agentC: string;

  beforeEach(() => {
    db = makeDb();
    pm = makeMockPM();

    const project = createProject(db, { name: 'test-project', workingDir: '/tmp/test' });
    projectId = project.id;

    agentA = createAgent(db, { name: 'Agent A', model: 'claude-haiku-4-5-20251001' }).id;
    agentB = createAgent(db, { name: 'Agent B', model: 'claude-haiku-4-5-20251001' }).id;
    agentC = createAgent(db, { name: 'Agent C', model: 'claude-haiku-4-5-20251001' }).id;
  });

  afterEach(() => {
    db.close();
  });

  it('includes all agents when minTrustLevel is null', () => {
    const council = createCouncil(db, {
      name: 'Test Council',
      agentIds: [agentA, agentB, agentC],
      minTrustLevel: null,
    });

    const scorer = makeScorerWithLevels({ [agentA]: 'untrusted', [agentB]: 'untrusted', [agentC]: 'untrusted' });

    const result = launchCouncil(db, pm, council.id, projectId, 'test prompt', null, {
      reputationScorer: scorer,
    });

    expect(result.sessionIds).toHaveLength(3);
  });

  it('includes all agents when no scorer is provided', () => {
    const council = createCouncil(db, {
      name: 'Test Council',
      agentIds: [agentA, agentB, agentC],
      minTrustLevel: 'high',
    });

    const result = launchCouncil(db, pm, council.id, projectId, 'test prompt', null);

    expect(result.sessionIds).toHaveLength(3);
  });

  it('filters out agents below minTrustLevel', () => {
    const council = createCouncil(db, {
      name: 'Test Council',
      agentIds: [agentA, agentB, agentC],
      minTrustLevel: 'medium',
    });

    // agentA=low (excluded), agentB=medium (included), agentC=high (included)
    const scorer = makeScorerWithLevels({
      [agentA]: 'low',
      [agentB]: 'medium',
      [agentC]: 'high',
    });

    const result = launchCouncil(db, pm, council.id, projectId, 'test prompt', null, {
      reputationScorer: scorer,
    });

    expect(result.sessionIds).toHaveLength(2);
  });

  it('emits a warn log when agents are excluded', () => {
    const council = createCouncil(db, {
      name: 'Test Council',
      agentIds: [agentA, agentB],
      minTrustLevel: 'high',
    });

    const scorer = makeScorerWithLevels({ [agentA]: 'low', [agentB]: 'high' });

    const result = launchCouncil(db, pm, council.id, projectId, 'test prompt', null, {
      reputationScorer: scorer,
    });

    expect(result.sessionIds).toHaveLength(1);

    const logs = getCouncilLaunchLogs(db, result.launchId);
    const warnLog = logs.find((l) => l.level === 'warn');
    expect(warnLog).toBeDefined();
    expect(warnLog?.message).toContain('excluded from council');
  });

  it('includes agents when scorer throws (non-fatal)', () => {
    const council = createCouncil(db, {
      name: 'Test Council',
      agentIds: [agentA],
      minTrustLevel: 'high',
    });

    const throwingScorer = {
      computeScore: (_agentId: string) => {
        throw new Error('DB offline');
      },
    } as unknown as ReputationScorer;

    const result = launchCouncil(db, pm, council.id, projectId, 'test prompt', null, {
      reputationScorer: throwingScorer,
    });

    expect(result.sessionIds).toHaveLength(1);
  });

  it('returns empty session list when all agents are below threshold', () => {
    const council = createCouncil(db, {
      name: 'Test Council',
      agentIds: [agentA, agentB],
      minTrustLevel: 'verified',
    });

    const scorer = makeScorerWithLevels({ [agentA]: 'low', [agentB]: 'medium' });

    const result = launchCouncil(db, pm, council.id, projectId, 'test prompt', null, {
      reputationScorer: scorer,
    });

    expect(result.sessionIds).toHaveLength(0);
  });
});

describe('createCouncil — minTrustLevel persistence', () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
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

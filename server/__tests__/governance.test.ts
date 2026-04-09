import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  assessImpact,
  checkAutomationAllowed,
  classifyPath,
  classifyPaths,
  evaluateVote,
  evaluateWeightedVote,
  GOVERNANCE_TIERS,
  type GovernanceVoteRecord,
  type WeightedVoteRecord,
} from '../councils/governance';
import {
  approveGovernanceVoteHuman,
  castGovernanceMemberVote,
  createCouncil,
  createCouncilLaunch,
  createGovernanceVote,
  getGovernanceMemberVotes,
  getGovernanceVote,
  updateGovernanceVoteStatus,
} from '../db/councils';
import { runMigrations } from '../db/schema';

// ─── Tier classification tests ────────────────────────────────────────────────

describe('governance tier classification', () => {
  test('classifies Layer 0 (Constitutional) paths by basename', () => {
    expect(classifyPath('server/process/spending.ts')).toBe(0);
    expect(classifyPath('server/process/sdk-process.ts')).toBe(0);
    expect(classifyPath('server/process/manager.ts')).toBe(0);
    expect(classifyPath('server/mcp/tool-handlers.ts')).toBe(0);
    expect(classifyPath('server/permissions/broker.ts')).toBe(0);
    expect(classifyPath('server/councils/governance.ts')).toBe(0);
    // sdk-tools.ts and schema.ts are Layer 1 (Structural), not Layer 0 — see issue #1766
  });

  test('classifies Layer 0 paths by substring', () => {
    expect(classifyPath('server/councils/discussion.ts')).toBe(0);
    expect(classifyPath('server/councils/synthesis.ts')).toBe(0);
    expect(classifyPath('server/permissions/types.ts')).toBe(0);
    expect(classifyPath('server/algochat/spending.ts')).toBe(0);
    expect(classifyPath('server/process/protected-paths.ts')).toBe(0);
    expect(classifyPath('server/middleware/guards.ts')).toBe(0);
    expect(classifyPath('.env')).toBe(0);
    expect(classifyPath('corvid-agent.db')).toBe(0);
    expect(classifyPath('wallet-keystore.json')).toBe(0);
  });

  test('classifies Layer 1 (Structural) paths by basename', () => {
    expect(classifyPath('package.json')).toBe(1);
    expect(classifyPath('CLAUDE.md')).toBe(1);
    expect(classifyPath('tsconfig.json')).toBe(1);
    // sdk-tools.ts → Layer 1 via server/mcp/ substring; schema.ts → Layer 1 by basename
    expect(classifyPath('server/mcp/sdk-tools.ts')).toBe(1);
    expect(classifyPath('server/db/schema.ts')).toBe(1);
  });

  test('classifies Layer 1 paths by substring', () => {
    expect(classifyPath('server/db/migrations/042_something.ts')).toBe(1);
    expect(classifyPath('server/mcp/some-tool.ts')).toBe(1);
    expect(classifyPath('server/providers/anthropic.ts')).toBe(1);
    expect(classifyPath('server/lib/validation.ts')).toBe(1);
  });

  test('classifies Layer 2 (Operational) paths for everything else', () => {
    expect(classifyPath('server/routes/agents.ts')).toBe(2);
    expect(classifyPath('shared/types/councils.ts')).toBe(2);
    expect(classifyPath('client/src/App.tsx')).toBe(2);
    expect(classifyPath('server/__tests__/agents.test.ts')).toBe(2);
    expect(classifyPath('README.md')).toBe(2);
  });

  test('normalizes Windows backslashes', () => {
    expect(classifyPath('server\\councils\\discussion.ts')).toBe(0);
    expect(classifyPath('server\\routes\\agents.ts')).toBe(2);
  });

  test('classifyPaths returns most restrictive tier', () => {
    expect(
      classifyPaths([
        'server/routes/agents.ts', // Layer 2
        'server/db/migrations/042_foo.ts', // Layer 1
      ]),
    ).toBe(1);

    expect(
      classifyPaths([
        'server/routes/agents.ts', // Layer 2
        'server/councils/governance.ts', // Layer 0
      ]),
    ).toBe(0);

    expect(classifyPaths([])).toBe(2);
  });
});

// ─── Impact assessment tests ──────────────────────────────────────────────────

describe('governance impact assessment', () => {
  test('assesses Layer 0 impact correctly', () => {
    const impact = assessImpact(['server/councils/governance.ts', 'server/routes/agents.ts']);
    expect(impact.tier).toBe(0);
    expect(impact.tierLabel).toBe('Constitutional');
    expect(impact.blockedFromAutomation).toBe(true);
    expect(impact.requiresHumanApproval).toBe(true);
    expect(impact.quorumThreshold).toBe(1.0);
    expect(impact.affectedPaths).toHaveLength(2);
  });

  test('assesses Layer 1 impact correctly', () => {
    const impact = assessImpact(['package.json', 'server/routes/agents.ts']);
    expect(impact.tier).toBe(1);
    expect(impact.tierLabel).toBe('Structural');
    expect(impact.blockedFromAutomation).toBe(true);
    expect(impact.requiresHumanApproval).toBe(true);
    expect(impact.quorumThreshold).toBe(0.75);
  });

  test('assesses Layer 2 impact correctly', () => {
    const impact = assessImpact(['server/routes/agents.ts', 'shared/types/agents.ts']);
    expect(impact.tier).toBe(2);
    expect(impact.tierLabel).toBe('Operational');
    expect(impact.blockedFromAutomation).toBe(false);
    expect(impact.requiresHumanApproval).toBe(false);
    expect(impact.quorumThreshold).toBe(0.5);
  });

  test('assesses empty paths as Layer 2', () => {
    const impact = assessImpact([]);
    expect(impact.tier).toBe(2);
    expect(impact.affectedPaths).toHaveLength(0);
  });
});

// ─── Vote evaluation tests ────────────────────────────────────────────────────

describe('governance vote evaluation', () => {
  const makeVotes = (approves: number, rejects: number, abstains: number): GovernanceVoteRecord[] => {
    const votes: GovernanceVoteRecord[] = [];
    for (let i = 0; i < approves; i++) {
      votes.push({ agentId: `agent-a-${i}`, vote: 'approve', reason: '', votedAt: new Date().toISOString() });
    }
    for (let i = 0; i < rejects; i++) {
      votes.push({ agentId: `agent-r-${i}`, vote: 'reject', reason: '', votedAt: new Date().toISOString() });
    }
    for (let i = 0; i < abstains; i++) {
      votes.push({ agentId: `agent-s-${i}`, vote: 'abstain', reason: '', votedAt: new Date().toISOString() });
    }
    return votes;
  };

  test('Layer 0 always fails — no council jurisdiction', () => {
    const result = evaluateVote(0, 5, makeVotes(5, 0, 0), true);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('human-only commits required');
  });

  test('Layer 1 requires 75% supermajority + human approval', () => {
    // 3/4 = 75% — meets threshold
    const result1 = evaluateVote(1, 4, makeVotes(3, 1, 0), false);
    expect(result1.passed).toBe(false);
    expect(result1.awaitingHumanApproval).toBe(true);

    // Same vote with human approval
    const result2 = evaluateVote(1, 4, makeVotes(3, 1, 0), true);
    expect(result2.passed).toBe(true);

    // 2/4 = 50% — below threshold
    const result3 = evaluateVote(1, 4, makeVotes(2, 2, 0));
    expect(result3.passed).toBe(false);
    expect(result3.awaitingHumanApproval).toBe(false);
  });

  test('Layer 2 requires 50% majority, no human approval needed', () => {
    // 3/5 = 60% — meets threshold
    const result1 = evaluateVote(2, 5, makeVotes(3, 2, 0));
    expect(result1.passed).toBe(true);
    expect(result1.awaitingHumanApproval).toBe(false);

    // 2/5 = 40% — below threshold
    const result2 = evaluateVote(2, 5, makeVotes(2, 3, 0));
    expect(result2.passed).toBe(false);
  });

  test('abstentions do not count toward approval ratio', () => {
    // 2 approve, 0 reject, 3 abstain out of 5 total members
    // approvalRatio = 2/5 = 40% (based on total members, not total votes)
    const result = evaluateVote(2, 5, makeVotes(2, 0, 3));
    expect(result.passed).toBe(false);
    expect(result.approvalRatio).toBeCloseTo(0.4);
  });

  test('no members returns failure', () => {
    const result = evaluateVote(2, 0, []);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('No council members');
  });

  test('no votes cast returns failure', () => {
    const result = evaluateVote(2, 5, []);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('No votes cast');
  });
});

// ─── Automation enforcement tests ─────────────────────────────────────────────

describe('automation enforcement', () => {
  test('allows automation for Layer 2 paths', () => {
    const result = checkAutomationAllowed(['server/routes/agents.ts', 'shared/types/agents.ts']);
    expect(result.allowed).toBe(true);
    expect(result.blockedPaths).toHaveLength(0);
  });

  test('blocks automation for Layer 0 paths', () => {
    const result = checkAutomationAllowed(['server/councils/governance.ts']);
    expect(result.allowed).toBe(false);
    expect(result.blockedPaths).toContain('server/councils/governance.ts');
    expect(result.reason).toContain('Constitutional');
  });

  test('blocks automation for Layer 1 paths', () => {
    const result = checkAutomationAllowed(['package.json']);
    expect(result.allowed).toBe(false);
    expect(result.blockedPaths).toContain('package.json');
    expect(result.reason).toContain('Structural');
  });

  test('blocks automation when mixed Layer 0 and Layer 2 paths', () => {
    const result = checkAutomationAllowed([
      'server/routes/agents.ts', // Layer 2
      'server/process/manager.ts', // Layer 0
    ]);
    expect(result.allowed).toBe(false);
    expect(result.tier).toBe(0);
    expect(result.blockedPaths).toContain('server/process/manager.ts');
  });

  test('allows automation for empty paths', () => {
    const result = checkAutomationAllowed([]);
    expect(result.allowed).toBe(true);
  });
});

// ─── Governance tier constants tests ──────────────────────────────────────────

describe('governance tier constants', () => {
  test('Layer 0 is the most restrictive', () => {
    const tier0 = GOVERNANCE_TIERS[0];
    expect(tier0.quorumThreshold).toBe(1.0);
    expect(tier0.requiresHumanApproval).toBe(true);
    expect(tier0.allowsAutomation).toBe(false);
    expect(tier0.label).toBe('Constitutional');
  });

  test('Layer 1 requires supermajority and human approval', () => {
    const tier1 = GOVERNANCE_TIERS[1];
    expect(tier1.quorumThreshold).toBe(0.75);
    expect(tier1.requiresHumanApproval).toBe(true);
    expect(tier1.allowsAutomation).toBe(false);
  });

  test('Layer 2 allows automation with simple majority', () => {
    const tier2 = GOVERNANCE_TIERS[2];
    expect(tier2.quorumThreshold).toBe(0.5);
    expect(tier2.requiresHumanApproval).toBe(false);
    expect(tier2.allowsAutomation).toBe(true);
  });
});

// ─── Database governance vote tests ───────────────────────────────────────────

describe('governance vote DB operations', () => {
  let db: Database;
  const AGENT_IDS = ['agent-1', 'agent-2', 'agent-3'];
  const PROJECT_ID = 'proj-1';

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
    for (const id of AGENT_IDS) {
      db.query(`INSERT INTO agents (id, name, model, system_prompt) VALUES (?, ?, 'test', 'test')`).run(
        id,
        `Agent-${id}`,
      );
    }
    db.query(`INSERT INTO projects (id, name, working_dir) VALUES (?, 'TestProject', '/tmp/test')`).run(PROJECT_ID);
  });

  afterEach(() => {
    db.close();
  });

  test('creates governance vote record', () => {
    const council = createCouncil(db, { name: 'Test Council', agentIds: AGENT_IDS });
    const launch = createCouncilLaunch(db, {
      id: crypto.randomUUID(),
      councilId: council.id,
      projectId: PROJECT_ID,
      prompt: 'Test governance vote',
      voteType: 'governance',
      governanceTier: 1,
    });

    const vote = createGovernanceVote(db, {
      launchId: launch.id,
      governanceTier: 1,
      affectedPaths: ['package.json', 'server/providers/anthropic.ts'],
    });

    expect(vote.governance_tier).toBe(1);
    expect(vote.status).toBe('pending');
    expect(vote.human_approved).toBe(0);
    expect(JSON.parse(vote.affected_paths)).toEqual(['package.json', 'server/providers/anthropic.ts']);
  });

  test('retrieves governance vote by launch ID', () => {
    const council = createCouncil(db, { name: 'Test Council', agentIds: AGENT_IDS });
    const launch = createCouncilLaunch(db, {
      id: crypto.randomUUID(),
      councilId: council.id,
      projectId: PROJECT_ID,
      prompt: 'Test',
      voteType: 'governance',
      governanceTier: 2,
    });

    createGovernanceVote(db, {
      launchId: launch.id,
      governanceTier: 2,
      affectedPaths: ['server/routes/agents.ts'],
    });

    const retrieved = getGovernanceVote(db, launch.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.governance_tier).toBe(2);
  });

  test('casts and retrieves member votes', () => {
    const council = createCouncil(db, { name: 'Test Council', agentIds: AGENT_IDS });
    const launch = createCouncilLaunch(db, {
      id: crypto.randomUUID(),
      councilId: council.id,
      projectId: PROJECT_ID,
      prompt: 'Test',
      voteType: 'governance',
      governanceTier: 2,
    });

    const govVote = createGovernanceVote(db, {
      launchId: launch.id,
      governanceTier: 2,
      affectedPaths: [],
    });

    castGovernanceMemberVote(db, {
      governanceVoteId: govVote.id,
      agentId: 'agent-1',
      vote: 'approve',
      reason: 'Looks good',
    });

    castGovernanceMemberVote(db, {
      governanceVoteId: govVote.id,
      agentId: 'agent-2',
      vote: 'reject',
      reason: 'Too risky',
    });

    const memberVotes = getGovernanceMemberVotes(db, govVote.id);
    expect(memberVotes).toHaveLength(2);
    expect(memberVotes[0].vote).toBe('approve');
    expect(memberVotes[1].vote).toBe('reject');
  });

  test('upserts member votes (one vote per agent)', () => {
    const council = createCouncil(db, { name: 'Test Council', agentIds: AGENT_IDS });
    const launch = createCouncilLaunch(db, {
      id: crypto.randomUUID(),
      councilId: council.id,
      projectId: PROJECT_ID,
      prompt: 'Test',
      voteType: 'governance',
      governanceTier: 2,
    });

    const govVote = createGovernanceVote(db, {
      launchId: launch.id,
      governanceTier: 2,
      affectedPaths: [],
    });

    // First vote
    castGovernanceMemberVote(db, {
      governanceVoteId: govVote.id,
      agentId: 'agent-1',
      vote: 'reject',
    });

    // Changed mind — upsert
    castGovernanceMemberVote(db, {
      governanceVoteId: govVote.id,
      agentId: 'agent-1',
      vote: 'approve',
      reason: 'Changed my mind',
    });

    const memberVotes = getGovernanceMemberVotes(db, govVote.id);
    expect(memberVotes).toHaveLength(1);
    expect(memberVotes[0].vote).toBe('approve');
  });

  test('updates governance vote status', () => {
    const council = createCouncil(db, { name: 'Test Council', agentIds: AGENT_IDS });
    const launch = createCouncilLaunch(db, {
      id: crypto.randomUUID(),
      councilId: council.id,
      projectId: PROJECT_ID,
      prompt: 'Test',
      voteType: 'governance',
      governanceTier: 2,
    });

    const govVote = createGovernanceVote(db, {
      launchId: launch.id,
      governanceTier: 2,
      affectedPaths: [],
    });

    updateGovernanceVoteStatus(db, govVote.id, 'approved', new Date().toISOString());

    const updated = getGovernanceVote(db, launch.id);
    expect(updated!.status).toBe('approved');
    expect(updated!.resolved_at).not.toBeNull();
  });

  test('records human approval', () => {
    const council = createCouncil(db, { name: 'Test Council', agentIds: AGENT_IDS });
    const launch = createCouncilLaunch(db, {
      id: crypto.randomUUID(),
      councilId: council.id,
      projectId: PROJECT_ID,
      prompt: 'Test',
      voteType: 'governance',
      governanceTier: 1,
    });

    const govVote = createGovernanceVote(db, {
      launchId: launch.id,
      governanceTier: 1,
      affectedPaths: ['package.json'],
    });

    approveGovernanceVoteHuman(db, govVote.id, 'human-operator');

    const updated = getGovernanceVote(db, launch.id);
    expect(updated!.human_approved).toBe(1);
    expect(updated!.human_approved_by).toBe('human-operator');
    expect(updated!.human_approved_at).not.toBeNull();
  });

  test('council launch stores vote_type and governance_tier', () => {
    const council = createCouncil(db, { name: 'Test Council', agentIds: AGENT_IDS });
    const launchId = crypto.randomUUID();
    createCouncilLaunch(db, {
      id: launchId,
      councilId: council.id,
      projectId: PROJECT_ID,
      prompt: 'Governance vote test',
      voteType: 'governance',
      governanceTier: 1,
    });

    const row = db.query('SELECT vote_type, governance_tier FROM council_launches WHERE id = ?').get(launchId) as {
      vote_type: string;
      governance_tier: number;
    };
    expect(row.vote_type).toBe('governance');
    expect(row.governance_tier).toBe(1);
  });

  test('standard launch defaults vote_type to standard', () => {
    const council = createCouncil(db, { name: 'Test Council', agentIds: AGENT_IDS });
    const launchId = crypto.randomUUID();
    createCouncilLaunch(db, {
      id: launchId,
      councilId: council.id,
      projectId: PROJECT_ID,
      prompt: 'Standard launch',
    });

    const row = db.query('SELECT vote_type, governance_tier FROM council_launches WHERE id = ?').get(launchId) as {
      vote_type: string;
      governance_tier: number | null;
    };
    expect(row.vote_type).toBe('standard');
    expect(row.governance_tier).toBeNull();
  });

  test('council stores quorum_type and quorum_threshold', () => {
    const council = createCouncil(db, {
      name: 'Custom Quorum Council',
      agentIds: AGENT_IDS,
      quorumType: 'supermajority',
      quorumThreshold: 0.8,
    });

    expect(council.quorumType).toBe('supermajority');
    expect(council.quorumThreshold).toBe(0.8);
  });

  test('council defaults quorum_type to majority', () => {
    const council = createCouncil(db, {
      name: 'Default Quorum Council',
      agentIds: AGENT_IDS,
    });

    expect(council.quorumType).toBe('majority');
    expect(council.quorumThreshold).toBeNull();
  });
});

// ─── Weighted vote evaluation tests ──────────────────────────────────────────

describe('weighted governance vote evaluation', () => {
  const makeWeightedVotes = (
    specs: { vote: 'approve' | 'reject' | 'abstain'; weight: number }[],
  ): WeightedVoteRecord[] => {
    return specs.map((s, i) => ({
      agentId: `agent-${i}`,
      vote: s.vote,
      reason: '',
      votedAt: new Date().toISOString(),
      weight: s.weight,
    }));
  };

  test('Layer 0 always fails regardless of weights', () => {
    const votes = makeWeightedVotes([
      { vote: 'approve', weight: 100 },
      { vote: 'approve', weight: 100 },
    ]);
    const result = evaluateWeightedVote(0, 2, votes, true);
    expect(result.passed).toBe(false);
  });

  test('high-reputation approvers can outvote low-reputation rejectors', () => {
    // Agent 0 (weight 90) approves, agents 1-2 (weight 20 each) reject
    // Weighted: 90 approve / (90+20+20) = 69.2% < 75% → fails Layer 1
    const votes = makeWeightedVotes([
      { vote: 'approve', weight: 90 },
      { vote: 'reject', weight: 20 },
      { vote: 'reject', weight: 20 },
    ]);
    const result = evaluateWeightedVote(1, 3, votes, true);
    expect(result.passed).toBe(false);
    expect(result.weightedApprovalRatio).toBeCloseTo(90 / 130, 2);
  });

  test('weighted majority passes Layer 2 at 50% threshold', () => {
    // Agent 0 (weight 80) approves, Agent 1 (weight 20) rejects
    // Weighted: 80/(80+20) = 80% > 50% → passes
    const votes = makeWeightedVotes([
      { vote: 'approve', weight: 80 },
      { vote: 'reject', weight: 20 },
    ]);
    const result = evaluateWeightedVote(2, 2, votes);
    expect(result.passed).toBe(true);
    expect(result.weightedApprovalRatio).toBeCloseTo(0.8, 2);
  });

  test('weighted minority fails even if unweighted majority', () => {
    // 2 low-weight approvers vs 1 high-weight rejector
    // Unweighted: 2/3 = 66% > 50% → would pass
    // Weighted: (10+10)/(10+10+80) = 20% < 50% → fails
    const votes = makeWeightedVotes([
      { vote: 'approve', weight: 10 },
      { vote: 'approve', weight: 10 },
      { vote: 'reject', weight: 80 },
    ]);
    const result = evaluateWeightedVote(2, 3, votes);
    expect(result.passed).toBe(false);
    expect(result.weightedApprovalRatio).toBeCloseTo(20 / 100, 2);
  });

  test('custom threshold overrides tier default', () => {
    // 2/3 approve (weight 50 each), 1 rejects (weight 50)
    // Weighted: 100/150 = 66.7%
    // Default Layer 2 threshold (50%) → passes
    // Custom threshold 0.7 → fails
    const votes = makeWeightedVotes([
      { vote: 'approve', weight: 50 },
      { vote: 'approve', weight: 50 },
      { vote: 'reject', weight: 50 },
    ]);

    const withDefault = evaluateWeightedVote(2, 3, votes);
    expect(withDefault.passed).toBe(true);

    const withCustom = evaluateWeightedVote(2, 3, votes, false, 0.7);
    expect(withCustom.passed).toBe(false);
  });

  test('abstentions reduce weighted approval ratio', () => {
    // Agent 0 (weight 50) approves, Agent 1 (weight 50) abstains
    // Total weight = 100, approve weight = 50 → 50% exactly
    const votes = makeWeightedVotes([
      { vote: 'approve', weight: 50 },
      { vote: 'abstain', weight: 50 },
    ]);
    const result = evaluateWeightedVote(2, 2, votes);
    expect(result.passed).toBe(true); // 50% meets 50% threshold
    expect(result.weightedApprovalRatio).toBeCloseTo(0.5, 2);
  });

  test('Layer 1 awaits human approval after weighted vote passes', () => {
    const votes = makeWeightedVotes([
      { vote: 'approve', weight: 80 },
      { vote: 'approve', weight: 80 },
      { vote: 'reject', weight: 20 },
    ]);
    const result = evaluateWeightedVote(1, 3, votes, false);
    expect(result.passed).toBe(false);
    expect(result.awaitingHumanApproval).toBe(true);

    const withHuman = evaluateWeightedVote(1, 3, votes, true);
    expect(withHuman.passed).toBe(true);
  });

  test('returns vote weights in result', () => {
    const votes = makeWeightedVotes([
      { vote: 'approve', weight: 90 },
      { vote: 'reject', weight: 30 },
    ]);
    const result = evaluateWeightedVote(2, 2, votes);
    expect(result.voteWeights).toHaveLength(2);
    expect(result.voteWeights[0].weight).toBe(90);
    expect(result.voteWeights[1].weight).toBe(30);
  });

  test('no votes cast returns failure', () => {
    const result = evaluateWeightedVote(2, 5, []);
    expect(result.passed).toBe(false);
    expect(result.weightedApprovalRatio).toBe(0);
  });

  test('no members returns failure', () => {
    const result = evaluateWeightedVote(2, 0, []);
    expect(result.passed).toBe(false);
  });
});

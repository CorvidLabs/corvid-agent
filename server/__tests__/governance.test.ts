import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import {
    classifyPath,
    classifyPaths,
    assessImpact,
    evaluateVote,
    checkAutomationAllowed,
    GOVERNANCE_TIERS,
    type GovernanceVoteRecord,
} from '../councils/governance';
import {
    createCouncil,
    createCouncilLaunch,
    createGovernanceVote,
    getGovernanceVote,
    castGovernanceMemberVote,
    getGovernanceMemberVotes,
    updateGovernanceVoteStatus,
    approveGovernanceVoteHuman,
} from '../db/councils';

// ─── Tier classification tests ────────────────────────────────────────────────

describe('governance tier classification', () => {
    test('classifies Layer 0 (Constitutional) paths by basename', () => {
        expect(classifyPath('server/process/spending.ts')).toBe(0);
        expect(classifyPath('server/process/sdk-process.ts')).toBe(0);
        expect(classifyPath('server/process/manager.ts')).toBe(0);
        expect(classifyPath('server/mcp/sdk-tools.ts')).toBe(0);
        expect(classifyPath('server/mcp/tool-handlers.ts')).toBe(0);
        expect(classifyPath('server/db/schema.ts')).toBe(0);
        expect(classifyPath('server/permissions/broker.ts')).toBe(0);
        expect(classifyPath('server/councils/governance.ts')).toBe(0);
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
        expect(classifyPaths([
            'server/routes/agents.ts',           // Layer 2
            'server/db/migrations/042_foo.ts',   // Layer 1
        ])).toBe(1);

        expect(classifyPaths([
            'server/routes/agents.ts',           // Layer 2
            'server/councils/governance.ts',     // Layer 0
        ])).toBe(0);

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
            'server/routes/agents.ts',           // Layer 2
            'server/process/manager.ts',         // Layer 0
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
            db.query(`INSERT INTO agents (id, name, model, system_prompt) VALUES (?, ?, 'test', 'test')`).run(id, `Agent-${id}`);
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

        const row = db.query('SELECT vote_type, governance_tier FROM council_launches WHERE id = ?').get(launchId) as { vote_type: string; governance_tier: number };
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

        const row = db.query('SELECT vote_type, governance_tier FROM council_launches WHERE id = ?').get(launchId) as { vote_type: string; governance_tier: number | null };
        expect(row.vote_type).toBe('standard');
        expect(row.governance_tier).toBeNull();
    });
});

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import {
    createProposal,
    getProposal,
    listProposals,
    updateProposal,
    updateProposalStatus,
    deleteProposal,
    castProposalVote,
    getProposalVotes,
} from '../db/proposals';
import {
    evaluateProposalQuorum,
    resolveQuorumConfig,
    isValidTransition,
    type GovernanceTier,
} from '../councils/governance';
import { handleProposalRoutes } from '../routes/proposals';

let db: Database;

beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
});

afterEach(() => {
    db.close();
});

// ─── DB layer tests ─────────────────────────────────────────────────────────

describe('governance proposals DB', () => {
    test('creates and retrieves a proposal', () => {
        const proposal = createProposal(db, {
            title: 'Test Proposal',
            description: 'A test governance proposal',
            authorAgentId: 'agent-1',
            governanceTier: 2,
            affectedPaths: ['server/routes/test.ts'],
        });

        expect(proposal.id).toBeDefined();
        expect(proposal.title).toBe('Test Proposal');
        expect(proposal.description).toBe('A test governance proposal');
        expect(proposal.authorAgentId).toBe('agent-1');
        expect(proposal.governanceTier).toBe(2);
        expect(proposal.affectedPaths).toEqual(['server/routes/test.ts']);
        expect(proposal.status).toBe('draft');
        expect(proposal.decision).toBeNull();
        expect(proposal.quorumThreshold).toBeNull();
        expect(proposal.minVoters).toBeNull();

        const fetched = getProposal(db, proposal.id);
        expect(fetched).not.toBeNull();
        expect(fetched!.title).toBe('Test Proposal');
    });

    test('creates proposal with quorum overrides', () => {
        const proposal = createProposal(db, {
            title: 'Custom Quorum',
            authorAgentId: 'agent-1',
            quorumThreshold: 0.8,
            minVoters: 3,
        });

        expect(proposal.quorumThreshold).toBe(0.8);
        expect(proposal.minVoters).toBe(3);
    });

    test('lists proposals with filters', () => {
        createProposal(db, { title: 'P1', authorAgentId: 'agent-1', councilId: 'c1' });
        createProposal(db, { title: 'P2', authorAgentId: 'agent-2', councilId: 'c1' });
        createProposal(db, { title: 'P3', authorAgentId: 'agent-1', councilId: 'c2' });

        const all = listProposals(db);
        expect(all.length).toBe(3);

        const byCouncil = listProposals(db, { councilId: 'c1' });
        expect(byCouncil.length).toBe(2);

        const byAuthor = listProposals(db, { authorAgentId: 'agent-1' });
        expect(byAuthor.length).toBe(2);

        const byStatus = listProposals(db, { status: 'draft' });
        expect(byStatus.length).toBe(3);
    });

    test('updates proposal in draft status', () => {
        const proposal = createProposal(db, { title: 'Original', authorAgentId: 'agent-1' });
        const updated = updateProposal(db, proposal.id, { title: 'Updated', quorumThreshold: 0.6 });

        expect(updated).not.toBeNull();
        expect(updated!.title).toBe('Updated');
        expect(updated!.quorumThreshold).toBe(0.6);
    });

    test('refuses to update non-draft proposal', () => {
        const proposal = createProposal(db, { title: 'Test', authorAgentId: 'agent-1' });
        updateProposalStatus(db, proposal.id, 'open');

        const result = updateProposal(db, proposal.id, { title: 'Changed' });
        expect(result).toBeNull();
    });

    test('deletes draft proposal', () => {
        const proposal = createProposal(db, { title: 'To Delete', authorAgentId: 'agent-1' });
        expect(deleteProposal(db, proposal.id)).toBe(true);
        expect(getProposal(db, proposal.id)).toBeNull();
    });

    test('refuses to delete non-draft proposal', () => {
        const proposal = createProposal(db, { title: 'Open', authorAgentId: 'agent-1' });
        updateProposalStatus(db, proposal.id, 'open');
        expect(deleteProposal(db, proposal.id)).toBe(false);
    });

    test('transitions proposal status', () => {
        const proposal = createProposal(db, { title: 'Lifecycle', authorAgentId: 'agent-1' });

        updateProposalStatus(db, proposal.id, 'open');
        expect(getProposal(db, proposal.id)!.status).toBe('open');

        updateProposalStatus(db, proposal.id, 'voting', { voteStartAt: '2026-01-01T00:00:00Z' });
        const voting = getProposal(db, proposal.id)!;
        expect(voting.status).toBe('voting');
        expect(voting.voteStartAt).toBe('2026-01-01T00:00:00Z');

        updateProposalStatus(db, proposal.id, 'decided', {
            decision: 'approved',
            decidedAt: '2026-01-02T00:00:00Z',
            voteEndAt: '2026-01-02T00:00:00Z',
        });
        const decided = getProposal(db, proposal.id)!;
        expect(decided.status).toBe('decided');
        expect(decided.decision).toBe('approved');
        expect(decided.decidedAt).toBe('2026-01-02T00:00:00Z');

        updateProposalStatus(db, proposal.id, 'enacted', { enactedAt: '2026-01-03T00:00:00Z' });
        expect(getProposal(db, proposal.id)!.status).toBe('enacted');
    });

    test('casts and retrieves proposal votes', () => {
        const proposal = createProposal(db, { title: 'Vote Test', authorAgentId: 'agent-1' });
        updateProposalStatus(db, proposal.id, 'open');
        updateProposalStatus(db, proposal.id, 'voting');

        castProposalVote(db, { proposalId: proposal.id, agentId: 'agent-1', vote: 'approve', weight: 80 });
        castProposalVote(db, { proposalId: proposal.id, agentId: 'agent-2', vote: 'reject', weight: 40 });
        castProposalVote(db, { proposalId: proposal.id, agentId: 'agent-3', vote: 'abstain', weight: 60 });

        const votes = getProposalVotes(db, proposal.id);
        expect(votes.length).toBe(3);
        expect(votes[0].agentId).toBe('agent-1');
        expect(votes[0].vote).toBe('approve');
        expect(votes[0].weight).toBe(80);
    });

    test('upserts proposal vote (update on conflict)', () => {
        const proposal = createProposal(db, { title: 'Upsert', authorAgentId: 'agent-1' });

        castProposalVote(db, { proposalId: proposal.id, agentId: 'agent-1', vote: 'approve', weight: 50 });
        castProposalVote(db, { proposalId: proposal.id, agentId: 'agent-1', vote: 'reject', weight: 50 });

        const votes = getProposalVotes(db, proposal.id);
        expect(votes.length).toBe(1);
        expect(votes[0].vote).toBe('reject');
    });
});

// ─── Quorum evaluation tests ────────────────────────────────────────────────

describe('evaluateProposalQuorum', () => {
    test('Layer 0 always fails', () => {
        const result = evaluateProposalQuorum(
            0 as GovernanceTier,
            [{ vote: 'approve', weight: 100 }],
            { threshold: 0.5, minVoters: 1 },
        );
        expect(result.passed).toBe(false);
        expect(result.reason).toContain('Layer 0');
    });

    test('fails with insufficient voters', () => {
        const result = evaluateProposalQuorum(
            2 as GovernanceTier,
            [{ vote: 'approve', weight: 100 }],
            { threshold: 0.5, minVoters: 3 },
        );
        expect(result.passed).toBe(false);
        expect(result.voterCount).toBe(1);
        expect(result.requiredMinVoters).toBe(3);
        expect(result.reason).toContain('Insufficient voters');
    });

    test('passes with weighted majority at Layer 2', () => {
        const result = evaluateProposalQuorum(
            2 as GovernanceTier,
            [
                { vote: 'approve', weight: 80 },
                { vote: 'approve', weight: 70 },
                { vote: 'reject', weight: 30 },
            ],
            { threshold: 0.5, minVoters: 2 },
        );
        expect(result.passed).toBe(true);
        expect(result.weightedApprovalRatio).toBeGreaterThan(0.5);
    });

    test('fails below threshold', () => {
        const result = evaluateProposalQuorum(
            2 as GovernanceTier,
            [
                { vote: 'approve', weight: 20 },
                { vote: 'reject', weight: 80 },
            ],
            { threshold: 0.5, minVoters: 1 },
        );
        expect(result.passed).toBe(false);
        expect(result.weightedApprovalRatio).toBeLessThan(0.5);
    });

    test('awaits human approval for Layer 1', () => {
        const result = evaluateProposalQuorum(
            1 as GovernanceTier,
            [
                { vote: 'approve', weight: 80 },
                { vote: 'approve', weight: 90 },
            ],
            { threshold: 0.75, minVoters: 1 },
            false,
        );
        expect(result.passed).toBe(false);
        expect(result.awaitingHumanApproval).toBe(true);
    });

    test('passes Layer 1 with human approval', () => {
        const result = evaluateProposalQuorum(
            1 as GovernanceTier,
            [
                { vote: 'approve', weight: 80 },
                { vote: 'approve', weight: 90 },
            ],
            { threshold: 0.75, minVoters: 1 },
            true,
        );
        expect(result.passed).toBe(true);
    });

    test('abstentions excluded from voter count', () => {
        const result = evaluateProposalQuorum(
            2 as GovernanceTier,
            [
                { vote: 'approve', weight: 90 },
                { vote: 'abstain', weight: 50 },
                { vote: 'abstain', weight: 50 },
            ],
            { threshold: 0.5, minVoters: 2 },
        );
        expect(result.passed).toBe(false);
        expect(result.voterCount).toBe(1);
        expect(result.reason).toContain('Insufficient voters');
    });

    test('no votes returns failure', () => {
        const result = evaluateProposalQuorum(
            2 as GovernanceTier,
            [],
            { threshold: 0.5, minVoters: 1 },
        );
        expect(result.passed).toBe(false);
    });
});

// ─── Quorum config resolution ───────────────────────────────────────────────

describe('resolveQuorumConfig', () => {
    test('uses proposal-level overrides first', () => {
        const config = resolveQuorumConfig(2 as GovernanceTier, 0.8, 5, 0.6);
        expect(config.threshold).toBe(0.8);
        expect(config.minVoters).toBe(5);
    });

    test('falls back to council threshold', () => {
        const config = resolveQuorumConfig(2 as GovernanceTier, null, null, 0.6);
        expect(config.threshold).toBe(0.6);
        expect(config.minVoters).toBe(1); // default
    });

    test('falls back to tier default', () => {
        const config = resolveQuorumConfig(1 as GovernanceTier, null, null, null);
        expect(config.threshold).toBe(0.75); // Layer 1 supermajority
        expect(config.minVoters).toBe(1);
    });
});

// ─── Lifecycle transition validation ────────────────────────────────────────

describe('isValidTransition', () => {
    test('allows valid transitions', () => {
        expect(isValidTransition('draft', 'open')).toBe(true);
        expect(isValidTransition('open', 'voting')).toBe(true);
        expect(isValidTransition('open', 'draft')).toBe(true);
        expect(isValidTransition('voting', 'decided')).toBe(true);
        expect(isValidTransition('decided', 'enacted')).toBe(true);
    });

    test('rejects invalid transitions', () => {
        expect(isValidTransition('draft', 'voting')).toBe(false);
        expect(isValidTransition('draft', 'decided')).toBe(false);
        expect(isValidTransition('voting', 'open')).toBe(false);
        expect(isValidTransition('enacted', 'draft')).toBe(false);
        expect(isValidTransition('decided', 'voting')).toBe(false);
    });
});

// ─── Route handler tests ────────────────────────────────────────────────────

describe('proposal route handler', () => {
    test('returns null for non-matching paths', () => {
        const req = new Request('http://localhost/api/agents', { method: 'GET' });
        const url = new URL(req.url);
        const result = handleProposalRoutes(req, url, db);
        expect(result).toBeNull();
    });

    test('creates and lists proposals via routes', async () => {
        // Create
        const createReq = new Request('http://localhost/api/governance/proposals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: 'Route Test',
                authorAgentId: 'agent-1',
                governanceTier: 2,
            }),
        });
        const createRes = await handleProposalRoutes(createReq, new URL(createReq.url), db);
        expect(createRes).not.toBeNull();
        expect(createRes!.status).toBe(201);
        const created = await createRes!.json();
        expect(created.title).toBe('Route Test');

        // List
        const listReq = new Request('http://localhost/api/governance/proposals', { method: 'GET' });
        const listRes = await Promise.resolve(handleProposalRoutes(listReq, new URL(listReq.url), db));
        expect(listRes).not.toBeNull();
        const list = await listRes!.json();
        expect(list.length).toBe(1);
    });

    test('transitions proposal lifecycle via routes', async () => {
        const proposal = createProposal(db, { title: 'Lifecycle', authorAgentId: 'agent-1' });

        // draft → open
        const openReq = new Request(`http://localhost/api/governance/proposals/${proposal.id}/transition`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'open' }),
        });
        const openRes = await handleProposalRoutes(openReq, new URL(openReq.url), db);
        expect(openRes!.status).toBe(200);
        const opened = await openRes!.json();
        expect(opened.status).toBe('open');

        // open → voting
        const voteReq = new Request(`http://localhost/api/governance/proposals/${proposal.id}/transition`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'voting' }),
        });
        const voteRes = await handleProposalRoutes(voteReq, new URL(voteReq.url), db);
        expect(voteRes!.status).toBe(200);

        // Invalid: voting → open
        const invalidReq = new Request(`http://localhost/api/governance/proposals/${proposal.id}/transition`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'open' }),
        });
        const invalidRes = await handleProposalRoutes(invalidReq, new URL(invalidReq.url), db);
        expect(invalidRes!.status).toBe(400);
    });

    test('casts votes and evaluates quorum via routes', async () => {
        const proposal = createProposal(db, {
            title: 'Vote Test',
            authorAgentId: 'agent-1',
            minVoters: 2,
        });
        updateProposalStatus(db, proposal.id, 'open');
        updateProposalStatus(db, proposal.id, 'voting');

        // Cast vote
        const voteReq = new Request(`http://localhost/api/governance/proposals/${proposal.id}/votes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agentId: 'agent-1', vote: 'approve' }),
        });
        const voteRes = await handleProposalRoutes(voteReq, new URL(voteReq.url), db);
        expect(voteRes!.status).toBe(200);
        const voteResult = await voteRes!.json();
        expect(voteResult.ok).toBe(true);
        expect(voteResult.weight).toBe(50); // Default weight (no reputation scorer)

        // Get votes
        const getReq = new Request(`http://localhost/api/governance/proposals/${proposal.id}/votes`, { method: 'GET' });
        const getRes = await handleProposalRoutes(getReq, new URL(getReq.url), db);
        const votesData = await getRes!.json();
        expect(votesData.votes.length).toBe(1);
        expect(votesData.evaluation).toBeDefined();
    });

    test('rejects vote on non-voting proposal', async () => {
        const proposal = createProposal(db, { title: 'Draft', authorAgentId: 'agent-1' });

        const voteReq = new Request(`http://localhost/api/governance/proposals/${proposal.id}/votes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agentId: 'agent-1', vote: 'approve' }),
        });
        const res = await handleProposalRoutes(voteReq, new URL(voteReq.url), db);
        expect(res!.status).toBe(400);
    });

    test('requires decision when transitioning to decided', async () => {
        const proposal = createProposal(db, { title: 'No Decision', authorAgentId: 'agent-1' });
        updateProposalStatus(db, proposal.id, 'open');
        updateProposalStatus(db, proposal.id, 'voting');

        const req = new Request(`http://localhost/api/governance/proposals/${proposal.id}/transition`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'decided' }),
        });
        const res = await handleProposalRoutes(req, new URL(req.url), db);
        expect(res!.status).toBe(400);
        const body = await res!.json();
        expect(body.error).toContain('Decision');
    });

    test('only approved proposals can be enacted', async () => {
        const proposal = createProposal(db, { title: 'Rejected', authorAgentId: 'agent-1' });
        updateProposalStatus(db, proposal.id, 'open');
        updateProposalStatus(db, proposal.id, 'voting');
        updateProposalStatus(db, proposal.id, 'decided', { decision: 'rejected', decidedAt: new Date().toISOString() });

        const req = new Request(`http://localhost/api/governance/proposals/${proposal.id}/transition`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'enacted' }),
        });
        const res = await handleProposalRoutes(req, new URL(req.url), db);
        expect(res!.status).toBe(400);
        const body = await res!.json();
        expect(body.error).toContain('approved');
    });
});

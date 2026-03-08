import type { Database } from 'bun:sqlite';
import type { ReputationScorer } from '../reputation/scorer';
import type { RequestContext } from '../middleware/guards';
import type { ProposalStatus } from '../../shared/types';
import { tenantRoleGuard } from '../middleware/guards';
import {
    parseBodyOrThrow,
    ValidationError,
    CreateProposalSchema,
    UpdateProposalSchema,
    ProposalTransitionSchema,
    ProposalVoteSchema,
} from '../lib/validation';
import { json, handleRouteError } from '../lib/response';
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
import { getCouncil } from '../db/councils';
import {
    evaluateProposalQuorum,
    resolveQuorumConfig,
    isValidTransition,
    type GovernanceTier,
} from '../councils/governance';

// ─── Route handler ────────────────────────────────────────────────────────────

export function handleProposalRoutes(
    req: Request,
    url: URL,
    db: Database,
    context?: RequestContext,
    reputationScorer?: ReputationScorer | null,
): Response | Promise<Response> | null {
    const path = url.pathname;
    const method = req.method;
    const tenantId = context?.tenantId ?? 'default';

    // List proposals
    if (path === '/api/governance/proposals' && method === 'GET') {
        const councilId = url.searchParams.get('councilId') ?? undefined;
        const status = url.searchParams.get('status') as ProposalStatus | undefined;
        const authorAgentId = url.searchParams.get('authorAgentId') ?? undefined;
        return json(listProposals(db, { councilId, status, authorAgentId }, tenantId));
    }

    // Create proposal
    if (path === '/api/governance/proposals' && method === 'POST') {
        if (context) {
            const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
            if (denied) return denied;
        }
        return handleCreateProposal(req, db, tenantId);
    }

    // Single proposal routes
    const proposalMatch = path.match(/^\/api\/governance\/proposals\/([^/]+)(\/(.+))?$/);
    if (!proposalMatch) return null;

    const proposalId = proposalMatch[1];
    const action = proposalMatch[3];

    // GET proposal
    if (!action && method === 'GET') {
        const proposal = getProposal(db, proposalId);
        if (!proposal) return json({ error: 'Not found' }, 404);
        const votes = getProposalVotes(db, proposalId);
        return json({ ...proposal, votes });
    }

    // PUT update proposal (draft only)
    if (!action && method === 'PUT') {
        if (context) {
            const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
            if (denied) return denied;
        }
        return handleUpdateProposal(req, db, proposalId);
    }

    // DELETE proposal (draft only)
    if (!action && method === 'DELETE') {
        if (context) {
            const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
            if (denied) return denied;
        }
        const deleted = deleteProposal(db, proposalId);
        return deleted ? json({ ok: true }) : json({ error: 'Not found or not in draft status' }, 400);
    }

    // POST transition status
    if (action === 'transition' && method === 'POST') {
        if (context) {
            const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
            if (denied) return denied;
        }
        return handleTransition(req, db, proposalId);
    }

    // GET votes
    if (action === 'votes' && method === 'GET') {
        const proposal = getProposal(db, proposalId);
        if (!proposal) return json({ error: 'Not found' }, 404);
        const votes = getProposalVotes(db, proposalId);

        // Also include quorum evaluation
        const council = proposal.councilId ? getCouncil(db, proposal.councilId) : null;
        const quorumConfig = resolveQuorumConfig(
            proposal.governanceTier as GovernanceTier,
            proposal.quorumThreshold,
            proposal.minVoters,
            council?.quorumThreshold ?? null,
        );
        const evaluation = evaluateProposalQuorum(
            proposal.governanceTier as GovernanceTier,
            votes.map((v) => ({ vote: v.vote, weight: v.weight })),
            quorumConfig,
        );

        return json({ votes, evaluation, quorumConfig });
    }

    // POST cast vote
    if (action === 'votes' && method === 'POST') {
        if (context) {
            const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
            if (denied) return denied;
        }
        return handleCastVote(req, db, proposalId, reputationScorer);
    }

    return null;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleCreateProposal(
    req: Request,
    db: Database,
    tenantId: string,
): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, CreateProposalSchema);
        const proposal = createProposal(db, data, tenantId);
        return json(proposal, 201);
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.detail }, 400);
        return handleRouteError(err);
    }
}

async function handleUpdateProposal(
    req: Request,
    db: Database,
    proposalId: string,
): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, UpdateProposalSchema);
        const proposal = updateProposal(db, proposalId, data);
        if (!proposal) return json({ error: 'Not found or not in draft status' }, 400);
        return json(proposal);
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.detail }, 400);
        return handleRouteError(err);
    }
}

async function handleTransition(
    req: Request,
    db: Database,
    proposalId: string,
): Promise<Response> {
    try {
        const body = await parseBodyOrThrow(req, ProposalTransitionSchema);
        const proposal = getProposal(db, proposalId);
        if (!proposal) return json({ error: 'Not found' }, 404);

        if (!isValidTransition(proposal.status, body.status)) {
            return json({
                error: `Invalid transition from '${proposal.status}' to '${body.status}'`,
            }, 400);
        }

        const now = new Date().toISOString();
        const extras: Parameters<typeof updateProposalStatus>[3] = {};

        if (body.status === 'voting') {
            extras.voteStartAt = now;
        }
        if (body.status === 'decided') {
            if (!body.decision) {
                return json({ error: 'Decision (approved/rejected) is required when transitioning to decided' }, 400);
            }
            extras.decision = body.decision;
            extras.decidedAt = now;
            extras.voteEndAt = now;
        }
        if (body.status === 'enacted') {
            if (proposal.decision !== 'approved') {
                return json({ error: 'Only approved proposals can be enacted' }, 400);
            }
            extras.enactedAt = now;
        }

        updateProposalStatus(db, proposalId, body.status, extras);
        const updated = getProposal(db, proposalId);
        return json(updated);
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.detail }, 400);
        return handleRouteError(err);
    }
}

async function handleCastVote(
    req: Request,
    db: Database,
    proposalId: string,
    reputationScorer?: ReputationScorer | null,
): Promise<Response> {
    try {
        const body = await parseBodyOrThrow(req, ProposalVoteSchema);
        const proposal = getProposal(db, proposalId);
        if (!proposal) return json({ error: 'Not found' }, 404);

        if (proposal.status !== 'voting') {
            return json({ error: `Proposal is in '${proposal.status}' status, not accepting votes` }, 400);
        }

        // If council-bound, verify the agent is a member
        if (proposal.councilId) {
            const council = getCouncil(db, proposal.councilId);
            if (council && !council.agentIds.includes(body.agentId)) {
                return json({ error: 'Agent is not a member of the proposal council' }, 403);
            }
        }

        // Resolve reputation weight
        let weight = 50;
        if (reputationScorer) {
            const score = reputationScorer.getCachedScore(body.agentId);
            if (score) weight = score.overallScore;
        }

        castProposalVote(db, {
            proposalId,
            agentId: body.agentId,
            vote: body.vote,
            weight,
            reason: body.reason,
        });

        // Re-evaluate quorum
        const votes = getProposalVotes(db, proposalId);
        const council = proposal.councilId ? getCouncil(db, proposal.councilId) : null;
        const quorumConfig = resolveQuorumConfig(
            proposal.governanceTier as GovernanceTier,
            proposal.quorumThreshold,
            proposal.minVoters,
            council?.quorumThreshold ?? null,
        );
        const evaluation = evaluateProposalQuorum(
            proposal.governanceTier as GovernanceTier,
            votes.map((v) => ({ vote: v.vote, weight: v.weight })),
            quorumConfig,
        );

        return json({
            ok: true,
            vote: body.vote,
            agentId: body.agentId,
            weight,
            evaluation,
        });
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.detail }, 400);
        return handleRouteError(err);
    }
}

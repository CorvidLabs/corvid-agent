/**
 * Governance Proposal API routes.
 *
 * Endpoints:
 *   GET    /api/proposals              — list proposals (filter by councilId, status)
 *   POST   /api/proposals              — create a new proposal (starts as draft)
 *   GET    /api/proposals/:id          — get proposal by ID
 *   PUT    /api/proposals/:id          — update proposal (only in draft/open)
 *   DELETE /api/proposals/:id          — delete proposal (only in draft)
 *   POST   /api/proposals/:id/transition — advance proposal lifecycle
 *   GET    /api/proposals/:id/evaluate — evaluate current vote status
 */

import type { Database } from 'bun:sqlite';
import type { ProposalStatus } from '../../shared/types';
import type { RequestContext } from '../middleware/guards';
import type { ReputationScorer } from '../reputation/scorer';
import { tenantRoleGuard } from '../middleware/guards';
import {
    parseBodyOrThrow,
    ValidationError,
    CreateProposalSchema,
    UpdateProposalSchema,
    TransitionProposalSchema,
} from '../lib/validation';
import { json, handleRouteError } from '../lib/response';
import {
    createProposal,
    getProposal,
    listProposals,
    updateProposal,
    deleteProposal,
    transitionProposal,
} from '../db/proposals';
import { getCouncil } from '../db/councils';
import { getGovernanceVote } from '../db/councils';
import { getGovernanceMemberVotes } from '../db/councils';
import {
    evaluateProposalVote,
    type GovernanceTier,
    type WeightedVoteRecord,
} from '../councils/governance';

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

    // Collection endpoints
    if (path === '/api/proposals' && method === 'GET') {
        const councilId = url.searchParams.get('councilId') ?? undefined;
        const status = (url.searchParams.get('status') as ProposalStatus) ?? undefined;
        return json(listProposals(db, { councilId, status }, tenantId));
    }

    if (path === '/api/proposals' && method === 'POST') {
        if (context) {
            const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
            if (denied) return denied;
        }
        return handleCreate(req, db, tenantId);
    }

    // Single proposal routes
    const match = path.match(/^\/api\/proposals\/([^/]+)(\/(.+))?$/);
    if (!match) return null;

    const id = match[1];
    const action = match[3];

    if (!action) {
        if (method === 'GET') {
            const proposal = getProposal(db, id, tenantId);
            return proposal ? json(proposal) : json({ error: 'Not found' }, 404);
        }
        if (method === 'PUT') {
            if (context) {
                const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
                if (denied) return denied;
            }
            return handleUpdate(req, db, id, tenantId);
        }
        if (method === 'DELETE') {
            if (context) {
                const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
                if (denied) return denied;
            }
            return handleDelete(db, id, tenantId);
        }
    }

    if (action === 'transition' && method === 'POST') {
        if (context) {
            const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
            if (denied) return denied;
        }
        return handleTransition(req, db, id, tenantId);
    }

    if (action === 'evaluate' && method === 'GET') {
        return handleEvaluate(db, id, tenantId, reputationScorer);
    }

    return null;
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async function handleCreate(req: Request, db: Database, tenantId: string): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, CreateProposalSchema);

        // Verify the council exists
        const council = getCouncil(db, data.councilId, tenantId);
        if (!council) return json({ error: 'Council not found' }, 404);

        const proposal = createProposal(db, data, tenantId);
        return json(proposal, 201);
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.detail }, 400);
        return handleRouteError(err);
    }
}

async function handleUpdate(req: Request, db: Database, id: string, tenantId: string): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, UpdateProposalSchema);

        const existing = getProposal(db, id, tenantId);
        if (!existing) return json({ error: 'Not found' }, 404);

        // Can only update proposals in draft or open status
        if (existing.status !== 'draft' && existing.status !== 'open') {
            return json({ error: `Cannot update proposal in '${existing.status}' status` }, 400);
        }

        const proposal = updateProposal(db, id, data, tenantId);
        return proposal ? json(proposal) : json({ error: 'Not found' }, 404);
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.detail }, 400);
        return handleRouteError(err);
    }
}

function handleDelete(db: Database, id: string, tenantId: string): Response {
    const existing = getProposal(db, id, tenantId);
    if (!existing) return json({ error: 'Not found' }, 404);

    if (existing.status !== 'draft') {
        return json({ error: 'Can only delete proposals in draft status' }, 400);
    }

    const deleted = deleteProposal(db, id, tenantId);
    return deleted ? json({ ok: true }) : json({ error: 'Not found' }, 404);
}

async function handleTransition(
    req: Request,
    db: Database,
    id: string,
    tenantId: string,
): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, TransitionProposalSchema);
        const proposal = transitionProposal(db, id, data.status, data.decision ?? null, tenantId);
        return proposal ? json(proposal) : json({ error: 'Not found' }, 404);
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.detail }, 400);
        if (err instanceof Error && err.message.startsWith('Invalid transition')) {
            return json({ error: err.message }, 400);
        }
        return handleRouteError(err);
    }
}

function handleEvaluate(
    db: Database,
    id: string,
    tenantId: string,
    reputationScorer?: ReputationScorer | null,
): Response {
    const proposal = getProposal(db, id, tenantId);
    if (!proposal) return json({ error: 'Not found' }, 404);

    const council = getCouncil(db, proposal.councilId, tenantId);
    if (!council) return json({ error: 'Council not found' }, 404);

    const totalMembers = council.agentIds.length;

    // If proposal has a linked launch with governance votes, use those
    let weightedVotes: WeightedVoteRecord[] = [];
    if (proposal.launchId) {
        const governanceVote = getGovernanceVote(db, proposal.launchId);
        if (governanceVote) {
            const memberVotes = getGovernanceMemberVotes(db, governanceVote.id);
            weightedVotes = memberVotes.map((mv) => {
                let weight = 50;
                if (reputationScorer) {
                    const score = reputationScorer.getCachedScore(mv.agent_id);
                    if (score) weight = score.overallScore;
                }
                return {
                    agentId: mv.agent_id,
                    vote: mv.vote as 'approve' | 'reject' | 'abstain',
                    reason: mv.reason,
                    votedAt: mv.created_at,
                    weight,
                };
            });
        }
    }

    const evaluation = evaluateProposalVote(
        proposal.governanceTier as GovernanceTier,
        totalMembers,
        weightedVotes,
        false, // humanApproved — checked separately
        {
            threshold: proposal.quorumThreshold ?? council.quorumThreshold,
            minimumVoters: proposal.minimumVoters,
        },
    );

    return json({
        proposalId: proposal.id,
        status: proposal.status,
        decision: proposal.decision,
        governanceTier: proposal.governanceTier,
        totalMembers,
        votes: weightedVotes,
        evaluation,
    });
}

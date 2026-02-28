/**
 * Reputation routes — Score queries, event recording, attestation.
 */
import type { Database } from 'bun:sqlite';
import type { ReputationScorer } from '../reputation/scorer';
import type { ReputationAttestation } from '../reputation/attestation';
import { IdentityVerification, type VerificationTier } from '../reputation/identity-verification';
import { json, badRequest, notFound, handleRouteError, safeNumParam } from '../lib/response';
import { parseBodyOrThrow, ValidationError, RecordReputationEventSchema } from '../lib/validation';

const VALID_TIERS: Set<string> = new Set(['UNVERIFIED', 'GITHUB_VERIFIED', 'OWNER_VOUCHED', 'ESTABLISHED']);

export function handleReputationRoutes(
    req: Request,
    url: URL,
    _db: Database,
    scorer?: ReputationScorer | null,
    attestation?: ReputationAttestation | null,
): Response | Promise<Response> | null {
    if (!scorer) {
        if (!url.pathname.startsWith('/api/reputation')) return null;
        return json({ error: 'Reputation service not available' }, 503);
    }

    const path = url.pathname;
    const method = req.method;

    // ─── Scores ──────────────────────────────────────────────────────────────

    // All scores (auto-computes stale)
    if (path === '/api/reputation/scores' && method === 'GET') {
        return json(scorer.computeAllIfStale());
    }

    // Force-recompute all scores
    if (path === '/api/reputation/scores' && method === 'POST') {
        return json(scorer.computeAll());
    }

    // Compute/get score for agent
    const scoreMatch = path.match(/^\/api\/reputation\/scores\/([^/]+)$/);
    if (scoreMatch) {
        const agentId = scoreMatch[1];

        if (method === 'GET') {
            const refresh = url.searchParams.get('refresh') === 'true';
            const score = refresh
                ? scorer.computeScore(agentId)
                : scorer.getCachedScore(agentId) ?? scorer.computeScore(agentId);
            return json(score);
        }

        // Force recompute
        if (method === 'POST') {
            const score = scorer.computeScore(agentId);
            return json(score);
        }
    }

    // ─── Events ──────────────────────────────────────────────────────────────

    // Record event
    if (path === '/api/reputation/events' && method === 'POST') {
        return handleRecordEvent(req, scorer);
    }

    // Get events for agent
    const eventsMatch = path.match(/^\/api\/reputation\/events\/([^/]+)$/);
    if (eventsMatch && method === 'GET') {
        const agentId = eventsMatch[1];
        const limit = safeNumParam(url.searchParams.get('limit'), 50);
        return json(scorer.getEvents(agentId, limit));
    }

    // ─── Attestation ─────────────────────────────────────────────────────────

    // ─── Identity Verification ─────────────────────────────────────────────

    if (path === '/api/reputation/identities' && method === 'GET') {
        const iv = new IdentityVerification(_db);
        return json(iv.getAllIdentities());
    }

    const identityMatch = path.match(/^\/api\/reputation\/identity\/([^/]+)$/);
    if (identityMatch) {
        const agentId = identityMatch[1];
        const iv = new IdentityVerification(_db);

        if (method === 'GET') {
            const identity = iv.getIdentity(agentId);
            return identity ? json(identity) : json({ agentId, tier: 'UNVERIFIED' });
        }

        if (method === 'PUT') {
            return handleSetIdentityTier(req, agentId, iv);
        }
    }

    const attestMatch = path.match(/^\/api\/reputation\/attestation\/([^/]+)$/);
    if (attestMatch) {
        const agentId = attestMatch[1];

        if (method === 'GET') {
            if (!attestation) return json({ error: 'Attestation service not available' }, 503);
            const att = attestation.getAttestation(agentId);
            return att ? json(att) : notFound('No attestation found');
        }

        if (method === 'POST') {
            return handleCreateAttestation(agentId, scorer, attestation);
        }
    }

    return null;
}

async function handleRecordEvent(
    req: Request,
    scorer: ReputationScorer,
): Promise<Response> {
    try {
        const body = await parseBodyOrThrow(req, RecordReputationEventSchema);
        scorer.recordEvent(body);
        return json({ ok: true }, 201);
    } catch (err) {
        if (err instanceof ValidationError) return badRequest(err.detail);
        return handleRouteError(err);
    }
}

async function handleCreateAttestation(
    agentId: string,
    scorer: ReputationScorer,
    attestation?: ReputationAttestation | null,
): Promise<Response> {
    if (!attestation) return json({ error: 'Attestation service not available' }, 503);

    try {
        const score = scorer.computeScore(agentId);
        const hash = await attestation.createAttestation(score);
        return json({ hash, agentId, trustLevel: score.trustLevel }, 201);
    } catch (err) {
        return handleRouteError(err);
    }
}

async function handleSetIdentityTier(
    req: Request,
    agentId: string,
    iv: IdentityVerification,
): Promise<Response> {
    try {
        const body = await req.json() as { tier?: string; dataHash?: string };
        if (!body.tier || !VALID_TIERS.has(body.tier)) {
            return badRequest(`Invalid tier. Must be one of: ${[...VALID_TIERS].join(', ')}`);
        }
        const identity = iv.setTier(agentId, body.tier as VerificationTier, body.dataHash);
        return json(identity);
    } catch (err) {
        return handleRouteError(err);
    }
}

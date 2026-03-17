/**
 * Reputation routes — Score queries, event recording, attestation.
 */
import type { Database } from 'bun:sqlite';
import type { ReputationScorer } from '../reputation/scorer';
import type { ReputationAttestation } from '../reputation/attestation';
import type { RequestContext } from '../middleware/guards';
import { tenantRoleGuard } from '../middleware/guards';
import { IdentityVerification, type VerificationTier } from '../reputation/identity-verification';
import { json, badRequest, notFound, handleRouteError, safeNumParam } from '../lib/response';
import { parseBodyOrThrow, ValidationError, RecordReputationEventSchema, SubmitFeedbackSchema } from '../lib/validation';
import { createLogger } from '../lib/logger';

const feedbackLog = createLogger('FeedbackRoutes');

const VALID_TIERS: Set<string> = new Set(['UNVERIFIED', 'GITHUB_VERIFIED', 'OWNER_VOUCHED', 'ESTABLISHED']);

export function handleReputationRoutes(
    req: Request,
    url: URL,
    _db: Database,
    scorer?: ReputationScorer | null,
    attestation?: ReputationAttestation | null,
    context?: RequestContext,
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

    // ─── Explanation ──────────────────────────────────────────────────────────

    const explainMatch = path.match(/^\/api\/reputation\/explain\/([^/]+)$/);
    if (explainMatch && method === 'GET') {
        const agentId = explainMatch[1];
        return json(scorer.computeExplanation(agentId));
    }

    // ─── Events ──────────────────────────────────────────────────────────────

    // Record event
    if (path === '/api/reputation/events' && method === 'POST') {
        if (context) {
            const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
            if (denied) return denied;
        }
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
            if (context) {
                const denied = tenantRoleGuard('owner')(req, url, context);
                if (denied) return denied;
            }
            return handleSetIdentityTier(req, agentId, iv);
        }
    }

    // ─── Feedback ──────────────────────────────────────────────────────────

    if (path === '/api/reputation/feedback' && method === 'POST') {
        return handleSubmitFeedback(req, _db, scorer);
    }

    const feedbackMatch = path.match(/^\/api\/reputation\/feedback\/([^/]+)$/);
    if (feedbackMatch && method === 'GET') {
        const agentId = feedbackMatch[1];
        const limit = safeNumParam(url.searchParams.get('limit'), 50);
        return handleGetFeedback(agentId, limit, _db);
    }

    // ─── Attestation ─────────────────────────────────────────────────────

    const attestMatch = path.match(/^\/api\/reputation\/attestation\/([^/]+)$/);
    if (attestMatch) {
        const agentId = attestMatch[1];

        if (method === 'GET') {
            if (!attestation) return json({ error: 'Attestation service not available' }, 503);
            const att = attestation.getAttestation(agentId);
            return att ? json(att) : notFound('No attestation found');
        }

        if (method === 'POST') {
            if (context) {
                const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
                if (denied) return denied;
            }
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

// ─── Feedback Handlers ──────────────────────────────────────────────────────

async function handleSubmitFeedback(
    req: Request,
    db: Database,
    scorer: ReputationScorer,
): Promise<Response> {
    try {
        const body = await parseBodyOrThrow(req, SubmitFeedbackSchema);

        // Rate limiting: max 10 feedbacks per submitter per agent per day
        if (body.submittedBy) {
            const row = db.query(`
                SELECT COUNT(*) as count FROM response_feedback
                WHERE submitted_by = ? AND agent_id = ?
                  AND created_at > datetime('now', '-1 day')
            `).get(body.submittedBy, body.agentId) as { count: number };

            if (row.count >= 10) {
                return json({ error: 'Rate limit exceeded: max 10 feedbacks per agent per day' }, 429);
            }
        }

        const id = crypto.randomUUID();

        db.query(`
            INSERT INTO response_feedback (id, agent_id, session_id, source, sentiment, category, comment, submitted_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            id,
            body.agentId,
            body.sessionId ?? null,
            body.source,
            body.sentiment,
            body.category ?? null,
            body.comment ?? null,
            body.submittedBy ?? null,
        );

        // Record reputation event
        const scoreImpact = body.sentiment === 'positive' ? 2 : -2;
        scorer.recordEvent({
            agentId: body.agentId,
            eventType: 'feedback_received',
            scoreImpact,
            metadata: { feedbackId: id, sentiment: body.sentiment, source: body.source },
        });

        feedbackLog.info('Feedback submitted', { id, agentId: body.agentId, sentiment: body.sentiment });
        return json({ ok: true, id }, 201);
    } catch (err) {
        if (err instanceof ValidationError) return badRequest(err.detail);
        return handleRouteError(err);
    }
}

function handleGetFeedback(
    agentId: string,
    limit: number,
    db: Database,
): Response {
    const feedback = db.query(`
        SELECT * FROM response_feedback
        WHERE agent_id = ?
        ORDER BY created_at DESC
        LIMIT ?
    `).all(agentId, limit);

    const aggregate = db.query(`
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN sentiment = 'positive' THEN 1 ELSE 0 END) as positive,
            SUM(CASE WHEN sentiment = 'negative' THEN 1 ELSE 0 END) as negative
        FROM response_feedback
        WHERE agent_id = ?
    `).get(agentId) as { total: number; positive: number; negative: number };

    return json({
        feedback,
        aggregate: {
            positive: aggregate.positive ?? 0,
            negative: aggregate.negative ?? 0,
            total: aggregate.total ?? 0,
        },
    });
}

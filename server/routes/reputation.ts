/**
 * Reputation routes — Score queries, event recording, attestation.
 */
import type { Database } from 'bun:sqlite';
import { createLogger } from '../lib/logger';
import { badRequest, handleRouteError, json, notFound, safeNumParam } from '../lib/response';
import {
  parseBodyOrThrow,
  RecordReputationEventSchema,
  SubmitFeedbackSchema,
  ValidationError,
} from '../lib/validation';
import type { RequestContext } from '../middleware/guards';
import { tenantRoleGuard } from '../middleware/guards';
import { getClientIp } from '../middleware/rate-limit';
import { ActivitySummaryAttestation } from '../reputation/activity-attestation';
import type { ReputationAttestation } from '../reputation/attestation';
import { IdentityVerification, type VerificationTier } from '../reputation/identity-verification';
import type { ReputationScorer } from '../reputation/scorer';

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
        : (scorer.getCachedScore(agentId) ?? scorer.computeScore(agentId));
      return json(score);
    }

    // Force recompute
    if (method === 'POST') {
      const score = scorer.computeScore(agentId);
      return json(score);
    }
  }

  // ─── History ──────────────────────────────────────────────────────────────

  const historyMatch = path.match(/^\/api\/reputation\/history\/([^/]+)$/);
  if (historyMatch && method === 'GET') {
    const agentId = historyMatch[1];
    const days = safeNumParam(url.searchParams.get('days'), 90);
    return json(scorer.getHistory(agentId, days || 90));
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
    const limitParam = safeNumParam(url.searchParams.get('limit'), 50);
    const limit = limitParam === 0 ? 10000 : limitParam;
    return json(scorer.getEvents(agentId, limit));
  }

  // ─── Stats ─────────────────────────────────────────────────────────────

  const statsMatch = path.match(/^\/api\/reputation\/stats\/([^/]+)$/);
  if (statsMatch && method === 'GET') {
    const agentId = statsMatch[1];
    return handleGetStats(agentId, _db);
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

  // ─── Activity Summaries ───────────────────────────────────────────────

  if (path === '/api/reputation/summaries' && method === 'GET') {
    return handleListSummaries(url, _db);
  }

  if (path === '/api/reputation/summaries' && method === 'POST') {
    return handleCreateSummary(req, _db);
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

  // ─── Audit Guide ───────────────────────────────────────────────────────

  if (path === '/api/reputation/audit-guide' && method === 'GET') {
    return json(buildAuditGuide());
  }

  return null;
}

function buildAuditGuide(): AuditGuide {
  return {
    version: '1.0',
    description:
      'CorvidAgent publishes cryptographic attestations on Algorand for every significant agent action. ' +
      'Any external observer can independently verify what agents have done, when, and with what outcome.',
    network: {
      localnet: {
        description: 'Development — Docker-based local Algorand network',
        indexerUrl: 'http://localhost:8980',
      },
      mainnet: { description: 'Production — Algorand mainnet', indexerUrl: 'https://mainnet-idx.algonode.cloud' },
    },
    noteFormats: [
      {
        prefix: 'corvid-reputation',
        format: 'corvid-reputation:{agentId}:{sha256hex}',
        description: 'Reputation score attestation. Published when an agent reputation score is committed on-chain.',
        fields: [
          { name: 'agentId', description: 'Internal agent identifier (UUID or slug)' },
          { name: 'sha256hex', description: 'Full 64-character SHA-256 hex of the payload JSON' },
        ],
        payloadSchema:
          '{ agentId, overallScore, trustLevel, components: { taskCompletion, peerRating, creditPattern, securityCompliance, activityLevel }, computedAt }',
        verifySteps: [
          'Fetch the transaction from the Algorand indexer by txid',
          'Base64-decode the note field',
          'The last 64 characters are the SHA-256 hash',
          'Reconstruct the payload: JSON.stringify({ agentId, overallScore, trustLevel, components, computedAt })',
          'Compute SHA-256 of the payload and compare with the hash in the note',
        ],
      },
      {
        prefix: 'corvid-memory',
        format: 'corvid-memory:{agentId}:{memoryKey}:{hash16}',
        description: 'Memory promotion attestation. Published when a memory is promoted to long-term on-chain storage.',
        fields: [
          { name: 'agentId', description: 'Internal agent identifier' },
          { name: 'memoryKey', description: 'Key of the promoted memory (e.g. feedback-testing)' },
          { name: 'hash16', description: 'First 16 characters of the SHA-256 hash of the promotion payload' },
        ],
        payloadSchema: '{ memoryKey, agentId, promotedAt }',
        verifySteps: [
          'Query indexer for transactions from the agent wallet with note-prefix corvid-memory:',
          'Decode the note to get the memoryKey and hash16',
          'Reconstruct payload: JSON.stringify({ memoryKey, agentId, promotedAt })',
          'Compute SHA-256 and verify the first 16 chars match hash16',
        ],
      },
      {
        prefix: 'corvid-weekly-summary',
        format: 'corvid-weekly-summary:{agentId}:{weekLabel}:{sha256hex}',
        description:
          'Weekly outcome analysis attestation. Published each week summarising sessions, PRs, health, and observations.',
        fields: [
          { name: 'agentId', description: 'Internal agent identifier' },
          { name: 'weekLabel', description: 'ISO week string, e.g. 2026-W17' },
          { name: 'sha256hex', description: 'SHA-256 hash of the weekly summary text' },
        ],
        payloadSchema: 'Plain text summary string (hashed as UTF-8)',
        verifySteps: [
          'Query indexer with note-prefix corvid-weekly-summary: and the wallet address',
          'Decode the note and extract weekLabel and hash',
          'Compute SHA-256 of the summary text and compare',
        ],
      },
      {
        prefix: 'corvid-daily-review',
        format: 'corvid-daily-review:{agentId}:{date}:{sha256hex}',
        description:
          'Daily review attestation. Published each day with execution stats, PR counts, health uptime, and observations.',
        fields: [
          { name: 'agentId', description: 'Internal agent identifier' },
          { name: 'date', description: 'Review date in YYYY-MM-DD format' },
          { name: 'sha256hex', description: 'SHA-256 hash of the daily review summary text' },
        ],
        payloadSchema: 'Plain text summary string (hashed as UTF-8)',
        verifySteps: [
          'Query indexer with note-prefix corvid-daily-review: and the wallet address',
          'Decode the note and extract the date and hash',
          'Compute SHA-256 of the review summary text and compare',
        ],
      },
      {
        prefix: 'arc69-memory',
        format: 'ARC-69 ASA (Asset) with description "corvid-agent memory"',
        description:
          'Long-term memory stored as an Algorand Standard Asset using the ARC-69 metadata standard. ' +
          'Each memory key maps to an on-chain ASA whose note field contains the encrypted memory value.',
        fields: [
          { name: 'assetName', description: 'Memory key used as the ASA name' },
          { name: 'description', description: 'Always "corvid-agent memory" for identification' },
          { name: 'note', description: 'ARC-69 JSON metadata containing the memory value (base64-encoded)' },
        ],
        payloadSchema:
          '{ standard: "arc69", description: "corvid-agent memory", properties: { key, value, updatedAt } }',
        verifySteps: [
          'Query indexer for assets created by the agent wallet with unit-name CMEM',
          'Fetch the latest ARC-69 metadata from the most recent asset configuration transaction',
          'The note field contains base64-encoded ARC-69 JSON with the memory value',
        ],
      },
    ],
    indexerQueries: [
      {
        description: 'Find all reputation attestations for a wallet address',
        method: 'GET',
        path: '/v2/accounts/{walletAddress}/transactions',
        queryParams: { 'note-prefix': Buffer.from('corvid-reputation:').toString('base64') },
        note: 'note-prefix must be URL-encoded base64 of "corvid-reputation:"',
      },
      {
        description: 'Find all memory attestations',
        method: 'GET',
        path: '/v2/accounts/{walletAddress}/transactions',
        queryParams: { 'note-prefix': Buffer.from('corvid-memory:').toString('base64') },
        note: 'note-prefix must be URL-encoded base64 of "corvid-memory:"',
      },
      {
        description: 'Find weekly summary attestations',
        method: 'GET',
        path: '/v2/accounts/{walletAddress}/transactions',
        queryParams: { 'note-prefix': Buffer.from('corvid-weekly-summary:').toString('base64') },
        note: 'note-prefix must be URL-encoded base64 of "corvid-weekly-summary:"',
      },
      {
        description: 'Fetch a specific transaction by txid',
        method: 'GET',
        path: '/v2/transactions/{txid}',
        queryParams: {},
        note: 'Returns the full transaction including the base64-encoded note field',
      },
      {
        description: 'Find ARC-69 memory assets owned by a wallet',
        method: 'GET',
        path: '/v2/accounts/{walletAddress}/assets',
        queryParams: {},
        note: 'Filter by unit-name=CMEM to find corvid-agent memory assets',
      },
    ],
    hashVerification: {
      algorithm: 'SHA-256',
      encoding: 'hex (64 lowercase characters)',
      example:
        'const payload = JSON.stringify({ agentId, overallScore, trustLevel, components, computedAt });\n' +
        'const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));\n' +
        'const hex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");',
    },
    tools: [
      {
        name: 'algosdk',
        url: 'https://developer.algorand.org/docs/sdks/',
        description: 'Official Algorand SDK for Node.js, Python, Go, Java',
      },
      {
        name: 'algokit',
        url: 'https://developer.algorand.org/algokit/',
        description: 'All-in-one Algorand development toolkit',
      },
      {
        name: 'Pera Explorer',
        url: 'https://explorer.perawallet.app/',
        description: 'Algorand mainnet block explorer',
      },
      {
        name: 'DappFlow',
        url: 'https://app.dappflow.org/explorer/home',
        description: 'Algorand explorer with ARC-69 metadata support',
      },
      {
        name: 'AlgoNode Indexer',
        url: 'https://mainnet-idx.algonode.cloud/v2/transactions',
        description: 'Free public Algorand indexer API',
      },
    ],
  };
}

interface AuditGuideNoteFormat {
  prefix: string;
  format: string;
  description: string;
  fields: { name: string; description: string }[];
  payloadSchema: string;
  verifySteps: string[];
}

interface AuditGuideIndexerQuery {
  description: string;
  method: string;
  path: string;
  queryParams: Record<string, string>;
  note: string;
}

interface AuditGuide {
  version: string;
  description: string;
  network: Record<string, { description: string; indexerUrl: string }>;
  noteFormats: AuditGuideNoteFormat[];
  indexerQueries: AuditGuideIndexerQuery[];
  hashVerification: { algorithm: string; encoding: string; example: string };
  tools: { name: string; url: string; description: string }[];
}

async function handleRecordEvent(req: Request, scorer: ReputationScorer): Promise<Response> {
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

async function handleSetIdentityTier(req: Request, agentId: string, iv: IdentityVerification): Promise<Response> {
  try {
    const body = (await req.json()) as { tier?: string; dataHash?: string };
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

async function handleSubmitFeedback(req: Request, db: Database, scorer: ReputationScorer): Promise<Response> {
  try {
    const body = await parseBodyOrThrow(req, SubmitFeedbackSchema);

    // Rate limiting: max 10 feedbacks per submitter per agent per day.
    // For anonymous submissions (null submittedBy), fall back to IP address as rate-limit key.
    const clientIp = getClientIp(req);
    const effectiveSubmitter = body.submittedBy ?? `anon:${clientIp}`;

    const row = db
      .query(`
            SELECT COUNT(*) as count FROM response_feedback
            WHERE submitted_by = ? AND agent_id = ?
              AND created_at > datetime('now', '-1 day')
        `)
      .get(effectiveSubmitter, body.agentId) as { count: number };

    if (row.count >= 10) {
      return json({ error: 'Rate limit exceeded: max 10 feedbacks per agent per day' }, 429);
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
      effectiveSubmitter,
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

function handleGetStats(agentId: string, db: Database): Response {
  // Event counts by type
  const eventCounts = db
    .query(`
        SELECT event_type, COUNT(*) as count, SUM(score_impact) as total_impact
        FROM reputation_events
        WHERE agent_id = ?
        GROUP BY event_type
    `)
    .all(agentId) as { event_type: string; count: number; total_impact: number }[];

  // Feedback breakdown by source
  const feedbackBySource = db
    .query(`
        SELECT source, sentiment, COUNT(*) as count
        FROM response_feedback
        WHERE agent_id = ?
        GROUP BY source, sentiment
    `)
    .all(agentId) as { source: string; sentiment: string; count: number }[];

  // Total feedback aggregate
  const feedbackTotal = db
    .query(`
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN sentiment = 'positive' THEN 1 ELSE 0 END) as positive,
            SUM(CASE WHEN sentiment = 'negative' THEN 1 ELSE 0 END) as negative
        FROM response_feedback
        WHERE agent_id = ?
    `)
    .get(agentId) as { total: number; positive: number; negative: number };

  // Build structured response
  const events: Record<string, { count: number; totalImpact: number }> = {};
  for (const row of eventCounts) {
    events[row.event_type] = { count: row.count, totalImpact: row.total_impact };
  }

  const feedback: Record<string, { positive: number; negative: number }> = {};
  for (const row of feedbackBySource) {
    if (!feedback[row.source]) feedback[row.source] = { positive: 0, negative: 0 };
    feedback[row.source][row.sentiment as 'positive' | 'negative'] = row.count;
  }

  return json({
    agentId,
    events,
    feedback,
    feedbackTotal: {
      positive: feedbackTotal.positive ?? 0,
      negative: feedbackTotal.negative ?? 0,
      total: feedbackTotal.total ?? 0,
    },
  });
}

function handleGetFeedback(agentId: string, limit: number, db: Database): Response {
  const feedback = db
    .query(`
        SELECT * FROM response_feedback
        WHERE agent_id = ?
        ORDER BY created_at DESC
        LIMIT ?
    `)
    .all(agentId, limit);

  const aggregate = db
    .query(`
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN sentiment = 'positive' THEN 1 ELSE 0 END) as positive,
            SUM(CASE WHEN sentiment = 'negative' THEN 1 ELSE 0 END) as negative
        FROM response_feedback
        WHERE agent_id = ?
    `)
    .get(agentId) as { total: number; positive: number; negative: number };

  return json({
    feedback,
    aggregate: {
      positive: aggregate.positive ?? 0,
      negative: aggregate.negative ?? 0,
      total: aggregate.total ?? 0,
    },
  });
}

// ─── Activity Summary Handlers ───────────────────────────────────────────────

function handleListSummaries(url: URL, db: Database): Response {
  try {
    const period = url.searchParams.get('period') ?? undefined;
    const limit = safeNumParam(url.searchParams.get('limit'), 30) || 30;
    const attester = new ActivitySummaryAttestation(db);
    const summaries = attester.listSummaries(period, limit);
    return json(summaries);
  } catch (err) {
    return handleRouteError(err);
  }
}

async function handleCreateSummary(req: Request, db: Database): Promise<Response> {
  try {
    const body = (await req.json().catch(() => ({}))) as { period?: string };
    const period: 'daily' | 'weekly' = body.period === 'weekly' ? 'weekly' : 'daily';
    const attester = new ActivitySummaryAttestation(db);
    const result = await attester.createSummary(period);
    return json({ ok: true, period, ...result }, 201);
  } catch (err) {
    return handleRouteError(err);
  }
}

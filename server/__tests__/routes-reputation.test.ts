import { Database } from 'bun:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { runMigrations } from '../db/schema';
import { ReputationAttestation } from '../reputation/attestation';
import { ReputationScorer } from '../reputation/scorer';
import { handleReputationRoutes } from '../routes/reputation';

let db: Database;
let scorer: ReputationScorer;
let attestation: ReputationAttestation;
let agentId: string;
let projectId: string;

function fakeReq(method: string, path: string, body?: unknown): { req: Request; url: URL } {
  const url = new URL(`http://localhost:3000${path}`);
  const opts: RequestInit = { method };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
    opts.headers = { 'Content-Type': 'application/json' };
  }
  return { req: new Request(url.toString(), opts), url };
}

beforeAll(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);

  // Seed an agent and project for FK constraints
  agentId = crypto.randomUUID();
  projectId = crypto.randomUUID();
  db.query("INSERT INTO agents (id, name) VALUES (?, 'Reputation Agent')").run(agentId);
  db.query("INSERT INTO projects (id, name, working_dir) VALUES (?, 'Test', '/tmp')").run(projectId);

  scorer = new ReputationScorer(db);
  attestation = new ReputationAttestation(db);
});

afterAll(() => db.close());

describe('Reputation Routes', () => {
  // ─── Service unavailable ─────────────────────────────────────────────────

  it('returns 503 when scorer is not available', async () => {
    const { req, url } = fakeReq('GET', '/api/reputation/scores');
    const res = await handleReputationRoutes(req, url, db, undefined, undefined);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(503);
    const data = await res!.json();
    expect(data.error).toContain('Reputation service not available');
  });

  it('returns null for non-reputation paths when service is unavailable', () => {
    const { req, url } = fakeReq('GET', '/api/other');
    const res = handleReputationRoutes(req, url, db, undefined, undefined);
    expect(res).toBeNull();
  });

  // ─── Events ──────────────────────────────────────────────────────────────

  it('POST /api/reputation/events records a valid event', async () => {
    const { req, url } = fakeReq('POST', '/api/reputation/events', {
      agentId,
      eventType: 'task_completed',
      scoreImpact: 10,
      metadata: { taskId: 'task-1' },
    });
    const res = await handleReputationRoutes(req, url, db, scorer, attestation)!;
    expect(res).not.toBeNull();
    expect(res!.status).toBe(201);
    const data = await res!.json();
    expect(data.ok).toBe(true);
  });

  it('POST /api/reputation/events rejects missing agentId', async () => {
    const { req, url } = fakeReq('POST', '/api/reputation/events', {
      eventType: 'task_completed',
      scoreImpact: 5,
    });
    const res = await handleReputationRoutes(req, url, db, scorer, attestation)!;
    expect(res!.status).toBe(400);
    const data = await res!.json();
    expect(data.error).toContain('agentId');
  });

  it('POST /api/reputation/events rejects invalid event type', async () => {
    const { req, url } = fakeReq('POST', '/api/reputation/events', {
      agentId,
      eventType: 'invalid_type',
      scoreImpact: 5,
    });
    const res = await handleReputationRoutes(req, url, db, scorer, attestation)!;
    expect(res!.status).toBe(400);
    const data = await res!.json();
    expect(data.error).toContain('eventType');
  });

  it('POST /api/reputation/events rejects missing scoreImpact', async () => {
    const { req, url } = fakeReq('POST', '/api/reputation/events', {
      agentId,
      eventType: 'task_completed',
    });
    const res = await handleReputationRoutes(req, url, db, scorer, attestation)!;
    expect(res!.status).toBe(400);
    const data = await res!.json();
    expect(data.error).toContain('scoreImpact');
  });

  it('GET /api/reputation/events/:agentId returns events for agent', async () => {
    const { req, url } = fakeReq('GET', `/api/reputation/events/${agentId}`);
    const res = await handleReputationRoutes(req, url, db, scorer, attestation)!;
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThanOrEqual(1);
    expect(data[0].agent_id).toBe(agentId);
    expect(data[0].event_type).toBe('task_completed');
  });

  // ─── Scores ──────────────────────────────────────────────────────────────

  it('GET /api/reputation/scores/:agentId computes and returns score', async () => {
    const { req, url } = fakeReq('GET', `/api/reputation/scores/${agentId}`);
    const res = await handleReputationRoutes(req, url, db, scorer, attestation)!;
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(data.agentId).toBe(agentId);
    expect(typeof data.overallScore).toBe('number');
    expect(data.trustLevel).toBeDefined();
    expect(data.components).toBeDefined();
    expect(typeof data.components.taskCompletion).toBe('number');
    expect(typeof data.components.securityCompliance).toBe('number');
  });

  it('GET /api/reputation/scores returns all scores', async () => {
    const { req, url } = fakeReq('GET', '/api/reputation/scores');
    const res = await handleReputationRoutes(req, url, db, scorer, attestation)!;
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThanOrEqual(1);
    expect(data[0].agentId).toBe(agentId);
  });

  it('POST /api/reputation/scores/:agentId force-recomputes score', async () => {
    const { req, url } = fakeReq('POST', `/api/reputation/scores/${agentId}`);
    const res = await handleReputationRoutes(req, url, db, scorer, attestation)!;
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(data.agentId).toBe(agentId);
    expect(typeof data.overallScore).toBe('number');
  });

  // ─── Feedback ──────────────────────────────────────────────────────────

  it('POST /api/reputation/feedback submits positive feedback', async () => {
    const { req, url } = fakeReq('POST', '/api/reputation/feedback', {
      agentId,
      sentiment: 'positive',
      source: 'api',
    });
    const res = await handleReputationRoutes(req, url, db, scorer, attestation)!;
    expect(res).not.toBeNull();
    expect(res!.status).toBe(201);
    const data = await res!.json();
    expect(data.ok).toBe(true);
    expect(typeof data.id).toBe('string');
  });

  it('POST /api/reputation/feedback submits negative feedback with optional fields', async () => {
    const { req, url } = fakeReq('POST', '/api/reputation/feedback', {
      agentId,
      sentiment: 'negative',
      source: 'discord',
      category: 'inaccurate',
      comment: 'Response was wrong',
      submittedBy: 'user-1',
    });
    const res = await handleReputationRoutes(req, url, db, scorer, attestation)!;
    expect(res).not.toBeNull();
    expect(res!.status).toBe(201);
    const data = await res!.json();
    expect(data.ok).toBe(true);
  });

  it('POST /api/reputation/feedback rejects invalid sentiment', async () => {
    const { req, url } = fakeReq('POST', '/api/reputation/feedback', {
      agentId,
      sentiment: 'neutral',
      source: 'api',
    });
    const res = await handleReputationRoutes(req, url, db, scorer, attestation)!;
    expect(res).not.toBeNull();
    expect(res!.status).toBe(400);
  });

  it('POST /api/reputation/feedback rejects missing agentId', async () => {
    const { req, url } = fakeReq('POST', '/api/reputation/feedback', {
      sentiment: 'positive',
    });
    const res = await handleReputationRoutes(req, url, db, scorer, attestation)!;
    expect(res).not.toBeNull();
    expect(res!.status).toBe(400);
  });

  it('POST /api/reputation/feedback records reputation event', async () => {
    const eventsBefore = scorer.getEvents(agentId);
    const feedbackCountBefore = eventsBefore.filter((e) => e.event_type === 'feedback_received').length;

    const { req, url } = fakeReq('POST', '/api/reputation/feedback', {
      agentId,
      sentiment: 'positive',
    });
    await handleReputationRoutes(req, url, db, scorer, attestation);

    const eventsAfter = scorer.getEvents(agentId);
    const feedbackCountAfter = eventsAfter.filter((e) => e.event_type === 'feedback_received').length;
    expect(feedbackCountAfter).toBe(feedbackCountBefore + 1);
  });

  it('POST /api/reputation/feedback enforces rate limit', async () => {
    const submitter = `rate-limit-test-${crypto.randomUUID()}`;
    // Insert 10 feedbacks directly
    for (let i = 0; i < 10; i++) {
      db.query(
        `INSERT INTO response_feedback (id, agent_id, source, sentiment, submitted_by, created_at)
                 VALUES (?, ?, 'api', 'positive', ?, datetime('now'))`,
      ).run(crypto.randomUUID(), agentId, submitter);
    }

    const { req, url } = fakeReq('POST', '/api/reputation/feedback', {
      agentId,
      sentiment: 'positive',
      source: 'api',
      submittedBy: submitter,
    });
    const res = await handleReputationRoutes(req, url, db, scorer, attestation)!;
    expect(res).not.toBeNull();
    expect(res!.status).toBe(429);
    const data = await res!.json();
    expect(data.error).toContain('Rate limit');
  });

  it('POST /api/reputation/feedback allows feedback without submittedBy (no rate limit check)', async () => {
    const { req, url } = fakeReq('POST', '/api/reputation/feedback', {
      agentId,
      sentiment: 'positive',
    });
    const res = await handleReputationRoutes(req, url, db, scorer, attestation)!;
    expect(res).not.toBeNull();
    expect(res!.status).toBe(201);
  });

  it('GET /api/reputation/feedback/:agentId returns feedback with aggregates', async () => {
    const { req, url } = fakeReq('GET', `/api/reputation/feedback/${agentId}`);
    const res = await handleReputationRoutes(req, url, db, scorer, attestation)!;
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(data.feedback).toBeDefined();
    expect(Array.isArray(data.feedback)).toBe(true);
    expect(data.aggregate).toBeDefined();
    expect(typeof data.aggregate.total).toBe('number');
    expect(typeof data.aggregate.positive).toBe('number');
    expect(typeof data.aggregate.negative).toBe('number');
  });

  it('GET /api/reputation/feedback/:agentId respects limit param', async () => {
    const { req, url } = fakeReq('GET', `/api/reputation/feedback/${agentId}?limit=2`);
    const res = await handleReputationRoutes(req, url, db, scorer, attestation)!;
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(data.feedback.length).toBeLessThanOrEqual(2);
  });

  it('GET /api/reputation/feedback/:agentId returns empty for unknown agent', async () => {
    const { req, url } = fakeReq('GET', '/api/reputation/feedback/nonexistent-agent');
    const res = await handleReputationRoutes(req, url, db, scorer, attestation)!;
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(data.feedback).toEqual([]);
    expect(data.aggregate.total).toBe(0);
  });

  // ─── History ─────────────────────────────────────────────────────────────

  it('GET /api/reputation/history/:agentId returns empty array when no history', async () => {
    const freshId = crypto.randomUUID();
    db.query("INSERT INTO agents (id, name) VALUES (?, 'Fresh')").run(freshId);

    const { req, url } = fakeReq('GET', `/api/reputation/history/${freshId}`);
    const res = await handleReputationRoutes(req, url, db, scorer, attestation)!;
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(0);
  });

  it('GET /api/reputation/history/:agentId returns history after score computation', async () => {
    // Compute a score first so history is recorded
    scorer.computeScore(agentId);

    const { req, url } = fakeReq('GET', `/api/reputation/history/${agentId}`);
    const res = await handleReputationRoutes(req, url, db, scorer, attestation)!;
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(data.length).toBeGreaterThanOrEqual(1);
    expect(data[0].overallScore).toBeDefined();
    expect(data[0].trustLevel).toBeDefined();
    expect(data[0].components).toBeDefined();
    expect(data[0].computedAt).toBeDefined();
  });

  it('GET /api/reputation/history/:agentId respects days param', async () => {
    const { req, url } = fakeReq('GET', `/api/reputation/history/${agentId}?days=30`);
    const res = await handleReputationRoutes(req, url, db, scorer, attestation)!;
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(Array.isArray(data)).toBe(true);
  });

  // ─── Explain ─────────────────────────────────────────────────────────────

  it('GET /api/reputation/explain/:agentId returns detailed explanation', async () => {
    const { req, url } = fakeReq('GET', `/api/reputation/explain/${agentId}`);
    const res = await handleReputationRoutes(req, url, db, scorer, attestation)!;
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(data.agentId).toBe(agentId);
    expect(typeof data.overallScore).toBe('number');
    expect(typeof data.decayFactor).toBe('number');
    expect(typeof data.rawScore).toBe('number');
    expect(Array.isArray(data.components)).toBe(true);
    expect(data.components).toHaveLength(5);

    const comp = data.components[0];
    expect(typeof comp.component).toBe('string');
    expect(typeof comp.score).toBe('number');
    expect(typeof comp.weight).toBe('number');
    expect(typeof comp.weightedContribution).toBe('number');
    expect(typeof comp.isDefault).toBe('boolean');
    expect(typeof comp.reason).toBe('string');
    expect(comp.evidence).toBeDefined();
    expect(Array.isArray(comp.recentEvents)).toBe(true);
  });

  it('GET /api/reputation/explain/:agentId marks defaults correctly', async () => {
    // Create a fresh agent with no activity
    const freshId = crypto.randomUUID();
    db.query("INSERT INTO agents (id, name) VALUES (?, 'Fresh Agent')").run(freshId);

    const { req, url } = fakeReq('GET', `/api/reputation/explain/${freshId}`);
    const res = await handleReputationRoutes(req, url, db, scorer, attestation)!;
    const data = await res!.json();

    const tc = data.components.find((c: { component: string }) => c.component === 'taskCompletion');
    expect(tc.isDefault).toBe(true);
    expect(tc.reason).toContain('No tasks');

    const pr = data.components.find((c: { component: string }) => c.component === 'peerRating');
    expect(pr.isDefault).toBe(true);

    const al = data.components.find((c: { component: string }) => c.component === 'activityLevel');
    expect(al.isDefault).toBe(false);
    expect(al.score).toBe(0);
  });

  // ─── Stats ─────────────────────────────────────────────────────────────

  it('GET /api/reputation/stats/:agentId returns aggregated stats', async () => {
    const { req, url } = fakeReq('GET', `/api/reputation/stats/${agentId}`);
    const res = await handleReputationRoutes(req, url, db, scorer, attestation)!;
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(data.agentId).toBe(agentId);
    expect(data.events).toBeDefined();
    expect(data.feedback).toBeDefined();
    expect(data.feedbackTotal).toBeDefined();
    expect(typeof data.feedbackTotal.positive).toBe('number');
    expect(typeof data.feedbackTotal.negative).toBe('number');
    expect(typeof data.feedbackTotal.total).toBe('number');
  });

  it('GET /api/reputation/stats/:agentId includes event type counts', async () => {
    const { req, url } = fakeReq('GET', `/api/reputation/stats/${agentId}`);
    const res = await handleReputationRoutes(req, url, db, scorer, attestation)!;
    const data = await res!.json();
    // We recorded task_completed events earlier in the test
    expect(data.events.task_completed).toBeDefined();
    expect(data.events.task_completed.count).toBeGreaterThanOrEqual(1);
    expect(typeof data.events.task_completed.totalImpact).toBe('number');
  });

  it('GET /api/reputation/stats/:agentId includes feedback by source', async () => {
    const { req, url } = fakeReq('GET', `/api/reputation/stats/${agentId}`);
    const res = await handleReputationRoutes(req, url, db, scorer, attestation)!;
    const data = await res!.json();
    // We submitted feedback from 'api' and 'discord' sources earlier
    expect(data.feedbackTotal.total).toBeGreaterThanOrEqual(2);
  });

  it('GET /api/reputation/stats/:agentId returns empty for unknown agent', async () => {
    const { req, url } = fakeReq('GET', '/api/reputation/stats/nonexistent-agent');
    const res = await handleReputationRoutes(req, url, db, scorer, attestation)!;
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(data.agentId).toBe('nonexistent-agent');
    expect(Object.keys(data.events)).toHaveLength(0);
    expect(data.feedbackTotal.total).toBe(0);
  });

  // ─── Unmatched path ──────────────────────────────────────────────────────

  it('returns null for unmatched paths', () => {
    const { req, url } = fakeReq('GET', '/api/other');
    const res = handleReputationRoutes(req, url, db, scorer, attestation);
    expect(res).toBeNull();
  });
});

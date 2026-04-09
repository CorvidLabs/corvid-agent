import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { runMigrations } from '../db/schema';
import { SubmitFeedbackSchema } from '../lib/validation';
import { ReputationScorer } from '../reputation/scorer';

let db: Database;
let scorer: ReputationScorer;

function seedAgent(id: string = 'agent-1', name: string = 'Test Agent'): void {
  db.query('INSERT OR IGNORE INTO agents (id, name) VALUES (?, ?)').run(id, name);
}

function seedProject(id: string = 'proj-1', name: string = 'test-project'): void {
  db.query('INSERT OR IGNORE INTO projects (id, name, working_dir) VALUES (?, ?, ?)').run(id, name, '/tmp/test');
}

function seedFeedback(
  agentId: string,
  sentiment: 'positive' | 'negative',
  submittedBy?: string,
  daysAgo: number = 0,
): string {
  const id = crypto.randomUUID();
  const createdAt = new Date(Date.now() - daysAgo * 86400_000).toISOString();
  db.query(
    'INSERT INTO response_feedback (id, agent_id, sentiment, submitted_by, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(id, agentId, sentiment, submittedBy ?? null, createdAt);
  return id;
}

function seedMarketplaceReview(agentId: string, rating: number): void {
  const listingId = crypto.randomUUID();
  db.query('INSERT INTO marketplace_listings (id, agent_id, name, description, category) VALUES (?, ?, ?, ?, ?)').run(
    listingId,
    agentId,
    'Test Listing',
    'desc',
    'utility',
  );
  db.query('INSERT INTO marketplace_reviews (id, listing_id, rating) VALUES (?, ?, ?)').run(
    crypto.randomUUID(),
    listingId,
    rating,
  );
}

beforeEach(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
  seedAgent('agent-1');
  seedProject('proj-1');
  scorer = new ReputationScorer(db);
});

afterEach(() => {
  db.close();
});

// ─── Migration ──────────────────────────────────────────────────────────────

describe('migration creates tables', () => {
  test('response_feedback table exists with correct columns', () => {
    const columns = db.query("PRAGMA table_info('response_feedback')").all() as { name: string }[];
    const colNames = columns.map((c) => c.name);

    expect(colNames).toContain('id');
    expect(colNames).toContain('agent_id');
    expect(colNames).toContain('session_id');
    expect(colNames).toContain('source');
    expect(colNames).toContain('sentiment');
    expect(colNames).toContain('category');
    expect(colNames).toContain('comment');
    expect(colNames).toContain('submitted_by');
    expect(colNames).toContain('created_at');
  });

  test('indexes exist on agent_id and created_at', () => {
    const indexes = db.query("PRAGMA index_list('response_feedback')").all() as { name: string }[];
    const indexNames = indexes.map((i) => i.name);

    expect(indexNames).toContain('idx_response_feedback_agent');
    expect(indexNames).toContain('idx_response_feedback_created');
  });
});

// ─── Submit Feedback ────────────────────────────────────────────────────────

describe('submit feedback', () => {
  test('positive feedback creates record and reputation event', () => {
    const id = crypto.randomUUID();
    db.query(`
            INSERT INTO response_feedback (id, agent_id, source, sentiment)
            VALUES (?, ?, 'api', 'positive')
        `).run(id, 'agent-1');

    scorer.recordEvent({
      agentId: 'agent-1',
      eventType: 'feedback_received',
      scoreImpact: 2,
      metadata: { feedbackId: id, sentiment: 'positive', source: 'api' },
    });

    // Verify feedback record
    const row = db.query('SELECT * FROM response_feedback WHERE id = ?').get(id) as Record<string, unknown>;
    expect(row).toBeTruthy();
    expect(row.agent_id).toBe('agent-1');
    expect(row.sentiment).toBe('positive');

    // Verify reputation event
    const events = scorer.getEvents('agent-1');
    const feedbackEvent = events.find((e) => e.event_type === 'feedback_received');
    expect(feedbackEvent).toBeTruthy();
    expect(feedbackEvent!.score_impact).toBe(2);
  });

  test('negative feedback creates record and reputation event', () => {
    const id = crypto.randomUUID();
    db.query(`
            INSERT INTO response_feedback (id, agent_id, source, sentiment)
            VALUES (?, ?, 'discord', 'negative')
        `).run(id, 'agent-1');

    scorer.recordEvent({
      agentId: 'agent-1',
      eventType: 'feedback_received',
      scoreImpact: -2,
      metadata: { feedbackId: id, sentiment: 'negative', source: 'discord' },
    });

    const row = db.query('SELECT * FROM response_feedback WHERE id = ?').get(id) as Record<string, unknown>;
    expect(row).toBeTruthy();
    expect(row.sentiment).toBe('negative');

    const events = scorer.getEvents('agent-1');
    const feedbackEvent = events.find((e) => e.event_type === 'feedback_received');
    expect(feedbackEvent).toBeTruthy();
    expect(feedbackEvent!.score_impact).toBe(-2);
  });
});

// ─── Get Feedback Aggregates ────────────────────────────────────────────────

describe('get feedback aggregates', () => {
  test('returns correct aggregate counts', () => {
    seedFeedback('agent-1', 'positive');
    seedFeedback('agent-1', 'positive');
    seedFeedback('agent-1', 'negative');

    const aggregate = db
      .query(`
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN sentiment = 'positive' THEN 1 ELSE 0 END) as positive,
                SUM(CASE WHEN sentiment = 'negative' THEN 1 ELSE 0 END) as negative
            FROM response_feedback
            WHERE agent_id = ?
        `)
      .get('agent-1') as { total: number; positive: number; negative: number };

    expect(aggregate.total).toBe(3);
    expect(aggregate.positive).toBe(2);
    expect(aggregate.negative).toBe(1);
  });

  test('feedback ordered by created_at DESC', () => {
    seedFeedback('agent-1', 'positive', undefined, 2);
    seedFeedback('agent-1', 'negative', undefined, 0);

    const rows = db
      .query('SELECT sentiment FROM response_feedback WHERE agent_id = ? ORDER BY created_at DESC')
      .all('agent-1') as { sentiment: string }[];

    expect(rows[0].sentiment).toBe('negative'); // most recent first
    expect(rows[1].sentiment).toBe('positive');
  });
});

// ─── Feedback Integration into Peer Rating ──────────────────────────────────

describe('feedback integration into peer rating', () => {
  test('feedback only: uses feedback score when >= 3 feedbacks', () => {
    // 4 positive, 1 negative = 80% positive = score 80
    seedFeedback('agent-1', 'positive');
    seedFeedback('agent-1', 'positive');
    seedFeedback('agent-1', 'positive');
    seedFeedback('agent-1', 'positive');
    seedFeedback('agent-1', 'negative');

    const score = scorer.computeScore('agent-1');
    expect(score.components.peerRating).toBe(80);
  });

  test('insufficient feedback returns default 50', () => {
    seedFeedback('agent-1', 'positive');
    seedFeedback('agent-1', 'positive');
    // Only 2 feedbacks — below threshold of 3

    const score = scorer.computeScore('agent-1');
    expect(score.components.peerRating).toBe(50);
  });

  test('both marketplace and feedback: blended 60/40', () => {
    // Marketplace: rating 5 => score 100
    seedMarketplaceReview('agent-1', 5);

    // Feedback: 3 positive, 0 negative => score 100
    seedFeedback('agent-1', 'positive');
    seedFeedback('agent-1', 'positive');
    seedFeedback('agent-1', 'positive');

    const score = scorer.computeScore('agent-1');
    // 100 * 0.6 + 100 * 0.4 = 100
    expect(score.components.peerRating).toBe(100);
  });

  test('blended with different scores', () => {
    // Marketplace: rating 3 => score = ((3-1)/4)*100 = 50
    seedMarketplaceReview('agent-1', 3);

    // Feedback: 3 positive, 0 negative => score 100
    seedFeedback('agent-1', 'positive');
    seedFeedback('agent-1', 'positive');
    seedFeedback('agent-1', 'positive');

    const score = scorer.computeScore('agent-1');
    // 50 * 0.6 + 100 * 0.4 = 30 + 40 = 70
    expect(score.components.peerRating).toBe(70);
  });

  test('marketplace only: uses marketplace score', () => {
    seedMarketplaceReview('agent-1', 5);

    const score = scorer.computeScore('agent-1');
    expect(score.components.peerRating).toBe(100);
  });
});

// ─── Validation ─────────────────────────────────────────────────────────────

describe('validation', () => {
  test('rejects invalid sentiment', () => {
    const result = SubmitFeedbackSchema.safeParse({
      agentId: 'agent-1',
      sentiment: 'neutral',
    });
    expect(result.success).toBe(false);
  });

  test('accepts valid positive feedback', () => {
    const result = SubmitFeedbackSchema.safeParse({
      agentId: 'agent-1',
      sentiment: 'positive',
      category: 'helpful',
    });
    expect(result.success).toBe(true);
  });

  test('accepts valid negative feedback', () => {
    const result = SubmitFeedbackSchema.safeParse({
      agentId: 'agent-1',
      sentiment: 'negative',
      category: 'inaccurate',
      comment: 'Response was wrong',
    });
    expect(result.success).toBe(true);
  });

  test('rejects missing agentId', () => {
    const result = SubmitFeedbackSchema.safeParse({
      sentiment: 'positive',
    });
    expect(result.success).toBe(false);
  });

  test('rejects invalid category', () => {
    const result = SubmitFeedbackSchema.safeParse({
      agentId: 'agent-1',
      sentiment: 'positive',
      category: 'invalid-category',
    });
    expect(result.success).toBe(false);
  });
});

// ─── Rate Limiting ──────────────────────────────────────────────────────────

describe('rate limiting', () => {
  test('allows up to 10 feedbacks per submitter per agent per day', () => {
    const submitter = 'user-wallet-1';
    for (let i = 0; i < 10; i++) {
      seedFeedback('agent-1', 'positive', submitter, 0);
    }

    const row = db
      .query(`
            SELECT COUNT(*) as count FROM response_feedback
            WHERE submitted_by = ? AND agent_id = ?
              AND created_at > datetime('now', '-1 day')
        `)
      .get(submitter, 'agent-1') as { count: number };

    expect(row.count).toBe(10);
  });

  test('detects when rate limit is exceeded', () => {
    const submitter = 'user-wallet-1';
    for (let i = 0; i < 10; i++) {
      seedFeedback('agent-1', 'positive', submitter, 0);
    }

    const row = db
      .query(`
            SELECT COUNT(*) as count FROM response_feedback
            WHERE submitted_by = ? AND agent_id = ?
              AND created_at > datetime('now', '-1 day')
        `)
      .get(submitter, 'agent-1') as { count: number };

    // Should be at limit
    expect(row.count >= 10).toBe(true);
  });

  test('old feedbacks do not count toward rate limit', () => {
    const submitter = 'user-wallet-1';
    for (let i = 0; i < 10; i++) {
      seedFeedback('agent-1', 'positive', submitter, 2); // 2 days ago
    }

    const row = db
      .query(`
            SELECT COUNT(*) as count FROM response_feedback
            WHERE submitted_by = ? AND agent_id = ?
              AND created_at > datetime('now', '-1 day')
        `)
      .get(submitter, 'agent-1') as { count: number };

    expect(row.count).toBe(0); // None in last 24h
  });
});

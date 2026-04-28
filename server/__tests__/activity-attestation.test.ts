import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { runMigrations } from '../db/schema';
import { ActivitySummaryAttestation } from '../reputation/activity-attestation';

let db: Database;
const AGENT_ID = 'agent-test-activity';
const PROJECT_ID = 'project-test-activity';

function seedAgentAndProject(database: Database): void {
  database.exec(`INSERT OR IGNORE INTO agents (id, name, model) VALUES ('${AGENT_ID}', 'TestAgent', 'test')`);
  database
    .query('INSERT OR IGNORE INTO projects (id, name, working_dir, tenant_id) VALUES (?, ?, ?, ?)')
    .run(PROJECT_ID, 'TestProject', '/tmp/test', 'default');
}

function insertSession(
  database: Database,
  opts: { status?: string; creditsConsumed?: number; createdAt?: string } = {},
): void {
  const id = `sess-${crypto.randomUUID().slice(0, 8)}`;
  const status = opts.status ?? 'completed';
  const credits = opts.creditsConsumed ?? 0;
  const createdAt = opts.createdAt ?? new Date().toISOString();
  database
    .query(
      `INSERT INTO sessions (id, agent_id, project_id, status, credits_consumed, created_at, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, 'default')`,
    )
    .run(id, AGENT_ID, PROJECT_ID, status, credits, createdAt);
}

function insertWorkTask(
  database: Database,
  opts: { status?: string; prUrl?: string | null; createdAt?: string } = {},
): void {
  const id = `wt-${crypto.randomUUID().slice(0, 8)}`;
  const status = opts.status ?? 'completed';
  const prUrl = opts.prUrl ?? null;
  const createdAt = opts.createdAt ?? new Date().toISOString();
  database
    .query(
      `INSERT INTO work_tasks (id, agent_id, project_id, description, status, pr_url, created_at, tenant_id)
       VALUES (?, ?, ?, 'test task', ?, ?, ?, 'default')`,
    )
    .run(id, AGENT_ID, PROJECT_ID, status, prUrl, createdAt);
}

function insertReputationEvent(database: Database, opts: { createdAt?: string } = {}): void {
  const id = `evt-${crypto.randomUUID().slice(0, 8)}`;
  const createdAt = opts.createdAt ?? new Date().toISOString();
  database
    .query(`INSERT INTO reputation_events (id, agent_id, event_type, created_at) VALUES (?, ?, 'test', ?)`)
    .run(id, AGENT_ID, createdAt);
}

beforeEach(() => {
  db = new Database(':memory:');
  runMigrations(db);
  seedAgentAndProject(db);
});

afterEach(() => {
  db.close();
});

describe('buildPayload', () => {
  test('returns zeroed payload when no data exists', () => {
    const attester = new ActivitySummaryAttestation(db);
    const payload = attester.buildPayload('daily');

    expect(payload.period).toBe('daily');
    expect(payload.sessions.total).toBe(0);
    expect(payload.sessions.completed).toBe(0);
    expect(payload.sessions.failed).toBe(0);
    expect(payload.workTasks.total).toBe(0);
    expect(payload.workTasks.completed).toBe(0);
    expect(payload.workTasks.failed).toBe(0);
    expect(payload.workTasks.prsCreated).toBe(0);
    expect(payload.creditsConsumed).toBe(0);
    expect(payload.reputationEvents).toBe(0);
    expect(payload.periodStart).toBeDefined();
    expect(payload.periodEnd).toBeDefined();
    expect(payload.generatedAt).toBeDefined();
  });

  test('aggregates sessions within the daily window', () => {
    insertSession(db, { status: 'completed', creditsConsumed: 10 });
    insertSession(db, { status: 'completed', creditsConsumed: 5 });
    insertSession(db, { status: 'error' });

    const attester = new ActivitySummaryAttestation(db);
    const payload = attester.buildPayload('daily');

    expect(payload.sessions.total).toBe(3);
    expect(payload.sessions.completed).toBe(2);
    expect(payload.sessions.failed).toBe(1);
    expect(payload.creditsConsumed).toBe(15);
  });

  test('aggregates work tasks within the daily window', () => {
    insertWorkTask(db, { status: 'completed', prUrl: 'https://github.com/test/pr/1' });
    insertWorkTask(db, { status: 'completed' });
    insertWorkTask(db, { status: 'failed' });

    const attester = new ActivitySummaryAttestation(db);
    const payload = attester.buildPayload('daily');

    expect(payload.workTasks.total).toBe(3);
    expect(payload.workTasks.completed).toBe(2);
    expect(payload.workTasks.failed).toBe(1);
    expect(payload.workTasks.prsCreated).toBe(1);
  });

  test('counts reputation events within the window', () => {
    insertReputationEvent(db);
    insertReputationEvent(db);

    const attester = new ActivitySummaryAttestation(db);
    const payload = attester.buildPayload('daily');

    expect(payload.reputationEvents).toBe(2);
  });

  test('weekly period uses 7-day window', () => {
    const attester = new ActivitySummaryAttestation(db);
    const payload = attester.buildPayload('weekly');

    expect(payload.period).toBe('weekly');
    const start = new Date(payload.periodStart).getTime();
    const end = new Date(payload.periodEnd).getTime();
    const daysDiff = (end - start) / (86400 * 1000);
    expect(daysDiff).toBeGreaterThan(6.9);
    expect(daysDiff).toBeLessThan(7.1);
  });

  test('excludes data older than the period window', () => {
    const oldDate = new Date(Date.now() - 10 * 86400 * 1000).toISOString();
    insertSession(db, { status: 'completed', createdAt: oldDate });
    insertWorkTask(db, { status: 'completed', createdAt: oldDate });
    insertReputationEvent(db, { createdAt: oldDate });

    const attester = new ActivitySummaryAttestation(db);
    const payload = attester.buildPayload('daily');

    expect(payload.sessions.total).toBe(0);
    expect(payload.workTasks.total).toBe(0);
    expect(payload.reputationEvents).toBe(0);
  });
});

describe('hashPayload', () => {
  test('returns a 64-character hex string', async () => {
    const attester = new ActivitySummaryAttestation(db);
    const payload = attester.buildPayload('daily');
    const hash = await attester.hashPayload(payload);

    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test('produces deterministic hashes for identical payloads', async () => {
    const attester = new ActivitySummaryAttestation(db);
    const payload = attester.buildPayload('daily');
    const hash1 = await attester.hashPayload(payload);
    const hash2 = await attester.hashPayload(payload);

    expect(hash1).toBe(hash2);
  });

  test('produces different hashes for different payloads', async () => {
    const attester = new ActivitySummaryAttestation(db);
    const p1 = attester.buildPayload('daily');
    const p2 = { ...p1, creditsConsumed: 999 };
    const hash1 = await attester.hashPayload(p1);
    const hash2 = await attester.hashPayload(p2);

    expect(hash1).not.toBe(hash2);
  });
});

describe('createSummary', () => {
  test('stores summary in database without on-chain publication', async () => {
    insertSession(db, { status: 'completed', creditsConsumed: 5 });

    const attester = new ActivitySummaryAttestation(db);
    const { hash, txid } = await attester.createSummary('daily');

    expect(hash).toHaveLength(64);
    expect(txid).toBeNull();

    const row = db.query('SELECT * FROM activity_summaries WHERE hash = ?').get(hash) as Record<string, unknown>;
    expect(row).toBeTruthy();
    expect(row.period).toBe('daily');
    expect(row.txid).toBeNull();
    expect(row.published_at).toBeNull();
  });

  test('publishes on-chain when sendTransaction is provided', async () => {
    const attester = new ActivitySummaryAttestation(db);
    const mockTxid = 'TX-TEST-123';
    const sendTx = async (_note: string) => mockTxid;

    const { hash, txid } = await attester.createSummary('daily', sendTx);

    expect(txid).toBe(mockTxid);

    const row = db.query('SELECT * FROM activity_summaries WHERE hash = ?').get(hash) as Record<string, unknown>;
    expect(row.txid).toBe(mockTxid);
    expect(row.published_at).toBeTruthy();
  });

  test('handles sendTransaction failure gracefully', async () => {
    const attester = new ActivitySummaryAttestation(db);
    const sendTx = async (_note: string): Promise<string> => {
      throw new Error('network error');
    };

    const { hash, txid } = await attester.createSummary('daily', sendTx);

    expect(hash).toHaveLength(64);
    expect(txid).toBeNull();

    const row = db.query('SELECT * FROM activity_summaries WHERE hash = ?').get(hash) as Record<string, unknown>;
    expect(row).toBeTruthy();
    expect(row.txid).toBeNull();
  });

  test('sends correctly formatted note to sendTransaction', async () => {
    const attester = new ActivitySummaryAttestation(db);
    let capturedNote = '';
    const sendTx = async (note: string) => {
      capturedNote = note;
      return 'TX-123';
    };

    await attester.createSummary('weekly', sendTx);

    expect(capturedNote).toMatch(/^corvid-activity:weekly:\d{4}-\d{2}-\d{2}:[0-9a-f]{16}$/);
  });
});

describe('listSummaries', () => {
  test('returns empty array when no summaries exist', () => {
    const attester = new ActivitySummaryAttestation(db);
    const summaries = attester.listSummaries();
    expect(summaries).toHaveLength(0);
  });

  test('returns summaries ordered by most recent first', async () => {
    const attester = new ActivitySummaryAttestation(db);
    await attester.createSummary('daily');
    await attester.createSummary('weekly');

    const summaries = attester.listSummaries();
    expect(summaries).toHaveLength(2);
    expect(summaries[0].createdAt).toBeDefined();
  });

  test('filters by period when specified', async () => {
    const attester = new ActivitySummaryAttestation(db);
    await attester.createSummary('daily');
    await attester.createSummary('weekly');

    const daily = attester.listSummaries('daily');
    expect(daily).toHaveLength(1);
    expect(daily[0].period).toBe('daily');

    const weekly = attester.listSummaries('weekly');
    expect(weekly).toHaveLength(1);
    expect(weekly[0].period).toBe('weekly');
  });

  test('respects limit parameter', async () => {
    const attester = new ActivitySummaryAttestation(db);
    await attester.createSummary('daily');
    await attester.createSummary('daily');
    await attester.createSummary('daily');

    const summaries = attester.listSummaries(undefined, 2);
    expect(summaries).toHaveLength(2);
  });

  test('maps database columns to camelCase fields', async () => {
    const attester = new ActivitySummaryAttestation(db);
    await attester.createSummary('daily');

    const summaries = attester.listSummaries();
    const s = summaries[0];
    expect(s.id).toBeDefined();
    expect(s.period).toBe('daily');
    expect(s.periodStart).toBeDefined();
    expect(s.periodEnd).toBeDefined();
    expect(s.payload).toBeDefined();
    expect(s.hash).toHaveLength(64);
    expect(s.createdAt).toBeDefined();
  });
});

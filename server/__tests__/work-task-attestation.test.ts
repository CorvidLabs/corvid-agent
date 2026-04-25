import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { WorkTask } from '../../shared/types/work-tasks';
import { runMigrations } from '../db/schema';
import { WorkTaskAttestation } from '../work/task-attestation';

/**
 * Tests for WorkTaskAttestation — on-chain attestation of work task outcomes.
 *
 * Covers:
 * - createAttestation stores a row and returns a hex SHA-256 hash
 * - publishOnChain updates the txid and published_at columns
 * - attest() is a best-effort wrapper (never throws, returns null on error)
 * - getAttestation retrieves the latest record for a task
 * - completed and failed outcomes are both handled correctly
 */

let db: Database;
let attestation: WorkTaskAttestation;

function makeTask(overrides: Partial<WorkTask> = {}): WorkTask {
  return {
    id: crypto.randomUUID(),
    agentId: 'agent-123',
    projectId: 'project-abc',
    sessionId: null,
    source: 'web',
    sourceId: null,
    requesterInfo: {},
    description: 'Implement feature X',
    branchName: 'feat/x',
    status: 'completed',
    priority: 2,
    prUrl: 'https://github.com/CorvidLabs/corvid-agent/pull/999',
    summary: null,
    error: null,
    originalBranch: 'main',
    worktreeDir: '/tmp/worktrees/feat-x',
    iterationCount: 1,
    maxRetries: 3,
    retryCount: 0,
    retryBackoff: 'fixed',
    lastRetryAt: null,
    preemptedBy: null,
    queuedAt: null,
    createdAt: '2026-04-23T10:00:00.000Z',
    completedAt: '2026-04-23T10:05:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  db = new Database(':memory:');
  runMigrations(db);
  attestation = new WorkTaskAttestation(db);
});

afterEach(() => {
  db.close();
});

describe('WorkTaskAttestation.createAttestation', () => {
  test('returns a 64-char hex hash for a completed task', async () => {
    const task = makeTask();
    const hash = await attestation.createAttestation(task);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  test('returns a 64-char hex hash for a failed task', async () => {
    const task = makeTask({ status: 'failed', prUrl: null, error: 'tsc failed' });
    const hash = await attestation.createAttestation(task);
    expect(hash).toHaveLength(64);
  });

  test('stores attestation row with correct outcome', async () => {
    const task = makeTask();
    const hash = await attestation.createAttestation(task);

    const row = db.query('SELECT * FROM work_task_attestations WHERE task_id = ?').get(task.id) as {
      task_id: string;
      agent_id: string;
      outcome: string;
      pr_url: string | null;
      duration_ms: number | null;
      hash: string;
      payload: string;
      txid: string | null;
      published_at: string | null;
    };

    expect(row).not.toBeNull();
    expect(row.task_id).toBe(task.id);
    expect(row.agent_id).toBe('agent-123');
    expect(row.outcome).toBe('completed');
    expect(row.pr_url).toBe(task.prUrl);
    expect(row.duration_ms).toBe(300000); // 5 minutes
    expect(row.hash).toBe(hash);
    expect(row.txid).toBeNull();
    expect(row.published_at).toBeNull();
  });

  test('stores null pr_url for failed tasks', async () => {
    const task = makeTask({ status: 'failed', prUrl: null });
    await attestation.createAttestation(task);

    const row = db.query('SELECT outcome, pr_url FROM work_task_attestations WHERE task_id = ?').get(task.id) as {
      outcome: string;
      pr_url: string | null;
    };

    expect(row.outcome).toBe('failed');
    expect(row.pr_url).toBeNull();
  });

  test('payload is valid JSON containing the task fields', async () => {
    const task = makeTask();
    const hash = await attestation.createAttestation(task);

    const row = db.query('SELECT payload FROM work_task_attestations WHERE task_id = ?').get(task.id) as {
      payload: string;
    };

    const payload = JSON.parse(row.payload);
    expect(payload.taskId).toBe(task.id);
    expect(payload.agentId).toBe('agent-123');
    expect(payload.outcome).toBe('completed');
    expect(payload.prUrl).toBe(task.prUrl);
    expect(payload.durationMs).toBe(300000);
    expect(payload.completedAt).toBe(task.completedAt);
    expect(hash).toHaveLength(64);
  });

  test('same input produces the same hash (deterministic)', async () => {
    const task = makeTask();
    const hash1 = await attestation.createAttestation(task);
    // Reset the DB row so we can insert again
    db.query('DELETE FROM work_task_attestations WHERE task_id = ?').run(task.id);
    const hash2 = await attestation.createAttestation(task);
    expect(hash1).toBe(hash2);
  });
});

describe('WorkTaskAttestation.publishOnChain', () => {
  test('updates txid and published_at after on-chain send', async () => {
    const task = makeTask();
    const hash = await attestation.createAttestation(task);

    const fakeTxid = 'TXID1234ABCD';
    const sent: string[] = [];
    const txid = await attestation.publishOnChain(task.id, hash, 'completed', (note) => {
      sent.push(note);
      return Promise.resolve(fakeTxid);
    });

    expect(txid).toBe(fakeTxid);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatch(/^corvid-work:/);
    expect(sent[0]).toContain(task.id);
    expect(sent[0]).toContain('completed');

    const row = db.query('SELECT txid, published_at FROM work_task_attestations WHERE task_id = ?').get(task.id) as {
      txid: string | null;
      published_at: string | null;
    };

    expect(row.txid).toBe(fakeTxid);
    expect(row.published_at).not.toBeNull();
  });

  test('returns null when sendTransaction returns null', async () => {
    const task = makeTask();
    const hash = await attestation.createAttestation(task);

    const txid = await attestation.publishOnChain(task.id, hash, 'completed', () => Promise.resolve(null));
    expect(txid).toBeNull();

    const row = db.query('SELECT txid FROM work_task_attestations WHERE task_id = ?').get(task.id) as {
      txid: string | null;
    };

    expect(row.txid).toBeNull();
  });
});

describe('WorkTaskAttestation.attest', () => {
  test('creates attestation and publishes, returns txid', async () => {
    const task = makeTask();
    const txid = await attestation.attest(task, () => Promise.resolve('TX-BEST-EFFORT'));
    expect(txid).toBe('TX-BEST-EFFORT');
  });

  test('returns null (does not throw) when sendTransaction throws', async () => {
    const task = makeTask();
    const result = await attestation.attest(task, () => Promise.reject(new Error('AlgoKit offline')));
    expect(result).toBeNull();
  });
});

describe('WorkTaskAttestation.getAttestation', () => {
  test('returns null for unknown task', () => {
    expect(attestation.getAttestation('unknown-task-id')).toBeNull();
  });

  test('returns the attestation record after creation', async () => {
    const task = makeTask();
    await attestation.createAttestation(task);

    const record = attestation.getAttestation(task.id);
    expect(record).not.toBeNull();
    expect(record!.taskId).toBe(task.id);
    expect(record!.agentId).toBe('agent-123');
    expect(record!.outcome).toBe('completed');
    expect(record!.txid).toBeNull();
    expect(record!.publishedAt).toBeNull();
  });

  test('returns latest record when multiple attestations exist', async () => {
    const task = makeTask();
    await attestation.createAttestation(task);

    // Insert a second attestation manually with a later timestamp
    db.query(`
      INSERT INTO work_task_attestations (task_id, agent_id, outcome, hash, payload, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now', '+1 second'))
    `).run(task.id, task.agentId, 'failed', 'abc123', '{}');

    const record = attestation.getAttestation(task.id);
    expect(record!.outcome).toBe('failed');
  });
});

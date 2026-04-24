/**
 * WorkTaskAttestation — On-chain verifiable records of work task outcomes.
 *
 * Publishes a hash of the task completion/failure event on Algorand,
 * creating a tamper-proof audit trail for every autonomous work task.
 * Addresses issue #1458: full on-chain transparency for all agent actions.
 *
 * Note format: corvid-work:{taskId}:{outcome}:{hash[:16]}
 */
import type { Database } from 'bun:sqlite';
import type { WorkTask } from '../../shared/types/work-tasks';
import { createLogger } from '../lib/logger';

const log = createLogger('WorkTaskAttestation');

export interface WorkTaskAttestationPayload {
  taskId: string;
  agentId: string;
  outcome: 'completed' | 'failed';
  prUrl: string | null;
  durationMs: number | null;
  completedAt: string;
}

export interface WorkTaskAttestationRecord {
  taskId: string;
  agentId: string;
  outcome: 'completed' | 'failed';
  hash: string;
  payload: string;
  txid: string | null;
  createdAt: string;
  publishedAt: string | null;
}

function buildPayload(task: WorkTask): WorkTaskAttestationPayload {
  const outcome: 'completed' | 'failed' = task.status === 'completed' ? 'completed' : 'failed';
  const completedAt = task.completedAt ?? new Date().toISOString();
  const durationMs =
    task.completedAt && task.createdAt
      ? new Date(task.completedAt).getTime() - new Date(task.createdAt).getTime()
      : null;

  return {
    taskId: task.id,
    agentId: task.agentId,
    outcome,
    prUrl: task.prUrl,
    durationMs,
    completedAt,
  };
}

async function hashPayload(payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(payload);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export class WorkTaskAttestation {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  /**
   * Create and store an attestation for a completed or failed work task.
   * Returns the hex SHA-256 hash of the attestation payload.
   */
  async createAttestation(task: WorkTask): Promise<string> {
    const attestationPayload = buildPayload(task);
    const payloadJson = JSON.stringify(attestationPayload);
    const hash = await hashPayload(payloadJson);

    this.db
      .query(`
        INSERT INTO work_task_attestations
          (task_id, agent_id, outcome, pr_url, duration_ms, hash, payload, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `)
      .run(
        task.id,
        task.agentId,
        attestationPayload.outcome,
        task.prUrl,
        attestationPayload.durationMs,
        hash,
        payloadJson,
      );

    log.info('Created work task attestation', {
      taskId: task.id,
      agentId: task.agentId,
      outcome: attestationPayload.outcome,
      hash: `${hash.slice(0, 16)}...`,
    });

    return hash;
  }

  /**
   * Publish attestation on-chain via an Algorand note transaction.
   * @param taskId - The work task ID
   * @param hash - The attestation hash (from createAttestation)
   * @param outcome - Task outcome
   * @param sendTransaction - Callback that sends the note and returns a txid
   */
  async publishOnChain(
    taskId: string,
    hash: string,
    outcome: 'completed' | 'failed',
    sendTransaction: (note: string) => Promise<string | null>,
  ): Promise<string | null> {
    const note = `corvid-work:${taskId}:${outcome}:${hash.slice(0, 16)}`;
    const txid = await sendTransaction(note);

    if (txid) {
      this.db
        .query(`
          UPDATE work_task_attestations
          SET txid = ?, published_at = datetime('now')
          WHERE task_id = ? AND hash = ?
        `)
        .run(txid, taskId, hash);

      log.info('Published work task attestation on-chain', {
        taskId,
        outcome,
        hash: `${hash.slice(0, 16)}...`,
        txid,
      });
    }

    return txid;
  }

  /**
   * Create attestation and publish on-chain in one call.
   * Best-effort — never throws. Returns txid or null.
   */
  async attest(task: WorkTask, sendTransaction: (note: string) => Promise<string | null>): Promise<string | null> {
    try {
      const hash = await this.createAttestation(task);
      const outcome = task.status === 'completed' ? 'completed' : 'failed';
      return await this.publishOnChain(task.id, hash, outcome, sendTransaction);
    } catch (err) {
      log.warn('Work task attestation failed (non-fatal)', {
        taskId: task.id,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  /**
   * Get the latest attestation record for a task.
   */
  getAttestation(taskId: string): WorkTaskAttestationRecord | null {
    const row = this.db
      .query(`
        SELECT task_id, agent_id, outcome, hash, payload, txid, created_at, published_at
        FROM work_task_attestations
        WHERE task_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `)
      .get(taskId) as {
      task_id: string;
      agent_id: string;
      outcome: 'completed' | 'failed';
      hash: string;
      payload: string;
      txid: string | null;
      created_at: string;
      published_at: string | null;
    } | null;

    if (!row) return null;

    return {
      taskId: row.task_id,
      agentId: row.agent_id,
      outcome: row.outcome,
      hash: row.hash,
      payload: row.payload,
      txid: row.txid,
      createdAt: row.created_at,
      publishedAt: row.published_at,
    };
  }
}

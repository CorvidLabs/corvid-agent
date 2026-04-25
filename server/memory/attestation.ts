/**
 * MemoryAttestation — On-chain verifiable records of memory promotion events.
 *
 * When a memory is promoted to long-term on-chain storage (ARC-69 ASA or
 * plain transaction), this module records a SHA-256 attestation — a tamper-proof
 * audit trail for every corvid_promote_memory call.
 *
 * Note format: corvid-memory:{agentId}:{memoryKey}:{hash[:16]}
 * Addresses issue #1458: full on-chain transparency for all agent actions.
 */
import type { Database } from 'bun:sqlite';
import { createLogger } from '../lib/logger';

const log = createLogger('MemoryAttestation');

export interface MemoryAttestationPayload {
  memoryKey: string;
  agentId: string;
  promotedAt: string;
}

export interface MemoryAttestationRecord {
  id: number;
  memoryKey: string;
  agentId: string;
  hash: string;
  payload: string;
  txid: string | null;
  createdAt: string;
  publishedAt: string | null;
}

async function hashPayload(payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(payload);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Create and store a memory attestation record.
 * Returns the hex SHA-256 hash of the attestation payload.
 */
export async function createMemoryAttestation(
  db: Database,
  agentId: string,
  memoryKey: string,
  txid?: string | null,
): Promise<string> {
  const promotedAt = new Date().toISOString();
  const attestationPayload: MemoryAttestationPayload = { memoryKey, agentId, promotedAt };
  const payloadJson = JSON.stringify(attestationPayload);
  const hash = await hashPayload(payloadJson);

  db.query(
    `INSERT INTO memory_attestations (memory_key, agent_id, hash, payload, txid, published_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(memoryKey, agentId, hash, payloadJson, txid ?? null, txid ? new Date().toISOString() : null);

  log.info('Created memory attestation', {
    memoryKey,
    agentId,
    hash: `${hash.slice(0, 16)}...`,
    txid: txid ?? null,
  });

  return hash;
}

/**
 * Get all attestation records for an agent, newest first.
 */
export function listMemoryAttestations(db: Database, agentId: string, limit = 50): MemoryAttestationRecord[] {
  return (
    db
      .query(
        `SELECT id, memory_key, agent_id, hash, payload, txid, created_at, published_at
         FROM memory_attestations
         WHERE agent_id = ?
         ORDER BY id DESC
         LIMIT ?`,
      )
      .all(agentId, limit) as Array<{
      id: number;
      memory_key: string;
      agent_id: string;
      hash: string;
      payload: string;
      txid: string | null;
      created_at: string;
      published_at: string | null;
    }>
  ).map((row) => ({
    id: row.id,
    memoryKey: row.memory_key,
    agentId: row.agent_id,
    hash: row.hash,
    payload: row.payload,
    txid: row.txid,
    createdAt: row.created_at,
    publishedAt: row.published_at,
  }));
}

/**
 * Get the latest attestation for a specific memory key.
 */
export function getMemoryAttestation(db: Database, agentId: string, memoryKey: string): MemoryAttestationRecord | null {
  const row = db
    .query(
      `SELECT id, memory_key, agent_id, hash, payload, txid, created_at, published_at
       FROM memory_attestations
       WHERE agent_id = ? AND memory_key = ?
       ORDER BY id DESC
       LIMIT 1`,
    )
    .get(agentId, memoryKey) as {
    id: number;
    memory_key: string;
    agent_id: string;
    hash: string;
    payload: string;
    txid: string | null;
    created_at: string;
    published_at: string | null;
  } | null;

  if (!row) return null;

  return {
    id: row.id,
    memoryKey: row.memory_key,
    agentId: row.agent_id,
    hash: row.hash,
    payload: row.payload,
    txid: row.txid,
    createdAt: row.created_at,
    publishedAt: row.published_at,
  };
}

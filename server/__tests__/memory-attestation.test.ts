import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { runMigrations } from '../db/schema';
import { createMemoryAttestation, getMemoryAttestation, listMemoryAttestations } from '../memory/attestation';

/**
 * Tests for memory attestation — on-chain verifiable records of memory promotion.
 *
 * Covers:
 * - createMemoryAttestation stores a row and returns a hex SHA-256 hash
 * - attestation records include txid and published_at when txid is provided
 * - getMemoryAttestation retrieves the latest record for a key
 * - listMemoryAttestations returns all records for an agent, newest first
 * - multiple promotions of the same key create multiple attestation records
 */

let db: Database;
const AGENT_ID = 'agent-test-123';

beforeEach(() => {
  db = new Database(':memory:');
  runMigrations(db);
});

afterEach(() => {
  db.close();
});

describe('createMemoryAttestation', () => {
  test('stores attestation row and returns hex SHA-256 hash', async () => {
    const hash = await createMemoryAttestation(db, AGENT_ID, 'test-key', 'txid-abc');

    expect(hash).toMatch(/^[0-9a-f]{64}$/);

    const row = db
      .query('SELECT * FROM memory_attestations WHERE agent_id = ? AND memory_key = ?')
      .get(AGENT_ID, 'test-key') as {
      memory_key: string;
      agent_id: string;
      hash: string;
      payload: string;
      txid: string | null;
      published_at: string | null;
    } | null;

    expect(row).not.toBeNull();
    expect(row!.hash).toBe(hash);
    expect(row!.memory_key).toBe('test-key');
    expect(row!.agent_id).toBe(AGENT_ID);
    expect(row!.txid).toBe('txid-abc');
    expect(row!.published_at).not.toBeNull();
  });

  test('stores attestation with null txid when not provided', async () => {
    await createMemoryAttestation(db, AGENT_ID, 'no-txid-key');

    const row = db
      .query('SELECT txid, published_at FROM memory_attestations WHERE memory_key = ?')
      .get('no-txid-key') as { txid: string | null; published_at: string | null } | null;

    expect(row!.txid).toBeNull();
    expect(row!.published_at).toBeNull();
  });

  test('payload contains memoryKey, agentId, promotedAt', async () => {
    await createMemoryAttestation(db, AGENT_ID, 'payload-key', 'tx-xyz');

    const row = db.query('SELECT payload FROM memory_attestations WHERE memory_key = ?').get('payload-key') as {
      payload: string;
    } | null;

    const payload = JSON.parse(row!.payload);
    expect(payload.memoryKey).toBe('payload-key');
    expect(payload.agentId).toBe(AGENT_ID);
    expect(typeof payload.promotedAt).toBe('string');
  });
});

describe('getMemoryAttestation', () => {
  test('returns latest attestation for a key', async () => {
    await createMemoryAttestation(db, AGENT_ID, 'my-key', 'txid-1');
    await createMemoryAttestation(db, AGENT_ID, 'my-key', 'txid-2');

    const att = getMemoryAttestation(db, AGENT_ID, 'my-key');

    expect(att).not.toBeNull();
    expect(att!.memoryKey).toBe('my-key');
    expect(att!.agentId).toBe(AGENT_ID);
    expect(att!.txid).toBe('txid-2');
  });

  test('returns null for unknown key', () => {
    const att = getMemoryAttestation(db, AGENT_ID, 'nonexistent');
    expect(att).toBeNull();
  });
});

describe('listMemoryAttestations', () => {
  test('returns all attestations for agent newest first', async () => {
    await createMemoryAttestation(db, AGENT_ID, 'key-a', 'tx-a');
    await createMemoryAttestation(db, AGENT_ID, 'key-b', 'tx-b');
    await createMemoryAttestation(db, AGENT_ID, 'key-c', 'tx-c');

    const list = listMemoryAttestations(db, AGENT_ID);

    expect(list.length).toBe(3);
    expect(list[0].memoryKey).toBe('key-c');
    expect(list[2].memoryKey).toBe('key-a');
  });

  test('does not return attestations for other agents', async () => {
    await createMemoryAttestation(db, AGENT_ID, 'key-mine', 'tx-1');
    await createMemoryAttestation(db, 'other-agent', 'key-theirs', 'tx-2');

    const list = listMemoryAttestations(db, AGENT_ID);

    expect(list.length).toBe(1);
    expect(list[0].memoryKey).toBe('key-mine');
  });

  test('returns empty array when no attestations exist', () => {
    const list = listMemoryAttestations(db, AGENT_ID);
    expect(list).toEqual([]);
  });
});

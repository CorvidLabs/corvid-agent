---
module: memory-attestation
version: 1
status: draft
files:
  - server/memory/attestation.ts
db_tables:
  - memory_attestations
depends_on: []
tracks: [1458]
---

# Memory Attestation

## Purpose

Record tamper-proof SHA-256 attestations whenever a memory is promoted to on-chain storage. Each promotion event creates an attestation row containing the hashed payload, the original payload JSON, and an optional transaction ID linking to the on-chain record. This provides a verifiable audit trail for all `corvid_promote_memory` operations.

## Architecture

When `handlePromoteMemory` successfully writes a memory on-chain (ARC-69 ASA or plain transaction), it calls `createMemoryAttestation` to record the event in the `memory_attestations` table.

## Exports

### `createMemoryAttestation(db, agentId, memoryKey, txid?): Promise<string>`

Creates an attestation record. Returns the hex SHA-256 hash of the JSON payload `{memoryKey, agentId, promotedAt}`. Sets `published_at` only when a `txid` is provided.

### `listMemoryAttestations(db, agentId, limit?): MemoryAttestationRecord[]`

Returns all attestation records for an agent, newest first. Default limit 50.

### `getMemoryAttestation(db, agentId, memoryKey): MemoryAttestationRecord | null`

Returns the latest attestation record for a specific memory key, or null.

## Database

### `memory_attestations`

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| memory_key | TEXT NOT NULL | The memory key being attested |
| agent_id | TEXT NOT NULL | The agent that promoted the memory |
| hash | TEXT NOT NULL | SHA-256 hex hash of the payload |
| payload | TEXT NOT NULL | JSON payload: `{memoryKey, agentId, promotedAt}` |
| txid | TEXT | On-chain transaction ID (null if not yet published) |
| created_at | TEXT NOT NULL | Row creation timestamp |
| published_at | TEXT | When the on-chain transaction was confirmed |

## Invariants

- Every call to `createMemoryAttestation` inserts exactly one row.
- `published_at` is set if and only if `txid` is non-null.
- Hash is deterministic for a given payload string.
- `listMemoryAttestations` returns results ordered by `id DESC`.

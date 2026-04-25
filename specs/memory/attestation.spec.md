---
module: memory-attestation
version: 1
status: active
files:
  - server/memory/attestation.ts
  - server/db/migrations/122_memory_attestations.ts
db_tables:
  - memory_attestations
depends_on:
  - specs/memory/memory.spec.md
---

# Memory Attestation Service

## Purpose

Records SHA-256 attestations whenever a memory is promoted to long-term on-chain storage (ARC-69 ASA or plain transaction). Provides a tamper-proof audit trail for memory promotion events, enabling third-party verification that a specific memory existed at a given point in time.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `createMemoryAttestation` | `(db: Database, agentId: string, memoryKey: string, txid?: string \| null)` | `Promise<string>` | Hash the promotion payload with SHA-256, store the attestation row, return the hex hash. Sets `published_at` when `txid` is provided. |
| `listMemoryAttestations` | `(db: Database, agentId: string, limit?: number)` | `MemoryAttestationRecord[]` | Return all attestation records for an agent, newest first (default limit 50) |
| `getMemoryAttestation` | `(db: Database, agentId: string, memoryKey: string)` | `MemoryAttestationRecord \| null` | Return the latest attestation for a specific memory key, or null |

### Exported Types

| Type | Description |
|------|-------------|
| `MemoryAttestationPayload` | The payload hashed for attestation: `memoryKey`, `agentId`, `promotedAt` |
| `MemoryAttestationRecord` | Full attestation row mapped to camelCase: id, memoryKey, agentId, hash, payload, txid, createdAt, publishedAt |

### Migration Exports (122_memory_attestations.ts)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `up` | `(db: Database)` | `void` | Creates `memory_attestations` table and indexes |
| `down` | `(db: Database)` | `void` | Drops `memory_attestations` table |

## Database Schema

### Table: `memory_attestations` (migration 122)

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT |
| `memory_key` | TEXT | NOT NULL |
| `agent_id` | TEXT | NOT NULL |
| `hash` | TEXT | NOT NULL |
| `payload` | TEXT | NOT NULL |
| `txid` | TEXT | nullable |
| `created_at` | TEXT | NOT NULL DEFAULT datetime('now') |
| `published_at` | TEXT | nullable |

Indexes: `idx_memory_attestations_agent_id`, `idx_memory_attestations_key`.

## Invariants

1. `createMemoryAttestation` always returns a 64-character lowercase hex SHA-256 hash.
2. The payload JSON contains exactly `memoryKey`, `agentId`, and `promotedAt` fields.
3. When `txid` is provided, `published_at` is set to the current ISO timestamp; when omitted, both `txid` and `published_at` are null.
4. `listMemoryAttestations` returns results ordered by `id DESC` (newest first).
5. `getMemoryAttestation` returns only the latest attestation when multiple exist for the same key.
6. Multiple promotions of the same key create multiple attestation rows (append-only).

## Behavioral Examples

### Scenario: Memory promotion with transaction ID

- **Given** an agent promotes memory key `"project-goals"` with txid `"TXID123"`
- **When** `createMemoryAttestation` is called
- **Then** a row is inserted with non-null `txid` and `published_at`, and the hex hash is returned

### Scenario: Memory promotion without transaction ID

- **Given** an agent promotes memory key `"draft-notes"` without a txid
- **When** `createMemoryAttestation` is called
- **Then** a row is inserted with null `txid` and null `published_at`

### Scenario: Retrieving latest attestation

- **Given** key `"my-key"` has been attested twice with txids `"tx1"` and `"tx2"`
- **When** `getMemoryAttestation` is called for `"my-key"`
- **Then** the record with `txid = "tx2"` is returned

## Error Cases

| Condition | Behavior |
|-----------|----------|
| No attestation for key | `getMemoryAttestation` returns null |
| No attestations for agent | `listMemoryAttestations` returns empty array |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/lib/logger.ts` | `createLogger()` |
| `bun:sqlite` | `Database` type |
| Web Crypto API | `crypto.subtle.digest('SHA-256', ...)` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/routes/index.ts` | `listMemoryAttestations`, `getMemoryAttestation` via dynamic import |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-04-25 | CorvidAgent | Initial spec for CI coverage fix |

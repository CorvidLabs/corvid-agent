---
module: observations-db
version: 1
status: active
files:
  - server/db/observations.ts
db_tables:
  - memory_observations
  - memory_observations_fts
depends_on:
  - specs/db/agents.spec.md
---

# Observations DB

## Purpose

Data-access layer for memory observations — short-term, scored insights gathered by agents during sessions. Observations accumulate a `relevance_score` through boosting and can be promoted ("graduated") to long-term ARC-69 ASA memories once their score and access count cross a threshold. Added in migration 095.

No business logic lives here — just SQL queries with row-to-domain mapping, FTS5-backed full-text search, and automatic expiry/purge helpers.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `recordObservation` | `(db: Database, input: RecordObservationInput)` | `MemoryObservation` | Insert a new observation. Sets a default 7-day expiry when `expiresAt` is not provided |
| `getObservation` | `(db: Database, id: string)` | `MemoryObservation \| null` | Fetch a single observation by ID. Returns `null` if not found |
| `listObservations` | `(db: Database, agentId: string, opts?: ListObservationOptions)` | `MemoryObservation[]` | List observations for an agent, optionally filtered by status and ordered by score |
| `searchObservations` | `(db: Database, agentId: string, query: string, opts?: SearchObservationOptions)` | `MemoryObservation[]` | Full-text search using FTS5; falls back to LIKE search if FTS5 returns no results |
| `boostObservation` | `(db: Database, id: string, delta?: number)` | `void` | Increment `relevance_score` by `delta` (default `0.5`) and increment `access_count` |
| `markGraduated` | `(db: Database, id: string, graduatedKey: string)` | `void` | Set `status='graduated'` and record the ARC-69 key the observation was promoted to |
| `dismissObservation` | `(db: Database, id: string)` | `void` | Set `status='dismissed'` — soft-delete without removing the row |
| `getGraduationCandidates` | `(db: Database, agentId: string, opts?: GraduationCandidateOptions)` | `MemoryObservation[]` | Return active observations with `relevance_score >= 3.0` and `access_count >= 2`, ordered by score descending |
| `expireObservations` | `(db: Database)` | `number` | Set `status='expired'` on all active observations whose `expires_at` is in the past. Returns the count of rows updated |
| `purgeOldObservations` | `(db: Database, retentionDays?: number)` | `number` | Hard-delete graduated, dismissed, or expired rows older than `retentionDays` (default 30). Returns deleted count |
| `countObservations` | `(db: Database, agentId: string, opts?: CountObservationOptions)` | `ObservationCounts` | Return counts grouped by status for an agent |

Internal types (`MemoryObservation`, `RecordObservationInput`, `ListObservationOptions`, `SearchObservationOptions`, `GraduationCandidateOptions`, `CountObservationOptions`, `ObservationCounts`) are defined and used within the module but not exported.

## Invariants

1. **Default expiry**: When `expiresAt` is not supplied, `recordObservation` sets `expires_at` to 7 days from now.
2. **Status values**: `status` must be one of `'active'`, `'graduated'`, `'dismissed'`, `'expired'`.
3. **Score monotonicity**: `boostObservation` only increments — scores never decrease via this function.
4. **FTS sync**: `memory_observations_fts` is kept in sync with `memory_observations` via `AFTER INSERT/DELETE/UPDATE` triggers; no manual FTS writes are needed.
5. **FTS fallback**: `searchObservations` falls back to a LIKE-based query when FTS5 returns zero results.
6. **Graduation key**: `markGraduated` stores the on-chain ARC-69 key in `graduated_key`; callers must supply a non-empty key.
7. **Cascade on agent delete**: `agent_id` references `agents(id) ON DELETE CASCADE`.

## Behavioral Examples

### Scenario: Record and boost an observation

- **Given** an agent `agent-1`
- **When** `recordObservation(db, { agentId: 'agent-1', source: 'session', content: 'User prefers short responses' })` is called
- **Then** a row exists with `status='active'`, `relevance_score=1.0`, `access_count=0`, and `expires_at` ~7 days from now
- **When** `boostObservation(db, id)` is called twice
- **Then** `relevance_score=2.0` and `access_count=2`

### Scenario: Graduate a candidate

- **Given** an active observation with `relevance_score >= 3.0` and `access_count >= 2`
- **When** `getGraduationCandidates(db, agentId)` is called
- **Then** the observation appears in the result list
- **When** `markGraduated(db, id, 'feedback-pref-123')` is called
- **Then** `status='graduated'` and `graduated_key='feedback-pref-123'`

### Scenario: Expiry and purge

- **Given** observations with `expires_at` in the past
- **When** `expireObservations(db)` is called
- **Then** those rows have `status='expired'`
- **When** `purgeOldObservations(db, 30)` is called after 30 days
- **Then** the expired rows are hard-deleted

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `getObservation` with unknown ID | Returns `null` |
| `boostObservation` with unknown ID | No-op (zero rows updated) |
| `markGraduated` with unknown ID | No-op |
| `dismissObservation` with unknown ID | No-op |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `bun:sqlite` | `Database` type |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/mcp/tool-handlers/memory.ts` | Observation CRUD via MCP tools |
| `server/scheduler/jobs/graduate-observations.ts` | `getGraduationCandidates`, `markGraduated` |
| `server/scheduler/jobs/expire-observations.ts` | `expireObservations`, `purgeOldObservations` |

## Database Tables

### memory_observations

Stores agent memory observations with relevance scoring.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | UUID |
| `agent_id` | TEXT | NOT NULL, FK `agents(id)` ON DELETE CASCADE | Owning agent |
| `source` | TEXT | NOT NULL | Origin of the observation (e.g. `session`, `tool`, `user`) |
| `source_id` | TEXT | DEFAULT NULL | Optional ID of the source entity (e.g. session ID) |
| `content` | TEXT | NOT NULL | Observation text |
| `suggested_key` | TEXT | DEFAULT NULL | Candidate ARC-69 memory key for graduation |
| `relevance_score` | REAL | NOT NULL, DEFAULT `1.0` | Floating-point relevance score; boosted over time |
| `access_count` | INTEGER | NOT NULL, DEFAULT `0` | How many times the observation has been accessed/boosted |
| `last_accessed_at` | TEXT | DEFAULT NULL | Timestamp of last access |
| `status` | TEXT | NOT NULL, DEFAULT `'active'` | `active` / `graduated` / `dismissed` / `expired` |
| `graduated_key` | TEXT | DEFAULT NULL | ARC-69 key this observation was promoted to (set on graduation) |
| `created_at` | TEXT | DEFAULT `datetime('now')` | Creation timestamp |
| `expires_at` | TEXT | DEFAULT NULL | Expiry timestamp; NULL means no expiry |

**Indexes:**
- `idx_observations_agent` on `agent_id`
- `idx_observations_status` on `(agent_id, status)`
- `idx_observations_score` on `relevance_score DESC`
- `idx_observations_expires` on `expires_at WHERE expires_at IS NOT NULL`

### memory_observations_fts

FTS5 virtual table mirroring `content` and `suggested_key` from `memory_observations` for full-text search.

| Column | Description |
|--------|-------------|
| `content` | Mirrors `memory_observations.content` |
| `suggested_key` | Mirrors `memory_observations.suggested_key` |

Kept in sync via `observations_ai` (INSERT), `observations_ad` (DELETE), and `observations_au` (UPDATE) triggers defined in migration 095.

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-29 | jackdaw | Initial spec (migration 095) |

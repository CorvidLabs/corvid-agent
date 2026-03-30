---
module: reputation-db
version: 1
status: draft
files:
  - server/db/reputation.ts
db_tables:
  - agent_reputation
  - reputation_events
  - reputation_attestations
  - reputation_history
depends_on: []
---

# Reputation DB

## Purpose

Pure data-access layer for reading and deleting agent reputation scores and reputation events. Provides direct DB access for routes that need to query reputation data without going through the reputation scorer service.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `getReputationRecord` | `(db: Database, agentId: string)` | `ReputationRecord \| null` | Fetch a single agent's reputation record by agent ID. Returns null if no record exists |
| `listReputationRecords` | `(db: Database)` | `ReputationRecord[]` | List all reputation records ordered by `overall_score DESC` (highest score first) |
| `getReputationEvents` | `(db: Database, agentId: string, limit?: number)` | `ReputationEventRecord[]` | Get reputation events for an agent ordered by `created_at DESC`. Default limit is 50 |
| `deleteReputationRecord` | `(db: Database, agentId: string)` | `boolean` | Delete an agent's reputation record. Returns `true` if a row was deleted, `false` if no record existed |

### Exported Types

| Type | Description |
|------|-------------|
| (none) | All types are imported from `server/reputation/types` (`ReputationRecord`, `ReputationEventRecord`) |

## Invariants

1. **Read-only for scores**: This module only reads and deletes reputation records; score computation and event recording are handled by the reputation scorer service
2. **Ordering**: `listReputationRecords` always returns records sorted by `overall_score DESC`; `getReputationEvents` always returns events sorted by `created_at DESC` (newest first)
3. **Default limit**: `getReputationEvents` defaults to 50 events when no limit is specified
4. **Delete does not cascade**: `deleteReputationRecord` only deletes from `agent_reputation`; it does not delete associated `reputation_events`
5. **Raw DB rows**: Functions return `ReputationRecord` and `ReputationEventRecord` types which use snake_case column names (raw DB format), not camelCase domain types

## Behavioral Examples

### Scenario: Retrieve an agent's reputation
- **Given** an agent with id `agent-1` has a reputation record with `overall_score = 85`
- **When** `getReputationRecord(db, 'agent-1')` is called
- **Then** a `ReputationRecord` is returned with all component scores and the `computed_at` timestamp

### Scenario: List all agents by reputation ranking
- **Given** three agents exist with scores 90, 75, and 60
- **When** `listReputationRecords(db)` is called
- **Then** records are returned in order: score 90, score 75, score 60

### Scenario: Query recent reputation events with custom limit
- **Given** an agent has 100 reputation events
- **When** `getReputationEvents(db, 'agent-1', 10)` is called
- **Then** only the 10 most recent events are returned, ordered newest first

### Scenario: Delete a nonexistent reputation record
- **Given** no reputation record exists for `agent-unknown`
- **When** `deleteReputationRecord(db, 'agent-unknown')` is called
- **Then** `false` is returned

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `getReputationRecord` with nonexistent agent ID | Returns `null` |
| `getReputationEvents` with nonexistent agent ID | Returns `[]` (empty array) |
| `deleteReputationRecord` with nonexistent agent ID | Returns `false` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/reputation/types` | `ReputationRecord`, `ReputationEventRecord` type definitions |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/routes/reputation.ts` | All functions for HTTP API reputation endpoints |

## Database Tables

### agent_reputation

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `agent_id` | TEXT | PRIMARY KEY | References the agent whose reputation is tracked |
| `overall_score` | INTEGER | DEFAULT `0` | Composite reputation score (0-100) |
| `trust_level` | TEXT | DEFAULT `'untrusted'` | Derived trust level: `untrusted`, `low`, `medium`, `high`, `verified` |
| `task_completion` | INTEGER | DEFAULT `0` | Task completion rate component (0-100) |
| `peer_rating` | INTEGER | DEFAULT `0` | Average peer rating component (0-100) |
| `credit_pattern` | INTEGER | DEFAULT `0` | Credit spending pattern component (0-100) |
| `security_compliance` | INTEGER | DEFAULT `0` | Security compliance component (0-100) |
| `activity_level` | INTEGER | DEFAULT `0` | Recent activity level component (0-100) |
| `attestation_hash` | TEXT | DEFAULT `NULL` | On-chain attestation hash if published |
| `tenant_id` | TEXT | DEFAULT NULL | Tenant isolation identifier |
| `computed_at` | TEXT | DEFAULT `datetime('now')` | ISO 8601 timestamp of last score computation |

### reputation_events

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | UUID of the event |
| `agent_id` | TEXT | NOT NULL | Agent this event applies to |
| `event_type` | TEXT | NOT NULL | Type of event (e.g. `task_completed`, `security_violation`) |
| `score_impact` | REAL | DEFAULT `0` | Positive or negative score impact value |
| `metadata` | TEXT | DEFAULT `'{}'` | JSON-serialized extra context |
| `created_at` | TEXT | DEFAULT `datetime('now')` | ISO 8601 timestamp of event creation |

**Indexes:**
- `idx_reputation_events_agent` on `agent_id`
- `idx_reputation_events_type` on `event_type`

### reputation_attestations

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `agent_id` | TEXT | PK part | Agent whose reputation is attested |
| `hash` | TEXT | PK part | Attestation hash |
| `payload` | TEXT | DEFAULT NULL | JSON-serialized attestation payload |
| `txid` | TEXT | DEFAULT NULL | On-chain transaction ID |
| `published_at` | TEXT | DEFAULT NULL | When the attestation was published on-chain |
| `created_at` | TEXT | DEFAULT `datetime('now')` | Creation timestamp |

### reputation_history

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Auto-incrementing identifier |
| `agent_id` | TEXT | NOT NULL | Agent whose reputation is tracked |
| `overall_score` | INTEGER | NOT NULL | Composite reputation score at this point in time |
| `trust_level` | TEXT | NOT NULL | Trust level at this point in time |
| `task_completion` | INTEGER | NOT NULL, DEFAULT 0 | Task completion component |
| `peer_rating` | INTEGER | NOT NULL, DEFAULT 0 | Peer rating component |
| `credit_pattern` | INTEGER | NOT NULL, DEFAULT 0 | Credit pattern component |
| `security_compliance` | INTEGER | NOT NULL, DEFAULT 0 | Security compliance component |
| `activity_level` | INTEGER | NOT NULL, DEFAULT 0 | Activity level component |
| `computed_at` | TEXT | NOT NULL, DEFAULT `datetime('now')` | When this snapshot was computed |

**Indexes:**
- `idx_reputation_history_agent` on `agent_id`
- `idx_reputation_history_computed` on `computed_at`
- `idx_reputation_history_agent_time` on `(agent_id, computed_at)`

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |

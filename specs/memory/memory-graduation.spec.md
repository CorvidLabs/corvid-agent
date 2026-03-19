---
module: memory-graduation
version: 1
status: draft
files:
  - server/memory/graduation-service.ts
  - server/db/observations.ts
  - server/db/migrations/095_memory_observations.ts
  - server/mcp/tool-handlers/observations.ts
db_tables:
  - memory_observations
depends_on: []
---

# Memory Graduation — Short-Term to Long-Term

## Purpose

Provide a pipeline for short-term observations to accumulate relevance and automatically graduate to long-term ARC-69 memories. This closes the gap between ephemeral session data and persistent on-chain storage.

Currently, memories are either:
- Explicitly saved by the agent via `corvid_save_memory` (direct → ARC-69)
- Lost when sessions end

This module introduces an intermediate layer — **observations** — that capture insights from sessions, feedback, daily reviews, and other sources. Observations accumulate relevance through repeated access, and the `MemoryGraduationService` periodically promotes qualifying observations to permanent ARC-69 memories.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Observation Sources                    │
│  session metrics │ feedback │ daily review │ PR outcomes │
└──────────────────────┬──────────────────────────────────┘
                       │ recordObservation()
                       ▼
              ┌────────────────┐
              │ memory_        │ SQLite table
              │ observations   │ (short-term, scored)
              └────────┬───────┘
                       │
                       │ MemoryGraduationService (every 5 min)
                       │ Criteria: score >= 3.0 AND access >= 2
                       ▼
              ┌────────────────┐
              │ agent_memories │ → ARC-69 ASA (on-chain)
              │ (long-term)    │
              └────────────────┘
```

## Observation Lifecycle

```
┌──────────┐     boost/access     ┌──────────┐     graduate     ┌───────────┐
│  active  │ ──────────────────► │  active  │ ──────────────► │ graduated │
│ score=1  │                      │ score≥3  │                  │           │
└──────────┘                      └──────────┘                  └───────────┘
     │                                                               │
     │ TTL expires                                              saved as
     ▼                                                          agent_memory
┌──────────┐         ┌───────────┐                              + ARC-69 ASA
│ expired  │         │ dismissed │
└──────────┘         └───────────┘
     │                    │
     └────────────────────┘
              │
              │ purge (30 days)
              ▼
          [deleted]
```

## Database

### `memory_observations` table

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| id | TEXT | PK (UUID) | Unique identifier |
| agent_id | TEXT | FK → agents | Owner agent |
| source | TEXT | required | One of: session, feedback, daily-review, health, pr-outcome, manual |
| source_id | TEXT | NULL | Reference to source record (session ID, PR number, etc.) |
| content | TEXT | required | Observation text |
| suggested_key | TEXT | NULL | Suggested memory key for graduation |
| relevance_score | REAL | 1.0 | Accumulated relevance — boosted on access |
| access_count | INTEGER | 0 | Number of times recalled/referenced |
| last_accessed_at | TEXT | NULL | Last access timestamp |
| status | TEXT | 'active' | One of: active, graduated, expired, dismissed |
| graduated_key | TEXT | NULL | Memory key it was graduated as |
| created_at | TEXT | now() | Creation timestamp |
| expires_at | TEXT | +7 days | TTL — expired if not graduated by this date |

### Indexes

| Index | Columns | Description |
|-------|---------|-------------|
| idx_observations_agent | (agent_id) | Agent lookup |
| idx_observations_status | (agent_id, status) | Status-filtered queries |
| idx_observations_score | (relevance_score DESC) | Graduation candidate queries |
| idx_observations_expires | (expires_at) WHERE NOT NULL | Expiry scanning |

### FTS5 virtual table

`memory_observations_fts` on `(content, suggested_key)` for full-text search.

## Public API

### Migration — `server/db/migrations/095_memory_observations.ts`

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `up` | `(db: Database)` | `void` | Creates the `memory_observations` table, indexes, and FTS5 virtual table |
| `down` | `(db: Database)` | `void` | Drops the `memory_observations` table and its FTS5 virtual table |

### DB Helpers — `server/db/observations.ts`

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `recordObservation` | `(db, { agentId, source, sourceId?, content, suggestedKey?, relevanceScore?, expiresAt? })` | `MemoryObservation` | Create a new observation |
| `getObservation` | `(db, id)` | `MemoryObservation \| null` | Fetch by ID |
| `listObservations` | `(db, agentId, { status?, limit?, source? })` | `MemoryObservation[]` | List with filters |
| `searchObservations` | `(db, agentId, query)` | `MemoryObservation[]` | FTS5 search with LIKE fallback |
| `boostObservation` | `(db, id, scoreBoost?)` | `void` | Increment score and access count |
| `markGraduated` | `(db, id, graduatedKey)` | `void` | Mark as graduated with key |
| `dismissObservation` | `(db, id)` | `void` | Mark as dismissed |
| `getGraduationCandidates` | `(db, agentId, { scoreThreshold?, minAccess?, limit? })` | `MemoryObservation[]` | Find observations meeting graduation criteria |
| `expireObservations` | `(db)` | `number` | Expire past-TTL observations |
| `purgeOldObservations` | `(db, retentionDays?)` | `number` | Delete old expired/dismissed observations |
| `countObservations` | `(db, agentId)` | `{ active, graduated, expired, dismissed }` | Stats by status |

### Graduation Service — `server/memory/graduation-service.ts`

| Export | Type | Description |
|--------|------|-------------|
| `MemoryGraduationService` | class | Periodic service that evaluates observations and graduates high-value ones to ARC-69 |

### MCP Tool Handlers — `server/mcp/tool-handlers/observations.ts`

| Export | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `handleRecordObservation` | `(ctx, { content, source?, source_id?, suggested_key?, relevance_score? })` | `CallToolResult` | Record a short-term observation |
| `handleListObservations` | `(ctx, { status?, source?, query?, limit? })` | `CallToolResult` | List/search observations |
| `handleBoostObservation` | `(ctx, { id, score_boost? })` | `CallToolResult` | Boost relevance score |
| `handleDismissObservation` | `(ctx, { id })` | `CallToolResult` | Dismiss an observation |
| `handleObservationStats` | `(ctx)` | `CallToolResult` | Get observation statistics |

### REST API Endpoints

| Endpoint | Method | Schema | Description |
|----------|--------|--------|-------------|
| `/api/mcp/record-observation` | POST | `McpRecordObservationSchema` | Record observation |
| `/api/mcp/list-observations` | POST | `McpListObservationsSchema` | List/search observations |
| `/api/mcp/boost-observation` | POST | `McpBoostObservationSchema` | Boost observation |
| `/api/mcp/dismiss-observation` | POST | `McpDismissObservationSchema` | Dismiss observation |
| `/api/mcp/observation-stats` | POST | `McpObservationStatsSchema` | Get stats |

## Graduation Criteria

An observation graduates when ALL of:
1. `status = 'active'`
2. `relevance_score >= 3.0`
3. `access_count >= 2`

The memory key is determined by:
1. `suggested_key` if provided
2. Fallback: `obs:{source}:{id_prefix}`

## Behavioral Examples

### Scenario: Observation accumulates relevance and graduates

- **Given** agent records observation "Leif prefers concise PR descriptions" with source=feedback
- **When** the observation is recalled twice (access_count → 2) and boosted once (score → 2.0 + 1.0 = 3.0)
- **Then** on the next graduation tick, it's promoted to `agent_memories` with key `feedback-pr-style`
- **And** an ARC-69 ASA is minted with the observation content
- **And** the observation status changes to `graduated`

### Scenario: Observation expires without graduation

- **Given** agent records observation with default 7-day TTL
- **When** 7 days pass without the observation reaching graduation criteria
- **Then** status changes to `expired` on the next tick
- **And** after 30 more days, the row is purged

### Scenario: User dismisses an observation

- **Given** agent has an active observation about a temporary debugging pattern
- **When** user calls `corvid_dismiss_observation`
- **Then** status changes to `dismissed`
- **And** it's excluded from graduation candidates
- **And** purged after 30 days

## Invariants

1. **One graduation per observation.** Once graduated, an observation is never re-graduated.
2. **Graduation creates a memory.** Every graduated observation results in an `agent_memories` row.
3. **TTL is advisory.** The graduation service expires observations, but expiry is checked on tick, not real-time.
4. **Scores only increase.** `boostObservation` only adds — there is no negative scoring.
5. **Sources are validated.** Only the six defined source types are accepted.

## Error Cases

| Condition | Behavior |
|-----------|----------|
| ARC-69 graduation fails | Memory saved to SQLite as 'pending', MemorySyncService retries |
| Duplicate suggested_key | `saveMemory` upserts — observation content overwrites existing memory |
| FTS5 search fails | Falls back to LIKE search |
| No active observations | Tick completes immediately (no-op) |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/memory/arc69-store.ts` | `createMemoryAsa` for ARC-69 ASA minting during graduation |
| `server/db/agent-memories.ts` | `saveMemory`, `updateMemoryTxid`, `updateMemoryAsaId` for creating long-term memories |
| `server/algochat/agent-wallet.ts` | `AgentWalletService` for wallet management during on-chain writes |
| `server/lib/logger.ts` | `createLogger` for structured logging |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/bootstrap.ts` | `MemoryGraduationService` instantiation and wiring |
| `server/algochat/init.ts` | Service startup in `wirePostInit` |
| `server/routes/mcp-api.ts` | Observation REST API routes |
| `server/mcp/http-transport.ts` | MCP tool registration |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-19 | corvid-agent | Initial spec — memory graduation pipeline |

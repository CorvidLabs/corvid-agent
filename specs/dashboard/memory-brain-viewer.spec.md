---
module: memory-brain-viewer
version: 2
status: active
files:
  - server/routes/dashboard.ts
  - client/src/app/features/memory/unified-memory.component.ts
db_tables:
  - agent_memories
depends_on:
  - specs/memory/memory.spec.md
---

# Unified Memory View

## Purpose

Consolidated memory view at `/observe/memory` that merges the former Brain Viewer and Memory Browser into a single interface. Gives humans full visibility into an agent's "brain" — all stored memories across both tiers (long-term localnet/on-chain and short-term SQLite cache). Three view modes: **Overview** (stats, sync health, tier breakdown), **Browse** (searchable memory list with filtering), and **3D** (spatial graph visualization of memories and their relationships). Shows sync status, storage tier, encryption state, and memory health metrics so operators can understand what an agent knows, where it's stored, and whether the two tiers are in sync.

Replaces the former `/observe/brain-viewer` and `/observe/memory-browser` routes (both redirect here).

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `handleDashboardRoutes` | `(req: Request, url: URL, db: Database, context?: RequestContext)` | `Response \| null` | Route handler for `/api/dashboard/summary` aggregated endpoint |

### Exported Components

| Component | Selector | Description |
|-----------|----------|-------------|
| `UnifiedMemoryComponent` | `app-unified-memory` | Angular component providing the consolidated memory view with Overview, Browse, and 3D modes |

### API Endpoints

| Endpoint | Method | Parameters | Returns | Description |
|----------|--------|------------|---------|-------------|
| `/api/dashboard/memories` | GET | `agentId?`, `tier?`, `status?`, `category?`, `search?`, `limit?`, `offset?` | `MemoryBrainResponse` | Paginated list of memories with tier and sync metadata |
| `/api/dashboard/memories/stats` | GET | `agentId?` | `MemoryBrainStats` | Aggregate stats: counts by tier, sync health, storage usage |
| `/api/dashboard/memories/:id` | GET | — | `MemoryBrainEntry` | Single memory detail with full metadata |
| `/api/dashboard/memories/sync-status` | GET | `agentId?` | `MemorySyncStatus` | Real-time sync service health and pending queue |

### Proposed Types (to be created)

```typescript
type MemoryTier = 'longterm' | 'shortterm';

interface MemoryBrainEntry {
  id: string;
  agentId: string;
  key: string;
  content: string;              // decrypted content (server-side only)
  tier: MemoryTier;             // derived from status + txid
  status: 'pending' | 'confirmed' | 'failed';
  txid: string | null;          // Algorand txid if synced on-chain
  category: string | null;      // auto-categorized type
  categoryConfidence: number | null;
  decayScore: number | null;    // freshness score (0.4–1.0)
  createdAt: string;
  updatedAt: string;
}

interface MemoryBrainResponse {
  entries: MemoryBrainEntry[];
  total: number;
  limit: number;
  offset: number;
}

interface MemoryBrainStats {
  totalMemories: number;
  byTier: {
    longterm: number;     // status='confirmed' with txid
    shortterm: number;    // status='pending' or 'failed' (SQLite only)
  };
  byStatus: {
    confirmed: number;
    pending: number;
    failed: number;
  };
  byCategory: Record<string, number>;
  byAgent: Array<{
    agentId: string;
    agentName: string;
    total: number;
    longterm: number;
    shortterm: number;
  }>;
  oldestMemory: string | null;
  newestMemory: string | null;
  averageDecayScore: number | null;
}

interface MemorySyncStatus {
  isRunning: boolean;
  pendingCount: number;
  failedCount: number;
  lastSyncAt: string | null;
  syncIntervalMs: number;
  recentErrors: Array<{
    memoryId: string;
    key: string;
    error: string;
    failedAt: string;
  }>;
}
```

## Invariants

1. **Tier derivation is deterministic:** A memory is `longterm` if and only if `status='confirmed'` AND `txid IS NOT NULL`. All other memories are `shortterm`.
2. **Content never exposed in browser:** Memory content is rendered server-side or returned via authenticated API only. Never embedded in client-side JavaScript bundles.
3. **Agent isolation:** All endpoints filter by `agentId` when provided. Multi-agent views require operator-tier or higher permission.
4. **Read-only dashboard:** The brain viewer endpoints are GET-only. No mutations (save, delete, sync) from the dashboard — those go through existing MCP API routes.
5. **Sync status reflects reality:** `MemorySyncStatus.pendingCount` matches `SELECT COUNT(*) FROM agent_memories WHERE status='pending'` at query time.
6. **Decay scores are live-computed:** Decay scores shown in the viewer are computed at query time via `computeDecayMultiplier`, not cached stale values.
7. **Tier badge is always visible:** Every memory entry in the UI displays a clear tier indicator — operators must never have to guess whether a memory is on-chain or SQLite-only.
8. **Graceful degradation:** If the on-chain transactor is unavailable (e.g., localnet down), the viewer still renders SQLite data with a "chain unavailable" banner.
9. **Pagination defaults:** Default limit is 50, max limit is 200. Offset-based pagination.
10. **Category enrichment is best-effort:** If `memory_categories` table has no entry for a memory, `category` and `categoryConfidence` are null — never block rendering.

## Behavioral Examples

### Scenario: Operator views all memories for an agent

- **Given** agent `corvid-agent` has 15 confirmed (longterm) and 3 pending (shortterm) memories
- **When** operator calls `GET /api/dashboard/memories?agentId=corvid-agent`
- **Then** response contains 18 entries, each with correct `tier` field (`longterm` for confirmed w/ txid, `shortterm` for pending)

### Scenario: Filtering by tier

- **Given** agent has memories in both tiers
- **When** operator calls `GET /api/dashboard/memories?agentId=corvid-agent&tier=shortterm`
- **Then** only memories with `status != 'confirmed'` or `txid IS NULL` are returned

### Scenario: Stats show per-agent breakdown

- **Given** 3 agents with varying memory counts
- **When** operator calls `GET /api/dashboard/memories/stats`
- **Then** `byAgent` array contains one entry per agent with `total`, `longterm`, and `shortterm` counts

### Scenario: Sync service is stalled

- **Given** MemorySyncService has 12 pending memories and 3 in failed state
- **When** operator calls `GET /api/dashboard/memories/sync-status`
- **Then** response shows `pendingCount: 12`, `failedCount: 3`, `isRunning: true`, and `recentErrors` lists the 3 failed memory keys with error messages

### Scenario: Failed memory shows shortterm tier with error context

- **Given** a memory with `status='failed'` and `txid=null`
- **When** displayed in the brain viewer
- **Then** tier is `shortterm`, status badge shows "failed", and the operator can see when the last sync attempt occurred

### Scenario: Search across memory content

- **Given** agent has memories with keys "api-preferences", "team-contacts", "deploy-process"
- **When** operator calls `GET /api/dashboard/memories?search=deploy`
- **Then** FTS5 search returns matching memories ranked by relevance

### Scenario: Multi-agent overview without agentId filter

- **Given** 5 agents exist with memories
- **When** operator calls `GET /api/dashboard/memories/stats` (no agentId)
- **Then** stats aggregate across all agents, `byAgent` breaks down per-agent

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Invalid agentId | Return 400 with error code `INVALID_AGENT_ID` |
| Agent has no memories | Return empty `entries: []` with `total: 0` |
| FTS5 search fails | Fall back to LIKE search, log warning |
| MemorySyncService not started | `sync-status` returns `isRunning: false`, other fields still populated from DB |
| Database locked (contention) | Retry with busy_timeout, return 503 if still locked |
| Unauthorized (below operator tier) | Return 403 with error code `INSUFFICIENT_PERMISSIONS` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/db/agent-memories.ts` | `listMemories`, `searchMemories`, `recallMemory` |
| `server/db/memory-sync.ts` | `MemorySyncService.getStats()` |
| `server/memory/index.ts` | `MemoryManager` for enriched queries |
| `server/memory/categories.ts` | Category data for enrichment |
| `server/memory/decay.ts` | `computeDecayMultiplier` for live freshness |
| `server/permissions/governance-tier.ts` | Route-level permission gating |
| `server/db/agent-memories.ts` | Direct DB queries for stats aggregation |

### Consumed By

| Module | What is used |
|--------|-------------|
| Dashboard UI | Renders memory brain viewer panel |
| `server/routes/dashboard.ts` | Registers new routes |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-17 | corvid-agent | Initial draft spec for memory brain viewer |
| 2026-03-18 | corvid-agent | Document exported functions, remove files already covered by memory/agent-memories/on-chain specs (#591) |
| 2026-03-27 | corvid-agent | Consolidated Brain Viewer + Memory Browser into unified Memory view with Overview/Browse/3D modes (#1595) |

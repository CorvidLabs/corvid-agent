---
spec: memory-brain-viewer.spec.md
sources:
  - server/routes/dashboard.ts
  - client/src/app/features/memory/unified-memory.component.ts
---

## Layout

The module spans both server (REST API routes) and client (Angular component). The `/observe/memory` page consolidates the former Brain Viewer and Memory Browser routes. Both `/observe/brain-viewer` and `/observe/memory-browser` redirect here.

Server routes are registered under `/api/dashboard/`:
- `GET /api/dashboard/memories` — paginated memory list
- `GET /api/dashboard/memories/stats` — aggregate stats
- `GET /api/dashboard/memories/:id` — single memory detail
- `GET /api/dashboard/memories/sync-status` — sync service health

Client layout has three tabs/modes selectable by the operator:
- **Overview** — stats cards (tier breakdown, sync health, per-agent counts)
- **Browse** — searchable/filterable paginated list with tier badges
- **3D** — spatial graph visualization of memories and relationships

## Components

### `handleDashboardRoutes` (server/routes/dashboard.ts)

Route handler for all `/api/dashboard/summary` requests. Aggregates data from multiple DB queries and returns combined JSON.

### `UnifiedMemoryComponent` (Angular)

| Input | Type | Description |
|-------|------|-------------|
| `agentId` | `string?` | Filter memories to a specific agent |
| `mode` | `'overview' \| 'browse' \| '3d'` | Active view mode |

Key responsibilities:
- Calls `/api/dashboard/memories/stats` for Overview tab
- Calls `/api/dashboard/memories` with filter params for Browse tab
- Renders tier badges on every entry (longterm / shortterm) — never hidden
- Shows "chain unavailable" banner when sync service is not running
- Falls back from FTS5 to LIKE search transparently

### Tier Derivation Logic

Memory tier is derived deterministically server-side:
- `longterm`: `status = 'confirmed'` AND `txid IS NOT NULL`
- `shortterm`: any other combination (pending, failed, or confirmed without txid)

### Decay Score Computation

`computeDecayMultiplier` is called at query time for each memory — scores are never cached. Returns a freshness value between 0.4 and 1.0.

## Tokens

| Constant | Value | Description |
|----------|-------|-------------|
| Default pagination limit | 50 | Default `limit` for `/api/dashboard/memories` |
| Max pagination limit | 200 | Hard cap on `limit` parameter |
| Pagination style | Offset-based | Uses `offset` + `limit` query params |

## Assets

| Resource | Description |
|----------|-------------|
| `agent_memories` table | Primary data source for all memory queries |
| `agent_memories_fts` virtual table | FTS5 index for content search; fallback to LIKE on failure |
| `memory_observations` table | Short-term memory observations (expiry-tracked) |
| `MemorySyncService` | Provides `getStats()` for sync-status endpoint |
| `computeDecayMultiplier` | Live-computed freshness score, imported from `server/memory/decay.ts` |

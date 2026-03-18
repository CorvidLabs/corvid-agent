---
module: brain-viewer-routes
version: 1
status: draft
files:
  - server/routes/brain-viewer.ts
db_tables:
  - agent_memories
  - agents
depends_on:
  - specs/memory/memory.spec.md
---

# Brain Viewer Routes

## Purpose

Dashboard API endpoints for inspecting agent memory state. Provides read-only visibility into both memory tiers: longterm (status='confirmed' with txid, on-chain localnet Algorand) and shortterm (status='pending' or 'failed', SQLite only). All endpoints live under `/api/dashboard/memories` and inherit the dashboard auth guard.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `handleBrainViewerRoutes` | `(req: Request, url: URL, db: Database, context?: RequestContext)` | `Response \| null` | Route handler for `/api/dashboard/memories/*`. Returns `null` for non-matching paths or non-GET methods. |

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/dashboard/memories` | Paginated memory list with filtering by agentId, tier, status, category, and full-text search |
| GET | `/api/dashboard/memories/stats` | Aggregate statistics: totals by tier/status/category/agent, date range, average decay score |
| GET | `/api/dashboard/memories/:id` | Single memory detail with tier, category, and decay score |
| GET | `/api/dashboard/memories/sync-status` | Sync health: pending/failed counts, last sync time, running heuristic, recent errors |

## Key Behaviors

### Tier Derivation
- A memory is **longterm** if `status = 'confirmed'` AND `txid IS NOT NULL`.
- All other memories are **shortterm**.

### Memory List Filtering
- `agentId` — filter by agent
- `tier` — `longterm` or `shortterm` (validated; invalid values return 400)
- `status` — `pending`, `confirmed`, or `failed` (validated; invalid values return 400)
- `category` — joins `memory_categories` table
- `search` — triggers FTS5 search with LIKE fallback
- `limit` — capped at 200, defaults to 50
- `offset` — defaults to 0

### Search
- FTS5 is attempted first using sanitized query (special characters stripped, words quoted with trailing wildcard).
- Falls back to LIKE on `key` and `content` columns if FTS5 is unavailable or returns no results.

### Memory Enrichment
- Each memory row is enriched with: `tier` (derived), `category` and `categoryConfidence` (from `memory_categories`), `decayScore` (computed live via `computeDecayMultiplier`).

### Sync Status Heuristic
- `isRunning` is `true` if any memory was confirmed within the last 120 seconds OR there are pending memories.

## Invariants

1. Only GET requests to paths starting with `/api/dashboard/memories` are handled; all others return `null`.
2. Tier parameter is validated: must be `"longterm"` or `"shortterm"` if provided; otherwise returns 400.
3. Status parameter is validated: must be `"pending"`, `"confirmed"`, or `"failed"` if provided; otherwise returns 400.
4. Limit is capped at `MAX_LIMIT` (200) regardless of query parameter value.
5. Archived memories (`archived = 1`) are excluded from list and stats queries.
6. Category and FTS5 queries gracefully handle missing tables (catch errors and continue).
7. Memory detail returns 404 if the ID does not exist.
8. All responses are JSON.

## Behavioral Examples

- `GET /api/dashboard/memories?tier=longterm&limit=10` — returns up to 10 confirmed memories with txid, ordered by `updated_at` DESC.
- `GET /api/dashboard/memories?search=wallet` — attempts FTS5 search for "wallet", falls back to LIKE `%wallet%` on key/content.
- `GET /api/dashboard/memories/stats` — returns `{ totalMemories, byTier, byStatus, byCategory, byAgent, oldestMemory, newestMemory, averageDecayScore }`.
- `GET /api/dashboard/memories/abc-123` — returns enriched memory detail or 404.
- `GET /api/dashboard/memories/sync-status` — returns `{ isRunning, pendingCount, failedCount, lastSyncAt, syncIntervalMs, recentErrors }`.
- `GET /api/dashboard/memories?tier=invalid` — returns 400 with message `'Invalid tier: must be "longterm" or "shortterm"'`.
- `POST /api/dashboard/memories` — returns `null` (non-GET method, pass-through).

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Invalid tier parameter | Returns 400 bad request |
| Invalid status parameter | Returns 400 bad request |
| Memory ID not found | Returns 404 not found |
| `memory_categories` table missing | Gracefully returns null category/confidence |
| `agent_memories_fts` table missing | Falls back to LIKE search |
| Route handler throws | Caught by `handleRouteError` and returned as error response |
| Non-GET request | Returns `null` (pass-through) |
| Path outside `/api/dashboard/memories` | Returns `null` (pass-through) |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `lib/response` | `json`, `badRequest`, `notFound`, `safeNumParam`, `handleRouteError` |
| `memory/decay` | `computeDecayMultiplier` for live decay score calculation |
| `middleware/guards` | `RequestContext` type |

### Consumed By

| Module | What is used |
|--------|-------------|
| `routes/dashboard` | `handleBrainViewerRoutes` registered as a dashboard sub-route handler |

## Change Log

| Version | Date | Description |
|---------|------|-------------|
| 1 | 2026-03-18 | Initial spec — 4 read-only endpoints for memory inspection dashboard. |

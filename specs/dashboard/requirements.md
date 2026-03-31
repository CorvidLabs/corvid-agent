---
spec: memory-brain-viewer.spec.md
---

## User Stories

- As an agent operator, I want to view all memories for an agent with their storage tier (longterm/shortterm) clearly indicated so that I can understand what the agent knows and where it is stored
- As an agent operator, I want to search and filter memories by tier, status, category, and text content so that I can quickly find specific memories
- As a platform administrator, I want to see per-agent memory statistics and sync health so that I can monitor the memory system across all agents
- As an agent operator, I want to view the sync status including pending count, failed count, and recent errors so that I can diagnose memory sync problems
- As an agent operator, I want three view modes (Overview, Browse, 3D) so that I can inspect memories at different levels of detail
- As an agent operator, I want old bookmarks to `/observe/brain-viewer` and `/observe/memory-browser` to redirect to the unified memory view so that my saved links continue to work

## Acceptance Criteria

- `GET /api/dashboard/memories` returns a paginated list of memories with correct `tier` field: `longterm` if `status='confirmed'` AND `txid IS NOT NULL`, otherwise `shortterm`
- `GET /api/dashboard/memories` supports query parameters: `agentId`, `tier`, `status`, `category`, `search`, `limit`, `offset`
- `GET /api/dashboard/memories/stats` returns aggregate statistics including `totalMemories`, `byTier`, `byStatus`, `byCategory`, `byAgent` breakdown, `oldestMemory`, `newestMemory`, and `averageDecayScore`
- `GET /api/dashboard/memories/:id` returns a single memory entry with full metadata
- `GET /api/dashboard/memories/sync-status` returns real-time sync service health: `isRunning`, `pendingCount`, `failedCount`, `lastSyncAt`, `syncIntervalMs`, and `recentErrors`
- `pendingCount` in sync-status matches `SELECT COUNT(*) FROM agent_memories WHERE status='pending'` at query time
- Decay scores are computed at query time via `computeDecayMultiplier`, not from cached stale values
- Every memory entry in the UI displays a visible tier badge (longterm or shortterm)
- If the on-chain transactor is unavailable, the viewer still renders SQLite data with a "chain unavailable" banner
- Default pagination limit is 50, maximum limit is 200, using offset-based pagination
- Category and categoryConfidence are null when no `memory_categories` entry exists for a memory (never blocks rendering)
- `search` parameter triggers FTS5 search; falls back to LIKE search if FTS5 fails
- `UnifiedMemoryComponent` provides Overview, Browse, and 3D view modes
- All endpoints filter by `agentId` when provided; multi-agent views require operator-tier permission
- Returns 400 for invalid agentId, 403 for insufficient permissions, 503 for database lock contention

## Constraints

- All dashboard memory endpoints are read-only (GET only); mutations go through existing MCP API routes
- Memory content is returned via authenticated API only; never embedded in client-side JavaScript bundles
- Agent isolation enforced: endpoints filter by `agentId` when provided
- FTS5 search failure is non-fatal; the system falls back to LIKE-based search with a logged warning
- Database busy_timeout retry is used for contention; 503 returned if still locked

## Out of Scope

- Creating, updating, or deleting memories from the dashboard (read-only view)
- Triggering manual memory sync from the dashboard UI
- Exporting memories to external formats (JSON, CSV)
- Memory content encryption/decryption in the browser (server-side only)
- Real-time WebSocket updates for memory changes (polling-based refresh)
- 3D visualization rendering logic (handled by the Angular component, not the API)

---
spec: memory-brain-viewer.spec.md
---

## Automated Testing

No dedicated test file found for dashboard routes. Coverage should be added:

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/__tests__/agent-memories.test.ts` | Unit | `listMemories`, `searchMemories` used by dashboard endpoints |
| _(missing)_ `server/__tests__/routes-dashboard.test.ts` | Integration | `/api/dashboard/memories` pagination, filtering, tier derivation, stats aggregation |

## Manual Testing

- [ ] `GET /api/dashboard/memories?agentId=<id>` — verify only that agent's memories are returned
- [ ] `GET /api/dashboard/memories?tier=longterm` — verify only `status=confirmed` + non-null txid entries returned
- [ ] `GET /api/dashboard/memories?tier=shortterm` — verify pending/failed entries returned
- [ ] `GET /api/dashboard/memories?search=deploy` — verify FTS5 search filters correctly
- [ ] `GET /api/dashboard/memories/stats` with no agentId — verify `byAgent` array covers all agents
- [ ] `GET /api/dashboard/memories/sync-status` — verify `pendingCount` matches actual pending row count in DB
- [ ] `GET /api/dashboard/memories/sync-status` when MemorySyncService is stopped — verify `isRunning: false` returned
- [ ] Navigate to `/observe/brain-viewer` — verify redirect to `/observe/memory`
- [ ] Navigate to `/observe/memory-browser` — verify redirect to `/observe/memory`
- [ ] View memory entry with `status=failed` — verify tier badge shows `shortterm`, status shows "failed"
- [ ] View agent with 0 memories — verify empty list returned, no server error

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| `agentId` provided but doesn't exist | Returns 400 with `INVALID_AGENT_ID` error code |
| Agent exists but has no memories | Returns `{ entries: [], total: 0 }` — not 404 |
| FTS5 index is corrupted | Falls back to LIKE search; logs warning; response still returned |
| `limit=500` (exceeds max) | Clamped to 200 |
| `limit=0` or negative | Returns 400 or defaults to 50 |
| Memory with `status=confirmed` but `txid=null` | Derived tier is `shortterm` (txid required for longterm) |
| `computeDecayMultiplier` throws | Category enrichment is best-effort; memory rendered without decay score |
| DB locked during stats query | Retry with busy_timeout; return 503 if still locked after retry |
| Unauthenticated request | Returns 403 with `INSUFFICIENT_PERMISSIONS` |
| Multi-agent stats query on large dataset | Aggregate query must complete; no per-agent N+1 queries |

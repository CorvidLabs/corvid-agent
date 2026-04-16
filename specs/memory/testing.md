---
spec: memory.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/__tests__/memory-manager.test.ts` | Unit | `MemoryManager.save/recall/search/list`, auto-categorization, embedding generation, cross-ref updates, cache behavior |
| `server/__tests__/memory-decay.test.ts` | Unit | `computeDecayMultiplier()` step boundaries, `applyDecay()` re-ranking, floor of 0.4 |
| `server/__tests__/memory-embeddings.test.ts` | Unit | `tokenize()`, `termFrequency()`, `IDFCorpus`, `cosineSimilaritySparse/Dense()`, zero-vector handling |
| `server/__tests__/memory-search.test.ts` | Unit | `fastSearch()` scoring blend, `deepSearch()` fallback on LLM failure, category-filter fallback |
| `server/__tests__/memory-categories.test.ts` | Unit | `categorize()` for all 10 categories, confidence bounds, `general` fallback |
| `server/__tests__/memory-cache.test.ts` | Unit | LRU eviction order, TTL expiration, `invalidatePrefix()`, `prune()` |
| `server/__tests__/memory-summarizer.test.ts` | Unit | Group detection, min-group-size skip, archive + summary creation, returns count |
| `server/__tests__/memory-sync.test.ts` | Integration | Short-term → confirmed promotion, sync from on-chain, tier label accuracy |
| `server/__tests__/arc69-memory.test.ts` (in algochat tests) | Integration | ARC-69 ASA memory write/read on localnet |

## Manual Testing

- [ ] Save a memory with key `api-key` and content `secret token for GitHub` — verify `memory_categories` records `credential` category with confidence > 0
- [ ] Recall the same memory twice — verify second call is served from LRU cache (no DB query)
- [ ] Save a memory, wait for it to age past the 7-day TTL — run `expireShortTermMemories()` and verify it is archived
- [ ] Recall a short-term memory 3 times — verify `access_count = 3` and `expires_at` extends to +14 days
- [ ] Save two memories sharing a domain (e.g., both about "kubernetes") — verify cross-references are created in `memory_cross_refs`
- [ ] Call `search(agentId, query, { mode: 'deep' })` with no `deepSearchFn` set — verify it falls back to fast search with no error
- [ ] Call `summarizeOldMemories(db, agentId)` with 3 old memories under the same key prefix — verify 3 archived and 1 summary created, returns 3
- [ ] Call `summarizeOldMemories(db, agentId)` with only 1 old memory in a group — verify it is NOT archived
- [ ] Promote a short-term memory via `corvid_promote_memory` — verify `status` transitions to `confirmed` and `txid` is set
- [ ] Promote a memory on testnet without `confirmed: true` — verify the handler returns a warning without writing

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| `recall()` for a non-existent key | Returns `null` |
| `search()` when FTS5 returns no matches | Returns empty `ScoredMemory[]` |
| `deepSearch()` LLM callback throws | Falls back to fast search results; logs warning |
| `ensureMemorySchema()` called on DB where tables already exist | No-op; idempotent |
| `listByCategory()` when `memory_categories` table does not exist | Returns empty array |
| `getRelated()` when `memory_cross_refs` table does not exist | Returns empty array |
| `tokenize('')` — empty input | Returns empty array |
| `cosineSimilaritySparse({}, someVector)` — zero vector | Returns 0 (no division by zero, no NaN) |
| Agent A searches for "Kubernetes" when agent B has a matching memory | Only agent A's memories returned (agent isolation) |
| LRU cache at `maxSize: 3`; insert 4th key | Least-recently-used key is evicted |
| LRU `get()` on key past TTL | Returns `undefined`; entry is lazily deleted |
| `applyDecay()` on memory 6 months old with score 1.0 | Score becomes 0.4 (1.0 * 0.4 floor multiplier) |
| FTS5 score blend when TF-IDF query vector is zero | 100% FTS5 rank used (no TF-IDF contribution) |
| Category filter eliminates all FTS5 candidates | Filter is dropped and unfiltered results returned |
| Updating an existing `confirmed` memory | Status resets to `short_term`; `txid` cleared until re-promoted |
| Session exits cleanly with zero user messages | No auto-save memory created (skipped) |

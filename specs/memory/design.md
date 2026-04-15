---
spec: memory.spec.md
sources:
  - server/memory/index.ts
  - server/memory/embeddings.ts
  - server/memory/decay.ts
  - server/memory/semantic-search.ts
  - server/memory/summarizer.ts
  - server/memory/cache.ts
  - server/memory/categories.ts
  - server/memory/schema.ts
---

## Module Structure

`server/memory/` implements the advanced memory subsystem on top of the core `server/db/agent-memories.ts` CRUD layer:

| File | Responsibility |
|------|---------------|
| `index.ts` | Exports `MemoryManager` — the unified high-level API wrapping all subsystems |
| `embeddings.ts` | `IDFCorpus` class, `tokenize()`, `termFrequency()`, `cosineSimilaritySparse/Dense()` — TF-IDF vector generation |
| `decay.ts` | `computeDecayMultiplier()`, `applyDecay()` — step-wise temporal decay for search re-ranking |
| `semantic-search.ts` | `fastSearch()`, `deepSearch()`, `search()` — FTS5 + TF-IDF hybrid search with optional LLM re-ranking |
| `summarizer.ts` | `summarizeOldMemories()` — archives old memories grouped by key prefix and creates summary entries |
| `cache.ts` | `LRUCache<T>` — generic LRU cache with TTL-based expiration and prefix invalidation |
| `categories.ts` | `categorize()`, `allCategories()` — keyword-heuristic categorization into 10 category taxonomy |
| `schema.ts` | `ensureMemorySchema()` — idempotent `CREATE TABLE IF NOT EXISTS` for 3 extension tables |

## Key Classes and Subsystems

### Two-Tier Memory Architecture
All memories start in SQLite (`agent_memories` table, `status: 'short_term'`) and are optionally promoted to on-chain ARC-69 ASAs (`status: 'confirmed'`). The SQLite layer is the fast-access tier; on-chain is the authoritative durable store.

- **Short-term**: `expires_at = datetime('now', '+7 days')`. Auto-archived by `expireShortTermMemories()`. Can resist expiry via access-count boosting (at access_count=3, TTL extends to +14 days).
- **Long-term (confirmed)**: `expires_at = NULL`. Never auto-archived. Requires explicit `corvid_promote_memory` call.
- **Permanent**: Plain Algorand self-transactions on testnet/mainnet. Immutable forever. Gated by explicit `confirmed: true` parameter.

### MemoryManager (index.ts)
Single-instance unified manager. Wraps all subsystems:
- `save()` → saves via core CRUD + auto-categorizes into `memory_categories` + generates TF-IDF embedding in `memory_embeddings` + updates cross-references in `memory_cross_refs`
- `recall()` → cache-first lookup; populates `LRUCache` on DB hit; increments `access_count` for short-term memories
- `search()` → dispatches to `fastSearch` or `deepSearch` based on `SearchOptions.mode`
- `getRelated()` → reads cross-references from `memory_cross_refs` ranked by Jaccard similarity

### TF-IDF + FTS5 Hybrid Search (semantic-search.ts)
`fastSearch()` pipeline:
1. SQLite FTS5 fulltext query to get candidate memories
2. TF-IDF cosine re-ranking against corpus vectors from `memory_embeddings`
3. Score blend: 40% FTS5 positional rank + 60% TF-IDF cosine (falls back to 100% FTS5 if TF-IDF vector is zero)
4. `applyDecay()` re-ranks by multiplying scores by temporal multipliers

`deepSearch()` additionally passes candidates to an optional `DeepSearchFn` (LLM re-ranker) and falls back to fast results on failure.

### LRU Cache (cache.ts)
Generic `LRUCache<T>` with configurable `maxSize` (default 1000) and `ttlMs` (default 5 minutes). Cache keys follow `{agentId}:{memoryKey}` format. Evicts LRU entry when at capacity. Expired entries are lazily deleted on `get()` and proactively swept via `prune()`.

### Categorization (categories.ts)
Keyword-heuristic classifier mapping memory key+content against 10 categories: `config`, `code`, `person`, `project`, `credential`, `preference`, `fact`, `conversation`, `task`, `general`. Returns `CategoryResult` with confidence in [0.0, 1.0]. Falls back to `general` with confidence 0.0 when no keywords match.

### Temporal Decay (decay.ts)
Step-wise multipliers based on days since `updated_at`:
- < 7 days: 1.0
- 7–30 days: 0.8
- 30–90 days: 0.6
- 90+ days: 0.4 (floor — memories are never zeroed)

## Configuration Values and Constants

| Setting | Value | Description |
|---------|-------|-------------|
| Short-term TTL | +7 days | Applied on every `saveMemory()` call |
| Access-count boost threshold | 3 | Extends TTL to +14 days when `access_count >= 3` |
| Decay floor | 0.4 | Minimum decay multiplier for memories 90+ days old |
| Cross-ref Jaccard threshold | 0.05 | Minimum similarity to create a cross-reference |
| Cross-refs per source | 10 | Maximum cross-references per source memory |
| Summarizer min group size | 2 | Groups with fewer memories are skipped |
| Summarizer default age | 30 days | Memories older than this are summarization candidates |
| LRU default TTL | 5 minutes | Cache TTL for recalled memories |

## Related Resources

| Resource | Description |
|----------|-------------|
| `server/db/agent-memories.ts` | Core CRUD: `saveMemory`, `recallMemory`, `searchMemories`, `listMemories`, `expireShortTermMemories`, `purgeOldArchivedMemories` |
| `agent_memories` DB table | Primary storage with `status`, `expires_at`, `access_count`, `txid` |
| `memory_categories` DB table | Per-memory category and confidence scores |
| `memory_embeddings` DB table | JSON-serialized TF-IDF weight maps |
| `memory_cross_refs` DB table | Jaccard-similarity cross-reference pairs |
| `server/algochat/` | AlgoChat/ARC-69 integration for on-chain memory promotion |
| `server/memory/consolidation.ts` | Memory consolidation and graduation pipeline |

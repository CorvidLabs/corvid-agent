---
module: memory
version: 1
status: active
files:
  - server/memory/index.ts
  - server/memory/embeddings.ts
  - server/memory/decay.ts
  - server/memory/semantic-search.ts
  - server/memory/summarizer.ts
  - server/memory/cache.ts
  - server/memory/categories.ts
  - server/memory/schema.ts
db_tables:
  - agent_memories
depends_on: []
---

# Memory System

## Purpose

Structured memory subsystem for agents. Provides persistent, per-agent memory storage with automatic categorization, TF-IDF embedding generation, LRU caching, dual-mode semantic search (fast FTS5 + TF-IDF hybrid and deep LLM re-ranking), temporal decay, summarization of old memories, and cross-reference tracking between related memories. All new capabilities are additive and backward compatible with the core `agent_memories` CRUD.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `tokenize` | `(text: string)` | `string[]` | Lowercases, strips punctuation, removes stop-words and tokens < 2 chars |
| `termFrequency` | `(tokens: string[])` | `Map<string, number>` | Normalized (by doc length) term-frequency map |
| `cosineSimilaritySparse` | `(a: Map<string, number>, b: Map<string, number>)` | `number` | Cosine similarity between two sparse TF-IDF vectors; returns 0 for zero vectors |
| `cosineSimilarityDense` | `(a: number[], b: number[])` | `number` | Cosine similarity between two dense float arrays |
| `computeDecayMultiplier` | `(updatedAt: string, now?: Date)` | `number` | Step-wise decay multiplier: <7d=1.0, 7-30d=0.8, 30-90d=0.6, 90d+=0.4 |
| `applyDecay` | `(results: ScoredMemory[], now?: Date)` | `ScoredMemory[]` | Multiplies each score by its decay factor and re-sorts descending |
| `fastSearch` | `(db: Database, agentId: string, query: string, opts?: SearchOptions)` | `ScoredMemory[]` | FTS5 candidate retrieval + TF-IDF cosine re-ranking with temporal decay |
| `deepSearch` | `(db: Database, agentId: string, query: string, opts?: SearchOptions, deepSearchFn?: DeepSearchFn)` | `Promise<ScoredMemory[]>` | Fast search for candidates, then optional LLM re-ranking; falls back to fast on failure |
| `search` | `(db: Database, agentId: string, query: string, opts?: SearchOptions, deepSearchFn?: DeepSearchFn)` | `Promise<ScoredMemory[]>` | Unified dispatch: delegates to `fastSearch` or `deepSearch` based on `opts.mode` |
| `summarizeOldMemories` | `(db: Database, agentId: string, olderThanDays?: number)` | `number` | Archives old unarchived memories grouped by key-prefix category, creates summary memories; returns archived count |
| `categorize` | `(key: string, content: string)` | `CategoryResult` | Keyword-heuristic categorization; returns best category and confidence 0.0-1.0 |
| `allCategories` | `()` | `MemoryCategory[]` | Returns the 10-element category taxonomy array |
| `ensureMemorySchema` | `(db: Database)` | `void` | Creates memory_categories, memory_embeddings, memory_cross_refs tables (idempotent) |

### Exported Types

| Type | Description |
|------|-------------|
| `MemoryManagerOptions` | `{ cache?: LRUCacheOptions; deepSearchFn?: DeepSearchFn }` |
| `EnrichedMemory` | `AgentMemory & { category?: MemoryCategory; categoryConfidence?: number }` |
| `SearchResult` | `{ memories: ScoredMemory[]; mode: SearchMode; totalCandidates: number }` |
| `SearchMode` | `'fast' \| 'deep'` |
| `SearchOptions` | `{ limit?: number; mode?: SearchMode; category?: string; minSimilarity?: number }` |
| `ScoredMemory` | `{ memory: AgentMemory; score: number; source: 'fts5' \| 'tfidf' \| 'combined' \| 'llm' }` |
| `DeepSearchFn` | `(query: string, candidates: AgentMemory[], limit: number) => Promise<ScoredMemory[]>` |
| `MemoryCategory` | `'config' \| 'code' \| 'person' \| 'project' \| 'credential' \| 'preference' \| 'fact' \| 'conversation' \| 'task' \| 'general'` |
| `CategoryResult` | `{ category: MemoryCategory; confidence: number }` |
| `LRUCacheOptions` | `{ maxSize?: number; ttlMs?: number }` |

### Exported Classes

| Class | Description |
|-------|-------------|
| `MemoryManager` | Unified manager wrapping CRUD with auto-categorization, embeddings, caching, and search |
| `IDFCorpus` | In-memory IDF corpus tracker for TF-IDF vector generation |
| `LRUCache` | LRU cache with configurable max size and TTL-based expiration |

#### MemoryManager Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `save` | `(params: { agentId: string; key: string; content: string })` | `EnrichedMemory` | Save with auto-categorization, embedding generation, and cross-ref update |
| `recall` | `(agentId: string, key: string)` | `EnrichedMemory \| null` | Cache-accelerated recall by key with category enrichment |
| `search` | `(agentId: string, query: string, opts?: SearchOptions)` | `Promise<SearchResult>` | Dual-mode search dispatching to fast or deep |
| `searchFast` | `(agentId: string, query: string, opts?: Omit<SearchOptions, 'mode'>)` | `ScoredMemory[]` | Synchronous fast search |
| `list` | `(agentId: string)` | `AgentMemory[]` | List recent memories (backward compatible) |
| `listByCategory` | `(agentId: string, category: MemoryCategory)` | `AgentMemory[]` | List memories filtered by category (limit 20) |
| `getRelated` | `(memoryId: string, limit?: number)` | `Array<{ memory: AgentMemory; score: number }>` | Get cross-referenced related memories by Jaccard similarity |
| `invalidateAgent` | `(agentId: string)` | `void` | Clear cache entries for a specific agent |
| `clearCache` | `()` | `void` | Clear all LRU cache entries and IDF corpora |
| `getCacheStats` | `()` | `{ size: number }` | Return current cache entry count |
| `setDeepSearchFn` | `(fn: DeepSearchFn)` | `void` | Set or update the deep search LLM callback |

#### IDFCorpus Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `addDocument` | `(tokens: string[])` | `void` | Add a document's unique terms to the corpus |
| `removeDocument` | `(tokens: string[])` | `void` | Remove a document's terms from the corpus |
| `idf` | `(term: string)` | `number` | Compute IDF: `log((N+1) / (1+df))` |
| `tfidfVector` | `(tokens: string[])` | `Map<string, number>` | Sparse TF-IDF vector for a document |
| `tfidfDenseVector` | `(tokens: string[], vocabIndex: string[])` | `number[]` | Dense float array aligned to a vocabulary index |

#### LRUCache Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `get` | `(key: string)` | `T \| undefined` | Get value if present and not expired; promotes to MRU |
| `set` | `(key: string, value: T)` | `void` | Set value with TTL; evicts LRU entry if at capacity |
| `delete` | `(key: string)` | `boolean` | Remove a specific key |
| `invalidatePrefix` | `(prefix: string)` | `number` | Remove all entries matching a key prefix |
| `clear` | `()` | `void` | Remove all entries |
| `prune` | `()` | `number` | Remove expired entries, return count removed |

## Invariants

1. **Agent isolation**: All memory operations (save, recall, search, list) are scoped to a single `agentId`. An agent can never read or search another agent's memories.
2. **Decay floor of 0.4**: `computeDecayMultiplier` never returns below 0.4. Old memories are deprioritized but never zeroed out by decay alone.
3. **Search results ranked by relevance**: All search results are sorted by score descending after decay is applied.
4. **Backward compatibility**: Memories saved through `MemoryManager.save()` are visible to core `saveMemory`/`recallMemory`/`searchMemories` functions, and vice versa.
5. **LRU eviction order**: When cache reaches `maxSize`, the least-recently-used entry is evicted first. Accessing a key via `get()` promotes it to most-recently-used.
6. **TTL expiration**: Cache entries older than `ttlMs` (default 5 minutes) return `undefined` on `get()` and are lazily deleted.
7. **Cache key format**: Cache keys are `{agentId}:{memoryKey}`, ensuring per-agent isolation in the shared cache.
8. **Auto-categorization on save**: Every `MemoryManager.save()` call automatically categorizes the memory and stores the result in `memory_categories`.
9. **Embedding update on save**: Every `MemoryManager.save()` call generates a TF-IDF embedding and stores it in `memory_embeddings`.
10. **Cross-reference threshold**: Cross-references are only created for memory pairs with Jaccard similarity > 0.05, capped at 10 per source memory.
11. **Category confidence bounds**: Confidence is always in [0.0, 1.0]. A score of 0.0 means no category keywords matched (falls back to `general`). Non-zero scores have a floor of 0.1.
12. **Summarizer minimum group size**: `summarizeOldMemories` skips groups with fewer than 2 memories.
13. **Summarizer preserves recency**: Only memories older than `olderThanDays` (default 30) are candidates for summarization.
14. **Schema idempotency**: `ensureMemorySchema()` uses `CREATE TABLE IF NOT EXISTS` and is safe to call on every initialization.
15. **Deep search graceful degradation**: If no `deepSearchFn` is provided or the LLM call fails, deep search falls back to fast search results.
16. **Cosine similarity for zero vectors**: Both `cosineSimilaritySparse` and `cosineSimilarityDense` return 0 when either input is a zero vector (no division by zero).
17. **Fast search scoring blend**: When TF-IDF produces non-zero query vectors, scores blend 40% FTS5 positional rank + 60% TF-IDF cosine. When TF-IDF zeroes out, 100% FTS5 rank is used.
18. **Category fallback in search**: If category filtering eliminates all FTS5 candidates, the filter is dropped and unfiltered results are returned.

## Behavioral Examples

### Scenario: Save with auto-enrichment

- **Given** a MemoryManager with an agent
- **When** `save({ agentId, key: 'api-key', content: 'secret token for GitHub' })` is called
- **Then** the returned `EnrichedMemory` has `category: 'credential'` with `categoryConfidence > 0`, and rows exist in `memory_categories` and `memory_embeddings`

### Scenario: Cache-accelerated recall

- **Given** a memory `test` was previously saved
- **When** `recall(agentId, 'test')` is called twice
- **Then** the first call queries the database and populates the cache; the second call returns the cached value without a DB query

### Scenario: Temporal decay re-ranking

- **Given** an old memory (6 months) with score 1.0 and a recent memory (2 days) with score 0.5
- **When** `applyDecay` is called
- **Then** the old memory's score becomes 0.4 (1.0 * 0.4) and the recent memory's score stays 0.5 (0.5 * 1.0), so the recent memory ranks first

### Scenario: Deep search without LLM callback

- **Given** a MemoryManager with no `deepSearchFn` configured
- **When** `search(agentId, query, { mode: 'deep' })` is called
- **Then** results are returned using fast search as a fallback

### Scenario: Summarize old memories

- **Given** two old memories with keys `project:alpha` and `project:beta` (60 days old)
- **When** `summarizeOldMemories(db, agentId)` is called
- **Then** both originals are archived (`archived=1`), a summary memory with key `summary:project:{date}` is created containing both contents, and the function returns 2

### Scenario: Summarizer skips single-memory groups

- **Given** one old memory in category `config`
- **When** `summarizeOldMemories` is called
- **Then** the memory is not archived and no summary is created

### Scenario: Agent-scoped search isolation

- **Given** agent1 has a memory about "Kubernetes" and agent2 has a memory about "Kubernetes"
- **When** `fastSearch(db, agent1Id, 'Kubernetes')` is called
- **Then** only agent1's memory is returned

### Scenario: LRU eviction at capacity

- **Given** a cache with `maxSize: 3` containing keys a, b, c
- **When** key d is inserted
- **Then** key a (least recently used) is evicted; keys b, c, d remain

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Recall nonexistent key | Returns `null` |
| Search with no FTS5 matches | Returns empty array |
| Deep search LLM callback throws | Falls back to fast search results, logs warning |
| `ensureMemorySchema` fails | `MemoryManager` logs warning, continues without memory extension tables |
| Category table doesn't exist | `listByCategory` returns empty array |
| Cross-refs table doesn't exist | `getRelated` returns empty array |
| Cache `get` on expired entry | Returns `undefined`, lazily deletes the entry |
| Empty input to `tokenize` | Returns empty array |
| Zero vectors in cosine similarity | Returns 0 (no NaN) |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/db/agent-memories.ts` | `saveMemory`, `recallMemory`, `listMemories`, `searchMemories` |
| `server/lib/logger.ts` | `createLogger` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/index.ts` | `MemoryManager` |
| `server/improvement/service.ts` | `MemoryManager`, `ScoredMemory` |
| `server/improvement/prompt-builder.ts` | `ScoredMemory` |
| `server/scheduler/service.ts` | `summarizeOldMemories` |
| `server/mcp/tool-handlers/index.ts` | `handleSaveMemory`, `handleRecallMemory` (via memory tool handler, uses core CRUD) |

## Database Tables

### agent_memories

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | Unique identifier (UUID) |
| agent_id | TEXT | NOT NULL | Owning agent |
| key | TEXT | NOT NULL | Memory key (unique per agent) |
| content | TEXT | NOT NULL | Memory content |
| txid | TEXT | DEFAULT NULL | On-chain transaction ID |
| status | TEXT | DEFAULT 'pending' | `pending` or `confirmed` |
| archived | INTEGER | NOT NULL DEFAULT 0 | 1 = archived by summarizer |
| created_at | TEXT | DEFAULT datetime('now') | Creation timestamp |
| updated_at | TEXT | DEFAULT datetime('now') | Last update timestamp |

### memory_categories

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| memory_id | TEXT | PRIMARY KEY, FK agent_memories(id) CASCADE | Memory reference |
| category | TEXT | NOT NULL DEFAULT 'general' | Auto-assigned category |
| confidence | REAL | NOT NULL DEFAULT 1.0 | Categorization confidence 0.0-1.0 |
| updated_at | TEXT | DEFAULT datetime('now') | Last categorization time |

### memory_embeddings

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| memory_id | TEXT | PRIMARY KEY, FK agent_memories(id) CASCADE | Memory reference |
| vector | TEXT | NOT NULL | JSON-serialized TF-IDF weight map |
| vocabulary | TEXT | NOT NULL DEFAULT '' | Comma-separated top-50 terms (debug) |
| updated_at | TEXT | DEFAULT datetime('now') | Last embedding time |

### memory_cross_refs

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| source_id | TEXT | NOT NULL, FK agent_memories(id) CASCADE | Source memory |
| target_id | TEXT | NOT NULL, FK agent_memories(id) CASCADE | Target memory |
| score | REAL | NOT NULL DEFAULT 0.0 | Jaccard similarity score |
| created_at | TEXT | DEFAULT datetime('now') | Creation timestamp |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| (none) | — | Memory module has no env var configuration; all settings are passed via `MemoryManagerOptions` constructor |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-27 | corvid-agent | Initial spec |

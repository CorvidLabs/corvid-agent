---
module: memory-consolidation
version: 1
status: active
files:
  - server/memory/consolidation.ts
db_tables:
  - agent_memories
depends_on:
  - specs/memory/memory.spec.md
---

# Memory Consolidation Service

## Purpose

Detects and merges duplicate or related agent memories using TF-IDF cosine similarity and Jaccard token overlap. Provides duplicate detection, merge suggestion generation, merge execution (update primary + archive duplicates), and bulk archiving of stale memories by decay score.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `findDuplicates` | `(db: Database, agentId: string, threshold?: number)` | `DuplicatePair[]` | Scan non-archived memories for near-duplicate pairs above similarity threshold (default 0.7) |
| `suggestMerges` | `(db: Database, agentId: string \| undefined, threshold?: number)` | `MergeSuggestion[]` | Group related memories by key prefix and content similarity; returns merge suggestions with preview content |
| `executeMerge` | `(db: Database, params: ExecuteMergeParams)` | `ExecuteMergeResult` | Update primary memory content to consolidated version and archive duplicates |
| `bulkArchive` | `(db: Database, filter: BulkArchiveFilter)` | `BulkArchiveResult` | Archive memories matching filter criteria (decay score, age, status) |

### Exported Types

| Type | Description |
|------|-------------|
| `MemoryRecord` | Memory row mapped to camelCase fields |
| `DuplicatePair` | A pair of memories with similarity score and detection method |
| `MergeSuggestion` | Suggested merge group with primary, duplicates, preview content, and similarity |
| `BulkArchiveFilter` | Filter criteria for bulk archive (agentId, maxDecayScore, olderThanDays, statuses) |
| `BulkArchiveResult` | Result of bulk archive with count and archived keys |
| `ExecuteMergeParams` | Parameters for merge execution (primaryId, duplicateIds, optional mergedContent) |
| `ExecuteMergeResult` | Result of merge with success flag, merged content, and archived keys |

## Invariants

1. `findDuplicates` only considers non-archived memories (`archived = 0`)
2. `findDuplicates` limits scan to 500 most recently updated memories per agent
3. Similarity score is the max of Jaccard and TF-IDF cosine (`combined = max(jaccard, tfidf)`)
4. `executeMerge` throws if primary memory is not found or already archived
5. Archived duplicates are soft-archived via `archiveMemory()` — never hard-deleted
6. `buildConsolidatedContent` (internal) deduplicates sentences and caps at 2000 chars
7. `suggestMerges` groups by key prefix first, then checks cross-prefix content duplicates at higher threshold (0.8)
8. `bulkArchive` applies decay filter via `computeDecayMultiplier` when `maxDecayScore` is set

## Behavioral Examples

### Scenario: Two memories with identical content

- **Given** two non-archived memories with same agent and nearly identical content
- **When** `findDuplicates` is called with default threshold
- **Then** returns a `DuplicatePair` with similarity score >= 0.7

### Scenario: Merge execution

- **Given** a primary memory and two duplicate memories
- **When** `executeMerge` is called
- **Then** primary content is updated with consolidated text, duplicates are archived

### Scenario: Bulk archive by decay

- **Given** several old short_term memories with low decay scores
- **When** `bulkArchive` is called with `maxDecayScore: 0.3`
- **Then** only memories with decay multiplier <= 0.3 are archived

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Primary memory not found or archived | `executeMerge` throws Error |
| Fewer than 2 memories for agent | `findDuplicates` returns empty array |
| Fewer than 2 memories total | `suggestMerges` returns empty array |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/db/agent-memories.ts` | `archiveMemory()` |
| `server/lib/logger.ts` | `createLogger()` |
| `server/memory/decay.ts` | `computeDecayMultiplier()` |
| `server/memory/embeddings.ts` | `cosineSimilaritySparse()`, `IDFCorpus`, `tokenize()` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/routes/brain-viewer.ts` | `findDuplicates`, `suggestMerges`, `executeMerge`, `bulkArchive` |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-04-10 | Jackdaw | Initial spec |

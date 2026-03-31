---
module: agent-memories-db
version: 1
status: draft
files:
  - server/db/agent-memories.ts
db_tables:
  - agent_memories
depends_on: []
---

# Agent Memories DB

## Purpose

Pure data-access layer for agent memory CRUD operations including save, recall, search, and lifecycle management. Memories are key-value pairs tied to an agent, optionally anchored on-chain via an Algorand transaction ID, with FTS5 full-text search support.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `saveMemory` | `(db: Database, params: { agentId: string; key: string; content: string; ttlDays?: number })` | `AgentMemory` | Upsert a memory by agent+key. On conflict, updates content and resets status to 'short_term', clears txid. Sets `expires_at` to `now + ttlDays` (default 7). Resets `access_count` to 0 |
| `recallMemory` | `(db: Database, agentId: string, key: string)` | `AgentMemory \| null` | Retrieve a specific memory by agent ID and key. For `short_term` memories: increments `access_count`; once count reaches 3, extends `expires_at` to max(current, now+14 days) |
| `searchMemories` | `(db: Database, agentId: string, query: string)` | `AgentMemory[]` | Search memories using FTS5 full-text search with LIKE fallback. Excludes archived. Max 20 results |
| `listMemories` | `(db: Database, agentId: string)` | `AgentMemory[]` | List non-archived memories for an agent, ordered by `updated_at DESC`. Max 20 results |
| `updateMemoryTxid` | `(db: Database, id: string, txid: string)` | `void` | Set the on-chain transaction ID and mark status as 'confirmed' |
| `updateMemoryStatus` | `(db: Database, id: string, status: MemoryStatus)` | `void` | Update the status of a memory (pending, confirmed, failed) |
| `getPendingMemories` | `(db: Database, limit?: number)` | `AgentMemory[]` | Get memories with status 'pending' or 'failed', ordered by `updated_at ASC`. Default limit 20 |
| `countPendingMemories` | `(db: Database)` | `number` | Count memories with status 'pending' or 'failed' |
| `updateMemoryAsaId` | `(db: Database, id: string, asaId: number)` | `void` | Set the ARC-69 ASA ID for a memory |
| `getMemoryByAsaId` | `(db: Database, agentId: string, asaId: number)` | `AgentMemory \| null` | Look up a memory by its ASA ID |
| `deleteMemoryRow` | `(db: Database, agentId: string, key: string)` | `boolean` | Hard-delete a memory row. Returns true if a row was deleted |
| `archiveMemory` | `(db: Database, agentId: string, key: string)` | `boolean` | Soft-delete by setting `archived = 1`. Returns true if a row was updated |
| `expireShortTermMemories` | `(db: Database)` | `number` | Archive all non-archived `short_term` memories whose `expires_at` is in the past. Returns count of archived memories |
| `purgeOldArchivedMemories` | `(db: Database, daysAfterArchive?: number)` | `number` | Hard-delete archived `short_term` memories whose `updated_at` is older than `daysAfterArchive` days (default 30). Returns count deleted |

### Exported Types

| Type | Description |
|------|-------------|
| (none) | All types are imported from `shared/types` (`AgentMemory`, `MemoryStatus`) |

## Invariants

1. **Upsert semantics**: `saveMemory` uses `ON CONFLICT(agent_id, key) DO UPDATE` ensuring at most one memory per agent+key pair
2. **Status reset on upsert**: When a memory is updated via `saveMemory`, status resets to 'pending' and txid resets to NULL, requiring re-confirmation on-chain
3. **UUID generation**: Memory IDs are generated via `crypto.randomUUID()` (but the actual ID may differ on upsert conflict)
4. **Archived exclusion**: `searchMemories` and `listMemories` filter out archived memories (`archived = 0`)
5. **FTS5 with LIKE fallback**: `searchMemories` attempts FTS5 ranked search first; on failure (missing table or invalid query), falls back to LIKE-based search on key and content
6. **FTS5 sanitization**: Special characters are stripped from search queries and each word is wrapped as a quoted prefix match (`"word"*`)
7. **Result limits**: `searchMemories`, `listMemories`, and `getPendingMemories` all cap results at 20 by default
8. **Confirmation flow**: Memories follow the lifecycle: pending -> confirmed (via `updateMemoryTxid`) or pending -> failed (via `updateMemoryStatus`)
9. **Cascade deletion**: Memories are deleted automatically when their parent agent is deleted (ON DELETE CASCADE)
10. **TTL default**: New `short_term` saves receive a default TTL of 7 days (`expires_at = now + 7 days`). Custom TTL is set via `ttlDays` parameter
11. **Access-based retention**: `recallMemory` increments `access_count` for `short_term` memories; at ≥3 accesses, `expires_at` is extended to at least `now + 14 days`
12. **Decay is non-destructive first**: `expireShortTermMemories` sets `archived = 1` (soft-delete); `purgeOldArchivedMemories` performs the hard-delete 30 days later
13. **Promoted memories exempt from decay**: Only `status = 'short_term'` memories are subject to TTL expiry and purge

## Behavioral Examples

### Scenario: Save a new memory

- **Given** an agent with no existing memory for key "preferences"
- **When** `saveMemory(db, { agentId: 'agent-1', key: 'preferences', content: 'likes dark mode' })` is called
- **Then** a new memory is created with status 'pending' and txid null

### Scenario: Upsert an existing memory

- **Given** an agent with an existing confirmed memory for key "preferences"
- **When** `saveMemory(db, { agentId: 'agent-1', key: 'preferences', content: 'likes light mode' })` is called
- **Then** the content is updated, status resets to 'pending', and txid resets to NULL

### Scenario: FTS5 search with fallback

- **Given** an agent with memories containing "machine learning" in content and no FTS5 table
- **When** `searchMemories(db, agentId, 'machine learning')` is called
- **Then** the FTS5 query fails silently and LIKE search returns matching memories

### Scenario: Confirm memory on-chain

- **Given** a pending memory with id "mem-1"
- **When** `updateMemoryTxid(db, 'mem-1', 'TX123ABC')` is called
- **Then** the memory's txid becomes 'TX123ABC' and status becomes 'confirmed'

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `recallMemory` with nonexistent key | Returns `null` |
| `searchMemories` with empty query after sanitization | FTS5 returns null query, falls through to LIKE search with `%%` pattern |
| `searchMemories` with FTS5 table missing | Catches error silently, falls back to LIKE search |
| `saveMemory` upsert re-read fails | Returns a synthetic `AgentMemory` from the input parameters |
| `getPendingMemories` with no pending records | Returns empty array |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `bun:sqlite` | `Database` type |
| `shared/types` | `AgentMemory`, `MemoryStatus` |
| `server/db/types` | `queryCount` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/mcp/tool-handlers/memory.ts` | `saveMemory`, `recallMemory`, `searchMemories`, `listMemories`, `updateMemoryTxid`, `updateMemoryStatus` |
| `server/memory/index.ts` | `saveMemory`, `recallMemory`, `searchMemories`, `listMemories`, `updateMemoryTxid`, `updateMemoryStatus`, `getPendingMemories`, `countPendingMemories` |
| `server/memory/graduation-service.ts` | `expireShortTermMemories`, `purgeOldArchivedMemories` |
| `server/memory/semantic-search.ts` | `searchMemories` |
| `server/routes/index.ts` | `updateMemoryTxid` |

## Database Tables

### agent_memories

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| agent_id | TEXT | NOT NULL, FK agents(id) ON DELETE CASCADE | Owning agent |
| key | TEXT | NOT NULL | Memory key (unique per agent via composite index) |
| content | TEXT | NOT NULL | Memory content/value |
| txid | TEXT | DEFAULT NULL | Algorand transaction ID anchoring this memory on-chain |
| asa_id | INTEGER | DEFAULT NULL | ARC-69 ASA ID for long-term memories (localnet only). NULL for permanent (plain txn) memories |
| status | TEXT | DEFAULT 'confirmed' | Lifecycle status: pending, confirmed, failed |
| archived | INTEGER | NOT NULL, DEFAULT 0 | Soft-delete flag (0 = active, 1 = archived) |
| book | TEXT | DEFAULT NULL | Book grouping for organized memory collections (e.g. 'operational', 'contacts') |
| page | INTEGER | DEFAULT NULL | Page number within a book for ordered content |
| expires_at | TEXT | DEFAULT NULL | TTL expiry for `short_term` memories. NULL for promoted (pending/confirmed) memories. Set to `now + ttlDays` on save |
| access_count | INTEGER | NOT NULL, DEFAULT 0 | Recall counter for `short_term` memories. Resets to 0 on upsert. Memories recalled ≥3 times get extended TTL |
| created_at | TEXT | DEFAULT datetime('now') | Creation timestamp |
| updated_at | TEXT | DEFAULT datetime('now') | Last modification timestamp |

### Indexes

| Index | Columns | Type | Description |
|-------|---------|------|-------------|
| idx_agent_memories_agent_key | (agent_id, key) | UNIQUE | Enforces one memory per agent+key pair, used for upsert |
| idx_agent_memories_agent | (agent_id) | INDEX | Speeds up per-agent queries |
| idx_agent_memories_asa | (agent_id, asa_id) WHERE asa_id IS NOT NULL | INDEX | Fast lookup of memory by ASA ID |
| idx_agent_memories_book_page | (agent_id, book, page) WHERE book IS NOT NULL | INDEX | Fast lookup of memories within a book |
| idx_agent_memories_expires | (expires_at) WHERE expires_at IS NOT NULL | INDEX | Fast lookup of memories by expiry for the decay cleanup job |

### Triggers

| Trigger | Event | Description |
|---------|-------|-------------|
| trg_agent_memories_book_page_insert | BEFORE INSERT | Enforces book and page must both be set or both be NULL |
| trg_agent_memories_book_page_update | BEFORE UPDATE | Enforces book and page must both be set or both be NULL |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
| 2026-03-30 | Jackdaw | Migration 113: add `expires_at`, `access_count`; add `expireShortTermMemories`, `purgeOldArchivedMemories` |

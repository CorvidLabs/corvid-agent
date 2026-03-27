---
module: arc69-library
version: 1
status: draft
files:
  - server/memory/arc69-library.ts
  - server/memory/library-sync.ts
  - server/db/migrations/106_agent_library.ts
  - server/db/schema/library.ts
  - server/db/agent-library.ts
db_tables:
  - agent_library
depends_on:
  - specs/memory/arc69-memory.spec.md
---

# ARC-69 Shared Agent Library (CRVLIB)

## Purpose

Build a shared, on-chain knowledge library where Team Alpha agents can publish and consume plaintext ARC-69 ASAs. Unlike CRVMEM (encrypted, private), CRVLIB entries are **plaintext** and readable by any agent. This enables a shared knowledge commons for guides, standards, decisions, and runbooks.

Supports multi-page "book" chaining where ASAs link together like chapters — useful for long-form content that exceeds a single note.

| Aspect | CRVMEM | CRVLIB |
|--------|--------|--------|
| Unit name | `CRVMEM` | `CRVLIB` |
| Asset name | `mem:{key}` | `lib:{key}` |
| Encryption | AlgoChat PSK (self-to-self) | None — plaintext |
| Who can read | Author only | Any agent |
| Who can update | Author only (manager) | Author only (manager) |
| DB table | `agent_memories` | `agent_library` |
| Multi-page | No | Yes — book chaining |

**Localnet only.** CRVLIB requires a fast, free chain for practical use.

## Public API

### Exported Functions — `server/memory/arc69-library.ts`

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `createLibraryEntry` | `(ctx: LibraryContext, params: CreateLibraryParams)` | `Promise<{ asaId: number; txid: string }>` | Mint CRVLIB ASA with plaintext ARC-69 note |
| `updateLibraryEntry` | `(ctx: LibraryContext, asaId: number, params: UpdateLibraryParams, existing: LibraryEntry)` | `Promise<{ txid: string }>` | acfg txn to update note |
| `readLibraryEntry` | `(ctx: LibraryContext, asaId: number)` | `Promise<LibraryEntry \| null>` | Fetch latest acfg note, parse plaintext JSON |
| `deleteLibraryEntry` | `(ctx: LibraryContext, asaId: number, mode: 'soft' \| 'hard')` | `Promise<{ txid: string }>` | Soft (empty note) or hard (destroy ASA) |
| `listLibraryEntries` | `(ctx: LibraryContext, filters?: LibraryFilters)` | `Promise<LibraryEntry[]>` | Query indexer for ALL CRVLIB ASAs via unit name filter; optional authorAddress, category, tag filters |
| `readBook` | `(ctx: LibraryContext, bookKey: string)` | `Promise<LibraryEntry[]>` | Fetch all pages of a book in order; page 1 found via DB `book=bookKey, page=1` lookup |
| `appendPage` | `(ctx: LibraryContext, bookKey: string, params: AppendPageParams)` | `Promise<{ asaId: number; txid: string }>` | Mint new page ASA and wire into book chain; page 1 must exist with key `{bookKey}/page-1` |
| `resolveLibraryAsa` | `(db: Database, key: string)` | `number \| null` | DB lookup for key → ASA ID |
| `buildNotePayload` | `(key, authorId, authorName, category, tags, content, bookMeta?)` | `Uint8Array` | Build ARC-69 JSON note bytes |
| `parseNotePayload` | `(noteBytes: Uint8Array)` | `LibraryNotePayload \| null` | Parse ARC-69 note bytes; returns null on failure or CRVMEM notes |

### Exported Class — `server/memory/library-sync.ts`

| Export | Description |
|--------|-------------|
| `LibrarySyncService` | Periodically indexes all CRVLIB ASAs from localnet into `agent_library`; follows the MemorySyncService pattern |

### Exported Functions — `server/db/migrations/106_agent_library.ts`

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `up` | `(db: Database)` | `void` | Create `agent_library` table and indexes |
| `down` | `(db: Database)` | `void` | Drop indexes and table |

### Exported Constants — `server/db/schema/library.ts`

| Export | Type | Description |
|--------|------|-------------|
| `tables` | `string[]` | DDL statements for the `agent_library` table |
| `indexes` | `string[]` | DDL statements for library indexes |

### Exported Functions — `server/db/agent-library.ts`

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `saveLibraryEntry` | `(db: Database, params)` | `LibraryEntry` | Upsert library entry to SQLite |
| `getLibraryEntry` | `(db: Database, key: string)` | `LibraryEntry \| null` | Fetch non-archived entry by key |
| `getLibraryEntryByAsaId` | `(db: Database, asaId: number)` | `LibraryEntry \| null` | Fetch entry by ASA ID |
| `listLibraryEntries` | `(db: Database, options?)` | `LibraryEntry[]` | List with optional category/author/tag filters |
| `getBookPages` | `(db: Database, book: string)` | `LibraryEntry[]` | Return all pages of a book sorted by page number |
| `updateLibraryEntryTxid` | `(db: Database, key: string, txid: string)` | `void` | Set txid after on-chain sync |
| `updateLibraryEntryAsaId` | `(db: Database, key: string, asaId: number)` | `void` | Store ASA ID after minting |
| `archiveLibraryEntry` | `(db: Database, key: string)` | `boolean` | Soft-delete (set archived=1) |
| `deleteLibraryEntryRow` | `(db: Database, key: string)` | `boolean` | Hard-delete row from SQLite |
| `resolveLibraryAsaId` | `(db: Database, key: string)` | `number \| null` | Look up ASA ID for a key |
| `upsertLibraryEntryFromChain` | `(db: Database, params)` | `void` | Restore from on-chain sync |

### Exported Types

| Type | Description |
|------|-------------|
| `LibraryContext` | Context: db, agentId, agentName, algodClient, indexerClient, chatAccount |
| `LibraryEntry` | Full entry with asaId, key, author, category, tags, content, book/page metadata, txid |
| `LibraryNotePayload` | ARC-69 JSON structure stored in transaction note |
| `LibraryCategory` | `'guide' \| 'reference' \| 'decision' \| 'standard' \| 'runbook'` |
| `CreateLibraryParams` | Parameters for createLibraryEntry |
| `UpdateLibraryParams` | Parameters for updateLibraryEntry |
| `AppendPageParams` | Parameters for appendPage |
| `ListLibraryOptions` | Options for DB-level `listLibraryEntries` (category, authorId, tag, book, limit, includeArchived) |
| `LibraryFilters` | Filters for on-chain listLibraryEntries |

### ARC-69 Note Schema

```json
{
  "standard": "arc69",
  "description": "corvid-agent library",
  "mime_type": "text/plain",
  "properties": {
    "key": "typescript-style-guide",
    "author_id": "357251b1-...",
    "author_name": "Jackdaw",
    "category": "guide",
    "tags": ["typescript", "style"],
    "content": "Use strict TypeScript. Prefer const over let...",
    "book": "typescript-style-guide",
    "page": 1,
    "next": 1234,
    "prev": null,
    "total": 3,
    "v": 1
  }
}
```

Content is **plaintext** — no encryption. For single-page entries, `book`, `page`, `next`, `prev`, and `total` are omitted.

## Invariants

1. **Plaintext content.** CRVLIB entries are never encrypted. Agents that need private knowledge should use CRVMEM.
2. **Unit name `CRVLIB`.** All library ASAs use unit name `CRVLIB` to distinguish from `CRVMEM`.
3. **Author-only updates.** Only the agent whose wallet is the ASA manager can update or delete an entry.
4. **Localnet only.** CRVLIB is gated on `network === 'localnet'`.
5. **Note field limit.** The ARC-69 note is limited to 1024 bytes. Content exceeding the available space (approximately 700 bytes after JSON overhead) will be rejected — use book chaining instead.
6. **SQLite is the index.** The `agent_library` table is a local cache. The on-chain ASA is authoritative.
7. **Key is globally unique.** The `key` column has a UNIQUE constraint — one key maps to at most one ASA. The `asa_id` column also has a UNIQUE constraint to prevent duplicate rows during sync.
8. **Book chaining integrity.** Page 1 always carries `total` = number of pages. Each page carries `prev`/`next` ASA IDs linking the chain.
9. **Book key convention.** All pages use `{bookKey}/page-{n}` suffix (e.g., `arch-guide/page-1`, `arch-guide/page-2`). `readBook` finds page 1 by querying `book=bookKey AND page=1` in the local DB — not by key prefix.
10. **Library discovery.** `listLibraryEntries` uses `searchForAssets().unit('CRVLIB')` to find ALL library ASAs from any agent. Optional `authorAddress` filter scopes to a specific creator. This is how agents discover each other's published content.

## Behavioral Examples

### Scenario: Create a single-page library entry

- **Given** agent Jackdaw is on localnet
- **When** `corvid_library_write(key: "adr-001", content: "Use Bun runtime", category: "decision")` is called
- **Then** a CRVLIB ASA is minted with plaintext ARC-69 note
- **And** `agent_library` row is created with `asa_id` set to the new ASA ID
- **And** any agent can read the content by querying the ASA

### Scenario: Read a library entry

- **Given** a CRVLIB ASA with key "adr-001" exists on-chain
- **When** `corvid_library_read(key: "adr-001")` is called by any agent (not just the author)
- **Then** the latest `acfg` note is fetched and parsed
- **And** the plaintext content is returned without decryption

### Scenario: Update an existing entry

- **Given** Jackdaw has a CRVLIB ASA for "adr-001"
- **When** `corvid_library_write(key: "adr-001", content: "Updated: Use Bun runtime v1.3+")` is called
- **Then** an `acfg` transaction is sent with updated note
- **And** the old content is replaced in the latest `acfg`

### Scenario: Create a multi-page book

- **Given** agent Condor wants to publish a long guide
- **When** page 1 is created with key `"arch-guide/page-1"`, `book: "arch-guide"`, `page: 1`, then `appendPage("arch-guide", ...)` is called
- **Then** page 2 ASA is minted with key `"arch-guide/page-2"`, page 1's `next` pointer is updated, and page 1's `total` becomes 2
- **And** `readBook("arch-guide")` returns both pages in order by following the chain from `book=arch-guide, page=1` in the DB

### Scenario: Delete a library entry

- **Given** Jackdaw has a CRVLIB ASA for "old-doc"
- **When** `corvid_library_delete(key: "old-doc", mode: "hard")` is called
- **Then** the ASA is destroyed and the SQLite row is removed
- **And** the entry is no longer readable

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Note exceeds 1024 bytes | Return error: "Content too large — use book chaining" |
| Not on localnet | Return error: CRVLIB is localnet-only |
| Update by non-author | Return error: only the author (ASA manager) can update |
| ASA not found | Return null |
| Indexer unavailable | Fall back to SQLite cached content |
| Invalid ARC-69 JSON in note | Log warning, skip during sync |
| `readBook` on nonexistent book | Return empty array |
| `appendPage` on nonexistent book | Throw error: create page 1 with key `{bookKey}/page-1` first |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `algosdk` | `makeAssetCreateTxnWithSuggestedParamsFromObject`, `makeAssetConfigTxnWithSuggestedParamsFromObject`, `makeAssetDestroyTxnWithSuggestedParamsFromObject` |
| `server/algochat/agent-wallet.ts` | `getAgentChatAccount()` for wallet access |
| `server/algochat/service.ts` | `algorandService` for algod/indexer clients |
| `server/db/agent-library.ts` | All DB CRUD functions |

### Consumed By

> **Note:** `server/mcp/tool-handlers/library.ts` does not exist yet. It is classified as Layer 1 (Structural) under governance and requires a supermajority council vote + human approval before creation. The MCP tool handlers (`corvid_library_write`, `corvid_library_read`, `corvid_library_list`, `corvid_library_delete`) are documented in this spec but the handler file must be created through the governance process. Until then, no consumer references exist.

## Database Tables

### agent_library

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | Row UUID |
| asa_id | INTEGER | DEFAULT NULL, UNIQUE | On-chain ASA ID — UNIQUE prevents duplicate sync rows |
| key | TEXT | NOT NULL, UNIQUE | Unique entry identifier |
| author_id | TEXT | NOT NULL, FK→agents.id | Agent that created the entry |
| author_name | TEXT | NOT NULL | Author display name |
| category | TEXT | NOT NULL, DEFAULT 'reference' | Entry category |
| tags | TEXT | NOT NULL, DEFAULT '[]' | JSON array of tags |
| content | TEXT | NOT NULL | Entry content |
| book | TEXT | DEFAULT NULL | Book identifier for multi-page entries |
| page | INTEGER | DEFAULT NULL | Page number within book (1-indexed) |
| txid | TEXT | DEFAULT NULL | Most recent transaction ID |
| created_at | TEXT | NOT NULL | ISO 8601 timestamp |
| updated_at | TEXT | NOT NULL | ISO 8601 timestamp |
| archived | INTEGER | NOT NULL, DEFAULT 0 | 1 = soft-deleted |

### Indexes

| Index | Columns | Description |
|-------|---------|-------------|
| idx_agent_library_key | (key) | Fast key lookup |
| idx_agent_library_category | (category) WHERE archived=0 | Category browse |
| idx_agent_library_book_page | (book, page) WHERE book IS NOT NULL | Book page traversal |
| idx_agent_library_author | (author_id) | List by author |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| (none new) | — | CRVLIB is auto-enabled on localnet. No new configuration required |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-26 | corvid-agent | Initial spec — shared plaintext library with book chaining |
| 2026-03-26 | corvid-agent | v1.1: localnet gate, searchForAssets for all-agent discovery, /page-N key convention, asa_id UNIQUE, LibrarySyncService, exported buildNotePayload/parseNotePayload |

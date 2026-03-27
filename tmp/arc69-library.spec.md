---
module: arc69-library
version: 1
status: draft
files:
  - server/memory/arc69-library.ts
  - server/mcp/tool-handlers/library.ts
  - server/db/migrations/XXX_arc69_library.ts
db_tables:
  - agent_library
depends_on:
  - arc69-memory
---

# ARC-69 Shared Agent Library (CRVLIB)

## Purpose

A shared, on-chain knowledge library where Team Alpha agents can publish and consume ARC-69 ASAs cooperatively. Unlike `CRVMEM` memories (encrypted, private, single-agent), library entries are **plaintext, shared, and readable by any agent**. Any agent can create entries; any agent can read them; any agent can request updates.

This enables collective knowledge building — guides, references, decisions, and multi-page "books" that persist on-chain and are discoverable by the entire team.

## Key Differences from CRVMEM

| Aspect | CRVMEM (Private Memory) | CRVLIB (Shared Library) |
|--------|------------------------|------------------------|
| Unit name | `CRVMEM` | `CRVLIB` |
| Encryption | PSK-encrypted (self-to-self) | **Plaintext** — intentionally readable |
| Audience | Single agent only | All agents on localnet |
| Use case | Personal memory, preferences | Shared guides, references, decisions |
| Chaining | Not supported | Multi-page book chaining |

## ARC-69 Note Schema

### Single-page entry

```json
{
  "standard": "arc69",
  "description": "corvid-agent library",
  "mime_type": "text/plain",
  "properties": {
    "key": "guide-pr-review-checklist",
    "author_id": "357251b1-...",
    "author_name": "Rook",
    "category": "guide",
    "tags": ["pr", "review", "process"],
    "content": "<plaintext content>",
    "v": 1
  }
}
```

### Chained (multi-page) entry

Each page in a chain includes a `chain` object:

```json
{
  "standard": "arc69",
  "description": "corvid-agent library",
  "mime_type": "text/plain",
  "properties": {
    "key": "guide-pr-review/page-1",
    "author_id": "357251b1-...",
    "author_name": "Rook",
    "category": "guide",
    "tags": ["pr", "review"],
    "chain": {
      "book": "guide-pr-review",
      "page": 1,
      "next": 98765,
      "prev": null,
      "total": 3
    },
    "content": "Page 1 content here...",
    "v": 1
  }
}
```

### Chain Rules

1. `book` — shared identifier across all pages in the chain. Must be identical on every page.
2. `page` — 1-indexed ordinal position.
3. `next` / `prev` — ASA IDs linking the chain. `null` at chain ends.
4. `total` — total page count. Updated on **page 1** whenever the chain grows. Other pages may have stale `total` values; page 1 is authoritative.
5. Adding a new page requires: mint new ASA, update previous page's `next` via `acfg`, update page 1's `total` via `acfg`.
6. Maximum content per page: 8000 bytes (conservative limit for ARC-69 note field). Content exceeding this must be split across pages.

### Categories

| Category | Description | Examples |
|----------|-------------|---------|
| `guide` | How-to knowledge, processes | PR review checklist, deployment steps |
| `reference` | Facts, lookups, data | API endpoints, config values, team contacts |
| `decision` | Architectural or process decisions | "Why we chose X over Y" |
| `standard` | Team standards and conventions | Code style, naming conventions |
| `runbook` | Operational procedures | Incident response, rollback steps |

Categories are advisory — agents use them for filtering but enforcement is not strict.

### Tags

Free-form string array for cross-cutting concerns. No controlled vocabulary — agents add whatever tags make sense. Used for search/filtering.

## Public API

### Exported Functions — `server/memory/arc69-library.ts`

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `createLibraryEntry` | `(ctx: LibraryContext, entry: LibraryEntryInput)` | `Promise<{ asaId: number; txid: string }>` | Mint a new `CRVLIB` ASA with plaintext ARC-69 note |
| `updateLibraryEntry` | `(ctx: LibraryContext, asaId: number, updates: Partial<LibraryEntryInput>)` | `Promise<{ txid: string }>` | Send `acfg` txn with updated ARC-69 note |
| `readLibraryEntry` | `(ctx: LibraryContext, asaId: number)` | `Promise<LibraryEntry \| null>` | Fetch latest `acfg` txn for ASA, parse plaintext note |
| `deleteLibraryEntry` | `(ctx: LibraryContext, asaId: number, mode: 'soft' \| 'hard')` | `Promise<{ txid: string }>` | Soft: empty note. Hard: destroy ASA |
| `listLibraryEntries` | `(ctx: LibraryContext, filter?: LibraryFilter)` | `Promise<LibraryEntry[]>` | List library entries, optionally filtered by category/tag/author |
| `readBook` | `(ctx: LibraryContext, bookId: string)` | `Promise<LibraryEntry[]>` | Fetch all pages of a chained book in order, following `next` links from page 1 |
| `appendPage` | `(ctx: LibraryContext, bookId: string, content: string)` | `Promise<{ asaId: number; txid: string }>` | Add a new page to an existing book chain |
| `resolveLibraryAsa` | `(db: Database, key: string)` | `number \| null` | Look up ASA ID for a library key from local DB |

### Exported Types

| Type | Description |
|------|-------------|
| `LibraryContext` | Context: db, agentId, agentName, algodClient, indexerClient |
| `LibraryEntry` | `{ asaId: number; key: string; authorId: string; authorName: string; category: string; tags: string[]; content: string; chain?: ChainInfo; txid: string; round: number; timestamp: string }` |
| `LibraryEntryInput` | `{ key: string; category: string; tags?: string[]; content: string; chain?: ChainInfo }` |
| `LibraryFilter` | `{ category?: string; tag?: string; authorId?: string; book?: string }` |
| `ChainInfo` | `{ book: string; page: number; next: number \| null; prev: number \| null; total: number }` |
| `LibraryNotePayload` | The ARC-69 JSON structure for library entries |

## Database Tables

### agent_library

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Local row ID |
| asa_id | INTEGER | NOT NULL, UNIQUE | On-chain ASA ID |
| key | TEXT | NOT NULL | Entry key (e.g., `guide-pr-review/page-1`) |
| author_id | TEXT | NOT NULL | Agent ID of the creator |
| author_name | TEXT | NOT NULL | Human-readable agent name |
| category | TEXT | NOT NULL | Entry category |
| tags | TEXT | DEFAULT '[]' | JSON array of tags |
| content | TEXT | NOT NULL | Plaintext content |
| book | TEXT | DEFAULT NULL | Book identifier for chained entries |
| page | INTEGER | DEFAULT NULL | Page number within book |
| txid | TEXT | NOT NULL | Latest transaction ID |
| created_at | TEXT | NOT NULL DEFAULT (datetime('now')) | Row creation time |
| updated_at | TEXT | NOT NULL DEFAULT (datetime('now')) | Last update time |
| archived | INTEGER | NOT NULL DEFAULT 0 | 1 = soft-deleted |

### Indexes

| Index | Columns | Description |
|-------|---------|-------------|
| idx_library_key | (key) | Fast key lookup |
| idx_library_category | (category) | Filter by category |
| idx_library_book | (book, page) | Fetch book pages in order |
| idx_library_author | (author_id) | Filter by author |

## Invariants

1. **`CRVLIB` unit name.** All library ASAs use unit name `CRVLIB` to distinguish from private `CRVMEM` memories.
2. **Plaintext content.** Library entries are NEVER encrypted. The content in the ARC-69 note is plaintext. This is by design — the library is shared.
3. **Any agent can read.** No access control on reads. Any agent that can query the indexer can read any library entry.
4. **Only the author can update/delete.** The ASA manager is always the creating agent's wallet. Only that wallet can send `acfg` transactions.
5. **Chain integrity.** When a book has N pages, page 1's `total` must equal N. Each page's `prev`/`next` must form a valid doubly-linked list with no gaps.
6. **ASA total = 1, decimals = 0.** Same as CRVMEM — each entry is a unique NFT.
7. **Localnet only.** Same gate as CRVMEM.
8. **Key uniqueness.** Each key maps to at most one ASA. For chained entries, keys follow the pattern `{book}/page-{n}`.
9. **Manager = creator wallet.** Reserve, freeze, clawback are cleared.
10. **SQLite is the index, chain is source of truth.** Same as CRVMEM — sync from chain restores the local cache.

## Behavioral Examples

### Scenario: Create a single-page library entry

- **Given** Rook wants to share a PR review checklist
- **When** `createLibraryEntry({ key: "guide-pr-review", category: "guide", tags: ["pr", "review"], content: "1. Check tests pass..." })` is called
- **Then** a `CRVLIB` ASA is minted with plaintext ARC-69 note
- **And** `agent_library` row is created with the ASA ID
- **And** any agent can now discover and read this entry

### Scenario: Create a multi-page book

- **Given** CorvidAgent wants to write a 3-page architecture guide
- **When** page 1 is created with `chain: { book: "arch-overview", page: 1, next: null, prev: null, total: 1 }`
- **And** `appendPage("arch-overview", "Page 2 content")` is called
- **Then** a new ASA is minted for page 2 with `chain: { book: "arch-overview", page: 2, next: null, prev: <page1-asa>, total: 2 }`
- **And** page 1's `acfg` is updated: `next` set to page 2's ASA ID, `total` set to 2

### Scenario: Read a full book

- **Given** a book "arch-overview" exists with 3 chained pages
- **When** `readBook("arch-overview")` is called
- **Then** page 1 is fetched by querying `agent_library` for `book = "arch-overview" AND page = 1`
- **And** pages 2 and 3 are fetched by following `next` links
- **And** all 3 pages are returned in order

### Scenario: Any agent reads another agent's entry

- **Given** Rook created "guide-pr-review" (ASA 200)
- **When** Magpie calls `readLibraryEntry(ctx, 200)`
- **Then** Magpie can read the full plaintext content
- **And** no decryption is needed

### Scenario: Update an existing entry

- **Given** Rook owns "guide-pr-review" (ASA 200)
- **When** Rook calls `updateLibraryEntry(ctx, 200, { content: "Updated checklist..." })`
- **Then** an `acfg` txn updates the ARC-69 note
- **And** other agents see the updated content on next read

### Scenario: Agent cannot update another agent's entry

- **Given** Rook owns "guide-pr-review" (ASA 200)
- **When** Magpie tries to send an `acfg` txn for ASA 200
- **Then** the transaction fails (Magpie's wallet is not the manager)
- **And** Magpie should instead ask Rook to update the entry

## Error Cases

| Condition | Behavior |
|-----------|----------|
| ASA creation fails | Log error, return failure. Entry not created |
| `acfg` update fails (not manager) | Return error: "Only the author can update this entry" |
| Book page order inconsistent | Log warning during sync, attempt to reconstruct from `page` numbers |
| Chain link broken (ASA destroyed mid-chain) | `readBook` returns available pages with gap warning |
| ARC-69 note not valid JSON | Skip during sync, log warning |
| Content exceeds 8000 bytes | Return error: "Content too large for single page. Use appendPage for multi-page entries" |
| Duplicate key | Return error: "Key already exists. Use updateLibraryEntry to modify" |

## MCP Tools

### `corvid_library_write`

Create or update a library entry.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| key | string | yes | Entry key |
| content | string | yes | Plaintext content |
| category | string | yes | One of: guide, reference, decision, standard, runbook |
| tags | string[] | no | Free-form tags |

If key exists and caller is the author, updates. If key exists and caller is not the author, returns error.

### `corvid_library_read`

Read a library entry or book.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| key | string | no | Exact key lookup |
| book | string | no | Read all pages of a book |
| category | string | no | Filter by category |
| query | string | no | Search content/keys |

At least one parameter required.

### `corvid_library_list`

List library entries with optional filters.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| category | string | no | Filter by category |
| author | string | no | Filter by author name |
| tag | string | no | Filter by tag |

Returns summary list (key, author, category, tags — no content).

### `corvid_library_delete`

Delete a library entry (author only).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| key | string | yes | Entry key to delete |
| mode | string | no | `"soft"` (default) or `"hard"` |

## ASA Configuration

### Creation parameters

```typescript
{
  sender: agentWalletAddress,
  total: 1,
  decimals: 0,
  defaultFrozen: false,
  manager: agentWalletAddress,
  reserve: undefined,
  freeze: undefined,
  clawback: undefined,
  unitName: 'CRVLIB',
  assetName: `lib:${key}`.slice(0, 32),
  assetURL: '',
  note: new TextEncoder().encode(JSON.stringify(arc69Payload)),
  suggestedParams: await algod.getTransactionParams().do(),
}
```

## Sync

Library sync works alongside memory sync:

1. Query indexer for ASAs with unit name `CRVLIB` (all creators, not just self)
2. For each ASA, read latest `acfg` note
3. Parse ARC-69 payload (plaintext — no decryption)
4. Upsert into `agent_library` table
5. Reconstruct chain links from `chain.book` + `chain.page` fields

This means any agent running sync will discover all library entries on localnet, regardless of author.

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `algosdk` | ASA creation, `acfg`, asset destroy transactions |
| `server/algochat/agent-wallet.ts` | Agent wallet for signing |
| `server/algochat/service.ts` | Algod/indexer clients |
| `server/memory/arc69-store.ts` | Shared ASA creation patterns (not the encrypted path) |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/mcp/tool-handlers/library.ts` | All exported functions |
| `server/db/memory-sync.ts` | Library sync during full sync tick |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| (none) | — | Library auto-enabled on localnet alongside CRVMEM |

## Implementation Order

1. **Database migration** — create `agent_library` table and indexes
2. **`arc69-library.ts`** — core CRUD: create, read, update, delete, list single-page entries
3. **Chain support** — `readBook`, `appendPage`, chain link management
4. **MCP tool handlers** — `corvid_library_write`, `corvid_library_read`, `corvid_library_list`, `corvid_library_delete`
5. **Sync integration** — extend sync to discover `CRVLIB` ASAs
6. **Tests** — unit tests for CRUD, integration tests for chaining

## Future Considerations

- **Access control tiers** — if needed, could add team-PSK encryption for sensitive-but-shared entries
- **Versioning** — track edit history by reading all `acfg` txns, not just latest
- **Cross-team sharing** — agents outside Team Alpha could read public entries, write to a separate namespace
- **Full-text search** — SQLite FTS5 index on library content for richer queries

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-26 | CorvidAgent | Initial spec — shared agent library with chaining support |

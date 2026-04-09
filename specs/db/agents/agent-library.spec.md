---
module: agent-library-db
version: 1
status: active
files:
  - server/db/agent-library.ts
db_tables:
  - agent_library
depends_on:
  - specs/db/agents/agents.spec.md
---

# Agent Library DB

## Purpose

Data-access layer for CRVLIB — the shared, plaintext on-chain knowledge library used by Team Alpha agents. Unlike CRVMEM (encrypted, private per-agent), CRVLIB entries are published as ARC-69 ASAs and readable by any agent. Entries are organised by category and can be grouped into multi-page books. Added in migration 106 with the `title` column added in migration 111.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `saveLibraryEntry` | `(db: Database, input: SaveLibraryInput)` | `LibraryEntry` | Insert a new library entry. Generates a UUID, sets defaults for category and tags |
| `getLibraryEntry` | `(db: Database, id: string)` | `LibraryEntry \| null` | Fetch a single entry by ID. Returns `null` if not found |
| `getLibraryEntryByAsaId` | `(db: Database, asaId: number)` | `LibraryEntry \| null` | Fetch entry by on-chain ASA ID |
| `listLibraryEntries` | `(db: Database, opts?: ListLibraryOptions)` | `LibraryEntry[]` | List entries with optional filters for category, authorId, tag, book, and archival status |
| `getBookPages` | `(db: Database, book: string)` | `LibraryEntry[]` | Return all pages for a book ordered by page number ASC |
| `listLibraryEntriesGrouped` | `(db: Database, opts?: ListLibraryOptions)` | `GroupedLibraryResult` | List entries collapsed by book (multi-page books appear once with a page count) |
| `updateLibraryEntryTxid` | `(db: Database, id: string, txid: string)` | `void` | Set the on-chain transaction ID after publishing |
| `updateLibraryEntryAsaId` | `(db: Database, id: string, asaId: number)` | `void` | Set the ASA ID after the ASA is created on-chain |
| `archiveLibraryEntry` | `(db: Database, id: string)` | `void` | Mark entry as archived (`archived=1`); soft-delete |
| `deleteLibraryEntryRow` | `(db: Database, id: string)` | `boolean` | Hard-delete an entry. Returns `true` if a row was deleted |
| `resolveLibraryAsaId` | `(db: Database, key: string)` | `number \| null` | Look up the ASA ID for an entry by key. Returns `null` if not found or not yet published |
| `upsertLibraryEntryFromChain` | `(db: Database, input: ChainLibraryInput)` | `LibraryEntry` | Insert or update an entry sourced from an on-chain ARC-69 ASA (`INSERT ... ON CONFLICT DO UPDATE`) |

### Exported Types

| Type | Description |
|------|-------------|
| `LibraryCategory` | `'guide' \| 'reference' \| 'decision' \| 'standard' \| 'runbook'` |
| `LibraryEntry` | Complete entry domain object (camel-case) |
| `ListLibraryOptions` | Filter options: `category`, `authorId`, `tag`, `book`, `includeArchived`, `limit`, `offset` |

## Invariants

1. **Key uniqueness**: `key` has a UNIQUE constraint — one entry per logical key. Use `upsertLibraryEntryFromChain` for idempotent on-chain sync.
2. **ASA uniqueness**: `asa_id` has a UNIQUE constraint — two entries cannot reference the same on-chain ASA.
3. **Archived filter**: `listLibraryEntries` and related functions exclude archived entries by default unless `includeArchived: true` is passed.
4. **Default category**: `category` defaults to `'reference'` when not specified.
5. **Tags as JSON**: `tags` is stored as a JSON array string (DEFAULT `'[]'`).
6. **Book ordering**: `getBookPages` always returns pages in `page ASC` order.
7. **Author FK**: `author_id` references `agents(id)` — the agent that published the entry.
8. **Title nullable**: `title` (added in migration 111) is nullable; entries created before the migration will have `NULL` title.

## Behavioral Examples

### Scenario: Save and retrieve an entry

- **Given** agent `author-1` wants to publish a reference entry
- **When** `saveLibraryEntry(db, { key: 'algo-fees', authorId: 'author-1', authorName: 'Jackdaw', category: 'reference', content: '...' })` is called
- **Then** a row is stored with `archived=0`, `asa_id=NULL`, and `tags='[]'`
- **When** `getLibraryEntry(db, id)` is called
- **Then** the entry is returned in camel-case

### Scenario: On-chain publication flow

- **Given** a saved entry with id `lib-1`
- **When** the ASA is created on-chain and `updateLibraryEntryAsaId(db, 'lib-1', 99999)` is called
- **Then** `asa_id=99999`
- **When** `updateLibraryEntryTxid(db, 'lib-1', 'TXN...')` is called
- **Then** `txid='TXN...'`

### Scenario: Multi-page book

- **Given** three entries with `book='algo-guide'` and pages 1, 2, 3
- **When** `getBookPages(db, 'algo-guide')` is called
- **Then** three entries are returned in page order

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `getLibraryEntry` with unknown ID | Returns `null` |
| `getLibraryEntryByAsaId` with unknown ASA | Returns `null` |
| `resolveLibraryAsaId` for unknown key | Returns `null` |
| `deleteLibraryEntryRow` for unknown ID | Returns `false` |
| Insert with duplicate `key` | UNIQUE constraint violation (use `upsertLibraryEntryFromChain` for upserts) |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `bun:sqlite` | `Database` type |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/mcp/tool-handlers/library.ts` | Full CRUD via MCP library tools |
| `server/db/memory-sync.ts` | `upsertLibraryEntryFromChain`, `resolveLibraryAsaId` for on-chain sync |

## Database Tables

### agent_library

Shared agent knowledge library with on-chain ASA backing.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | UUID |
| `asa_id` | INTEGER | DEFAULT NULL, UNIQUE | On-chain ASA ID (NULL until published) |
| `key` | TEXT | NOT NULL, UNIQUE | Logical key for the entry |
| `title` | TEXT | DEFAULT NULL | Optional human-readable title (added migration 111) |
| `author_id` | TEXT | NOT NULL, FK `agents(id)` | Agent that authored the entry |
| `author_name` | TEXT | NOT NULL | Display name of the author |
| `category` | TEXT | NOT NULL, DEFAULT `'reference'` | `guide` / `reference` / `decision` / `standard` / `runbook` |
| `tags` | TEXT | NOT NULL, DEFAULT `'[]'` | JSON array of tag strings |
| `content` | TEXT | NOT NULL | Entry content |
| `book` | TEXT | DEFAULT NULL | Book name (groups multi-page entries) |
| `page` | INTEGER | DEFAULT NULL | Page number within a book |
| `txid` | TEXT | DEFAULT NULL | On-chain transaction ID |
| `created_at` | TEXT | NOT NULL, DEFAULT `datetime('now')` | Creation timestamp |
| `updated_at` | TEXT | NOT NULL, DEFAULT `datetime('now')` | Last update timestamp |
| `archived` | INTEGER | NOT NULL, DEFAULT `0` | Soft-delete flag (boolean: 1=archived) |

**Indexes:**
- `idx_agent_library_key` on `key`
- `idx_agent_library_category` on `category WHERE archived = 0`
- `idx_agent_library_book_page` on `(book, page) WHERE book IS NOT NULL`
- `idx_agent_library_author` on `author_id`

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-29 | jackdaw | Initial spec (migrations 106, 111) |

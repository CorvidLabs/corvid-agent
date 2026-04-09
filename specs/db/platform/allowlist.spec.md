---
module: allowlist
version: 1
status: draft
files:
  - server/db/allowlist.ts
db_tables:
  - algochat_allowlist
depends_on: []
---

# Allowlist

## Purpose
Manages a wallet address allowlist that controls which Algorand addresses are permitted to message agents. When the allowlist is empty, the system operates in open mode where all addresses are allowed.

## Public API

### Exported Functions
| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `listAllowlist` | `db: Database` | `AllowlistEntry[]` | Returns all allowlist entries ordered by created_at descending |
| `getAllowlistEntry` | `db: Database, address: string` | `AllowlistEntry \| null` | Retrieves a single entry by address, or null if not found |
| `addToAllowlist` | `db: Database, address: string, label?: string` | `AllowlistEntry` | Inserts an address (upserts on conflict, updating label) |
| `updateAllowlistEntry` | `db: Database, address: string, label: string` | `AllowlistEntry \| null` | Updates the label for an existing entry; returns null if address not found |
| `removeFromAllowlist` | `db: Database, address: string` | `boolean` | Deletes an entry by address; returns true if a row was deleted |
| `isAllowed` | `db: Database, address: string` | `boolean` | Returns true if the address is in the allowlist, or if the allowlist is empty (open mode) |

### Exported Types
| Type | Description |
|------|-------------|
| `AllowlistEntry` | `{ address: string; label: string; createdAt: string }` — public-facing representation of an allowlist row |

## Invariants
1. `addToAllowlist` uses `INSERT ... ON CONFLICT DO UPDATE` so duplicate addresses never cause errors; the label is updated instead.
2. When the allowlist table is empty, `isAllowed` returns `true` for any address (open mode).
3. When the allowlist table has at least one entry, only addresses present in the table pass `isAllowed`.
4. `removeFromAllowlist` and `updateAllowlistEntry` are idempotent with respect to missing addresses (they return `false` / `null` respectively).
5. All SQL operates on the `algochat_allowlist` table; the internal `AllowlistRow` type maps `created_at` to the camelCase `createdAt` in the public `AllowlistEntry`.

## Behavioral Examples
### Scenario: Adding a new address to an empty allowlist
- **Given** the allowlist is empty (open mode)
- **When** `addToAllowlist(db, "ALGO123", "My Wallet")` is called
- **Then** the address is inserted and the returned entry has `address: "ALGO123"`, `label: "My Wallet"`, and a `createdAt` timestamp

### Scenario: Checking permission in open mode
- **Given** the allowlist table has zero rows
- **When** `isAllowed(db, "ANY_ADDRESS")` is called
- **Then** it returns `true`

### Scenario: Checking permission with a populated allowlist
- **Given** the allowlist contains address "ALGO123"
- **When** `isAllowed(db, "ALGO999")` is called
- **Then** it returns `false` because "ALGO999" is not in the list

### Scenario: Upserting an existing address
- **Given** "ALGO123" is already in the allowlist with label "Old"
- **When** `addToAllowlist(db, "ALGO123", "New")` is called
- **Then** the label is updated to "New" and no duplicate row is created

## Error Cases
| Condition | Behavior |
|-----------|----------|
| `getAllowlistEntry` with non-existent address | Returns `null` |
| `updateAllowlistEntry` with non-existent address | Returns `null` (no rows changed) |
| `removeFromAllowlist` with non-existent address | Returns `false` (no rows deleted) |
| `addToAllowlist` with duplicate address | Upserts — updates the label, no error thrown |

## Dependencies
### Consumes
| Module | What is used |
|--------|-------------|
| `bun:sqlite` | `Database` type for all DB operations |
| `db/types` | `queryCount` used by `isAllowed` to check if the table is empty |

### Consumed By
| Module | What is used |
|--------|-------------|
| `server/routes/allowlist.ts` | CRUD route handlers call all exported functions |
| `server/routes/index.ts` | Registers allowlist routes |
| `server/algochat/message-router.ts` | Calls `isAllowed` to gate inbound AlgoChat messages |

## Database Tables
### algochat_allowlist
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `address` | TEXT | PRIMARY KEY | Algorand wallet address |
| `label` | TEXT | DEFAULT '' | Human-readable label for the address |
| `created_at` | TEXT | NOT NULL, DEFAULT datetime('now') | ISO-8601 timestamp of when the entry was created |

## Change Log
| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |

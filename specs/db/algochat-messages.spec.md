---
module: algochat-messages-db
version: 1
status: draft
files:
  - server/db/algochat-messages.ts
db_tables:
  - algochat_messages
depends_on: []
---

# AlgoChat Messages DB

## Purpose

Pure data-access layer for AlgoChat message logging and wallet analytics. Records all inbound and outbound AlgoChat messages exchanged with external wallet participants, and provides wallet-level summaries by joining with the allowlist and credit ledger tables.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `saveAlgoChatMessage` | `(db: Database, params: { participant: string; content: string; direction: 'inbound' \| 'outbound' \| 'status'; fee?: number; provider?: string; model?: string })` | `AlgoChatMessage` | Insert a new AlgoChat message log entry |
| `listRecentAlgoChatMessages` | `(db: Database, limit?: number, offset?: number)` | `{ messages: AlgoChatMessage[]; total: number }` | Paginated listing of all messages, ordered by `created_at DESC`. Default limit 50, offset 0 |
| `searchAlgoChatMessages` | `(db: Database, options: { limit?: number; offset?: number; search?: string; participant?: string })` | `{ messages: AlgoChatMessage[]; total: number }` | Paginated search with optional text content and participant filters. Max limit capped at 100 |
| `getWalletSummaries` | `(db: Database, options?: { search?: string })` | `WalletSummary[]` | Aggregated per-wallet statistics with allowlist labels and credit balances. Optional search by address or label |
| `getWalletMessages` | `(db: Database, address: string, limit?: number, offset?: number)` | `{ messages: AlgoChatMessage[]; total: number }` | Paginated messages for a specific wallet address. Default limit 50, offset 0 |

### Exported Types

| Type | Description |
|------|-------------|
| `AlgoChatMessage` | Message record: id, participant, content, direction, fee, provider, model, createdAt |
| `WalletSummary` | Per-wallet analytics: address, label, messageCount, inboundCount, outboundCount, lastActive, onAllowlist, credits, totalPurchased |

## Invariants

1. **Auto-increment ID**: AlgoChat message IDs are auto-incrementing integers (not UUIDs), retrieved via `last_insert_rowid()`
2. **Direction enum**: Direction must be one of 'inbound', 'outbound', or 'status'
3. **Default fee**: Fee defaults to 0 if not provided
4. **Limit cap**: `searchAlgoChatMessages` enforces a maximum limit of 100 regardless of input
5. **Cross-table joins**: `getWalletSummaries` joins with `algochat_allowlist` (for labels) and `credit_ledger` (for balances) -- these are separate queries per wallet, not a single join
6. **No cascade deletion**: AlgoChat messages are not foreign-keyed to agents and are not deleted when an agent is deleted
7. **Provider/model defaults**: Provider and model default to empty string on insert, mapped to `undefined` on read when empty

## Behavioral Examples

### Scenario: Log an inbound AlgoChat message

- **Given** a participant wallet address "ALGO123..."
- **When** `saveAlgoChatMessage(db, { participant: 'ALGO123...', content: 'Hello agent', direction: 'inbound', fee: 1000 })` is called
- **Then** a new message is inserted and returned with an auto-incrementing integer ID

### Scenario: Search messages by content

- **Given** 100 messages, 15 containing "deploy"
- **When** `searchAlgoChatMessages(db, { search: 'deploy', limit: 10 })` is called
- **Then** returns `{ messages: [...10 items], total: 15 }`

### Scenario: Get wallet summaries with credit info

- **Given** wallet "ALGO123..." has 30 messages (20 inbound, 10 outbound), is on the allowlist with label "alice", and has 5 credits
- **When** `getWalletSummaries(db)` is called
- **Then** returns a summary including `{ address: 'ALGO123...', label: 'alice', messageCount: 30, inboundCount: 20, outboundCount: 10, onAllowlist: true, credits: 5 }`

### Scenario: Wallet not on allowlist

- **Given** wallet "UNKNOWN..." has 2 messages but is not on the allowlist
- **When** `getWalletSummaries(db)` is called
- **Then** the wallet summary shows `label: ''`, `onAllowlist: false`, `credits: 0`, `totalPurchased: 0`

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `searchAlgoChatMessages` with no matching results | Returns `{ messages: [], total: 0 }` |
| `getWalletMessages` with unknown address | Returns `{ messages: [], total: 0 }` |
| `getWalletSummaries` with no messages in table | Returns empty array |
| `listRecentAlgoChatMessages` with empty table | Returns `{ messages: [], total: 0 }` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `bun:sqlite` | `Database` type |
| `server/db/types` | `queryCount` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/algochat/response-formatter.ts` | `saveAlgoChatMessage` |
| `server/routes/index.ts` | `searchAlgoChatMessages`, `getWalletSummaries`, `getWalletMessages` |

## Database Tables

### algochat_messages

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Auto-incrementing message ID |
| participant | TEXT | NOT NULL | External wallet address (Algorand) |
| content | TEXT | NOT NULL | Message body |
| direction | TEXT | NOT NULL, DEFAULT 'inbound' | Message direction: inbound, outbound, or status |
| fee | INTEGER | DEFAULT 0 | Transaction fee in microALGOs |
| provider | TEXT | DEFAULT '' | LLM provider used for response generation |
| model | TEXT | DEFAULT '' | LLM model used for response generation |
| created_at | TEXT | DEFAULT datetime('now') | Creation timestamp |

### Indexes

| Index | Columns | Type | Description |
|-------|---------|------|-------------|
| idx_algochat_messages_created | (created_at) | INDEX | Speeds up chronological ordering |
| idx_algochat_messages_participant | (participant) | INDEX | Speeds up per-wallet queries |

### Related Tables (read-only joins)

| Table | How used |
|-------|----------|
| `algochat_allowlist` | Joined in `getWalletSummaries` for wallet labels and allowlist status |
| `credit_ledger` | Joined in `getWalletSummaries` for credit balance and total purchased |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |

---
module: conversation-access-db
version: 1
status: active
files:
  - server/db/conversation-access.ts
db_tables:
  - agent_conversation_allowlist
  - agent_conversation_blocklist
  - agent_conversation_rate_limits
depends_on:
  - specs/db/agents/agents.spec.md
---

# Conversation Access DB

## Purpose

Per-agent conversation access control — allowlist, blocklist, and rate-limit tracking for AlgoChat conversational agents. Controls which Algorand addresses may initiate conversations with an agent and enforces per-address message rate limits. Added in migration 102, which also adds `conversation_mode`, `conversation_rate_limit_window`, and `conversation_rate_limit_max` columns to the `agents` table.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `listAgentAllowlist` | `(db: Database, agentId: string)` | `AgentAllowlistEntry[]` | Return all allowlist entries for an agent, ordered by `created_at DESC` |
| `isOnAgentAllowlist` | `(db: Database, agentId: string, address: string)` | `boolean` | Check whether a given address is on an agent's allowlist |
| `addToAgentAllowlist` | `(db: Database, agentId: string, address: string, label?: string)` | `void` | Insert a new allowlist entry (agent_id + address is PRIMARY KEY — duplicate inserts are no-ops via `INSERT OR IGNORE`) |
| `removeFromAgentAllowlist` | `(db: Database, agentId: string, address: string)` | `boolean` | Delete an allowlist entry. Returns `true` if a row was deleted |
| `listAgentBlocklist` | `(db: Database, agentId: string)` | `AgentBlocklistEntry[]` | Return all blocklist entries for an agent, ordered by `created_at DESC` |
| `isOnAgentBlocklist` | `(db: Database, agentId: string, address: string)` | `boolean` | Check whether a given address is on an agent's blocklist |
| `addToAgentBlocklist` | `(db: Database, agentId: string, address: string, reason?: string)` | `void` | Insert a new blocklist entry (`INSERT OR IGNORE`) |
| `removeFromAgentBlocklist` | `(db: Database, agentId: string, address: string)` | `boolean` | Delete a blocklist entry. Returns `true` if a row was deleted |
| `recordConversationMessage` | `(db: Database, agentId: string, address: string)` | `void` | Append a rate-limit tracking row for the given agent + address |
| `pruneRateLimitEntries` | `(db: Database, agentId: string, address: string, windowSeconds: number)` | `void` | Delete rate-limit rows older than `windowSeconds` for the given agent + address |
| `getConversationRateLimit` | `(db: Database, agentId: string, address: string, windowSeconds: number, maxMessages: number)` | `RateLimitStatus` | Calculate the current rate-limit status: remaining messages in window and reset timestamp |

### Exported Types

| Type | Description |
|------|-------------|
| `AgentAllowlistEntry` | `{ agentId: string; address: string; label: string; createdAt: string }` |
| `AgentBlocklistEntry` | `{ agentId: string; address: string; reason: string; createdAt: string }` |
| `RateLimitStatus` | `{ allowed: boolean; remaining: number; resetAt: string }` |

## Invariants

1. **Composite primary key**: Both `agent_conversation_allowlist` and `agent_conversation_blocklist` have `(agent_id, address)` as PRIMARY KEY — per-agent address entries are unique.
2. **INSERT OR IGNORE**: `addToAgentAllowlist` and `addToAgentBlocklist` silently ignore duplicate inserts.
3. **Rate-limit rows are append-only**: `recordConversationMessage` only inserts; `pruneRateLimitEntries` handles cleanup.
4. **Window-based counting**: `getConversationRateLimit` counts rows within the last `windowSeconds` seconds to determine whether `maxMessages` has been exceeded.
5. **Agent cascade**: All three tables have `agent_id` referencing `agents(id) ON DELETE CASCADE`.
6. **Agents table columns**: Migration 102 adds `conversation_mode` (DEFAULT `'private'`), `conversation_rate_limit_window` (DEFAULT `3600`), and `conversation_rate_limit_max` (DEFAULT `10`) to the `agents` table.

## Behavioral Examples

### Scenario: Allowlist check

- **Given** address `ADDR1` is on agent `agent-1`'s allowlist
- **When** `isOnAgentAllowlist(db, 'agent-1', 'ADDR1')` is called
- **Then** returns `true`
- **When** `isOnAgentAllowlist(db, 'agent-1', 'ADDR2')` is called
- **Then** returns `false`

### Scenario: Rate limit enforcement

- **Given** a window of 3600 seconds and max 10 messages for agent `agent-1`
- **When** 10 messages from address `ADDR1` are recorded via `recordConversationMessage`
- **Then** `getConversationRateLimit(db, 'agent-1', 'ADDR1', 3600, 10)` returns `{ allowed: false, remaining: 0, resetAt: <timestamp> }`

### Scenario: Blocklist prevents conversation

- **Given** address `SPAMMER` is on agent `agent-1`'s blocklist
- **When** `isOnAgentBlocklist(db, 'agent-1', 'SPAMMER')` is called
- **Then** returns `true`

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Add address already on allowlist | `INSERT OR IGNORE` — no error, no duplicate |
| Remove address not on allowlist | Returns `false` |
| Remove address not on blocklist | Returns `false` |
| `isOnAgentAllowlist` for unknown agent | Returns `false` |
| `isOnAgentBlocklist` for unknown agent | Returns `false` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `bun:sqlite` | `Database` type |
| `shared/types` | `AgentAllowlistEntry`, `AgentBlocklistEntry`, `RateLimitStatus` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/algochat/conversation-access.ts` | `checkConversationAccess`, `getAgentConversationMode`, `setAgentConversationMode` |

## Database Tables

### agent_conversation_allowlist

Per-agent allowlist of Algorand addresses permitted to start conversations.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `agent_id` | TEXT | NOT NULL, FK `agents(id)` ON DELETE CASCADE, PK(agent_id, address) | Owning agent |
| `address` | TEXT | NOT NULL, PK(agent_id, address) | Algorand wallet address |
| `label` | TEXT | DEFAULT `''` | Human-readable label for the entry |
| `created_at` | TEXT | DEFAULT `datetime('now')` | When the entry was added |

**Indexes:**
- `idx_agent_conv_allow_agent` on `agent_id`

### agent_conversation_blocklist

Per-agent blocklist of Algorand addresses blocked from conversations.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `agent_id` | TEXT | NOT NULL, FK `agents(id)` ON DELETE CASCADE, PK(agent_id, address) | Owning agent |
| `address` | TEXT | NOT NULL, PK(agent_id, address) | Blocked Algorand wallet address |
| `reason` | TEXT | DEFAULT `'manual'` | Why the address was blocked |
| `created_at` | TEXT | DEFAULT `datetime('now')` | When the entry was added |

**Indexes:**
- `idx_agent_conv_block_agent` on `agent_id`

### agent_conversation_rate_limits

Append-only log used to enforce per-agent per-address message rate limits.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Auto-incrementing row ID |
| `agent_id` | TEXT | NOT NULL | Agent being rate-limited |
| `address` | TEXT | NOT NULL | Sender address |
| `message_at` | TEXT | NOT NULL, DEFAULT `datetime('now')` | Timestamp of the message |

**Indexes:**
- `idx_agent_conv_rate_agent_addr` on `(agent_id, address)`

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-29 | jackdaw | Initial spec (migration 102) |

---
module: algochat/conversation-access
version: 1
status: active
files:
  - server/algochat/conversation-access.ts
  - server/db/conversation-access.ts
  - server/db/migrations/102_conversation_access.ts
db_tables:
  - agent_conversation_allowlist
  - agent_conversation_blocklist
  - agent_conversation_rate_limits
depends_on:
  - server/db/agents.ts
  - server/algochat/message-router.ts
  - server/algochat/config.ts
---

# Conversation Access Control

## Purpose

Per-agent access control for conversational messaging. Determines who can
talk to each agent, enforces rate limits, and provides owner protections.

Without this module every AlgoChat-enabled agent is reachable by anyone on
the allowlist (or everyone, if the global allowlist is empty). This module
adds a **per-agent** access layer with three modes — private, allowlist,
public — plus per-address rate limiting and blocklisting.

**Self-protection note:** The primary agent (CorvidAgent) defaults to `private` mode. Self-protection enforcement (requiring owner confirmation for mode changes) is not currently implemented in the route handler.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `checkConversationAccess` | `(db: Database, agentId: string, participant: string, config: AlgoChatConfig)` | `ConversationAccessResult` | Determines whether a participant may message an agent |
| `recordConversationMessage` | `(db: Database, agentId: string, participant: string)` | `void` | Records a message for rate-limit tracking |
| `getAgentConversationMode` | `(db: Database, agentId: string)` | `ConversationMode` | Returns the agent's conversation mode |
| `setAgentConversationMode` | `(db: Database, agentId: string, mode: ConversationMode)` | `void` | Updates the agent's conversation mode |
| `addToAgentAllowlist` | `(db: Database, agentId: string, address: string, label?: string)` | `AgentAllowlistEntry` | Adds an address to an agent's conversation allowlist |
| `removeFromAgentAllowlist` | `(db: Database, agentId: string, address: string)` | `boolean` | Removes an address from an agent's allowlist |
| `listAgentAllowlist` | `(db: Database, agentId: string)` | `AgentAllowlistEntry[]` | Lists all allowed addresses for an agent |
| `addToAgentBlocklist` | `(db: Database, agentId: string, address: string, reason?: string)` | `AgentBlocklistEntry` | Blocks an address from messaging an agent |
| `removeFromAgentBlocklist` | `(db: Database, agentId: string, address: string)` | `boolean` | Unblocks an address |
| `listAgentBlocklist` | `(db: Database, agentId: string)` | `AgentBlocklistEntry[]` | Lists all blocked addresses for an agent |
| `isOnAgentAllowlist` | `(db: Database, agentId: string, address: string)` | `boolean` | Returns true if the address is on the agent's conversation allowlist |
| `isOnAgentBlocklist` | `(db: Database, agentId: string, address: string)` | `boolean` | Returns true if the address is on the agent's conversation blocklist |
| `getConversationRateLimit` | `(db: Database, agentId: string, participant: string)` | `RateLimitStatus` | Checks rate-limit status for a participant |
| `pruneRateLimitEntries` | `(db: Database, windowSeconds: number)` | `number` | Deletes rate-limit entries older than the given window; returns count of deleted rows |
| `up` | `(db: Database)` | `void` | Migration 102 up — creates conversation access tables and columns |
| `down` | `(db: Database)` | `void` | Migration 102 down — drops conversation access tables and columns |

### Exported Types

| Type | Description |
|------|-------------|
| `ConversationMode` | `'private' \| 'allowlist' \| 'public'` |
| `ConversationAccessResult` | `{ allowed: boolean; reason: DenyReason \| null }` |
| `DenyReason` | `'private' \| 'not_on_allowlist' \| 'blocked' \| 'rate_limited' \| 'agent_disabled'` |
| `AgentAllowlistEntry` | `{ agentId: string; address: string; label: string; createdAt: string }` |
| `AgentBlocklistEntry` | `{ agentId: string; address: string; reason: string; createdAt: string }` |
| `RateLimitStatus` | `{ allowed: boolean; remaining: number; resetsAt: string }` |

### Exported Classes

_None — this module uses pure functions backed by SQLite._

## Invariants

1. **Owner always passes.** If the participant is in `config.ownerAddresses`, access is granted regardless of mode, blocklist, or rate limits.
2. **Blocklist before allowlist.** A blocked address is denied even if it appears on the allowlist.
3. **Private means private.** In `private` mode, only owner addresses may converse. No exceptions.
4. **Silent denial.** Denied messages produce no response to the sender — no error, no acknowledgment.
5. **Default mode is `private`.** New agents and existing agents without an explicit mode are treated as `private`.
6. **Self-protection (not implemented).** The primary agent defaults to `private` mode (see default mode invariant #5), but mode changes via the API are not currently gated by owner confirmation. The `ALGOCHAT_PRIMARY_AGENT_ID` env var is parsed but not used for enforcement.
7. **Rate limits are per-address per-agent.** Each agent can have its own rate-limit configuration. Default: 10 messages per 60 minutes for non-owner addresses.
8. **Global allowlist is still checked first.** The per-agent access check runs _after_ the existing global allowlist gate. A participant must pass both.

## Behavioral Examples

### Scenario: Private agent receives message from non-owner

- **Given** agent "corvid-agent" has `conversation_mode = 'private'`
- **When** address `XYZABC...` (not owner) sends a message
- **Then** `checkConversationAccess` returns `{ allowed: false, reason: 'private' }`
- **And** no response is sent

### Scenario: Allowlist agent receives message from approved address

- **Given** agent "helper-bot" has `conversation_mode = 'allowlist'`
- **And** address `ABCDEF...` is in `agent_conversation_allowlist` for "helper-bot"
- **When** `ABCDEF...` sends a message
- **Then** `checkConversationAccess` returns `{ allowed: true, reason: null }`

### Scenario: Public agent rate-limits a participant

- **Given** agent "public-bot" has `conversation_mode = 'public'`
- **And** rate limit is 10 messages per 60 minutes
- **When** address `SENDER...` has sent 10 messages in the last 60 minutes
- **Then** `checkConversationAccess` returns `{ allowed: false, reason: 'rate_limited' }`

### Scenario: Blocked address is denied even on allowlist

- **Given** agent "helper-bot" has `conversation_mode = 'allowlist'`
- **And** address `BADACT...` is on both the allowlist and blocklist
- **When** `BADACT...` sends a message
- **Then** `checkConversationAccess` returns `{ allowed: false, reason: 'blocked' }`

### Scenario: Owner bypasses all restrictions

- **Given** agent "corvid-agent" has `conversation_mode = 'private'`
- **And** address `OWNER...` is in `config.ownerAddresses`
- **When** `OWNER...` sends a message
- **Then** `checkConversationAccess` returns `{ allowed: true, reason: null }`

### Scenario: Mode change (self-protection not enforced)

- **Given** agent "corvid-agent" is the primary agent
- **When** an API request attempts to set `conversation_mode = 'public'`
- **Then** the mode is updated immediately — no owner confirmation is required (self-protection is not currently implemented)

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Agent not found | Returns `{ allowed: false, reason: 'agent_disabled' }` |
| Agent disabled | Returns `{ allowed: false, reason: 'agent_disabled' }` |
| Agent has no `conversation_mode` set | Treated as `'private'` |
| Rate-limit table missing | Gracefully defaults to allowing (fail-open only for rate limits, not access) |
| Invalid address format | No address-format validation is performed; any string is accepted as a participant address |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/db/agents.ts` | `getAgent()` |
| `server/algochat/config.ts` | `AlgoChatConfig.ownerAddresses` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/algochat/message-router.ts` | `checkConversationAccess()`, `recordConversationMessage()` |
| `server/routes/agents.ts` | Allowlist/blocklist/mode CRUD endpoints |

## Database Tables

### agent_conversation_allowlist

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| agent_id | TEXT | NOT NULL, FK agents(id) | Agent this entry belongs to |
| address | TEXT | NOT NULL | Algorand address allowed to converse |
| label | TEXT | DEFAULT '' | Optional human-readable label |
| created_at | TEXT | DEFAULT datetime('now') | When the entry was created |
| | | PRIMARY KEY (agent_id, address) | Composite primary key |

### agent_conversation_blocklist

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| agent_id | TEXT | NOT NULL, FK agents(id) | Agent this entry belongs to |
| address | TEXT | NOT NULL | Algorand address blocked from conversing |
| reason | TEXT | DEFAULT 'manual' | Why the address was blocked |
| created_at | TEXT | DEFAULT datetime('now') | When the entry was created |
| | | PRIMARY KEY (agent_id, address) | Composite primary key |

### agent_conversation_rate_limits

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique identifier |
| agent_id | TEXT | NOT NULL | Agent this limit applies to |
| address | TEXT | NOT NULL | Sender address |
| message_at | TEXT | NOT NULL, DEFAULT datetime('now') | Timestamp of the message |

_Note: `conversation_mode` is stored as a new column on the `agents` table._

### agents (modified)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| conversation_mode | TEXT | DEFAULT 'private' | 'private', 'allowlist', or 'public' |
| conversation_rate_limit_window | INTEGER | DEFAULT 3600 | Rate limit window in seconds |
| conversation_rate_limit_max | INTEGER | DEFAULT 10 | Max messages per window |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `ALGOCHAT_PRIMARY_AGENT_ID` | _(first agent)_ | Parsed but not currently used for mode-change enforcement |
| `CONVERSATION_RATE_LIMIT_WINDOW` | `3600` | Default rate-limit window (seconds) — written to agent columns at migration time, not read at access-check time |
| `CONVERSATION_RATE_LIMIT_MAX` | `10` | Default max messages per window — written to agent columns at migration time, not read at access-check time |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-23 | corvid-agent | Initial spec |
| 2026-04-14 | corvid-agent | Clarify self-protection as unimplemented, fix invalid-address error case, clarify env var semantics (#2019) |

---
module: agent-blocklist-db
version: 1
status: draft
files:
  - server/db/agent-blocklist.ts
db_tables:
  - agent_blocklist
depends_on: []
---

# Agent Blocklist DB

## Purpose

CRUD operations for the agent blocklist. Prevents blacklisted agents from sending or receiving messages via AlgoChat. Used by the kill switch (auto-blacklist on critical security violations) and the messaging guard (instant reject).

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `isAgentBlocked` | `(db: Database, agentId: string)` | `boolean` | Checks if an agent is in the blocklist |
| `getAgentBlocklistEntry` | `(db: Database, agentId: string)` | `AgentBlocklistEntry \| null` | Fetches a single blocklist entry by agent ID. Returns `null` if not found |
| `addToAgentBlocklist` | `(db: Database, agentId: string, opts?: { reason?: BlocklistReason; detail?: string; blockedBy?: string })` | `AgentBlocklistEntry` | Adds or updates an agent in the blocklist. Uses `INSERT ... ON CONFLICT DO UPDATE` for upsert |
| `removeFromAgentBlocklist` | `(db: Database, agentId: string)` | `boolean` | Removes an agent from the blocklist. Returns `true` if a row was deleted |
| `listAgentBlocklist` | `(db: Database)` | `AgentBlocklistEntry[]` | Lists all blocked agents, ordered by `created_at DESC` |

### Exported Types

| Type | Description |
|------|-------------|
| `BlocklistReason` | `'security_violation' \| 'reputation_farming' \| 'malicious_content' \| 'manual' \| 'behavioral_drift'` -- why the agent was blocked |
| `AgentBlocklistEntry` | `{ agentId: string; reason: BlocklistReason; detail: string; blockedBy: string; createdAt: string }` |

## Invariants

1. **Upsert semantics**: `addToAgentBlocklist` updates `reason`, `detail`, and `blocked_by` on conflict (keyed on `agent_id`)
2. **Default values**: `reason` defaults to `'manual'`, `detail` to `''`, `blockedBy` to `'system'`
3. **No tenant scoping**: The blocklist is global (not scoped by tenant)

## Behavioral Examples

### Scenario: Block an agent and check

- **Given** an empty blocklist
- **When** `addToAgentBlocklist(db, 'agent-123', { reason: 'security_violation', detail: 'malicious payload' })` is called
- **Then** `isAgentBlocked(db, 'agent-123')` returns `true`

### Scenario: Upsert updates existing entry

- **Given** `agent-123` is blocked with reason `'manual'`
- **When** `addToAgentBlocklist(db, 'agent-123', { reason: 'behavioral_drift' })` is called
- **Then** the entry's reason is updated to `'behavioral_drift'`

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Get non-existent entry | Returns `null` |
| Remove non-existent entry | Returns `false` |
| Check unblocked agent | `isAgentBlocked` returns `false` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `bun:sqlite` | `Database` type |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/algochat/messaging-guard.ts` | `isAgentBlocked` to reject messages from blocked agents |

## Database Tables

### agent_blocklist

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `agent_id` | TEXT | PRIMARY KEY | Agent identifier |
| `reason` | TEXT | NOT NULL, DEFAULT `'manual'` | Why the agent was blocked |
| `detail` | TEXT | DEFAULT `''` | Additional detail about the block |
| `blocked_by` | TEXT | DEFAULT `'system'` | Who or what triggered the block |
| `created_at` | TEXT | DEFAULT `datetime('now')` | When the entry was created |

**Indexes:** `idx_agent_blocklist_reason` on `reason`

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-22 | corvid-agent | Initial spec |

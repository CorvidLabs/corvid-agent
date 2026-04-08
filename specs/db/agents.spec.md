---
module: agents-db
version: 1
status: active
files:
  - server/db/agents.ts
db_tables:
  - agents
depends_on: []
---

# Agents DB

## Purpose

Pure data-access layer for agent CRUD operations, wallet management, and funding. Provides the foundational read/write operations for agent entities that all higher-level services (ProcessManager, routes, AlgoChat, councils, work tasks) depend on.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `listAgents` | `(db: Database, tenantId?: string)` | `Agent[]` | List all agents filtered by tenant, ordered by `updated_at DESC` |
| `getAgent` | `(db: Database, id: string, tenantId?: string)` | `Agent \| null` | Fetch a single agent by ID with tenant ownership validation |
| `createAgent` | `(db: Database, input: CreateAgentInput, tenantId?: string)` | `Agent` | Insert a new agent with a generated UUID |
| `updateAgent` | `(db: Database, id: string, input: UpdateAgentInput, tenantId?: string)` | `Agent \| null` | Partial update of agent fields. Returns null if agent not found or tenant mismatch |
| `deleteAgent` | `(db: Database, id: string, tenantId?: string)` | `boolean` | Delete agent and all dependent records in a transaction. Returns false if not found |
| `setAgentWallet` | `(db: Database, agentId: string, walletAddress: string, encryptedMnemonic: string)` | `void` | Set the Algorand wallet address and encrypted mnemonic for an agent |
| `getAgentWalletMnemonic` | `(db: Database, agentId: string)` | `string \| null` | Retrieve the encrypted wallet mnemonic for an agent |
| `addAgentFunding` | `(db: Database, agentId: string, algoAmount: number)` | `void` | Increment the agent's `wallet_funded_algo` balance (additive) |
| `getAgentByWalletAddress` | `(db: Database, walletAddress: string)` | `Agent \| null` | Look up an agent by its Algorand wallet address. Returns `null` if no match |
| `getAlgochatEnabledAgents` | `(db: Database)` | `Agent[]` | List all agents with `algochat_enabled = 1`, ordered by `updated_at DESC` |

### Exported Types

| Type | Description |
|------|-------------|
| (none) | All types are imported from `shared/types` (`Agent`, `CreateAgentInput`, `UpdateAgentInput`) |

## Invariants

1. **UUID generation**: Agent IDs are generated via `crypto.randomUUID()`
2. **Tenant isolation**: `listAgents` and `getAgent` enforce tenant filtering via `withTenantFilter` and `validateTenantOwnership`
3. **Transactional deletion**: `deleteAgent` wraps all dependent record cleanup in a single `db.transaction()` to ensure atomicity
4. **Cascade vs manual cleanup**: Tables with `ON DELETE CASCADE` (agent_memories, council_members, agent_schedules, etc.) are auto-deleted; tables without cascade are manually deleted in the transaction
5. **Funding monotonicity**: `addAgentFunding` uses `wallet_funded_algo = wallet_funded_algo + ?` ensuring additive-only updates
6. **Timestamp auto-update**: Mutations set `updated_at = datetime('now')`
7. **Boolean mapping**: SQLite integers (0/1) are mapped to TypeScript booleans for `algochatEnabled`, `algochatAuto`, `voiceEnabled`
8. **JSON serialization**: `customFlags` and `mcpToolPermissions` are stored as JSON strings and parsed on read
9. **No-op update**: If `updateAgent` receives no changed fields, it returns the existing agent without issuing an UPDATE query
10. **Null FK cleanup**: `deleteAgent` nullifies optional foreign keys (councils.chairman_agent_id, algochat_conversations.agent_id) rather than deleting those rows
11. **AlgoChat defaults**: `createAgent()` defaults `algochatEnabled` and `algochatAuto` to `true` when not specified in the input. Agents are AlgoChat-enabled by default

## Behavioral Examples

### Scenario: Create and retrieve an agent

- **Given** a valid `CreateAgentInput` with name "TestBot"
- **When** `createAgent(db, { name: 'TestBot' })` is called
- **Then** a new agent is returned with a UUID `id`, default empty fields, and `algochatEnabled: true`, `algochatAuto: true`

### Scenario: Delete agent cascades all dependents

- **Given** an agent with sessions, messages, work tasks, and reputation records
- **When** `deleteAgent(db, agentId)` is called
- **Then** work_tasks, agent_messages, owner_questions, notification_channels, sessions (and their messages), and reputation records are all deleted in a single transaction before the agent row itself is removed

### Scenario: Partial update preserves unmodified fields

- **Given** an agent with name "Alpha" and model "claude-sonnet"
- **When** `updateAgent(db, id, { name: 'Beta' })` is called
- **Then** the agent's name becomes "Beta" but model remains "claude-sonnet"

### Scenario: Wallet funding is additive

- **Given** an agent with `wallet_funded_algo = 5.0`
- **When** `addAgentFunding(db, agentId, 2.5)` is called
- **Then** the agent's `wallet_funded_algo` becomes `7.5`

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `getAgent` with nonexistent ID | Returns `null` |
| `getAgent` with wrong tenant ID | Returns `null` (tenant ownership check fails) |
| `updateAgent` with nonexistent ID | Returns `null` |
| `deleteAgent` with nonexistent ID | Returns `false` |
| `createAgent` followed by failed re-read | Throws `NotFoundError` |
| `getAgentWalletMnemonic` with nonexistent agent | Returns `null` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `bun:sqlite` | `Database`, `SQLQueryBindings` types |
| `shared/types` | `Agent`, `CreateAgentInput`, `UpdateAgentInput` |
| `server/lib/errors` | `NotFoundError` |
| `server/tenant/types` | `DEFAULT_TENANT_ID` |
| `server/tenant/db-filter` | `withTenantFilter`, `validateTenantOwnership` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/routes/agents.ts` | `listAgents`, `getAgent`, `createAgent`, `updateAgent`, `deleteAgent` |
| `server/process/manager.ts` | `getAgent`, `getAlgochatEnabledAgents` |
| `server/algochat/agent-wallet.ts` | `getAgent`, `setAgentWallet`, `getAgentWalletMnemonic`, `addAgentFunding`, `listAgents` |
| `server/algochat/agent-directory.ts` | `getAgent`, `listAgents` |
| `server/algochat/agent-messenger.ts` | `getAgent` |
| `server/algochat/message-router.ts` | `getAgent` |
| `server/algochat/command-handler.ts` | `getAlgochatEnabledAgents` |
| `server/algochat/discovery-service.ts` | `listAgents`, `getAlgochatEnabledAgents` |
| `server/discord/bridge.ts` | `listAgents` |
| `server/slack/bridge.ts` | `listAgents` |
| `server/telegram/bridge.ts` | `getAgent`, `listAgents` |
| `server/mcp/sdk-tools.ts` | `getAgent` |
| `server/mcp/direct-tools.ts` | `getAgent` |
| `server/mcp/tool-handlers/ast.ts` | `getAgent` |
| `server/work/service.ts` | `getAgent` |
| `server/scheduler/service.ts` | `getAgent` |
| `server/webhooks/service.ts` | `getAgent` |
| `server/workflow/service.ts` | `getAgent` |
| `server/councils/discussion.ts` | `getAgent` |
| `server/councils/synthesis.ts` | `getAgent` |
| `server/polling/service.ts` | `getAgent` |
| `server/improvement/service.ts` | `getAgent` |
| `server/exam/runner.ts` | `listAgents`, `createAgent`, `updateAgent` |
| `server/selftest/service.ts` | `listAgents`, `createAgent`, `updateAgent` |
| `server/routes/personas.ts` | `getAgent` |
| `server/routes/sandbox.ts` | `getAgent` |
| `server/routes/skill-bundles.ts` | `getAgent` |
| `server/a2a/task-handler.ts` | `listAgents` |

## Database Tables

### agents

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| name | TEXT | NOT NULL | Display name |
| description | TEXT | DEFAULT '' | Agent description |
| system_prompt | TEXT | DEFAULT '' | System prompt for the agent |
| append_prompt | TEXT | DEFAULT '' | Prompt appended after system prompt |
| model | TEXT | DEFAULT '' | LLM model identifier |
| provider | TEXT | DEFAULT '' | LLM provider (e.g. anthropic, openai) |
| allowed_tools | TEXT | DEFAULT '' | Comma-separated list of allowed tool names |
| disallowed_tools | TEXT | DEFAULT '' | Comma-separated list of disallowed tool names |
| permission_mode | TEXT | DEFAULT 'default' | Permission mode (default, full-auto, etc.) |
| max_budget_usd | REAL | DEFAULT NULL | Maximum budget in USD, null for unlimited |
| algochat_enabled | INTEGER | DEFAULT 1 | Whether agent participates in AlgoChat (boolean) |
| algochat_auto | INTEGER | DEFAULT 1 | Whether agent auto-responds in AlgoChat (boolean) |
| custom_flags | TEXT | DEFAULT '{}' | JSON object of custom feature flags |
| default_project_id | TEXT | DEFAULT NULL | Default project for new sessions |
| mcp_tool_permissions | TEXT | DEFAULT NULL | JSON object of MCP tool permission overrides |
| voice_enabled | INTEGER | DEFAULT 0 | Whether TTS/STT voice is enabled (boolean) |
| voice_preset | TEXT | DEFAULT 'alloy' | Voice preset for TTS (alloy, echo, fable, onyx, nova, shimmer) |
| wallet_address | TEXT | DEFAULT NULL | Algorand wallet address |
| wallet_mnemonic_encrypted | TEXT | DEFAULT NULL | AES-encrypted wallet mnemonic |
| display_color | TEXT | DEFAULT NULL | Custom hex color for UI display (e.g. '#FF5733') |
| display_icon | TEXT | DEFAULT NULL | Custom icon identifier for UI display |
| avatar_url | TEXT | DEFAULT NULL | URL to agent's avatar image |
| disabled | INTEGER | DEFAULT 0 | Whether agent is disabled (boolean) |
| conversation_mode | TEXT | NOT NULL, DEFAULT 'private' | Conversation access mode: 'private', 'allowlist', 'public' |
| conversation_rate_limit_window | INTEGER | NOT NULL, DEFAULT 3600 | Rate limit window in seconds for conversations |
| conversation_rate_limit_max | INTEGER | NOT NULL, DEFAULT 10 | Max conversations per rate limit window |
| wallet_funded_algo | REAL | DEFAULT 0 | Total ALGO funded to this agent |
| tenant_id | TEXT | NOT NULL, DEFAULT 'default' | Tenant isolation identifier |
| created_at | TEXT | DEFAULT datetime('now') | Creation timestamp |
| updated_at | TEXT | DEFAULT datetime('now') | Last modification timestamp |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
| 2026-03-06 | corvid-agent | Agents now default to algochat_enabled=1, algochat_auto=1. createAgent() defaults both to true. |

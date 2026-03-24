---
module: conversational-seed
version: 1
status: active
files:
  - server/conversational/seed.ts
db_tables: []
depends_on:
  - specs/conversational/presets.spec.md
  - specs/db/agents.spec.md
  - specs/flock-directory/service.spec.md
---

# Conversational Seed

## Purpose

Seeds conversational agent presets on startup. Creates agents from `CONVERSATIONAL_PRESETS` if they don't already exist (matched by `presetKey` in `custom_flags`), ensures each agent has a wallet, and registers them in the Flock Directory. Safe to call multiple times — fully idempotent.

## Public API

### Exported Types

| Type | Description |
|------|-------------|
| `SeedConversationalAgentsOpts` | Options: `db` (Database), optional `walletService` (AgentWalletService), optional `flockDirectoryService` (FlockDirectoryService) |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `seedConversationalAgents` | `(opts: SeedConversationalAgentsOpts)` | `Promise<void>` | Seeds all conversational agent presets, creates wallets, and registers in Flock Directory |

## Invariants

1. Seeding is idempotent — calling multiple times MUST NOT create duplicate agents; existing agents are matched by `presetKey` in `custom_flags`
2. Wallet creation failures MUST NOT prevent the remaining presets from being seeded
3. Flock Directory registration failures MUST NOT prevent the remaining presets from being seeded
4. Agent creation failures MUST be logged and skipped, not thrown

## Behavioral Examples

### Scenario: First startup with no existing agents

- **Given** an empty agents table
- **When** `seedConversationalAgents` is called
- **Then** all presets are created as new agents with wallets and Flock Directory registrations

### Scenario: Subsequent startup with existing preset agents

- **Given** all preset agents already exist (matched by `presetKey` in custom_flags)
- **When** `seedConversationalAgents` is called
- **Then** no new agents are created and no errors are thrown

### Scenario: Wallet service unavailable

- **Given** `walletService` is null
- **When** `seedConversationalAgents` is called
- **Then** agents are created but wallet creation and Flock Directory registration are skipped

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Agent creation fails | Logs error, skips to next preset |
| Wallet creation fails | Logs debug message, continues with registration attempt |
| Flock Directory registration fails | Logs warning, continues to next preset |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/conversational/presets.ts` | `CONVERSATIONAL_PRESETS`, `ConversationalPreset` |
| `server/db/agents.ts` | `createAgent`, `listAgents`, `getAgent` |
| `server/algochat/agent-wallet.ts` | `AgentWalletService` type |
| `server/flock-directory/service.ts` | `FlockDirectoryService` type |
| `server/lib/logger.ts` | `createLogger` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/algochat/init.ts` | `seedConversationalAgents` called during post-init |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-24 | corvid-agent | Initial spec |

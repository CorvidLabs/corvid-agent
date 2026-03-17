---
module: memory-sync
version: 1
status: draft
files:
  - server/db/memory-sync.ts
db_tables:
  - agent_memories
depends_on: []
---

# Memory Sync

## Purpose

Background service that periodically syncs pending agent memories to **long-term storage** on the Algorand blockchain via encrypted on-chain transactions. In the two-tier memory architecture, this service is responsible for ensuring all memories reach the durable localnet layer (the authoritative record). Memories are encrypted, sent as self-addressed AlgoChat messages, and their transaction IDs are recorded back in the SQLite short-term cache.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `MemorySyncService` | `(db: Database)` | `MemorySyncService` | Exported class. Background service that syncs pending memories on-chain at a fixed interval |

### MemorySyncService Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `constructor` | `(db: Database)` | `MemorySyncService` | Initializes the service with a database reference |
| `setServices` | `(agentMessenger: AgentMessenger, serverMnemonic: string \| null \| undefined, network: string \| undefined)` | `void` | Injects the AgentMessenger and wallet credentials needed for on-chain sends |
| `setWalletService` | `(walletService: AgentWalletService)` | `void` | Injects the wallet service used to auto-refill agent wallets before sends |
| `start` | `()` | `void` | Starts the periodic sync timer. Runs an immediate tick, then every 60 seconds. No-op if already running |
| `stop` | `()` | `void` | Stops the periodic sync timer |
| `tick` | `()` | `Promise<void>` | Executes one sync cycle: fetches up to 10 pending memories, encrypts and sends each on-chain, updates DB status |
| `getStats` | `()` | `{ pendingCount: number; isRunning: boolean }` | Returns the count of pending memories and whether the timer is active |

### Exported Types

| Type | Description |
|------|-------------|
| (none) | No exported types; the class is the sole export |

## Invariants

1. **Reentrancy guard**: Only one `tick()` can execute at a time; concurrent calls return immediately via the `syncing` flag
2. **Service dependency**: `tick()` returns immediately if `agentMessenger` has not been set via `setServices()`
3. **Batch size**: Each tick processes at most 10 pending memories (`BATCH_SIZE = 10`)
4. **Failed backoff**: Memories with status `failed` are skipped if their `updatedAt` is less than 5 minutes ago (`FAILED_BACKOFF_MS`)
5. **Wallet refill before send**: If a `walletService` is set, `checkAndRefill()` is called before each on-chain send to ensure the agent wallet has sufficient balance
6. **Null txid handling**: If `sendOnChainToSelf` returns null (no wallet configured), the memory stays pending (not marked failed)
7. **Error isolation**: A failure on one memory does not abort the batch; it marks that memory as `failed` and continues
8. **Idempotent start**: Calling `start()` when already running logs a warning and does nothing
9. **Sync interval**: The timer fires every 60 seconds (`SYNC_INTERVAL_MS = 60_000`)

## Behavioral Examples

### Scenario: Successful memory sync

- **Given** 3 memories with status `pending` in the database and `agentMessenger` is configured
- **When** `tick()` runs
- **Then** each memory is encrypted via `encryptMemoryContent`, sent on-chain via `sendOnChainToSelf`, and its txid is stored via `updateMemoryTxid`

### Scenario: Failed memory with backoff

- **Given** a memory with status `failed` and `updatedAt` 2 minutes ago
- **When** `tick()` runs
- **Then** the memory is skipped (within the 5-minute backoff window)

### Scenario: Failed memory retry after backoff

- **Given** a memory with status `failed` and `updatedAt` 6 minutes ago
- **When** `tick()` runs
- **Then** the memory is retried (backoff period has elapsed)

### Scenario: No agent messenger configured

- **Given** `setServices()` has not been called
- **When** `tick()` runs
- **Then** it returns immediately without processing any memories

### Scenario: Wallet refill before send

- **Given** a `walletService` is set and a pending memory exists
- **When** `tick()` processes the memory
- **Then** `walletService.checkAndRefill(agentId)` is called before the on-chain send

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `sendOnChainToSelf` throws an error | Memory status is set to `failed` via `updateMemoryStatus`; processing continues with next memory |
| `sendOnChainToSelf` returns null | Memory stays in `pending` status (skipped, not failed) |
| `encryptMemoryContent` throws | Memory status is set to `failed`; error is logged |
| `walletService.checkAndRefill` throws | Memory status is set to `failed`; error is logged |
| `start()` called when already running | Logs a warning and returns without creating a second timer |
| `tick()` called while already syncing | Returns immediately (reentrancy guard) |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/db/agent-memories` | `getPendingMemories`, `updateMemoryTxid`, `updateMemoryStatus`, `countPendingMemories` |
| `server/algochat/agent-messenger` | `AgentMessenger` type and `sendOnChainToSelf` method |
| `server/algochat/agent-wallet` | `AgentWalletService` type and `checkAndRefill` method |
| `server/lib/crypto` | `encryptMemoryContent` |
| `server/lib/logger` | `createLogger` |
| `bun:sqlite` | `Database` type |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/index.ts` | `MemorySyncService` class (instantiated, started, and stopped during server lifecycle) |

## Database Tables

### agent_memories

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| agent_id | TEXT | NOT NULL, FK agents(id) ON DELETE CASCADE | Owning agent |
| key | TEXT | NOT NULL | Memory key (unique per agent via index) |
| content | TEXT | NOT NULL | Memory content (plaintext in DB, encrypted before on-chain send) |
| txid | TEXT | DEFAULT NULL | Algorand transaction ID once synced on-chain |
| status | TEXT | DEFAULT 'confirmed' | Sync status: `pending`, `confirmed`, or `failed` |
| archived | INTEGER | NOT NULL DEFAULT 0 | Soft-delete flag (0 = active, 1 = archived) |
| created_at | TEXT | DEFAULT datetime('now') | Creation timestamp |
| updated_at | TEXT | DEFAULT datetime('now') | Last modification timestamp |

**Indexes:**
- `idx_agent_memories_agent_key` UNIQUE ON (agent_id, key)
- `idx_agent_memories_agent` ON (agent_id)
- `idx_agent_memories_status` ON (status)

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-17 | corvid-agent | Update purpose to reflect two-tier architecture role (#1186) |
| 2026-03-04 | corvid-agent | Initial spec |

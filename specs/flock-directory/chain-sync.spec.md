---
module: flock-directory-chain-sync
version: 1
status: active
files:
  - server/flock-directory/chain-sync.ts
depends_on:
  - server/flock-directory/service.ts
  - server/flock-directory/on-chain-client.ts
  - server/lib/logger.ts
tracks: [1459]
---

# Flock Directory Chain Sync

## Purpose

Keeps the off-chain SQLite database synchronized with the on-chain FlockDirectory smart contract state. Periodically polls on-chain agent records and reconciles reputation tiers, scores, and registration status. The on-chain contract is the source of truth for registration status and reputation; the off-chain DB is the source of truth for search, analytics, and extended metadata.

## Public API

### Exported Functions

_No standalone exported functions. All functionality is exposed via the exported class._

### Exported Types

| Type | Description |
|------|-------------|
| `ChainSyncConfig` | Configuration: intervalMs, maxAgentsPerCycle, enabled |
| `SyncResult` | Result of a sync cycle: synced, failed, newDiscoveries, staleMarked, durationMs |

### Exported Classes

| Class | Description |
|-------|-------------|
| `ChainSyncService` | Periodic reconciliation service between off-chain DB and on-chain contract |

### ChainSyncService

| Method | Description |
|--------|-------------|
| `constructor(db, flockService, onChainClient, signerConfig, config?)` | Create sync service with required dependencies |
| `start()` | Begin periodic sync loop; runs initial sync immediately |
| `stop()` | Stop the periodic sync loop |
| `syncAll()` | Run a full sync cycle; returns SyncResult |
| `syncAgent(address)` | Sync a single agent by address |

## Invariants

- **Concurrency guard**: Only one sync cycle runs at a time; concurrent calls return an empty result.
- **Non-destructive**: Sync never deletes off-chain records; it only updates reputation data.
- **Graceful failure**: Individual agent sync failures do not abort the cycle.
- **Disabled mode**: When `enabled: false`, `start()` is a no-op.
- **Stop idempotence**: Calling `stop()` when not running is a no-op.

## Behavioral Examples

1. **No agents registered**: `syncAll()` returns `{ synced: 0, failed: 0, ... }`.
2. **Agent synced**: Off-chain reputation score is updated from on-chain `totalScore / totalMaxScore`.
3. **On-chain client not attached to service**: `syncAgent()` returns `null`.
4. **Concurrent sync**: Second call returns empty result immediately.

## Error Cases

| Scenario | Behavior |
|----------|----------|
| On-chain client unavailable | `syncAgent` returns null |
| Agent not found on-chain | Sync skips that agent, increments `failed` |
| Network timeout | Caught per-agent, does not abort cycle |
| DB not initialized | Throws on construction (caller responsibility) |

## Dependencies

- `FlockDirectoryService` — off-chain registry service
- `OnChainFlockClient` — typed client for contract interaction
- `createLogger` — structured logging

## Change Log

| Date | Change |
|------|--------|
| 2026-03-21 | Initial spec for chain-sync service (issue #895) |

---
module: usdc
version: 1
status: draft
files:
  - server/billing/usdc.ts
db_tables: []
depends_on:
  - specs/db/credits.spec.md
  - specs/lib/infra.spec.md
---

# USDC Deposit Watcher

## Purpose
Monitors an Algorand wallet for incoming USDC ASA transfers via the Algorand indexer and converts detected deposits into internal credits. Polls at a configurable interval (default 30s), tracks the last-processed round to avoid re-processing, and is idempotent by skipping already-recorded transaction IDs.

## Public API

### Exported Functions
| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `createUsdcWatcher` | `db: Database, walletAddress?: string` | `UsdcWatcher \| null` | Factory that creates a UsdcWatcher from environment configuration. Returns null if required config (wallet address, ASA ID, or indexer URL) is missing. |

### Exported Types
| Type | Description |
|------|-------------|
| `UsdcWatcherConfig` | Configuration interface for the watcher: `walletAddress` (string), `asaId` (number), `indexerBaseUrl` (string), `indexerToken?` (string), `pollIntervalMs?` (number, default 30000), `db` (Database). |

### Exported Classes
| Class | Description |
|-------|-------------|
| `UsdcWatcher` | Polls the Algorand indexer for incoming USDC transfers to a watched wallet and records them as credit deposits. |

#### `UsdcWatcher` Methods
| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `constructor` | `config: UsdcWatcherConfig` | `UsdcWatcher` | Creates a new watcher instance with the given configuration. |
| `start` | none | `void` | Begins polling for USDC deposits. Performs an immediate initial poll, then sets an interval. No-op if already running. The timer is unref'd so it does not keep the process alive. |
| `stop` | none | `void` | Stops polling by clearing the interval timer and setting the running flag to false. |
| `poll` | none | `Promise<number>` | Queries the indexer for new ASA transfers to the watched wallet since the last processed round. Returns the number of newly processed deposits. |

## Invariants
1. A transaction ID is never processed more than once — idempotency is enforced by `depositUsdc` in db/credits.
2. Only incoming transfers (receiver matches the watched wallet) with a positive amount and the correct ASA ID are processed.
3. `lastRound` monotonically increases and is used to filter subsequent indexer queries via `min-round`.
4. The watcher returns `null` from `createUsdcWatcher` rather than starting with incomplete configuration.
5. On mainnet, if no explicit `USDC_ASA_ID` is set, the hardcoded mainnet USDC ASA ID (31566704) is used.
6. The poll timer is unref'd so the watcher does not prevent process exit.

## Behavioral Examples
### Scenario: Successful USDC deposit detection
- **Given** a UsdcWatcher configured with a valid wallet, ASA ID, and indexer URL
- **When** the indexer returns a new asset transfer transaction to the watched wallet with a positive USDC amount
- **Then** `depositUsdc` is called to record the deposit, the processed count increments, and `lastRound` advances to the transaction's confirmed round.

### Scenario: Duplicate transaction skipped
- **Given** a transaction ID that was already recorded by `depositUsdc`
- **When** the poll encounters the same transaction again
- **Then** `depositUsdc` returns 0, the transaction is not double-counted, and the poll continues.

### Scenario: Factory returns null for missing config
- **Given** no `USDC_WATCH_ADDRESS` env var and no `walletAddress` argument
- **When** `createUsdcWatcher` is called
- **Then** it returns `null` without creating a watcher instance.

### Scenario: Non-mainnet without explicit ASA ID
- **Given** `ALGORAND_NETWORK` is `testnet` and `USDC_ASA_ID` is not set
- **When** `createUsdcWatcher` is called
- **Then** it returns `null` because there is no default ASA ID for non-mainnet networks.

## Error Cases
| Condition | Behavior |
|-----------|----------|
| Indexer HTTP request returns non-OK status | Logs a warning and returns 0 (no deposits processed). |
| Poll throws an error | The error is caught by the interval callback, logged, and the watcher continues polling. |
| Missing wallet address in config | `createUsdcWatcher` returns `null`. |
| Missing or invalid ASA ID for non-mainnet | `createUsdcWatcher` returns `null`. |
| Missing indexer URL | `createUsdcWatcher` returns `null`. |
| Transfer with zero or negative amount | Skipped during poll processing. |
| Transfer to a different receiver | Skipped during poll processing. |

## Dependencies
### Consumes
| Module | What is used |
|--------|-------------|
| `server/db/credits` | `depositUsdc` — records USDC deposits and converts to credits |
| `server/lib/logger` | `createLogger` — structured logging |
| `bun:sqlite` | `Database` type for SQLite access |

### Consumed By
| Module | What is used |
|--------|-------------|
| (none currently) | `UsdcWatcher` and `createUsdcWatcher` are not yet imported by other modules |

## Change Log
| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |

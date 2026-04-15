---
module: flock-directory-service
version: 1
status: active
files:
  - server/flock-directory/service.ts
  - server/flock-directory/types.ts
db_tables:
  - flock_agents
depends_on:
  - server/flock-directory/on-chain-client.ts
  - server/db/types.ts
  - server/lib/logger.ts
tracks: [1459]
---

# Flock Directory Service

## Purpose

Agent registry service for the Flock Directory. Manages agent registration, discovery, heartbeat tracking, and reputation aggregation. Operates in hybrid mode: off-chain SQLite for fast queries with optional on-chain sync via OnChainFlockClient when available. On-chain writes are fire-and-forget — the off-chain record is authoritative for reads.

## Public API

### Exported Functions

_No standalone exported functions. All functionality is exposed via the exported class._

### Exported Types

| Type | Description |
|------|-------------|
| `FlockAgentRecord` | Raw DB row shape: snake_case columns from `flock_agents` table |
| `RegisterFlockAgentInput` | Input for registration: address, name, optional description/instanceUrl/capabilities |
| `UpdateFlockAgentInput` | Partial update input: optional name, description, instanceUrl, capabilities, reputationScore, attestationCount, councilParticipations, uptimePct |
| `OnChainSignerConfig` | Signer config for on-chain operations: senderAddress, sk (Uint8Array), network |

### Exported Classes

| Class | Description |
|-------|-------------|
| `FlockDirectoryService` | Hybrid off-chain/on-chain agent registry |

#### FlockDirectoryService Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `setOnChainClient` | `(client: OnChainFlockClient, signer: OnChainSignerConfig)` | `void` | Injects on-chain client for hybrid operation |
| `hasOnChain` | _(getter)_ | `boolean` | Whether on-chain operations are available |
| `getOnChainClient` | `()` | `OnChainFlockClient \| null` | Returns the on-chain client or null |
| `register` | `(input: RegisterFlockAgentInput)` | `FlockAgent` | Registers agent off-chain, fire-and-forget on-chain |
| `deregister` | `(id: string)` | `boolean` | Soft-deletes agent (status → 'deregistered') |
| `heartbeat` | `(id: string)` | `boolean` | Updates last_heartbeat and status to 'active' |
| `update` | `(id: string, input: UpdateFlockAgentInput)` | `FlockAgent \| null` | Updates agent metadata |
| `getById` | `(id: string)` | `FlockAgent \| null` | Lookup by UUID |
| `getByAddress` | `(address: string)` | `FlockAgent \| null` | Lookup by Algorand address |
| `listActive` | `(limit?: number, offset?: number)` | `FlockAgent[]` | Lists active agents sorted by reputation desc |
| `search` | `(params: FlockDirectorySearchParams)` | `FlockDirectorySearchResult` | Filtered search with pagination and sorting |
| `computeReputation` | `(id: string)` | `FlockAgent \| null` | Computes composite 0–100 reputation score from uptime, attestations, council, heartbeat |
| `recomputeAllReputations` | `()` | `number` | Recomputes scores for all non-deregistered agents |
| `sweepStaleAgents` | `()` | `number` | Marks agents inactive if no heartbeat for 24 hours |
| `getStats` | `()` | `{ total, active, inactive, onChainAppId }` | Directory statistics |
| `selfRegister` | `(opts: { address, name, description, instanceUrl, capabilities })` | `Promise<FlockAgent>` | Idempotent self-registration for this corvid-agent instance |
| `syncFromChain` | `(address: string)` | `Promise<OnChainAgentRecord \| null>` | Fetches on-chain record and enriches off-chain entry with tier/score |

## Invariants

1. Off-chain SQLite record is always written first and is authoritative. On-chain writes are async fire-and-forget.
2. On-chain failures never cause off-chain operations to fail.
3. Deregistration is a soft delete — sets `status = 'deregistered'`, never removes the row.
4. Heartbeat only updates agents not in 'deregistered' status.
5. `selfRegister` is idempotent — if already registered at the given address, it sends a heartbeat instead.
6. Stale sweep threshold is 24 hours without heartbeat.
7. `computeReputation` score is always clamped to 0–100.
8. Reputation weights: uptime 35%, attestations 25% (log scale, cap 20), council 20% (linear, cap 10), heartbeat 20% (active=full, inactive=half).
9. Search defaults to sorting by reputation_score DESC when no sortBy is specified.

## Behavioral Examples

### Scenario: Register with on-chain sync

- **Given** `setOnChainClient` has been called with a valid client and signer
- **When** `register({ address, name })` is called
- **Then** the agent is inserted into SQLite immediately, and an async on-chain registration is fired

### Scenario: On-chain registration fails

- **Given** on-chain client is attached but the contract call fails
- **When** `register()` fires the async on-chain call
- **Then** the off-chain record remains intact, a warning is logged

### Scenario: Self-register idempotent

- **Given** agent is already registered at the given address with status 'active'
- **When** `selfRegister()` is called with the same address
- **Then** a heartbeat is sent instead of creating a duplicate, the existing agent is returned

### Scenario: Search with custom sort

- **Given** multiple agents are registered with varying uptime
- **When** `search({ sortBy: 'uptime', sortOrder: 'desc' })` is called
- **Then** results are sorted by uptime_pct descending

### Scenario: Compute reputation score

- **Given** an active agent with uptimePct=95, attestationCount=10, councilParticipations=5
- **When** `computeReputation(id)` is called
- **Then** a composite score is calculated from weighted components (uptime 35%, attestations 25%, council 20%, heartbeat 20%) and persisted

### Scenario: Stale agent sweep

- **Given** an agent's last heartbeat was 25 hours ago
- **When** `sweepStaleAgents()` runs
- **Then** the agent's status changes from 'active' to 'inactive'

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Duplicate address on register | SQLite UNIQUE constraint error (address column) |
| Update on deregistered agent | Returns null |
| syncFromChain without on-chain client | Returns null |
| Agent not found on-chain during sync | Returns null, logs debug message |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/flock-directory/on-chain-client.ts` | `OnChainFlockClient`, `OnChainAgentRecord`, `TIER_NAMES` |
| `server/db/types.ts` | `queryCount` |
| `server/lib/logger.ts` | `createLogger` |
| `shared/types/flock-directory.ts` | `FlockAgent`, `FlockDirectorySearchParams`, `FlockDirectorySearchResult` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/bootstrap.ts` | `FlockDirectoryService` constructor |
| `server/routes/flock-directory.ts` | Service methods via route handlers |
| `server/mcp/tool-handlers/flock-directory.ts` | Service methods via MCP tools |
| `server/__tests__/flock-directory-service.test.ts` | All methods |
| `server/__tests__/flock-directory-hybrid.test.ts` | On-chain hybrid methods |

## Database Tables

### flock_agents

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| address | TEXT | NOT NULL, UNIQUE | Algorand address |
| name | TEXT | NOT NULL | Agent display name |
| description | TEXT | NOT NULL, DEFAULT '' | Agent description |
| instance_url | TEXT | — | Agent's API endpoint URL |
| capabilities | TEXT | NOT NULL, DEFAULT '[]' | JSON array of capability strings |
| status | TEXT | NOT NULL, DEFAULT 'active' | One of: active, inactive, deregistered |
| reputation_score | INTEGER | NOT NULL, DEFAULT 0 | Reputation score (0-100) |
| attestation_count | INTEGER | NOT NULL, DEFAULT 0 | Number of attestations received |
| council_participations | INTEGER | NOT NULL, DEFAULT 0 | Number of council votes |
| uptime_pct | REAL | NOT NULL, DEFAULT 0.0 | Uptime percentage |
| last_heartbeat | TEXT | — | ISO timestamp of last heartbeat |
| registered_at | TEXT | NOT NULL, DEFAULT datetime('now') | Registration timestamp |
| updated_at | TEXT | NOT NULL, DEFAULT datetime('now') | Last update timestamp |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| _None_ | — | Service is configured via constructor injection (Database) and `setOnChainClient` |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-11 | corvid-agent | Initial spec |

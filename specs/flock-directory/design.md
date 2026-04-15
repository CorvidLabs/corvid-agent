---
spec: service.spec.md
sources:
  - server/flock-directory/service.ts
  - server/flock-directory/types.ts
---

## Layout

Module lives under `server/flock-directory/`:
- `types.ts` — type exports (`FlockAgentRecord`, `RegisterFlockAgentInput`, `UpdateFlockAgentInput`, `OnChainSignerConfig`)
- `service.ts` — `FlockDirectoryService` class (hybrid off-chain/on-chain registry)
- `on-chain-client.ts` — `OnChainFlockClient` wrapper around the Flock Directory Algorand contract
- `capability-router.ts` — capability-based agent discovery and routing
- `conflict-resolver.ts` — conflict resolution between local and on-chain records
- `chain-sync.ts` — background sync worker for on-chain state
- `testing/` — sub-module for automated agent testing (challenges, evaluator, runner)

## Components

### FlockDirectoryService
Hybrid registry with two data planes:

**Off-chain plane (SQLite, authoritative for reads):**
- All read operations (`getById`, `getByAddress`, `listActive`, `search`) query the `flock_agents` table directly
- Writes are committed to SQLite synchronously before any on-chain fire-and-forget is attempted

**On-chain plane (Algorand contract, fire-and-forget):**
- Injected via `setOnChainClient` after construction; optional
- On-chain writes never block off-chain operations; failures are logged as warnings
- `syncFromChain` enriches off-chain records with on-chain tier/score data

**Lifecycle operations:**
- `register` — inserts agent, fires async on-chain registration
- `deregister` — soft-delete (sets `status = 'deregistered'`); on-chain deregister fire-and-forget
- `heartbeat` — updates `last_heartbeat` and `status` to `'active'` for non-deregistered agents
- `selfRegister` — idempotent; sends heartbeat if address already registered

**Reputation system:**
- `computeReputation(id)` calculates composite 0–100 score from: uptime (35%), attestations (25%, log scale capped at 20), council participations (20%, linear capped at 10), heartbeat freshness (20%, full if active, half if inactive)
- `recomputeAllReputations` runs `computeReputation` for all non-deregistered agents
- `sweepStaleAgents` marks agents inactive if last heartbeat > 24 hours ago

## Tokens

| Constant | Value | Description |
|----------|-------|-------------|
| Stale threshold | 24 hours | Heartbeat age after which agent is marked inactive |
| Reputation score range | 0–100 | Clamped composite score |
| Uptime weight | 35% | Contribution to reputation from `uptime_pct` |
| Attestation weight | 25% | Log-scale, capped at 20 attestations |
| Council weight | 20% | Linear, capped at 10 participations |
| Heartbeat weight | 20% | Full if active, half if inactive |
| Default sort | `reputation_score DESC` | Applied when no `sortBy` param given |

## Assets

**DB table: `flock_agents`**
- `id` (UUID primary key), `address` (UNIQUE Algorand address), `name`, `description`, `instance_url`, `capabilities` (JSON array), `status` (active/inactive/deregistered), `reputation_score`, `attestation_count`, `council_participations`, `uptime_pct`, `last_heartbeat`, `registered_at`, `updated_at`

**External services:**
- Algorand contract (via `OnChainFlockClient`) — optional on-chain sync
- `CorvidLabs/flock-directory-contract` — source of the smart contract (external repo, not in this repo)

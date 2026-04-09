---
spec: service.spec.md
---

## Product Requirements

- Agents register themselves in a shared directory so that other agents can find them by capability, availability, or reputation — like a living team roster.
- The directory always reflects which agents are actually available right now; agents that have gone silent are automatically marked inactive.
- When a task needs to be assigned, the system automatically selects the best-qualified available agent based on reputation, current workload, and responsiveness.
- Multiple agents working on the same project cannot accidentally duplicate each other's effort — the directory mediates work claims to prevent conflicts.
- Agent reputation is computed from real performance data (uptime, task completion, peer testing) so operators can trust the rankings.

## User Stories

- As a team agent, I want to register myself in the Flock Directory so that other agents can discover my capabilities and route tasks to me.
- As a team agent, I want to send periodic heartbeats so that the directory knows I am alive and available for work.
- As an agent operator, I want to search the directory by capabilities, reputation, and status so that I can find the best agent for a given task.
- As a platform administrator, I want stale agents (no heartbeat for 30+ minutes) automatically marked inactive so that the directory reflects real availability.
- As a team agent, I want my reputation score computed from uptime, attestations, council participation, and heartbeat freshness so that reliable agents are ranked higher.
- As an agent developer, I want a capability router that selects the best agent for a task based on weighted scoring (reputation 40%, workload 30%, uptime 20%, recency 10%) so that delegation is fair and effective.
- As a platform administrator, I want off-chain SQLite to be authoritative for reads with fire-and-forget on-chain sync so that the system is fast but still anchored to the blockchain.
- As a team agent, I want conflict resolution via work claims so that multiple agents across machines do not duplicate effort on the same issue or branch.

## Acceptance Criteria

- `FlockDirectoryService.register` inserts a record into SQLite immediately and fires an async on-chain registration that does not block or fail the off-chain write.
- `selfRegister` is idempotent: if the agent is already registered at the given address, it sends a heartbeat instead of creating a duplicate.
- `sweepStaleAgents` marks agents as `inactive` if their `last_heartbeat` is older than 30 minutes; it never touches `deregistered` agents.
- `computeReputation` produces a score clamped to 0-100 using weights: uptime 35%, attestations 25% (log scale, cap 20), council 20% (linear, cap 10), heartbeat 20%.
- `search` defaults to sorting by `reputation_score DESC` when no `sortBy` is specified and supports pagination via `limit`/`offset`.
- `deregister` performs a soft delete by setting `status = 'deregistered'`; it never removes the database row.
- `CapabilityRouter.route` excludes the self agent, excludes agents lacking all required capabilities, and excludes agents with active claims on the target repo.
- `CapabilityRouter.route` returns `bestCandidate: null` with exclusion reasons when no agents match.
- `ChainSyncService.syncAll` runs one cycle at a time (concurrency guard), updates off-chain reputation from on-chain scores, and never deletes off-chain records.
- Individual agent sync failures in `ChainSyncService` do not abort the full sync cycle.
- `FlockConflictResolver.checkAndClaim` blocks claims on the same issue or same branch held by another agent, allows claims on different issues in the same repo by default, and auto-overrides expired claims.
- Work claims expire after 2 hours (default TTL) and released/expired/superseded claims are pruned after 7 days.
- `FlockTestRunner.runTest` executes challenges sequentially, shares a `threadId` for multi-turn challenges, and persists results to `flock_test_results` and `flock_test_challenge_results`.
- `getEffectiveScore` applies time-based decay (default 2%/day) and returns 0 for untested agents.
- A2A test transport resolves agent addresses to `instanceUrl` via the Flock Directory, submits tasks via `POST /a2a/tasks/send`, and polls for completion with a 30-second timeout.
- The evaluator's `CATEGORY_WEIGHTS` sum to 100: responsiveness 15, accuracy 20, context 15, efficiency 10, safety 20, bot_verification 20.

## Constraints

- Off-chain SQLite is always authoritative for reads; on-chain writes are fire-and-forget and never cause off-chain operations to fail.
- The smart contract source code is not in this repository; only the generated ABI client and typed facade are included.
- Secret keys are never cached in `OnChainFlockClient`; a fresh signer is built per call.
- `createFlockClient` never auto-deploys on mainnet; it returns `null` if no app ID is persisted.
- All challenge timeouts range from 90-120 seconds to accommodate real agent session boot times.
- The conflict resolver uses SQLite for persistence; cross-machine coordination relies on agents sharing the same database or syncing claims.

## Out of Scope

- Smart contract development, compilation, or TEAL bytecode management (lives in `CorvidLabs/flock-directory-contract`).
- Agent-to-agent message routing beyond capability-based task delegation.
- Manual challenge creation or editing via a UI (challenges are defined in code).
- Real-time push notifications for directory changes (polling-based only).
- Cross-instance flock federation (each instance has its own directory; federation is handled by the marketplace module).

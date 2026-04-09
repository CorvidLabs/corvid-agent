---
spec: service.spec.md
---

## Active Tasks

- [ ] Grow the flock: enable cross-machine agent discovery via testnet/mainnet Algorand registration (#1459)
- [ ] Add Flock Directory UI view to the dashboard — agent roster with reputation scores, capabilities, and heartbeat status (#1623)
- [ ] Implement cross-machine work claim coordination: currently SQLite-only, needs protocol for cross-instance conflict resolution
- [ ] Expose A2A test challenge results in the operator dashboard for evaluating remote agents

## Completed Tasks

- [x] SQLite-authoritative off-chain directory with fire-and-forget on-chain sync
- [x] `selfRegister` idempotent with heartbeat fallback on duplicate registration
- [x] `sweepStaleAgents` marking agents inactive after 30-minute heartbeat gap
- [x] `computeReputation` with weighted scoring: uptime 35%, attestations 25%, council 20%, heartbeat 20%
- [x] `CapabilityRouter.route` with weighted scoring (reputation 40%, workload 30%, uptime 20%, recency 10%)
- [x] `FlockConflictResolver` with 2-hour claim TTL and auto-override of expired claims
- [x] A2A test transport via `POST /a2a/tasks/send` with 30-second polling

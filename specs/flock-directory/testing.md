---
spec: service.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/__tests__/flock-directory-service.test.ts` | Unit | All `FlockDirectoryService` methods: register, deregister, heartbeat, update, getById, getByAddress, listActive, search, computeReputation, recomputeAllReputations, sweepStaleAgents, getStats, selfRegister |
| `server/__tests__/flock-directory-hybrid.test.ts` | Integration | On-chain hybrid path: `setOnChainClient`, fire-and-forget on-chain register/deregister, `syncFromChain` with mock on-chain client |
| `server/__tests__/flock-directory-chain-sync.test.ts` | Unit | Chain sync worker background synchronization logic |
| `server/__tests__/flock-directory-e2e.test.ts` | E2E | End-to-end registration, heartbeat, and discovery flow |
| `server/__tests__/routes-flock-directory.test.ts` | Route | HTTP API routes for flock directory CRUD operations |
| `server/__tests__/flock-directory-on-chain.test.ts` | Unit | `OnChainFlockClient` wrapper and Algorand contract interaction |
| `server/__tests__/flock-directory-tool-handler.test.ts` | Unit | MCP tool handler for `corvid_flock_directory` tool |
| `server/__tests__/flock-capability-router.test.ts` | Unit | Capability-based agent routing and discovery |
| `server/__tests__/scheduler-flock-reputation-refresh.test.ts` | Unit | Scheduled reputation recomputation and stale agent sweep |

## Manual Testing

- [ ] Register a new agent; verify it appears in `listActive` with `status: 'active'`
- [ ] Send heartbeat; verify `last_heartbeat` is updated and status remains `'active'`
- [ ] Register agent with same address a second time; verify SQLite UNIQUE constraint error
- [ ] Deregister an agent; verify it does NOT appear in `listActive` but is retrievable by ID with `status: 'deregistered'`
- [ ] Update a deregistered agent; verify it returns `null`
- [ ] Call `selfRegister` twice with same address; verify second call sends a heartbeat instead of creating a duplicate
- [ ] Set agent's `last_heartbeat` to 25 hours ago; run `sweepStaleAgents`; verify `status` changes to `'inactive'`
- [ ] Call `computeReputation` with known metrics; verify composite score matches expected formula output
- [ ] Inject `OnChainFlockClient`; register an agent; verify on-chain fire-and-forget is called asynchronously and off-chain record is immediately available
- [ ] Simulate on-chain registration failure; verify off-chain record remains intact and only a warning is logged

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| Duplicate Algorand address on register | SQLite UNIQUE constraint error propagates to caller |
| `heartbeat` called on deregistered agent | Returns `false`; no update made |
| `update` called on deregistered agent | Returns `null`; no update made |
| `syncFromChain` called without on-chain client | Returns `null` immediately |
| Agent not found on-chain during `syncFromChain` | Returns `null`; logs debug message; off-chain record unchanged |
| On-chain client attached but contract call fails during register | Off-chain insert succeeds; warning logged; no exception raised |
| Reputation score computed as fractional | Clamped to integer in 0–100 range |
| Agent with 0 uptime, 0 attestations, 0 council, inactive status | Reputation score = 0 |
| Agent with 100% uptime, 20 attestations, 10+ council participations, active | Reputation score = 100 |
| `listActive` with no active agents | Returns empty array |
| `search` with `sortBy: 'uptime'` | Results sorted by `uptime_pct` regardless of reputation score |

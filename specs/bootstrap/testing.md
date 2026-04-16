---
spec: bootstrap.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| (no dedicated unit tests) | — | Bootstrap is an integration-level concern; service-level tests cover individual services |

Bootstrap is tested implicitly through the full server startup path in integration/E2E tests. Because it is a pure composition root with no logic beyond construction order, unit tests would duplicate service constructor tests.

## Manual Testing

- [ ] Start the server with a valid database and verify all services appear in startup logs (no "failed to construct" errors)
- [ ] Start the server without AlgoChat configured (no `ALGORAND_MNEMONIC` env var) and verify the server starts normally with AlgoChat services absent
- [ ] Verify that `ServiceContainer` is fully populated by checking that a POST to `/api/sessions` creates a session (requires `processManager` and `workflowService` to be properly wired)
- [ ] Introduce a deliberate construction error in a Tier 1 service constructor; verify the server fails to start with a clear error rather than silently degrading

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| AlgoChat not configured | `AlgoChatState` properties are `undefined`; all other services construct normally |
| Circular service dependency introduced | JavaScript runtime error on startup — constructor call chain throws |
| Service constructor throws | `bootstrapServices` propagates the error; server does not start |
| Same `db` instance passed everywhere | All services share one connection — consistent with bun:sqlite single-writer model |
| `startTime` parameter | Passed through to services that track startup latency (e.g., UsageMonitor for metrics) |

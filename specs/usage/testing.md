---
spec: usage.spec.md
---

## Automated Testing

No test files currently exist for this module. Recommended test file:

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/usage/monitor.test.ts` | Unit | Cost backfill SQL correctness, spike detection thresholds, long-running detection, duplicate alert suppression, missing notification service handling |

Key fixtures needed: in-memory SQLite with `schedule_executions` and `sessions` rows; a stub `ProcessManager` with controllable `subscribeAll`; a mock `NotificationService` that records calls.

## Manual Testing

- [ ] Start the server, trigger a scheduled agent run, and verify the execution's `cost_usd` is populated after the session ends (check DB directly with `sqlite3 corvid-agent.db "SELECT cost_usd FROM schedule_executions ORDER BY created_at DESC LIMIT 5"`).
- [ ] Trigger a schedule that runs more than 30 minutes; confirm a "Long-Running Session" warning notification appears in the owner's channel.
- [ ] Run a schedule repeatedly until you have 3+ completed executions, then trigger one with artificially high cost (patch `total_cost_usd`); confirm a "Cost Spike Detected" notification is sent exactly once.
- [ ] Stop and restart the server after executions with `cost_usd = 0` accumulate; confirm `backfillCosts()` log line shows updated count.

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| Exactly 2 past completed executions | No spike alert even if current cost is 10x the average |
| Exactly 3 past completed executions | Spike detection activates; alert sent if ratio > 2x |
| Cost spike fires, then same execution triggers again | Second trigger suppressed via `alertedExecutions` set |
| Long-running check fires twice for same running execution | Alert sent only on first detection |
| Session has `total_cost_usd = null` | No backfill and no spike check performed |
| `NotificationService` not set when spike detected | Alert silently skipped; only debug log emitted |
| `NotificationService.notify` throws | Error caught and logged at warn; monitor continues |
| Schedule has no `agent_id` | Alert for cost spike or long-running silently skipped |
| `session_exited` for session not linked to any execution | Event silently ignored |
| `backfillCosts()` called when all executions already have cost | Returns 0 (no rows updated) |
| Session has `total_cost_usd = 0` | No backfill (guard prevents overwriting non-zero values with zero) |

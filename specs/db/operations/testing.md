---
spec: projects.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/__tests__/routes-schedules.test.ts` | Integration | Schedule CRUD API routes backed by `db/schedules.ts` |
| `server/__tests__/routes-councils.test.ts` | Integration | Council routes that exercise `db/councils.ts` operations |
| `server/__tests__/db-usdc-revenue.test.ts` | Unit | USDC revenue tracking in spending layer |
| `server/__tests__/work-task-drain.test.ts` | Integration | Work task state transitions, repo lock behavior |
| `server/__tests__/work-task-repo-map.test.ts` | Unit | Repo-to-task mapping logic |

## Manual Testing

- [ ] Create a project, then delete it: verify dependent sessions and work tasks are removed
- [ ] Purchase credits for an agent: verify `credit_ledger` gains a `purchase` entry
- [ ] Run a session that triggers deductions: verify `deduction` entries appear in ledger
- [ ] Reserve credits for a group message then release: verify net balance unchanged
- [ ] Schedule an agent with a cron expression: verify `schedule_executions` row created on first run
- [ ] Lock a repo via work task, attempt concurrent task on same repo: verify second task blocked
- [ ] Open a governance proposal: verify voting opens, veto window respects deadline

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| `getProject` with wrong tenant ID | Returns `null` (not 404 at DB layer) |
| `deleteProject` for non-existent ID | Returns `false` |
| Credit deduction when balance is zero | Implementation-specific; must not go negative without explicit overdraft support |
| Credit reservation exceeds available balance | Reservation should fail; available = credits - reserved |
| `reserve` followed by process crash (no `release`) | Reserved credits remain locked until explicit release or expiry |
| Two work tasks on same repo at same time | Repo lock prevents concurrent execution; second task waits or fails |
| `repo_blocklist` check on task creation | Task creation should reject blocked repos |
| Schedule with invalid cron expression | Validation should catch before insert |
| Council with zero members | Launch should fail with appropriate error |
| Governance proposal vote deadline in the past | Vote evaluation should treat as expired |

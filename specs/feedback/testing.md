---
spec: feedback.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/__tests__/response-feedback.test.ts` | Unit | `recordPrFromWorkTask` idempotency; `analyzeWeekly` insight generation; `getOutcomeContext` formatting; stale PR detection logic |

## Manual Testing

- [ ] Complete a work task that produces a PR; verify `recordPrFromWorkTask` creates a `pr_outcomes` row with `state: 'open'`
- [ ] Call `checkOpenPrs`; verify merged PRs in GitHub are reflected as `state: 'merged'` in the DB
- [ ] Let a PR remain open for 15 days (or mock the `createdAt`); verify `checkOpenPrs` marks it `closed` with `failureReason: 'stale'`
- [ ] Create 4 PRs in one repo with only 1 merged; run `analyzeWeekly`; confirm the insight flags the repo as low-success
- [ ] Call `analyzeWeekly` with no PRs tracked in the past 7 days; confirm a single insight "No PRs tracked this period." is returned
- [ ] Call `getOutcomeContext` when no PRs exist; verify it returns an empty string
- [ ] Configure no `MemoryManager`; call `saveAnalysisToMemory`; verify it logs a warning and returns without error

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| Invalid PR URL (missing PR number) | `recordPrFromWorkTask` logs warning and returns `null` |
| Same `workTaskId` submitted twice | Second call returns the existing record without creating a duplicate |
| GitHub API returns `result.ok: false` | PR is marked as checked (`lastCheckedAt` updated) but state is not changed |
| GitHub API throws during `checkOpenPrs` | Warning logged for that specific PR; polling continues to next entry |
| PR merged at exactly the 14-day mark | Not stale (stale threshold is strictly > 14 days) |
| `statusCheckRollup: 'SUCCESS'` and `reviewDecision: 'CHANGES_REQUESTED'` on closed PR | Failure reason is `review_rejection` (review decision takes precedence) |
| Repo with exactly 3 PRs and exactly 30% merge rate | Not flagged as low-success (threshold is strictly < 30%) |
| Weekly analysis has 0 work tasks | `workTaskStats.successRate` is `0` without division errors |

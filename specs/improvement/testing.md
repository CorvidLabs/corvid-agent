---
spec: improvement.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/__tests__/health-collector.test.ts` | Unit | `CodebaseHealthCollector.collect()`: parallel execution; per-collector safe defaults on timeout/failure; `parseTscOutput`, `parseTestOutput`, `parseTodoOutput`, `parseLargeFiles`, `parseOutdatedOutput` parsing functions |

## Manual Testing

- [ ] Run `AutonomousLoopService.run()` with a valid agent and project; verify health snapshot is saved and a session is created
- [ ] Run with agent trust level `medium` and `maxTasks: 5`; verify `maxTasksAllowed` in result is `2` (capped)
- [ ] Run with an `untrusted` agent; verify `AuthorizationError` is thrown before any session is created
- [ ] Run with an agent whose project has no `workingDir`; verify `ValidationError` is thrown
- [ ] Let a sub-collector time out (mock 60s timeout); verify the other collectors still return results and overall collection succeeds
- [ ] After a session completes, verify that work tasks created during it are saved to memory with key format `improvement_loop:outcome:{timestamp}`
- [ ] Run `computeTrends` with 4 snapshots showing TSC errors [10, 8, 5, 3]; verify `tsc_errors` trend is `improving`
- [ ] Run `computeTrends` with fewer than 2 snapshots; verify an empty array is returned
- [ ] Run `DailyReviewService.run()` for a day with multiple failed schedules; verify "High failure rate" observation is included
- [ ] Verify `buildImprovementPrompt` truncates TSC errors to 15 entries when more exist

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| Agent not found in DB | `NotFoundError` thrown with entity `'Agent'` |
| Project not found in DB | `NotFoundError` thrown with entity `'Project'` |
| Project exists but `workingDir` is null/empty | `ValidationError` thrown |
| Memory search fails during past attempt recall | Warning logged; `pastAttempts` defaults to empty array; loop continues |
| Trend computation throws | Warning logged; `trendSummary` remains undefined; loop continues |
| `bun test` subprocess hangs > 180 seconds | Killed; tests collector returns safe default `{ passed: false, failureCount: 0 }` |
| `bun outdated` returns non-parseable output | Safe default empty array returned; warning logged |
| `parseLargeFiles` with `.js` file > 500 lines | Only `.ts` files counted; `.js` file excluded |
| `parseOutdatedOutput` with a package at latest version | Package excluded from results (current === latest) |
| `registerFeedbackHooks` fails after session completes | Error logged; session and work tasks unaffected |
| Completed work task has no PR URL | `+5` reputation event recorded; outcome tracker not called |
| Completed work task has PR URL | `+5` reputation and PR outcome recorded in outcome tracker |
| Daily review with 0 schedule executions | No failure rate observation; no "All systems nominal" (requires executions > 0) |
| Trend with exactly 2 snapshots (boundary) | Trend computed (minimum satisfied); single comparison of each half |

---
spec: feedback.spec.md
---

## User Stories

- As an agent operator, I want PR outcomes (merged, closed, stale) automatically tracked so that I can measure agent effectiveness without manual bookkeeping
- As a platform administrator, I want weekly analysis reports with merge rates and failure reasons so that I can identify patterns and improve agent performance
- As an agent operator, I want per-repository outcome breakdowns so that I can see which repos have low success rates and adjust contribution strategies
- As a team agent, I want outcome context formatted as markdown so that the improvement loop can make data-driven decisions about what to work on next
- As a platform administrator, I want feedback metrics available via API so that dashboards and monitoring tools can display real-time PR outcome data

## Acceptance Criteria

- `recordPrFromWorkTask` creates a `PrOutcome` record from a work task ID and PR URL, extracting repo and PR number; returns `null` for unparseable URLs
- `recordPrFromWorkTask` is idempotent: calling with the same `workTaskId` returns the existing record without creating a duplicate
- `checkOpenPrs` polls GitHub for all open PR outcomes, updating state to `merged`, `closed`, or `closed` with reason `stale` (open > 14 days)
- PR state mapping: GitHub `MERGED` maps to `merged`, GitHub `CLOSED` maps to `closed` with inferred failure reason, open PRs older than 14 days map to `closed` with reason `stale`
- Failure reason inference: `FAILURE` in `statusCheckRollup` yields `ci_fail`; `CHANGES_REQUESTED` in `reviewDecision` yields `review_rejection`
- `analyzeWeekly` produces a `WeeklyAnalysis` with `period`, `overall` stats, `byRepo` breakdowns, `failureReasons`, `workTaskStats`, and `topInsights`
- Weekly insights flag repos with 3+ PRs and < 30% merge rate as "low success" and suggest reducing contributions
- `analyzeWeekly` returns a single insight "No PRs tracked this period." when no PRs exist in the past 7 days
- `saveAnalysisToMemory` persists the analysis under key `feedback:weekly:{date}`; is a no-op with a warning log when no memory manager is configured
- `getMetrics` returns `FeedbackMetrics` with overall stats, per-repo stats, failure reasons, recent outcomes, and work task success rate
- `getOutcomeContext` formats the past 7 days of outcome data as markdown; returns empty string when no PRs are tracked
- GitHub API failures during `checkOpenPrs` log a warning and update `lastCheckedAt` without changing the PR state; processing continues to the next PR

## Constraints

- Depends on GitHub API availability for PR state polling; individual PR check failures are non-fatal
- PR outcome storage uses the `pr_outcomes` SQLite table via `server/db/pr-outcomes`
- Memory persistence requires an optional `MemoryManager` instance; the service operates without it (analysis just is not saved)
- Stale PR threshold is hardcoded at 14 days
- Weekly analysis window is fixed at 7 days, not configurable

## Out of Scope

- Tracking issues or commits (only pull requests)
- Real-time GitHub webhook integration (polling-based only)
- Automatically closing or merging PRs based on analysis
- Cross-instance or multi-platform PR tracking (GitHub only)
- Historical trend analysis beyond the 7-day weekly window (handled by the improvement module)
- Notification or alerting on low merge rates

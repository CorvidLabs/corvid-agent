---
spec: improvement.spec.md
---

## User Stories

- As a team agent, I want an autonomous improvement loop that collects codebase health metrics and creates sessions to fix issues so that the codebase improves continuously without human intervention
- As a platform administrator, I want reputation-gated task limits so that untrusted agents cannot make unsupervised changes and trusted agents get appropriate autonomy
- As an agent operator, I want health metric trends tracked over time so that I can see whether the codebase is improving, stable, or regressing
- As an agent operator, I want daily review summaries saved to memory so that I have a persistent record of what happened each day
- As a team agent, I want past improvement attempts recalled from memory so that I avoid repeating failed approaches
- As a platform administrator, I want individual health collector failures to be non-fatal so that a single broken tool does not block the entire improvement cycle

## Acceptance Criteria

- `CodebaseHealthCollector.collect` runs all 5 sub-collectors (tsc, tests, code-markers, large files, outdated deps) in parallel via `Promise.all`; any individual failure returns a safe default without rejecting the overall collection
- Safe defaults: TSC returns `{ errors: [], passed: false }`, Tests returns `{ passed: false, summary: 'Collection failed', failureCount: 0 }`, Markers returns `{ todoCount: 0, fixmeCount: 0, hackCount: 0, samples: [] }`, Large files returns `[]`, Outdated deps returns `[]`
- Subprocess spawns have a 60-second timeout (180 seconds for tests); processes are killed on timeout
- `saveHealthSnapshot` persists metrics to the `health_snapshots` table; `getRecentSnapshots` retrieves the most recent snapshots (default 10) ordered by `collected_at` descending
- `computeTrends` requires at least 2 snapshots; with fewer, returns an empty array; tracks 7 metrics: `tsc_errors`, `test_failures`, `todos`, `fixmes`, `hacks`, `large_files`, `outdated_deps`
- Trend direction is determined by comparing first-half vs second-half averages with a 10% (or minimum 1) significance threshold; all metrics use "lower is better" semantics
- `AutonomousLoopService.run` validates agent and project exist, collects health, saves snapshot, computes trends, recalls past attempts from memory, computes reputation, gates tasks, builds prompt, creates session, and starts process
- Reputation gating enforces: `untrusted` = 0 tasks (throws `AuthorizationError`), `low` = 1, `medium` = min(requested, 2), `high`/`verified` = min(requested, 5)
- Default `maxTasks` is 3 when not specified in options
- `buildImprovementPrompt` includes sections for reputation, focus area, health metrics, trends, past attempts (truncated to 300 chars each), and actionable instructions; limits display to first 15 TSC errors, 10 large files, 10 outdated deps
- `parseLargeFiles` only considers `.ts` files with a default threshold of 500 lines
- After session completion, `registerFeedbackHooks` saves work tasks as memory entries with key format `improvement_loop:outcome:{ISO timestamp}`
- Completed work tasks add +5 reputation; failed tasks add -2 reputation; PRs on completed tasks are recorded in the outcome tracker
- `DailyReviewService.run` collects execution stats, PR stats, and health delta, generates observations, formats a summary, and saves to memory with key `review:daily:{date}`
- Daily review observation thresholds: failure rate >= 50% = "High failure rate", >= 25% = "Elevated failure rate"; inactivity, PR rejections, and health degradation are also detected

## Constraints

- Requires a valid agent with a project that has a `workingDir` set; missing entities throw `NotFoundError`, missing `workingDir` throws `ValidationError`
- Memory search failures during past attempt recall default to an empty array; the loop continues
- Trend computation failures default to undefined trend summary; the loop continues
- Sub-collector timeouts (60s general, 180s tests) are enforced via process kill
- The improvement loop depends on `ProcessManager`, `WorkTaskService`, `MemoryManager`, and `ReputationScorer` collaborators

## Out of Scope

- Approving or deploying changes made by the improvement loop (human review required)
- Customizing health metric thresholds or adding new sub-collectors at runtime
- Running improvement loops for languages other than TypeScript (hardcoded to tsc, bun test)
- Parallel improvement sessions for the same project
- Rollback of changes made during an improvement session
- Real-time streaming of improvement loop progress to the UI

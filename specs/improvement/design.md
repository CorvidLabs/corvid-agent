---
spec: improvement.spec.md
sources:
  - server/improvement/health-collector.ts
  - server/improvement/health-store.ts
  - server/improvement/prompt-builder.ts
  - server/improvement/service.ts
  - server/improvement/daily-review.ts
---

## Layout

Module under `server/improvement/`:
- `health-collector.ts` — `CodebaseHealthCollector` class; spawns subprocesses in parallel
- `health-store.ts` — `saveHealthSnapshot`, `getRecentSnapshots`, `computeTrends`, `formatTrendsForPrompt`
- `prompt-builder.ts` — `buildImprovementPrompt`; assembles full improvement loop prompt
- `service.ts` — `AutonomousLoopService`; full lifecycle orchestration
- `daily-review.ts` — `DailyReviewService`; end-of-day retrospective generation

## Components

### CodebaseHealthCollector (health-collector.ts)
Spawns 5 subprocesses in parallel via `Promise.all`:
1. `bun x tsc --noEmit` → TSC error parsing via `parseTscOutput`
2. `bun test` → test result parsing via `parseTestOutput`
3. `grep -r "TODO\|FIXME\|HACK"` → annotation counts via `parseTodoOutput`
4. `wc -l` on `.ts` files → large file detection via `parseLargeFiles` (> 500 lines default)
5. `bun outdated` → dependency analysis via `parseOutdatedOutput`

Each collector has a 60s timeout (180s for tests). Individual failures return safe defaults; the overall `collect()` call never rejects.

### health-store.ts (pure functions)
- `saveHealthSnapshot` — persists all collected metrics to `health_snapshots` table
- `getRecentSnapshots` — retrieves the N most recent snapshots for an agent/project pair
- `computeTrends` — splits snapshots into halves; compares averages with 10% threshold; tracks 7 metrics (all "lower is better")
- `formatTrendsForPrompt` — formats trends as readable lines for prompt embedding

### buildImprovementPrompt (prompt-builder.ts)
Assembles a structured prompt with sections:
- Reputation and trust level header
- Optional focus area override
- Health metrics snapshot (capped: first 15 TSC errors, 10 large files, 10 outdated deps)
- Trend summary (if computed)
- Past attempts from memory (truncated to 300 chars per entry)
- Actionable instructions with `maxTasks` limit

### AutonomousLoopService (service.ts)
Full orchestration pipeline on each `run()` call:
1. Validate agent and project exist; verify project has `workingDir`
2. Collect health metrics via `CodebaseHealthCollector`
3. Save snapshot and compute trends
4. Recall past improvement attempts from memory (semantic search)
5. Compute reputation via `ReputationScorer`; apply task gating (0/1/2/5 based on trust level)
6. Build prompt via `buildImprovementPrompt`
7. Create session and start process
8. Register feedback hooks (`registerFeedbackHooks`) via `saveLearnings` after session ends

**Reputation gating:**
| Trust Level | Max Tasks |
|-------------|-----------|
| `untrusted` | 0 (throws `AuthorizationError`) |
| `low` | 1 |
| `medium` | min(requested, 2) |
| `high` / `verified` | min(requested, 5) |

### DailyReviewService (daily-review.ts)
Generates end-of-day retrospectives:
- Collects schedule execution stats, PR outcome stats, and health delta from DB
- Generates observations using heuristic thresholds (failure rate ≥ 50% → high, ≥ 25% → elevated)
- Saves review to memory with key `review:daily:{date}`

## Tokens

| Constant | Value | Description |
|----------|-------|-------------|
| Subprocess timeout | 60 seconds | All sub-collectors (except tests) |
| Test subprocess timeout | 180 seconds | `bun test` subprocess |
| Default `maxTasks` | 3 | When not specified in `ImprovementLoopOptions` |
| Large file threshold | 500 lines | Default for `parseLargeFiles` |
| Prompt TSC limit | 15 errors | Max shown in prompt |
| Prompt large file limit | 10 | Max shown in prompt |
| Prompt outdated dep limit | 10 | Max shown in prompt |
| Past attempt truncation | 300 chars | Per-entry character limit in prompt |
| Trend significance threshold | 10% or 1 | Minimum difference to call a trend "improving" or "regressing" |
| Memory key format | `improvement_loop:outcome:{ISO timestamp}` | Key for saving per-task learnings |
| Reputation event (task completed) | +5 | Score impact for a completed work task |
| Reputation event (task failed) | -2 | Score impact for a failed work task |

## Assets

**DB tables used:**
- `health_snapshots` — persists collected health metrics over time
- `agents`, `projects`, `sessions` — validated and created during `run()`
- `work_tasks` — queried after session completion to identify tasks created during the run

**External collaborators injected at construction:**
- `ProcessManager` — starts sessions and subscribes to events
- `WorkTaskService` — lists tasks for feedback hooks
- `MemoryManager` — recalls past attempts and saves learnings
- `ReputationScorer` — computes reputation and records outcome events
- `OutcomeTrackerService` (optional) — records PR outcomes for feedback analysis

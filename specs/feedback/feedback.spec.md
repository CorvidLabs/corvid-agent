---
module: feedback
version: 1
status: draft
files:
  - server/feedback/outcome-tracker.ts
db_tables: []
depends_on:
  - specs/db/pr-outcomes.spec.md
  - specs/db/work-tasks.spec.md
  - specs/github/github.spec.md
  - specs/memory/memory.spec.md
  - specs/lib/infra.spec.md
---

# Outcome Tracker (Feedback)

## Purpose
Tracks PR lifecycle outcomes (open, merged, closed) by polling GitHub, records state transitions, and produces weekly analyses with structured insights that feed back into the improvement loop for data-driven decision making.

## Public API

### Exported Functions
| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| (none) | — | — | All functionality is exposed via the `OutcomeTrackerService` class. |

### Exported Types
| Type | Description |
|------|-------------|
| `WeeklyAnalysis` | Structured weekly analysis result containing: `period` ({ since, until }), `overall` (OutcomeStats), `byRepo` (Record<string, OutcomeStats>), `failureReasons` (Record<string, number>), `workTaskStats` ({ total, completed, failed, successRate }), `topInsights` (string[]). |
| `FeedbackMetrics` | Current feedback metrics for API/status reports containing: `overall` (OutcomeStats), `byRepo` (Record<string, OutcomeStats>), `failureReasons` (Record<string, number>), `recentOutcomes` (PrOutcome[]), `workTaskSuccessRate` (number). |

### Exported Classes
| Class | Description |
|-------|-------------|
| `OutcomeTrackerService` | Core service that records PR outcomes from work tasks, polls GitHub for state updates, produces weekly analyses, and provides metrics and context strings for the improvement loop. |

#### `OutcomeTrackerService` Methods
| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `constructor` | `db: Database, memoryManager?: MemoryManager \| null` | `OutcomeTrackerService` | Creates a new service instance with a database connection and an optional memory manager for persisting analyses. |
| `recordPrFromWorkTask` | `workTaskId: string, prUrl: string` | `PrOutcome \| null` | Records a PR outcome when a work task completes with a PR URL. Idempotent: returns the existing record if the work task already has an outcome. Returns null if the PR URL cannot be parsed. |
| `checkOpenPrs` | none | `Promise<{ checked: number; updated: number }>` | Checks all open PRs against GitHub to update their state (merged, closed, or stale after 14 days). Called periodically by the scheduler. |
| `analyzeWeekly` | `agentId?: string` | `WeeklyAnalysis` | Analyzes outcomes from the past 7 days and produces structured insights including merge rates, failure reasons, work task stats, and per-repo breakdowns. |
| `saveAnalysisToMemory` | `agentId: string, analysis: WeeklyAnalysis` | `void` | Saves a weekly analysis as structured memory under the key `feedback:weekly:{date}`. No-op if no memory manager is configured. |
| `getMetrics` | `since?: string` | `FeedbackMetrics` | Returns current feedback metrics for API/status reports, including overall stats, per-repo stats, failure reasons, recent outcomes, and work task success rate. |
| `getOutcomeContext` | none | `string` | Formats the past 7 days of outcome data as a markdown string for inclusion in improvement loop prompts. Returns empty string if no PRs were tracked. |

## Invariants
1. `recordPrFromWorkTask` is idempotent — calling it again with the same `workTaskId` returns the existing outcome without creating a duplicate.
2. A PR is marked stale and moved to `closed` state if it remains open for more than 14 days.
3. PR state mapping: GitHub `MERGED` maps to `merged`, GitHub `CLOSED` maps to `closed` (with an inferred failure reason), and open PRs older than 14 days map to `closed` with reason `stale`.
4. Failure reason inference: `FAILURE` in `statusCheckRollup` yields `ci_fail`; `CHANGES_REQUESTED` in `reviewDecision` yields `review_rejection`; otherwise null.
5. `saveAnalysisToMemory` is a no-op (logs a warning) when no memory manager is available.
6. `getOutcomeContext` returns an empty string when there are no tracked PRs in the past 7 days.
7. Weekly insights flag repos with 3+ PRs and < 30% merge rate as "low success" and suggest reducing contributions.

## Behavioral Examples
### Scenario: Recording a PR outcome from a completed work task
- **Given** a work task with ID "task-123" that produced a PR at "https://github.com/org/repo/pull/42"
- **When** `recordPrFromWorkTask("task-123", "https://github.com/org/repo/pull/42")` is called
- **Then** a new PrOutcome record is created with repo "org/repo", prNumber 42, and the outcome is returned.

### Scenario: Duplicate work task PR recording
- **Given** a PrOutcome already exists for work task "task-123"
- **When** `recordPrFromWorkTask("task-123", ...)` is called again
- **Then** the existing PrOutcome is returned without creating a duplicate.

### Scenario: Checking open PRs discovers a merged PR
- **Given** an open PrOutcome for repo "org/repo" PR #42
- **When** `checkOpenPrs` polls GitHub and finds the PR state is `MERGED`
- **Then** the outcome state is updated to `merged` and the updated count increments.

### Scenario: Stale PR detection
- **Given** an open PrOutcome created 15 days ago
- **When** `checkOpenPrs` polls GitHub and finds the PR is still open
- **Then** the outcome state is updated to `closed` with failure reason `stale`.

### Scenario: Weekly analysis with low-success repo
- **Given** repo "org/legacy-app" has 4 PRs in the past week with 1 merged (25% merge rate)
- **When** `analyzeWeekly` is called
- **Then** the `topInsights` array includes an entry flagging "org/legacy-app" as a low success repo.

## Error Cases
| Condition | Behavior |
|-----------|----------|
| Invalid PR URL passed to `recordPrFromWorkTask` | Logs a warning and returns `null`. |
| GitHub API call fails during `checkOpenPrs` | Logs a warning for that PR, marks it as checked (updates `lastCheckedAt`), and continues to the next PR. |
| GitHub returns no PR data (`result.ok` is false) | The PR is marked as checked without updating its state. |
| No memory manager configured when `saveAnalysisToMemory` is called | Logs a warning and returns without saving. |
| No PRs tracked in the past 7 days | `getOutcomeContext` returns empty string; `analyzeWeekly` returns a single insight "No PRs tracked this period." |

## Dependencies
### Consumes
| Module | What is used |
|--------|-------------|
| `server/db/pr-outcomes` | `listOpenPrOutcomes`, `updatePrOutcomeState`, `markPrChecked`, `createPrOutcome`, `parsePrUrl`, `getOutcomeStatsByRepo`, `getFailureReasonBreakdown`, `getOverallOutcomeStats`, `listPrOutcomes`, `getPrOutcomeByWorkTask` — PR outcome CRUD and statistics |
| `server/db/pr-outcomes` (types) | `PrOutcome`, `FailureReason`, `OutcomeStats` — type definitions |
| `server/db/work-tasks` | `listWorkTasks` — retrieves work tasks for success rate calculation |
| `server/github/operations` | `getPrState` — fetches current PR state from GitHub |
| `server/memory/index` | `MemoryManager` type — persists weekly analyses as structured memories |
| `server/lib/logger` | `createLogger` — structured logging |
| `bun:sqlite` | `Database` type for SQLite access |

### Consumed By
| Module | What is used |
|--------|-------------|
| `server/index.ts` | Instantiates `OutcomeTrackerService` and passes it to routes, scheduler, and improvement loop |
| `server/routes/index.ts` | Accepts `OutcomeTrackerService` for route registration |
| `server/routes/feedback.ts` | Uses `OutcomeTrackerService` to serve feedback API endpoints |
| `server/scheduler/service.ts` | Calls `checkOpenPrs` and `analyzeWeekly` on scheduled intervals |
| `server/improvement/service.ts` | Uses `OutcomeTrackerService` for outcome context in improvement loop decisions |

## Change Log
| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |

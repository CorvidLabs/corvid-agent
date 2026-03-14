---
module: improvement
version: 1
status: draft
files:
  - server/improvement/health-collector.ts
  - server/improvement/health-store.ts
  - server/improvement/prompt-builder.ts
  - server/improvement/service.ts
  - server/improvement/daily-review.ts
db_tables:
  - health_snapshots
depends_on:
  - specs/memory/memory.spec.md
  - specs/reputation/scorer.spec.md
  - specs/process/process-manager.spec.md
  - specs/work/work-task-service.spec.md
  - specs/db/connection.spec.md
  - specs/lib/infra.spec.md
  - specs/feedback/feedback.spec.md
---

# Improvement

## Purpose

Orchestrates the autonomous codebase improvement loop by collecting programmatic health metrics (TypeScript errors, test results, code markers, large files, outdated dependencies), tracking metric trends over time, building enriched prompts for the agent, and managing the full lifecycle of an improvement session including reputation gating, memory recall, and outcome feedback.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `parseTscOutput` | `output: string` | `TscError[]` | Parses raw `tsc` stdout/stderr into structured error objects using regex matching. |
| `parseTestOutput` | `output: string, exitCode: number` | `{ passed: boolean; summary: string; failureCount: number }` | Parses `bun test` output to extract pass/fail status, last 50 lines as summary, and failure count. |
| `parseTodoOutput` | `output: string` | `{ todoCount: number; fixmeCount: number; hackCount: number; samples: string[] }` | Parses grep output to count TODO/FIXME/HACK markers and collect up to 10 samples. |
| `parseLargeFiles` | `output: string, threshold?: number` | `LargeFile[]` | Parses `wc -l` output to find `.ts` files exceeding the line threshold (default 500), sorted descending by size. |
| `parseOutdatedOutput` | `output: string` | `OutdatedDep[]` | Parses `bun outdated` output to extract packages where current version differs from latest. |
| `saveHealthSnapshot` | `db: Database, agentId: string, projectId: string, metrics: HealthMetrics` | `HealthSnapshot` | Inserts a health metrics snapshot into the `health_snapshots` table and returns the created record. |
| `getRecentSnapshots` | `db: Database, agentId: string, projectId: string, limit?: number` | `HealthSnapshot[]` | Retrieves the most recent snapshots (default 10) for an agent/project pair, ordered by `collected_at` descending. |
| `computeTrends` | `snapshots: HealthSnapshot[]` | `MetricTrend[]` | Computes trend direction (improving/stable/regressing) for each metric by comparing first-half vs second-half averages. Requires at least 2 snapshots. |
| `formatTrendsForPrompt` | `trends: MetricTrend[]` | `string` | Formats trend data into human-readable lines suitable for embedding in a prompt. |
| `buildImprovementPrompt` | `health: HealthMetrics, pastAttempts: ScoredMemory[], reputation: ReputationScore, options: PromptOptions, trendSummary?: string, outcomeContext?: string` | `string` | Assembles a full improvement loop prompt with sections for reputation, focus area, health metrics, trends, past attempts, and actionable instructions. |

### Exported Types

| Type | Description |
|------|-------------|
| `TscError` | Structured TypeScript compiler error: `file`, `line`, `col`, `code`, `message`. |
| `LargeFile` | File exceeding size threshold: `file` path and `lines` count. |
| `OutdatedDep` | Outdated dependency: `name`, `current` version, `latest` version. |
| `HealthMetrics` | Full codebase health snapshot: TSC errors/pass, test pass/failures/summary, TODO/FIXME/HACK counts with samples, large files, outdated deps, collection timestamp and duration. |
| `HealthSnapshot` | Persisted health record: `id`, `agentId`, `projectId`, all metric counts, boolean pass flags, and `collectedAt` timestamp. |
| `TrendDirection` | Union type: `'improving' \| 'stable' \| 'regressing'`. |
| `MetricTrend` | Per-metric trend result: `metric` name, `direction`, and raw `values` array. |
| `PromptOptions` | Prompt configuration: `maxTasks` (number) and optional `focusArea` (string). |
| `ImprovementLoopOptions` | Run options: optional `maxTasks` and `focusArea`. |
| `ImprovementRunResult` | Result of an improvement run: `sessionId`, `health`, `reputationScore`, `trustLevel`, `pastAttemptCount`, `maxTasksAllowed`. |
| `DailyReviewResult` | Result of a daily review: `date`, `executions` (ExecutionStats), `prs` (DailyPrStats), `health` (HealthDelta), `observations` (string[]), `summary` (string). |

### Exported Classes

| Class | Description |
|-------|-------------|
| `CodebaseHealthCollector` | Collects codebase health metrics by spawning subprocesses (`tsc`, `bun test`, `grep`, `wc`, `bun outdated`) in parallel. Individual collector failures are non-fatal. |
| `AutonomousLoopService` | Orchestrates the full improvement cycle: validates agent/project, collects health, computes trends, recalls past attempts from memory, gates on reputation, builds prompt, creates session, and registers feedback hooks for outcome tracking. |
| `DailyReviewService` | Generates end-of-day retrospectives summarizing schedule executions, PR outcomes, and health trends, then saves to memory. |

#### CodebaseHealthCollector Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `collect` | `workingDir: string` | `Promise<HealthMetrics>` | Runs all sub-collectors (tsc, tests, TODOs, large files, outdated deps) in parallel and returns aggregated metrics. Individual failures return safe defaults. |

#### AutonomousLoopService Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `constructor` | `db: Database, processManager: ProcessManager, workTaskService: WorkTaskService, memoryManager: MemoryManager, reputationScorer: ReputationScorer` | `AutonomousLoopService` | Creates the service with all required collaborators. Internally instantiates a `CodebaseHealthCollector`. |
| `setOutcomeTrackerService` | `service: OutcomeTrackerService` | `void` | Injects the optional outcome tracker for PR feedback tracking. |
| `run` | `agentId: string, projectId: string, options?: ImprovementLoopOptions` | `Promise<ImprovementRunResult>` | Executes a full improvement loop cycle: validate, collect health, save snapshot, compute trends, recall memories, compute reputation, gate tasks, build prompt, create session, start process, and register feedback hooks. |

#### DailyReviewService Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `constructor` | `db: Database, memoryManager: MemoryManager` | `DailyReviewService` | Creates the service with database and memory manager. |
| `run` | `agentId: string, date?: string` | `DailyReviewResult` | Run a daily review for the given date (defaults to today UTC). Collects execution stats, PR stats, and health delta, generates observations, formats a summary, and saves to memory with key `review:daily:{date}`. |

## Invariants

1. All five sub-collectors in `CodebaseHealthCollector.collect()` run in parallel via `Promise.all`. Any individual failure is caught and returns a safe default; the overall collection never rejects.
2. Subprocess spawns have a 60-second timeout (180 seconds for tests). Processes are killed if they exceed the timeout.
3. Trend computation requires at least 2 snapshots; with fewer, an empty trend array is returned.
4. Trend direction is determined by comparing the average of the older half of values to the newer half, with a 10% (or minimum 1) threshold for significance. All tracked metrics use "lower is better" semantics.
5. Reputation gating enforces strict task limits: `untrusted` = 0 (blocked, throws `AuthorizationError`), `low` = 1, `medium` = min(requested, 2), `high`/`verified` = min(requested, 5).
6. The default `maxTasks` is 3 if not specified in options.
7. `parseLargeFiles` only considers `.ts` files and uses a default threshold of 500 lines.
8. `parseOutdatedOutput` filters out header lines and separator lines, only including entries where current and latest versions differ and both look like semver.
9. After a session completes, learnings are saved to memory with key format `improvement_loop:outcome:{ISO timestamp}`.
10. Completed work tasks add +5 reputation; failed tasks add -2 reputation.

## Behavioral Examples

### Scenario: Successful improvement loop run
- **Given** a valid agent and project with a `workingDir`, trust level is `medium`, and 3 tasks are requested
- **When** `AutonomousLoopService.run()` is called
- **Then** health metrics are collected and saved as a snapshot, past attempts are recalled from memory, reputation is computed, max tasks is capped to 2 (medium trust), a prompt is built, a new session is created and started, and the run result includes `maxTasksAllowed: 2`

### Scenario: Untrusted agent blocked
- **Given** an agent whose reputation trust level is `'untrusted'`
- **When** `AutonomousLoopService.run()` is called
- **Then** an `AuthorizationError` is thrown and no session is created

### Scenario: Health collection with TSC failures
- **Given** the codebase has 5 TypeScript errors
- **When** `CodebaseHealthCollector.collect()` is called
- **Then** `tscPassed` is false, `tscErrorCount` is 5, and `tscErrors` contains 5 structured `TscError` entries

### Scenario: Trend detection across cycles
- **Given** 4 health snapshots exist with TSC error counts [10, 8, 5, 3] (oldest to newest)
- **When** `computeTrends()` is called
- **Then** the `tsc_errors` metric trend direction is `'improving'` because the newer half average (4) is lower than the older half average (9)

### Scenario: Sub-collector failure is non-fatal
- **Given** `bun outdated` hangs for more than 60 seconds
- **When** `CodebaseHealthCollector.collect()` is called
- **Then** `outdatedDeps` returns an empty array, a warning is logged, and all other metrics are still collected successfully

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Agent ID not found in database | `NotFoundError` is thrown with entity `'Agent'`. |
| Project ID not found in database | `NotFoundError` is thrown with entity `'Project'`. |
| Project has no `workingDir` | `ValidationError` is thrown. |
| Agent trust level is `'untrusted'` | `AuthorizationError` is thrown; no session created. |
| Memory search fails during past attempt recall | Warning logged; `pastAttempts` defaults to empty array; loop continues. |
| Trend computation fails | Warning logged; `trendSummary` remains undefined; loop continues. |
| Individual sub-collector times out or crashes | Warning logged; that metric returns its safe default; other collectors unaffected. |
| `saveLearnings` fails after session completion | Error logged; does not affect the session or work tasks. |
| Task completion recording fails | Error logged; reputation event and memory save are skipped for that task. |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `memory` | `MemoryManager` for recalling past improvement attempts and saving session outcomes. `ScoredMemory` type from `semantic-search`. |
| `reputation` | `ReputationScorer` for computing agent reputation and recording task outcome events. `ReputationScore` and `TrustLevel` types. |
| `process` | `ProcessManager` for starting agent sessions and subscribing to session events. |
| `work` | `WorkTaskService` for listing tasks and registering completion callbacks. |
| `feedback` | `OutcomeTrackerService` (optional) for recording PR outcomes from completed work tasks and providing outcome context. |
| `db` | `getAgent` from `agents`, `getProject` from `projects`, `createSession` from `sessions` for entity validation and session creation. |
| `lib` | `createLogger` for structured logging. `NotFoundError`, `ValidationError`, `AuthorizationError` from `errors`. |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/index.ts` | Imports `AutonomousLoopService` to instantiate and wire into the server. |
| `scheduler` | Imports `AutonomousLoopService` type to trigger improvement loops on schedule. |
| `mcp` (reputation tool-handlers) | Imports `getRecentSnapshots`, `computeTrends`, `formatTrendsForPrompt` from `health-store` for exposing health trends via MCP tools. |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
| 2026-03-13 | corvid-agent | Added daily-review.ts: DailyReviewService class and DailyReviewResult type for end-of-day retrospectives |

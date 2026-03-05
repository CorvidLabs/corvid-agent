---
module: cron-parser
version: 1
status: draft
files:
  - server/scheduler/cron-parser.ts
  - server/scheduler/priority-rules.ts
  - server/scheduler/system-state.ts
db_tables: []
depends_on:
  - specs/lib/infra.spec.md
---

# Cron Parser & Scheduler Primitives

## Purpose
Provides cron expression parsing with preset aliases, next-date computation, human-readable descriptions, system state detection for health-aware scheduling, and priority rules that gate or boost scheduled actions based on system health.

## Public API

### Exported Functions

#### cron-parser.ts

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `parseCron` | `expression: string` | `ParsedCron` | Parses a 5-field cron expression (or preset alias) into sets of matching values per field |
| `getNextCronDate` | `expression: string, from?: Date` | `Date` | Computes the next date matching the cron expression, searching up to 366 days ahead |
| `describeCron` | `expression: string` | `string` | Returns a human-readable description of the cron expression |

#### priority-rules.ts

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `getActionCategory` | `actionType: ScheduleActionType` | `ActionCategory` | Maps a schedule action type to its category |
| `evaluateAction` | `actionType: ScheduleActionType, activeStates: SystemState[]` | `ActionGateResult` | Evaluates whether an action should run, skip, or be boosted given current system states |
| `getRulesForState` | `state: SystemState` | `PriorityRule` | Returns the priority rule for a specific system state |
| `getAllRules` | (none) | `Record<SystemState, PriorityRule>` | Returns a copy of all priority rules |

#### system-state.ts (SystemStateDetector class -- see below)

### Exported Types

| Type | Description |
|------|-------------|
| `ParsedCron` | Interface with fields: minute, hour, dayOfMonth, month, dayOfWeek (each a `CronField` with a `Set<number>`) |
| `ActionCategory` | Union type: `'feature_work' \| 'review' \| 'maintenance' \| 'communication' \| 'lightweight'` |
| `PriorityRule` | Interface: skip (ActionCategory[]), boost (ActionCategory[]), reason (string) |
| `ActionDecision` | Union type: `'run' \| 'skip' \| 'boost'` |
| `ActionGateResult` | Interface: decision (ActionDecision), reasons (string[]) |
| `SystemState` | Union type: `'healthy' \| 'ci_broken' \| 'server_degraded' \| 'p0_open' \| 'disk_pressure'` |
| `SystemStateResult` | Interface: states (SystemState[]), details (Record<string, string>), evaluatedAt (string), cached (boolean) |
| `SystemStateConfig` | Interface: owner, repo, diskPressureThreshold, p0Labels, cacheTtlMs |

### Exported Classes

| Class | Description |
|-------|-------------|
| `SystemStateDetector` | Aggregates system health signals (CI, server, P0 issues, disk) with cached evaluation |

#### SystemStateDetector Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `constructor` | `db: Database, config?: Partial<SystemStateConfig>` | `SystemStateDetector` | Initializes with database and optional config overrides |
| `setHealthCheck` | `fn: () => Promise<{ status: string }>` | `void` | Registers a health check callback for server status |
| `evaluate` | (none) | `Promise<SystemStateResult>` | Evaluates all system state signals (CI, server, P0, disk) with 60s cache TTL |
| `invalidateCache` | (none) | `void` | Forces the next `evaluate()` call to re-check all signals |

## Invariants
1. Cron expressions must have exactly 5 fields (minute, hour, day-of-month, month, day-of-week); otherwise `ValidationError` is thrown.
2. Supported preset aliases: `@hourly`, `@daily`, `@weekly`, `@monthly`, `@yearly`, `@annually`.
3. Day-of-week supports 0-7 where both 0 and 7 represent Sunday.
4. `getNextCronDate` starts searching from the next minute after `from` (seconds/ms zeroed) and throws `ValidationError` if no match is found within 366 days.
5. System state evaluation results are cached for 60 seconds (configurable via `cacheTtlMs`) to avoid excessive API calls on each scheduler tick.
6. When system state is `healthy`, no actions are skipped or boosted.
7. `ci_broken` and `p0_open` suppress `feature_work` and boost `maintenance`/`review`.
8. `server_degraded` suppresses all categories except `lightweight`.
9. `disk_pressure` suppresses `feature_work` and boosts `maintenance`.
10. If skip and boost both apply to an action, skip takes precedence.
11. CI checks query the GitHub Actions API for the latest completed run on the `main` branch.
12. P0 issue checks search for open issues matching configured labels (`priority:p0`, `critical`, `P0`).
13. Disk pressure checks use `df -P .` and compare usage against the threshold (default 90%).
14. All system state sub-checks (CI, server, P0, disk) run in parallel via `Promise.all` and silently return null on failure.
15. Default config targets `CorvidLabs/corvid-agent` repo.

## Behavioral Examples

### Scenario: Parsing a preset alias
- **Given** the expression `@daily`
- **When** `parseCron('@daily')` is called
- **Then** it returns minute={0}, hour={0}, dayOfMonth={1..31}, month={1..12}, dayOfWeek={0..7}

### Scenario: Getting the next cron date
- **Given** the expression `0 9 * * 1` (every Monday at 09:00)
- **When** `getNextCronDate('0 9 * * 1', new Date('2026-03-04T10:00:00'))` is called (Wednesday)
- **Then** it returns a Date representing Monday 2026-03-09 09:00:00

### Scenario: Action gating under CI failure
- **Given** active system states are `['ci_broken']`
- **When** `evaluateAction('work_task', ['ci_broken'])` is called
- **Then** it returns `{ decision: 'skip', reasons: ['CI is broken ...'] }` because `work_task` is category `feature_work`

### Scenario: System state caching
- **Given** `evaluate()` was called 30 seconds ago
- **When** `evaluate()` is called again
- **Then** it returns the cached result with `cached: true`

### Scenario: Describing a cron expression
- **Given** the expression `30 14 * * 1-5`
- **When** `describeCron('30 14 * * 1-5')` is called
- **Then** it returns a string like "At 14:30 on Mon, Tue, Wed, Thu, Fri"

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Invalid cron expression (not 5 fields) | `parseCron` throws `ValidationError` |
| No matching date within 366 days | `getNextCronDate` throws `ValidationError` |
| Unknown action type | `getActionCategory` defaults to `'feature_work'` |
| GitHub API request fails (CI check) | Returns null; state not flagged |
| GitHub API request fails (P0 check) | Returns null; state not flagged |
| `df` command fails | Returns null; disk pressure not flagged |
| Health check callback not set | Server health check returns null |
| `GH_TOKEN` not set | CI and P0 checks return null (skipped) |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/lib/errors` | `ValidationError` for invalid cron expressions |
| `server/lib/logger` | `createLogger` for structured logging |
| `shared/types` | `ScheduleActionType` for action categorization |
| `bun:sqlite` | `Database` type (constructor parameter for SystemStateDetector) |
| GitHub Actions API | CI status check (`/repos/{owner}/{repo}/actions/runs`) |
| GitHub Search API | P0 issue search (`/search/issues`) |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/scheduler/service` | `parseCron`, `getNextCronDate`, `describeCron` for schedule evaluation; `SystemStateDetector` and `evaluateAction` for health-aware gating |
| `server/routes/schedules` | `describeCron` for displaying schedule descriptions |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |

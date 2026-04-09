---
module: db-pr-outcomes
version: 1
status: draft
files:
  - server/db/pr-outcomes.ts
db_tables:
  - pr_outcomes
depends_on: []
---

# DB PR Outcomes

## Purpose
Provides CRUD operations, filtered queries, and aggregate statistics for the `pr_outcomes` table, which tracks the lifecycle of pull requests created by work tasks — whether they were merged, closed, or went stale — enabling the agent to learn from outcomes.

## Public API

### Exported Functions
| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `parsePrUrl` | `prUrl: string` | `{ repo: string; prNumber: number } \| null` | Parses a GitHub PR URL (e.g., `https://github.com/owner/repo/pull/123`) into repo and PR number. Returns null if the URL does not match. |
| `createPrOutcome` | `db: Database, params: { workTaskId: string; prUrl: string; repo: string; prNumber: number }` | `PrOutcome` | Inserts a new PR outcome record with a generated UUID and returns the full record. |
| `getPrOutcome` | `db: Database, id: string` | `PrOutcome \| null` | Retrieves a single PR outcome by its UUID, or null if not found. |
| `getPrOutcomeByWorkTask` | `db: Database, workTaskId: string` | `PrOutcome \| null` | Retrieves a PR outcome by its associated work task ID, or null if not found. |
| `listOpenPrOutcomes` | `db: Database` | `PrOutcome[]` | Returns all PR outcomes with `pr_state = 'open'`, ordered by `created_at ASC`. |
| `listPrOutcomes` | `db: Database, opts?: { repo?: string; prState?: PrState; since?: string; limit?: number }` | `PrOutcome[]` | Returns filtered PR outcomes ordered by `created_at DESC`. Supports optional repo, state, date, and limit filters. Default limit is 100. |
| `updatePrOutcomeState` | `db: Database, id: string, prState: PrState, failureReason?: FailureReason` | `void` | Updates a PR outcome's state and optionally sets the failure reason. Sets `checked_at` to now. Sets `resolved_at` to now if state is not 'open', otherwise sets it to NULL. |
| `markPrChecked` | `db: Database, id: string` | `void` | Updates only the `checked_at` timestamp to the current time. |
| `getOutcomeStatsByRepo` | `db: Database, since?: string` | `Record<string, OutcomeStats>` | Returns aggregate outcome statistics grouped by repository. Optionally filtered by a `since` date. Computes merge rate as `merged / (merged + closed)`. |
| `getFailureReasonBreakdown` | `db: Database, since?: string` | `Record<string, number>` | Returns a count of each failure reason for closed PRs. Unknown/null reasons are reported as `'unknown'`. |
| `getOverallOutcomeStats` | `db: Database, since?: string` | `OutcomeStats` | Returns aggregate outcome statistics across all repos. Optionally filtered by a `since` date. |

### Exported Types
| Type | Description |
|------|-------------|
| `PrState` | Union type: `'open' \| 'merged' \| 'closed'` |
| `FailureReason` | Union type: `'ci_fail' \| 'review_rejection' \| 'stale' \| 'merge_conflict' \| null` |
| `PrOutcome` | Interface representing a PR outcome record with camelCase properties: `id`, `workTaskId`, `prUrl`, `repo`, `prNumber`, `prState`, `failureReason`, `checkedAt`, `resolvedAt`, `createdAt` |
| `OutcomeStats` | Interface with fields: `total: number`, `merged: number`, `closed: number`, `open: number`, `mergeRate: number` |

## Invariants
1. All functions requiring database access take a `bun:sqlite` `Database` instance as the first parameter.
2. `createPrOutcome` generates a UUID via `crypto.randomUUID()` and always returns the full record by re-querying after insert.
3. `listPrOutcomes` defaults to a limit of 100 when no limit option is provided.
4. `updatePrOutcomeState` sets `resolved_at` to `datetime('now')` when the new state is not `'open'`, and to `NULL` when it is `'open'`.
5. `updatePrOutcomeState` always updates `checked_at` to `datetime('now')` regardless of the state transition.
6. `mergeRate` is calculated as `merged / (merged + closed)`, and is 0 when there are no resolved (merged + closed) outcomes.
7. `getFailureReasonBreakdown` only counts rows where `pr_state = 'closed'`; null failure reasons are coalesced to `'unknown'`.
8. Row-to-domain conversion maps snake_case DB columns to camelCase TypeScript properties via the internal `rowToOutcome` function.
9. `parsePrUrl` only supports GitHub PR URLs in the format `github.com/owner/repo/pull/N`.

## Behavioral Examples
### Scenario: Create and retrieve a PR outcome
- **Given** a work task `"task-1"` has produced a PR at `https://github.com/org/repo/pull/42`
- **When** `createPrOutcome(db, { workTaskId: "task-1", prUrl: "https://github.com/org/repo/pull/42", repo: "org/repo", prNumber: 42 })` is called
- **Then** a new row is inserted with `pr_state = 'open'`, a UUID `id`, and `created_at` set to now; the full `PrOutcome` is returned

### Scenario: Mark a PR as merged
- **Given** a PR outcome with `id = "abc-123"` exists in state `'open'`
- **When** `updatePrOutcomeState(db, "abc-123", "merged")` is called
- **Then** `pr_state` becomes `'merged'`, `checked_at` is set to now, `resolved_at` is set to now, and `failure_reason` remains null

### Scenario: Mark a PR as closed with failure reason
- **Given** a PR outcome with `id = "abc-123"` exists in state `'open'`
- **When** `updatePrOutcomeState(db, "abc-123", "closed", "ci_fail")` is called
- **Then** `pr_state` becomes `'closed'`, `failure_reason` becomes `'ci_fail'`, `checked_at` is set to now, and `resolved_at` is set to now

### Scenario: List open PRs for polling
- **Given** three PR outcomes exist: two with `pr_state = 'open'` and one with `pr_state = 'merged'`
- **When** `listOpenPrOutcomes(db)` is called
- **Then** it returns the two open outcomes ordered by `created_at ASC`

### Scenario: Parse a valid GitHub PR URL
- **Given** the URL `"https://github.com/CorvidLabs/corvid-agent/pull/99"`
- **When** `parsePrUrl(url)` is called
- **Then** it returns `{ repo: "CorvidLabs/corvid-agent", prNumber: 99 }`

### Scenario: Parse an invalid URL
- **Given** the URL `"https://gitlab.com/org/repo/-/merge_requests/1"`
- **When** `parsePrUrl(url)` is called
- **Then** it returns `null`

### Scenario: Get merge rate statistics by repo
- **Given** repo `"org/repo"` has 3 merged and 1 closed PR outcomes
- **When** `getOutcomeStatsByRepo(db)` is called
- **Then** it returns `{ "org/repo": { total: 4, merged: 3, closed: 1, open: 0, mergeRate: 0.75 } }`

## Error Cases
| Condition | Behavior |
|-----------|----------|
| `getPrOutcome` with non-existent ID | Returns `null` |
| `getPrOutcomeByWorkTask` with non-existent work task ID | Returns `null` |
| `parsePrUrl` with non-GitHub or malformed URL | Returns `null` |
| `listPrOutcomes` with no matching filters | Returns empty array `[]` |
| `getOutcomeStatsByRepo` with no data | Returns empty object `{}` |
| `getOverallOutcomeStats` with no data | Returns `{ total: 0, merged: 0, closed: 0, open: 0, mergeRate: 0 }` |
| `getFailureReasonBreakdown` with no closed PRs | Returns empty object `{}` |
| Database not initialized or table missing | Throws SQLite error (not handled in this module) |

## Dependencies
### Consumes
| Module | What is used |
|--------|-------------|
| `bun:sqlite` | `Database` type for all query operations |
| `crypto` (Web API) | `crypto.randomUUID()` for generating outcome IDs |

### Consumed By
| Module | What is used |
|--------|-------------|
| `server/feedback/outcome-tracker.ts` | `createPrOutcome`, `getPrOutcomeByWorkTask`, `listOpenPrOutcomes`, `updatePrOutcomeState`, `markPrChecked`, `getOutcomeStatsByRepo`, `getOverallOutcomeStats`, `getFailureReasonBreakdown`, `parsePrUrl`, `PrOutcome`, `FailureReason`, `OutcomeStats` types |
| `server/__tests__/pr-outcomes.test.ts` | All exported functions and types for unit testing |
| `server/__tests__/outcome-tracker.test.ts` | Functions and types imported for integration testing |

## Database Tables
### pr_outcomes
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID identifying the outcome record |
| work_task_id | TEXT | NOT NULL | References the work task that created this PR |
| pr_url | TEXT | NOT NULL | Full GitHub PR URL |
| repo | TEXT | NOT NULL | Repository in `owner/name` format |
| pr_number | INTEGER | NOT NULL | PR number within the repository |
| pr_state | TEXT | NOT NULL DEFAULT 'open' | Current state: 'open', 'merged', or 'closed' |
| failure_reason | TEXT | DEFAULT NULL | Why the PR was closed: 'ci_fail', 'review_rejection', 'stale', 'merge_conflict', or null |
| checked_at | TEXT | DEFAULT NULL | ISO timestamp of the last time this outcome was polled/checked |
| resolved_at | TEXT | DEFAULT NULL | ISO timestamp of when the PR was merged or closed |
| created_at | TEXT | NOT NULL DEFAULT datetime('now') | ISO timestamp of when the outcome record was created |

#### Indexes
| Index Name | Column(s) | Description |
|------------|-----------|-------------|
| idx_pr_outcomes_state | pr_state | Speeds up filtering by PR state (e.g., listing open PRs) |
| idx_pr_outcomes_repo | repo | Speeds up filtering and grouping by repository |
| idx_pr_outcomes_work_task | work_task_id | Speeds up lookup by associated work task |

## Change Log
| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |

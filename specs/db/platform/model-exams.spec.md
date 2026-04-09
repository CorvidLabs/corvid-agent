---
module: model-exams-db
version: 1
status: draft
files:
  - server/db/model-exams.ts
db_tables:
  - model_exam_runs
  - model_exam_results
depends_on: []
---

# Model Exams DB

## Purpose

Persistence layer for model exam scorecards and per-case results. Allows exam runs to be stored, queried by model, paginated, and compared across models over time via a leaderboard view.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `saveExamRun` | `(db: Database, scorecard: ExamScorecard)` | `StoredExamRun` | Persists a completed exam scorecard (run + all individual results) inside a write transaction. Generates UUIDs for run and result rows |
| `getExamRun` | `(db: Database, id: string)` | `StoredExamRun \| null` | Retrieves a single exam run with all its results. Returns `null` if not found |
| `listExamRuns` | `(db: Database, opts?: ListExamRunsOptions)` | `StoredExamRun[]` | Lists exam runs ordered by `created_at DESC` with optional model filter and pagination. Results array is empty (not loaded) for efficiency |
| `getModelHistory` | `(db: Database, model: string)` | `StoredExamRun[]` | Returns all runs for a specific model ordered by date descending, with full results loaded |
| `getLatestByModel` | `(db: Database)` | `StoredExamRun[]` | Returns the most recent exam run per model, ordered by `overall_score DESC`. Results array is empty (not loaded) |
| `deleteExamRun` | `(db: Database, id: string)` | `boolean` | Deletes an exam run and all its results inside a write transaction. Returns `false` if the run does not exist |

### Exported Types

| Type | Description |
|------|-------------|
| `StoredExamRun` | `{ id, model, overallScore, totalCases, totalPassed, totalDurationMs, categories, createdAt, results }` -- persisted exam run |
| `StoredExamResult` | `{ id, runId, category, caseName, passed, score, reason, durationMs, createdAt }` -- individual test case result |
| `ListExamRunsOptions` | `{ model?: string; limit?: number; offset?: number }` -- pagination/filter options for `listExamRuns` |

## Invariants

1. **Transactional writes**: `saveExamRun` and `deleteExamRun` both use `writeTransaction` to ensure atomicity across `model_exam_runs` and `model_exam_results` tables
2. **UUID generation**: Run and result IDs are generated via `crypto.randomUUID()`
3. **List efficiency**: `listExamRuns` and `getLatestByModel` return runs with an empty `results` array to avoid loading all per-case data
4. **Full results**: `getExamRun` and `getModelHistory` load all associated `model_exam_results` for each run
5. **Cascade delete**: `deleteExamRun` explicitly deletes results before the run (no FK cascade relied upon)
6. **Default pagination**: `listExamRuns` defaults to `limit: 50, offset: 0`

## Behavioral Examples

### Scenario: Save and retrieve an exam run

- **Given** a completed `ExamScorecard` for model `claude-3-opus`
- **When** `saveExamRun(db, scorecard)` is called
- **Then** a row is inserted into `model_exam_runs` and one row per test case into `model_exam_results`
- **And** the returned `StoredExamRun` contains all result details

### Scenario: List latest by model for leaderboard

- **Given** 3 models each have multiple exam runs
- **When** `getLatestByModel(db)` is called
- **Then** returns exactly 3 entries (one per model), ordered by `overall_score DESC`

### Scenario: Delete non-existent run

- **Given** no run with id `nonexistent`
- **When** `deleteExamRun(db, 'nonexistent')` is called
- **Then** returns `false` without modifying the database

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Run not found by ID | `getExamRun` returns `null` |
| Delete non-existent run | `deleteExamRun` returns `false` |
| No runs for a model | `getModelHistory` returns `[]` |
| No runs at all | `getLatestByModel` returns `[]` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/db/pool` | `writeTransaction` for atomic writes |
| `server/exam/types` | `ExamScorecard` type (input to `saveExamRun`) |
| `bun:sqlite` | `Database`, `SQLQueryBindings` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/routes/exam.ts` | All CRUD functions for the exam API |
| `server/exam/runner.ts` | `saveExamRun` to persist completed exams |

## Database Tables

### model_exam_runs

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | UUID |
| `model` | TEXT | NOT NULL | Model identifier (e.g. `claude-3-opus`) |
| `overall_score` | REAL | NOT NULL | Overall exam score (0-1) |
| `total_cases` | INTEGER | NOT NULL | Total number of test cases |
| `total_passed` | INTEGER | NOT NULL | Number of passing cases |
| `total_duration_ms` | INTEGER | NOT NULL | Total exam duration in milliseconds |
| `categories_json` | TEXT | NOT NULL | JSON object mapping category names to `{ score, passed, total }` |
| `created_at` | TEXT | NOT NULL, DEFAULT `datetime('now')` | Timestamp of the exam run |

**Indexes:** `idx_model_exam_runs_model` on `model`, `idx_model_exam_runs_created` on `created_at`

### model_exam_results

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | UUID |
| `run_id` | TEXT | NOT NULL, FK `model_exam_runs(id)` | Parent exam run |
| `category` | TEXT | NOT NULL | Test category name |
| `case_name` | TEXT | NOT NULL | Test case name |
| `passed` | INTEGER | NOT NULL, DEFAULT 0 | 1 if passed, 0 if failed |
| `score` | REAL | NOT NULL, DEFAULT 0 | Case score (0-1) |
| `reason` | TEXT | (nullable) | Grading reason/explanation |
| `duration_ms` | INTEGER | NOT NULL, DEFAULT 0 | Case execution time in ms |
| `created_at` | TEXT | NOT NULL, DEFAULT `datetime('now')` | Timestamp |

**Indexes:** `idx_model_exam_results_run` on `run_id`, `idx_model_exam_results_category` on `category`

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-13 | corvid-agent | Initial spec |

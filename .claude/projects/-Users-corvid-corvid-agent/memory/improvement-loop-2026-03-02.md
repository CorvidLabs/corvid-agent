# Improvement Loop — 2026-03-02T13:01Z

## Analysis

### Phantom Test Failure (FIXED — PR #433)
- **Root cause**: Health collector `SPAWN_TIMEOUT_MS` was 60s, but `bun test` takes ~107s. The process was killed, producing exit code != 0, which `parseTestOutput` interpreted as 1 failure via `Math.max(failureCount, 1)`.
- **Secondary issue**: `parseTestOutput` only searched last 30 lines for "N fail" pattern, but stdout+stderr concatenation meant the test summary was buried earlier in the output.
- **Fix**: Added `TEST_TIMEOUT_MS = 180_000` for test runner, search entire output with anchored regex, expanded summary window to 50 lines, added `failureCount === 0` to passed condition.
- **Branch**: `fix/health-collector-timeout`, PR #433

### FIXMEs/HACKs — Not Actionable
- All 13 FIXMEs and 15 HACKs are in documentation strings and health monitoring infrastructure code (string templates, grep patterns, test data). None are actual code issues needing fixes.

### Scheduler FOREIGN KEY Error — Documented, Not Fixed
- `execCustom` and 5 other scheduler methods don't validate `projectId` exists before `createSession()`. With invalid projectId, SQLite throws FK constraint error.
- Only surfaces in tests with dummy data (`projectId: 'p'`). Tests still pass since they only assert on approval events.
- **Recommendation**: Add `projectExists()` helper to validate projectId in `execReviewPrs`, `execGithubSuggest`, `execCodebaseReview`, `execDependencyAudit`, `execImprovementLoop`, `execCustom` (lines 659, 781, 824, 866, 912, 946).

## Metrics Impact
- `test_failures`: 1 → 0 (expected after PR #433 merges)
- All other metrics unchanged

## Work Created
- PR #433: fix health collector timeout and parsing reliability

---
module: flock-testing-routes
version: 1
status: active
files:
  - server/routes/flock-testing.ts
depends_on:
  - server/flock-directory/testing/runner.ts
  - server/lib/response.ts
  - server/middleware/guards.ts
---

# Flock Testing Routes

## Purpose

HTTP API routes for viewing Flock Directory agent test results and statistics. Read-only endpoints — test execution is triggered by schedules, not API calls.

## Public API

### Exported Types

| Type | Description |
|------|-------------|
| `FlockTestingDeps` | Optional dependencies for test triggering (`flockDirectory`, `agentMessenger`) |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `handleFlockTestingRoutes` | `(req, url, db, testRunner?, context?, deps?)` | `Response \| Promise<Response> \| null` | Route handler for `/api/flock-directory/testing/*` |

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/flock-directory/testing/stats` | Aggregate test stats (total tests, tested agents, avg score) |
| GET | `/api/flock-directory/testing/agents/:id/results` | Test history for an agent (paginated via `?limit=`) |
| GET | `/api/flock-directory/testing/agents/:id/latest` | Most recent test result for an agent |
| GET | `/api/flock-directory/testing/agents/:id/score` | Effective score with decay applied |

## Key Behaviors

- Returns 503 if `testRunner` is not provided (service unavailable)
- Returns null for unmatched paths (pass-through to other route handlers)
- Score endpoint returns both effective (decayed) and raw scores plus last-tested timestamp

## Invariants

- All endpoints return JSON responses
- Unmatched paths return null (pass-through)
- Missing `testRunner` always returns 503

## Behavioral Examples

- `GET /api/flock-directory/testing/stats` → `{ totalTests, testedAgents, avgScore }`
- `GET /api/flock-directory/testing/agents/xyz/latest` → 404 if no results exist
- `GET /api/flock-directory/testing/agents/xyz/score` → `{ agentId, effectiveScore, rawScore, lastTestedAt }`

## Error Cases

- No test results for agent → `/latest` returns 404
- Test runner unavailable → all endpoints return 503

## Dependencies

- `FlockTestRunner` — test execution and result queries
- `server/lib/response.ts` — JSON response helpers
- `server/middleware/guards.ts` — RequestContext type

## Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1 | 2026-03-15 | Initial version — 4 read-only endpoints |

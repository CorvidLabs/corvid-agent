---
module: flock-testing-routes
version: 2
status: active
files:
  - server/routes/flock-testing.ts
depends_on:
  - server/flock-directory/testing/runner.ts
  - server/flock-directory/testing/a2a-transport.ts
  - server/flock-directory/service.ts
  - server/lib/response.ts
  - server/middleware/guards.ts
---

# Flock Testing Routes

## Purpose

HTTP API routes for viewing Flock Directory agent test results, statistics, and on-demand test triggering. Includes both read-only endpoints (stats, results, scores) and a POST endpoint to trigger tests with a 4-hour cooldown per agent.

## Public API

### Exported Types

| Type | Description |
|------|-------------|
| `FlockTestingDeps` | Optional dependencies for test triggering: `{ flockDirectory?: FlockDirectoryService \| null }` |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `handleFlockTestingRoutes` | `(req, url, db, testRunner?, context?, deps?)` | `Response \| Promise<Response> \| null` | Route handler for `/api/flock-directory/testing/*` |

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/flock-directory/testing/agents/:id/run` | Trigger an on-demand test for an agent (4-hour cooldown) |
| GET | `/api/flock-directory/testing/agents/:id/score` | Effective score with decay applied (works without testRunner) |
| GET | `/api/flock-directory/testing/agents/:id/cooldown` | Check cooldown status for an agent (works without testRunner) |
| GET | `/api/flock-directory/testing/stats` | Aggregate test stats (total tests, tested agents, avg score) |
| GET | `/api/flock-directory/testing/agents/:id/results` | Test history for an agent (paginated via `?limit=`) |
| GET | `/api/flock-directory/testing/agents/:id/latest` | Most recent test result for an agent |

## Key Behaviors

- The `/run` endpoint creates a temporary `FlockTestRunner` with an A2A transport on each request — does not require a persistent `testRunner`
- The `/run` endpoint enforces a 4-hour (`TEST_COOLDOWN_MS`) per-agent cooldown; returns 429 if cooldown is active
- The `/score` and `/cooldown` endpoints work without a `testRunner` (score returns nulls gracefully, cooldown uses module-level map)
- Returns 503 if `testRunner` is not provided for stats/results/latest endpoints
- Returns 503 if `flockDirectory` is not provided for the `/run` endpoint
- Returns null for unmatched paths (pass-through to other route handlers)
- Score endpoint returns both effective (decayed) and raw scores plus last-tested timestamp
- After a successful test run, `flockDirectory.computeReputation()` is called to update the agent's reputation
- On test failure, the cooldown is cleared so the user can retry

## Invariants

- All endpoints return JSON responses
- Unmatched paths return null (pass-through)
- Missing `testRunner` returns 503 for stats/results/latest endpoints
- Missing `flockDirectory` returns 503 for the `/run` endpoint
- Cooldown is recorded immediately before running a test to prevent concurrent triggers
- Cooldown is cleared on test failure to allow retry

## Behavioral Examples

- `POST /api/flock-directory/testing/agents/xyz/run` → `{ result, nextAvailableAt }` on success
- `POST /api/flock-directory/testing/agents/xyz/run` during cooldown → 429 with `{ error, remainingMs, remainingMin, nextAvailableAt }`
- `GET /api/flock-directory/testing/agents/xyz/cooldown` → `{ onCooldown: false }` or `{ onCooldown: true, remainingMs, remainingMin, nextAvailableAt }`
- `GET /api/flock-directory/testing/stats` → `{ totalTests, testedAgents, avgScore }`
- `GET /api/flock-directory/testing/agents/xyz/latest` → 404 if no results exist
- `GET /api/flock-directory/testing/agents/xyz/score` → `{ agentId, effectiveScore, rawScore, lastTestedAt }`

## Error Cases

- No test results for agent → `/latest` returns 404
- Test runner unavailable → stats/results/latest endpoints return 503
- Flock directory unavailable → `/run` returns 503
- Agent not found in Flock Directory → `/run` returns 404
- Agent not active → `/run` returns 400
- Cooldown active → `/run` returns 429
- Test execution fails → cooldown cleared, error returned via `handleRouteError`

## Dependencies

- `FlockTestRunner` — test execution and result queries
- `FlockDirectoryService` — agent lookup and reputation computation
- `createA2ATransport` — A2A transport factory for on-demand test runner creation
- `server/lib/response.ts` — JSON response helpers (`json`, `notFound`, `safeNumParam`, `handleRouteError`)
- `server/middleware/guards.ts` — `RequestContext` type

## Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1 | 2026-03-15 | Initial version — 4 read-only endpoints |
| 2 | 2026-04-09 | Add POST `/run` endpoint with 4-hour cooldown, GET `/cooldown` endpoint, A2A transport for on-demand testing, score/cooldown endpoints work without testRunner |

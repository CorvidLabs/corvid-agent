---
spec: routes.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/__tests__/api-routes.test.ts` | Integration | Full pipeline: CORS, auth, rate limit, route dispatch, 404 for unknown routes |
| `server/__tests__/routes-agents.test.ts` | Integration | Agent CRUD, balance, invocation endpoints |
| `server/__tests__/routes-sessions.test.ts` | Integration | Session CRUD, start/stop, messages |
| `server/__tests__/routes-projects.test.ts` | Integration | Project CRUD, directory browsing with path validation |
| `server/__tests__/routes-schedules.test.ts` | Integration | Schedule CRUD, trigger execution, approval endpoints |
| `server/__tests__/routes-reputation.test.ts` | Integration | Reputation score endpoints |
| `server/__tests__/routes-sandbox.test.ts` | Integration | Sandbox pool stats and policy management |
| `server/__tests__/routes-permissions.test.ts` | Integration | Grant/revoke/list/emergency-revoke endpoints |
| `server/__tests__/routes-plugins.test.ts` | Integration | Plugin load/unload/capabilities endpoints |
| `server/__tests__/routes-performance.test.ts` | Integration | Performance snapshot, time-series, regression endpoints |
| `server/__tests__/routes-health.test.ts` | Integration | Liveness, readiness, history endpoints |
| `server/__tests__/routes-councils.test.ts` | Integration | Council launch and deliberation |
| `server/__tests__/routes-work-tasks.test.ts` | Integration | Work task CRUD and cancellation |
| `server/__tests__/auth-middleware.test.ts` | Unit | API key validation, cookie auth, unauthenticated 401 |
| `server/__tests__/middleware-pipeline.test.ts` | Unit | CORS preflight, rate-limit rejection, auth bypass |
| `server/__tests__/route-injection-guards.test.ts` | Unit | Path traversal blocking in project browse |

## Manual Testing

- [ ] Send `OPTIONS` preflight request and confirm 204 with correct CORS headers
- [ ] Send request without `Authorization` header and confirm 401
- [ ] Send valid API key and confirm route handler is reached
- [ ] Exceed rate limit and confirm 429 response
- [ ] Access `GET /api/projects/browse?path=/etc/passwd` and confirm 403 (path not allowed)
- [ ] Send request to unknown path and confirm 404
- [ ] Set `AUTH_DISABLED=true` and confirm unauthenticated requests are allowed

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| Handler returns null | Pipeline continues to next handler; 404 if all return null |
| Multiple handlers match the same prefix | First registered handler wins |
| CORS preflight (`OPTIONS`) | 204 returned immediately, no auth check |
| Path traversal in project browse (`../`) | 403 AuthorizationError |
| `resetAuthConfigForTest()` called | Cached auth config cleared; next request re-reads env |
| `initRateLimiterDb(db)` not called | Rate limiter uses in-memory store only |
| Request with malformed JSON body | Handler returns 400 with parse error message |

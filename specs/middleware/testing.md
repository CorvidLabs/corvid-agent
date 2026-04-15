---
spec: middleware-pipeline.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/__tests__/middleware-pipeline.test.ts` | Unit | Pipeline ordering, downstream/upstream phases, abort semantics, double-next error, error handler, guard chain short-circuit |
| `server/__tests__/builtin-middleware.test.ts` | Unit | CORS preflight handling, rate limit middleware, auth middleware, role middleware, error handler AppError vs generic error |
| `server/__tests__/auth-middleware.test.ts` | Unit | `authGuard`, `tenantGuard`, `TRUST_PROXY` proxy mode, wallet query param validation, timing-safe admin key comparison |
| `server/__tests__/dashboard-auth-guard.test.ts` | Unit | Dashboard auth enforcement for non-localhost origins |

## Manual Testing

- [ ] Send a request with three middleware registered at orders 30, 10, 20 — verify execution order is 10, 20, 30
- [ ] Set `ctx.aborted = true` in middleware at order 10 — verify middleware at order 20 does not execute
- [ ] Call `next()` twice from the same middleware — verify rejection with "next() called multiple times"
- [ ] Throw an `AppError` with `statusCode: 422` — verify error handler returns a 422 response with the error message
- [ ] Send an unauthenticated request to an auth-protected endpoint — verify 401 with `WWW-Authenticate: Bearer`
- [ ] Send an authenticated request with `role=user` to an admin-only path — verify 403 with `requiredRoles: ['admin']`
- [ ] Send 61 mutations within 60s from an authenticated user to `POST /api/messages` (user tier limit=60) — verify 61st returns 429 with `Retry-After` header
- [ ] Send a request to `/api/health` (exempt path) — verify no rate limit headers and always allowed
- [ ] Start server with `TRUST_PROXY=1`, send request with `X-Forwarded-Email: user@example.com` — verify auth bypasses API key check and resolves via email
- [ ] Send request with `?wallet=<invalid-value>` — verify `context.walletAddress` is NOT set
- [ ] Send request with `?wallet=IEEMTOJCOCJ5V6Z4I4XGFUPPVSROSPBNOMMJIFWVBTJTMYPIEZYELJDFD4` — verify `context.walletAddress` is set correctly
- [ ] Test `* /api/tools/*` wildcard pattern — verify both `GET /api/tools/abc` and `DELETE /api/tools/xyz` match the rule

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| Error propagates past error handler middleware (no response set) | `MiddlewarePipeline.execute()` sets generic 500 JSON response |
| `RateLimitError` thrown from downstream | Error handler includes `retryAfter` field in the response body |
| `AppError` with `statusCode: 429` | Response uses the AppError's status code, not generic 500 |
| OPTIONS preflight request | CORS middleware sets 204, `ctx.aborted = true`; downstream does not run |
| Guard chain: auth guard returns 401 | `endpointRateLimitGuard` never executes (short-circuit) |
| `roleGuard` with `context.authenticated = false` | Returns 401 (not 403) — user is not authenticated |
| `roleGuard` with correct role | Returns `null` (no block) |
| Rate limit bucket at exact limit | Next request is blocked (>= max, not just >) |
| Endpoint rate limit pattern `* /api/tools/*` + request `DELETE /api/tools/abc` | Wildcard method matches; prefix path matches |
| Invalid endpoint rate limit pattern (missing space) | `parsePattern` throws `Error('Invalid endpoint pattern: ...')` |
| No tier limit configured for requesting tier | Returns `{ allowed: true, headers: {} }` |
| Admin key compared with `===` instead of `timingSafeEqual()` | MUST NOT happen — timing oracle prevention (spec invariant 23) |
| `TRUST_PROXY=1` + `X-Forwarded-Email` with unknown email | `tenantGuard` returns 401 |
| `TRUST_PROXY=1` + malformed email | Header silently ignored; falls back to API key auth |
| Tenant member with `owner` role | `context.role` set to `'admin'` |
| Tenant member with `viewer` role | `context.role` set to `'viewer'` |

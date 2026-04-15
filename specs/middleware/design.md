---
spec: middleware-pipeline.spec.md
sources:
  - server/middleware/pipeline.ts
  - server/middleware/builtin.ts
  - server/middleware/guards.ts
  - server/middleware/endpoint-rate-limit.ts
---

## Module Structure

`server/middleware/` provides two complementary request-processing patterns:

| File | Pattern | Description |
|------|---------|-------------|
| `pipeline.ts` | Pipeline | `MiddlewarePipeline` class and `compose()` — Koa-style async middleware composition with ordering, downstream/upstream phases, and abort semantics |
| `builtin.ts` | Pipeline middleware | Factory functions for CORS, request logging, error handling, global rate limiting, auth, and role-based access control |
| `guards.ts` | Guard chain | `Guard` type, `applyGuards()`, and individual guard factories (`authGuard`, `roleGuard`, `rateLimitGuard`, `endpointRateLimitGuard`, `contentLengthGuard`, `tenantGuard`, `tenantRoleGuard`, `dashboardAuthGuard`) |
| `endpoint-rate-limit.ts` | Rate limiting | `EndpointRateLimiter` class: per-endpoint sliding-window rate limits with tier support and `X-RateLimit-*` headers |

## Key Classes and Subsystems

### MiddlewarePipeline (pipeline.ts)
Builder/registry for assembling a Koa-style pipeline. `use()` registers middleware; `execute()` sorts by `order`, composes, and runs the chain. Lazily compiles on first `execute()` call; invalidates cache on `use()` or `remove()`. Catches unhandled errors and sets a 500 JSON response.

**Execution phases**: Code before `await next()` runs downstream (in order); code after `await next()` runs upstream (reverse order). Not calling `next()` aborts the remaining chain. Calling `next()` twice throws an error.

**Canonical order constants** (`ORDER`):
```
CORS=10, REQUEST_LOG=20, ERROR_HANDLER=30,
RATE_LIMIT=100, AUTH=110, ROLE=120
```

### Guard Chain (guards.ts)
Simpler synchronous alternative to the pipeline for route-level gating. `Guard` functions return a `Response` (to short-circuit) or `null` (to continue). `applyGuards()` runs guards in argument order and returns the first non-null response.

Current per-route guard chain order: global rate limit → auth → endpoint rate limit → (conditional) role guard.

**Key guards:**
- `authGuard`: Validates `Authorization: Bearer` API key. In proxy mode (`TRUST_PROXY=1`) with a valid `X-Forwarded-Email` header, skips API key validation and defers to `tenantGuard`.
- `tenantGuard`: Resolves tenant membership via API key hash or (when `TRUST_PROXY=1`) `X-Forwarded-Email`. Maps tenant role to `context.role`.
- `roleGuard`: Checks `context.role` against allowed roles. Returns 401 if unauthenticated, 403 if wrong role.
- `contentLengthGuard`: Enforces max request body size (default 1 MB).
- `dashboardAuthGuard`: Dashboard-specific auth enforcement for non-localhost origins.

**Wallet query param**: `authGuard` sets `context.walletAddress` from the `?wallet=` query param only if it passes `isAlgorandAddressFormat()` (58 uppercase base32 chars). Invalid values are silently ignored.

### EndpointRateLimiter (endpoint-rate-limit.ts)
Sliding-window per-endpoint rate limiter. Rule matching is first-match-wins on patterns formatted as `METHOD /path` where `*` matches any method and `/*` suffix enables prefix matching.

**Tier resolution**: unauthenticated → `public`, authenticated non-admin → `user`, `role === 'admin'` → `admin`. Each tier has independent `{ max, windowMs }` limits. Missing tier limits return `{ allowed: true }`.

**Response headers** (all non-exempt responses): `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`. Blocked responses additionally include `Retry-After`.

**Rate limit key preference**: wallet address preferred over IP when both are available.

## Configuration Values and Constants

| Env Var / Constant | Default | Description |
|-------------------|---------|-------------|
| `RATE_LIMIT_GET` | `600` | Base GET request limit; endpoint limiter derives public/user/admin tier defaults |
| `RATE_LIMIT_MUTATION` | `60` | Base mutation request limit |
| `TRUST_PROXY` | unset | When `'1'` or `'true'`, enables `X-Forwarded-Email` proxy trust mode |
| `ORDER.CORS` | 10 | Runs first — handles preflight before any auth |
| `ORDER.RATE_LIMIT` | 100 | Global rate limit before auth |
| `ORDER.AUTH` | 110 | Authentication |
| `ORDER.ROLE` | 120 | Role-based access control |
| Endpoint rate limit order | 115 | Between global rate limit and auth in pipeline |
| Sweep interval | 5 minutes | Stale bucket cleanup for both limiters (unref'd timer) |

### Exempt Paths (Endpoint Rate Limiter)
`/api/health`, `/webhooks/github`, `/ws`, `/.well-known/agent-card.json`

### Admin-Protected Paths
`/metrics`, `/api/audit-log`, `/api/operational-mode`, `/api/backup`, `/api/memories/backfill`, `/api/selftest/run`, `/api/escalation-queue/*`, `/api/algochat/network`, `/api/security/overview`

## Related Resources

| Resource | Description |
|----------|-------------|
| `server/middleware/auth.ts` | `checkHttpAuth()`, `buildCorsHeaders()`, `AuthConfig` |
| `server/middleware/rate-limit.ts` | Global `RateLimiter`, `getClientIp()` |
| `server/lib/errors.ts` | `AppError`, `RateLimitError` — distinguished by the error handler middleware |
| `server/lib/validation.ts` | `isAlgorandAddressFormat()` used by `authGuard` |
| `server/observability/metrics.ts` | `endpointRateLimitRejections` counter incremented on 429 responses |
| `server/routes/index.ts` | Primary consumer — assembles guard chains for all routes |

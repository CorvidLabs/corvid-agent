---
module: middleware-pipeline
version: 1
status: active
files:
  - server/middleware/pipeline.ts
  - server/middleware/builtin.ts
  - server/middleware/guards.ts
  - server/middleware/endpoint-rate-limit.ts
db_tables: []
depends_on:
  - specs/middleware/auth.spec.md
  - specs/middleware/rate-limit.spec.md
---

# Middleware Pipeline, Built-in Middleware, Guards & Endpoint Rate Limiting

## Purpose

Request processing infrastructure for the HTTP server. Provides two complementary patterns:

1. **Pipeline** (`pipeline.ts`) — Koa-style async middleware composition with explicit ordering, downstream/upstream phases, and abort semantics.
2. **Built-in middleware** (`builtin.ts`) — Factory functions that produce pipeline-compatible `Middleware` objects for CORS, request logging, error handling, rate limiting, authentication, and role-based access control.
3. **Guards** (`guards.ts`) — Declarative guard chain pattern for route-level middleware. Guards are simple synchronous functions `(req, url, context) => Response | null` composed with `applyGuards`.
4. **Endpoint rate limiting** (`endpoint-rate-limit.ts`) — Per-endpoint sliding-window rate limiter with tier support (public/user/admin), pattern matching, and standard `X-RateLimit-*` response headers.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `createMiddlewareContext` | `(req: Request, url: URL, requestContext: RequestContext)` | `MiddlewareContext` | Creates a fresh context for an incoming request |
| `compose` | `(middlewares: Middleware[])` | `(ctx: MiddlewareContext) => Promise<void>` | Sorts middleware by order and composes into a single executable function |
| `errorHandlerMiddleware` | `()` | `Middleware` | Error boundary; catches errors from downstream and sets 500 response |
| `requestLogMiddleware` | `()` | `Middleware` | Logs method + path downstream, status + duration upstream |
| `corsMiddleware` | `(config: AuthConfig)` | `Middleware` | Handles OPTIONS preflight and applies CORS headers upstream |
| `rateLimitMiddleware` | `(limiter: RateLimiter)` | `Middleware` | Global sliding-window rate limit check; aborts with 429 when exceeded |
| `endpointRateLimitMiddleware` | `(limiter: EndpointRateLimiter)` | `Middleware` | Per-endpoint rate limit check with tier-aware limits |
| `authMiddleware` | `(config: AuthConfig)` | `Middleware` | Delegates to `checkHttpAuth`; populates requestContext on success |
| `roleMiddleware` | `(allowedRoles: string[], pathPredicate: (pathname: string) => boolean)` | `Middleware` | Role-based access control; 401/403 when role is insufficient |
| `authGuard` | `(config: AuthConfig)` | `Guard` | Guard version of auth middleware |
| `roleGuard` | `(...allowedRoles: string[])` | `Guard` | Guard that checks role inclusion |
| `rateLimitGuard` | `(limiter: RateLimiter)` | `Guard` | Guard version of global rate limit |
| `endpointRateLimitGuard` | `(limiter: EndpointRateLimiter)` | `Guard` | Guard version of endpoint rate limit |
| `applyGuards` | `(req: Request, url: URL, context: RequestContext, ...guards: Guard[])` | `Response \| null` | Runs guards sequentially; returns first non-null response or null |
| `createRequestContext` | `(walletAddress?: string)` | `RequestContext` | Creates a fresh RequestContext with `authenticated: false` |
| `requiresAdminRole` | `(pathname: string)` | `boolean` | Returns true if the pathname requires the admin role |
| `loadEndpointRateLimitConfig` | `()` | `EndpointRateLimitConfig` | Reads env vars and returns default endpoint rate limit configuration |
| `resolveTier` | `(authenticated: boolean, role?: string)` | `'public' \| 'user' \| 'admin'` | Maps auth state and role to a rate limit tier |

### Exported Types

| Type | Description |
|------|-------------|
| `MiddlewareContext` | Shared mutable context passed through the pipeline (req, url, method, requestContext, response, state, startTime, aborted) |
| `NextFn` | `() => Promise<void>` — invokes the next middleware in the chain |
| `MiddlewareFn` | `(ctx: MiddlewareContext, next: NextFn) => Promise<void>` |
| `Middleware` | Named middleware with `name`, `order`, and `handler` |
| `RequestContext` | Auth context populated by guards/middleware: walletAddress, role, authenticated, rateLimitHeaders |
| `Guard` | `(req: Request, url: URL, context: RequestContext) => Response \| null` |
| `TierLimit` | `{ max: number; windowMs: number }` — rate limit for a single tier |
| `EndpointTierLimits` | Per-tier limits: `{ public?, user?, admin? }` |
| `EndpointRule` | `{ pattern: string; tiers: EndpointTierLimits }` — per-endpoint rate limit rule |
| `EndpointRateLimitConfig` | `{ defaults: EndpointTierLimits; rules: EndpointRule[]; exemptPaths: string[] }` |
| `RateLimitResult` | `{ allowed: boolean; headers: Record<string, string>; response?: Response }` |

### Exported Classes

| Class | Description |
|-------|-------------|
| `MiddlewarePipeline` | Builder/registry for assembling and executing a middleware pipeline |
| `EndpointRateLimiter` | Per-endpoint sliding-window rate limiter with tier support |

#### MiddlewarePipeline Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `use` | `(middleware: Middleware)` | `this` | Register a middleware; invalidates compiled pipeline |
| `remove` | `(name: string)` | `this` | Remove a middleware by name |
| `getMiddlewares` | `()` | `ReadonlyArray<Readonly<Middleware>>` | Get all registered middleware sorted by order |
| `execute` | `(ctx: MiddlewareContext)` | `Promise<MiddlewareContext>` | Run the pipeline; catches unhandled errors and sets 500 response |

#### EndpointRateLimiter Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `check` | `(key: string, method: string, pathname: string, tier?: 'public' \| 'user' \| 'admin')` | `RateLimitResult` | Check whether a request should be allowed |
| `stop` | `()` | `void` | Stop the periodic sweep timer |
| `reset` | `()` | `void` | Clear all tracked buckets (for testing) |

### Exported Constants

| Constant | Description |
|----------|-------------|
| `ORDER` | Canonical middleware ordering: CORS=10, REQUEST_LOG=20, ERROR_HANDLER=30, RATE_LIMIT=100, AUTH=110, ROLE=120 |
| `ADMIN_PATHS` | Set of pathnames that require the admin role |

## Invariants

1. **Ordering by `order` property**: Middleware are sorted by numeric `order` ascending before execution. Ties are broken by registration order (stable sort).
2. **Koa-style downstream/upstream phases**: Code before `await next()` runs on the way down (in order); code after `await next()` runs on the way up (reverse order).
3. **Abort semantics**: Setting `ctx.aborted = true` prevents further downstream middleware from executing. The current middleware can still set `ctx.response` before returning.
4. **Not calling `next()` aborts**: A middleware that does not call `next()` prevents all subsequent downstream middleware from running.
5. **next() called at most once**: Calling `next()` more than once from the same middleware throws `Error('next() called multiple times')`.
6. **Pipeline catches unhandled errors**: If an error propagates out of `MiddlewarePipeline.execute()` and no response has been set, a 500 JSON response is returned.
7. **Error handler middleware catches AppErrors**: The error handler distinguishes `AppError` (returns the error's statusCode and message) from unknown errors (returns generic 500).
8. **Guard chain is sequential AND short-circuit**: `applyGuards` evaluates guards in order; the first guard to return a non-null `Response` short-circuits the chain.
9. **Guard execution order in routes**: The current guard chain order is: global rate limit → auth → endpoint rate limit → (conditional) role guard.
10. **Role guard requires prior auth**: The role guard returns 401 if `context.authenticated` is false, and 403 if the role is not in the allowed list.
11. **Endpoint rate limit first-match-wins**: Rules are evaluated in array order; the first matching rule's tier limits apply. Unmatched requests fall back to `defaults`.
12. **Endpoint rate limit pattern format**: Patterns are `METHOD /path` where `*` matches any method and `/*` suffix enables prefix matching.
13. **Tier resolution**: Unauthenticated → `public`, authenticated with `role !== 'admin'` → `user`, `role === 'admin'` → `admin`.
14. **Endpoint rate limit exempt paths**: Exempt paths bypass rate limiting entirely and return `{ allowed: true, headers: {} }`.
15. **Endpoint rate limit X-RateLimit headers**: Every non-exempt response includes `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers. Blocked responses additionally include `Retry-After`.
16. **Endpoint rate limit sliding window**: Uses per-bucket timestamp arrays; expired timestamps are pruned on each `check` call.
17. **Periodic sweep**: Both `EndpointRateLimiter` and global `RateLimiter` sweep stale entries every 5 minutes. Sweep timers are `unref`'d.
18. **Pipeline lazy compilation**: `MiddlewarePipeline` caches the composed function; adding or removing middleware invalidates the cache.
19. **Built-in middleware order ranges**: 0-99 pre-processing, 100-199 security, 200-299 enrichment, 300-399 business logic, 400-499 post-processing, 500+ observability.
20. **Endpoint rate limit order**: Runs at `ORDER.RATE_LIMIT + 15` (115), between global rate limit (100) and auth (110) in the pipeline pattern, but after auth in the guard chain.
21. **Rate limit key preference**: Both global and endpoint rate limiters prefer wallet address over IP as the rate limit key.
22. **Global rate limit exempt paths**: `/api/health`, `/webhooks/github`, and `/ws` bypass global rate limiting.

## Behavioral Examples

### Scenario: Pipeline executes middleware in order

- **Given** three middleware registered with orders 30, 10, 20
- **When** the pipeline executes
- **Then** they run in order 10, 20, 30 (sorted by `order`)

### Scenario: Middleware aborts the pipeline

- **Given** middleware A (order 10) sets `ctx.aborted = true` and `ctx.response`
- **When** the pipeline executes
- **Then** middleware B (order 20) does not execute, and `ctx.response` from A is preserved

### Scenario: Upstream phase runs in reverse

- **Given** middleware A (order 10) and B (order 20) both log before and after `next()`
- **When** the pipeline executes
- **Then** execution order is: A-down, B-down, B-up, A-up

### Scenario: Error handler catches downstream error

- **Given** error handler middleware (order 30) wraps downstream
- **When** a downstream middleware throws an Error
- **Then** the error handler catches it and sets a 500 JSON response with timestamp

### Scenario: Error handler preserves AppError status codes

- **Given** a downstream middleware throws a `RateLimitError` with statusCode 429
- **When** the error handler catches it
- **Then** the response has status 429 with the error's message and code, plus `retryAfter` if set

### Scenario: CORS middleware handles preflight

- **Given** CORS middleware is registered
- **When** an OPTIONS request arrives
- **Then** CORS middleware sets a 204 response with CORS headers, sets `ctx.aborted = true`, and downstream middleware does not run

### Scenario: Guard chain short-circuits on auth failure

- **Given** guards: rateLimitGuard, authGuard, endpointRateLimitGuard
- **When** the request has no Authorization header and API_KEY is configured
- **Then** `authGuard` returns a 401 Response, `endpointRateLimitGuard` never executes

### Scenario: Endpoint rate limit uses tier-appropriate limits

- **Given** an endpoint rule for `POST /api/messages` with `user: { max: 60, windowMs: 60000 }`
- **When** an authenticated user (tier=user) makes their 61st POST to `/api/messages` within 60 seconds
- **Then** the check returns `{ allowed: false }` with a 429 response and `Retry-After` header

### Scenario: Endpoint rate limit falls back to defaults

- **Given** no rule matches `GET /api/unknown-path`
- **When** the endpoint rate limiter checks the request
- **Then** the default tier limits apply (read bucket)

### Scenario: Admin role guard denies non-admin user

- **Given** guards: authGuard, roleGuard('admin') applied to `/metrics`
- **When** an authenticated request with `role=user` hits `/metrics`
- **Then** roleGuard returns a 403 Response with `{ error: 'Forbidden: insufficient role', requiredRoles: ['admin'] }`

### Scenario: Endpoint rate limit exempt path

- **Given** `/api/health` is in the exempt paths list
- **When** a request to `/api/health` is checked
- **Then** the check returns `{ allowed: true, headers: {} }` regardless of request count

### Scenario: Endpoint rate limit pattern with wildcard method

- **Given** a rule with pattern `* /api/tools/*`
- **When** a `DELETE /api/tools/abc` request is checked
- **Then** the rule matches (wildcard method, prefix path match)

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `next()` called twice from same middleware | `Promise.reject(new Error('next() called multiple times'))` |
| Unhandled error in pipeline (no response set) | `MiddlewarePipeline.execute` sets 500 JSON response |
| Error handler catches `AppError` | Response uses `err.statusCode`, `err.message`, `err.code` |
| Error handler catches `RateLimitError` | Response includes `retryAfter` field |
| Error handler catches unknown error | Response is generic 500 with timestamp |
| Guard returns non-null Response | `applyGuards` returns that Response immediately, skipping remaining guards |
| Role guard with unauthenticated context | 401 with `WWW-Authenticate: Bearer` |
| Role guard with wrong role | 403 with `requiredRoles` array in body |
| Invalid endpoint pattern (no space) | `parsePattern` throws `Error('Invalid endpoint pattern: ...')` |
| No tier limit configured for request's tier | Returns `{ allowed: true, headers: {} }` |
| Endpoint rate limit exceeded | 429 with JSON body `{ error, retryAfter }` and `X-RateLimit-*` headers |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/middleware/auth.ts` | `AuthConfig`, `buildCorsHeaders`, `checkHttpAuth` |
| `server/middleware/rate-limit.ts` | `RateLimiter`, `getClientIp` |
| `server/lib/logger.ts` | `createLogger` |
| `server/lib/errors.ts` | `isAppError`, `RateLimitError` |
| `server/observability/metrics.ts` | `endpointRateLimitRejections` counter |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/routes/index.ts` | `authGuard`, `roleGuard`, `rateLimitGuard`, `endpointRateLimitGuard`, `applyGuards`, `createRequestContext`, `requiresAdminRole`, `EndpointRateLimiter`, `loadEndpointRateLimitConfig`, `RequestContext` |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `RATE_LIMIT_GET` | `600` | Base read request limit; endpoint rate limiter derives default tier limits from this |
| `RATE_LIMIT_MUTATION` | `60` | Base mutation request limit; endpoint rate limiter derives default tier limits from this |

### Default Endpoint Rate Limit Tiers

| Tier | Read (per minute) | Mutation (per minute) |
|------|-------------------|-----------------------|
| public | `RATE_LIMIT_GET / 2` | `RATE_LIMIT_MUTATION / 2` |
| user | `RATE_LIMIT_GET` | `RATE_LIMIT_MUTATION` |
| admin | `RATE_LIMIT_GET * 2` | `RATE_LIMIT_MUTATION * 2` |

### Built-in Endpoint Rules

| Pattern | Description |
|---------|-------------|
| `POST /api/sessions` | Session creation — mutation limits per tier |
| `POST /api/messages` | Message sending — mutation limits per tier |
| `* /api/tools/*` | Tool invocations — stricter limits (mutation / 3 for public) |

### Exempt Paths (Endpoint Rate Limiter)

`/api/health`, `/webhooks/github`, `/ws`, `/.well-known/agent-card.json`

### Admin-Protected Paths

`/metrics`, `/api/audit-log`, `/api/operational-mode`, `/api/backup`, `/api/memories/backfill`, `/api/selftest/run`, `/api/escalation-queue/*`

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-26 | corvid-agent | Initial spec |

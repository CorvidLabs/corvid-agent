---
spec: auth.spec.md
---

## User Stories

- As a platform administrator, I want non-localhost deployments to require an API key so that the server is never accidentally exposed without authentication
- As an agent operator, I want timing-safe API key comparison so that attackers cannot use timing side-channels to guess the key
- As an agent developer, I want CORS origin reflection with an allowlist so that only approved web frontends can make cross-origin requests
- As a platform administrator, I want role-based access control on admin endpoints so that sensitive operations like network switching are restricted
- As an agent developer, I want a composable middleware pipeline with explicit ordering so that request processing stages (CORS, rate limit, auth, routing) execute in a deterministic sequence
- As a platform administrator, I want per-endpoint rate limiting with tier-aware limits (public/user/admin) so that unauthenticated clients cannot overwhelm specific expensive endpoints
- As an agent developer, I want declarative guard chains for route-level middleware so that route handlers can compose auth, rate limit, and tenant checks without boilerplate
- As an agent operator, I want API key rotation and expiry management so that compromised keys can be replaced without server restart

## Acceptance Criteria

- `validateStartupSecurity()` calls `process.exit(1)` if `BIND_HOST` is not localhost/127.0.0.1/::1 and no `API_KEY` is set
- `validateStartupSecurity()` throws `SecurityConfigError` if non-localhost deployment has wildcard CORS origins
- `checkHttpAuth()` returns null (allowed) for requests with valid `Authorization: Bearer <key>` header
- `checkHttpAuth()` returns 401 with `WWW-Authenticate: Bearer` for missing auth headers, and 403 for invalid keys
- `/api/health` and `/.well-known/agent-card.json` bypass HTTP authentication regardless of API key configuration
- OPTIONS requests bypass authentication for CORS preflight
- When `apiKey` is null (localhost-only mode), all requests are automatically authenticated
- `checkWsAuth()` checks `Authorization: Bearer <key>` header first, then `?key=<key>` query parameter
- `timingSafeEqual()` pads strings to equal length and XORs every byte to prevent timing attacks
- `buildCorsHeaders()` reflects the request origin if it matches `allowedOrigins` and sets `Vary: Origin`; disallowed origins receive empty `Access-Control-Allow-Origin`
- `rotateApiKey()` generates a new key and updates the `AuthConfig` in-place; `getApiKeyRotationStatus()` reports key age and rotation history
- `isApiKeyExpired()` returns true when the current key exceeds its TTL set via `setApiKeyExpiry()`
- Middleware pipeline sorts middleware by numeric `order` ascending and executes in Koa-style downstream/upstream phases
- Setting `ctx.aborted = true` prevents further downstream middleware from executing
- Calling `next()` more than once from the same middleware throws `Error('next() called multiple times')`
- `applyGuards()` evaluates guards sequentially; the first non-null Response short-circuits the chain
- `EndpointRateLimiter` uses sliding-window timestamp arrays with first-match-wins rule evaluation
- Every non-exempt rate-limited response includes `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers
- Blocked rate-limited responses additionally include `Retry-After` header
- `contentLengthGuard()` rejects requests exceeding the configured max bytes (default 1MB)
- `tenantGuard()` extracts and validates tenant ID from the request
- `authGuard()` validates the `?wallet` query parameter with `isAlgorandAddressFormat()` (58 uppercase base32 chars); invalid values are silently ignored

## Constraints

- All API key comparisons must use `timingSafeEqual()`; never plain `===`
- Global rate limit exempt paths: `/api/health`, `/webhooks/github`, `/ws`
- Admin-only paths are defined in `ADMIN_PATHS` set and checked via `requiresAdminRole()`
- Middleware ordering ranges: 0-99 pre-processing, 100-199 security, 200-299 enrichment, 300-399 business logic
- Both global `RateLimiter` and `EndpointRateLimiter` sweep stale entries every 5 minutes with `unref`'d timers
- Rate limit key preference: wallet address over IP address
- Pipeline is lazy-compiled; adding or removing middleware invalidates the cached composition

## Out of Scope

- OAuth 2.0 or OpenID Connect flows (device auth flow is in routes, not middleware)
- JWT token validation or refresh token management
- IP-based geoblocking
- Request body parsing or content-type negotiation
- WebSocket-specific middleware (WebSocket auth is in `server/ws/handler.ts`)

---
module: rate-limit
version: 1
status: draft
files:
  - server/middleware/rate-limit.ts
db_tables: []
depends_on: []
---

# Rate Limit Middleware

## Purpose

Sliding-window per-IP HTTP rate limiter. Separates traffic into two buckets — read (GET/HEAD/OPTIONS) and mutation (POST/PUT/DELETE) — each with independent limits. Returns 429 with Retry-After header when a client exceeds the configured threshold within the 1-minute window. Runs in-memory with periodic sweeping to prevent unbounded growth.

## Public API

### Exported Types

| Type | Description |
|------|-------------|
| `RateLimitConfig` | Configuration: `maxGet`, `maxMutation`, `windowMs` |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `loadRateLimitConfig` | `()` | `RateLimitConfig` | Reads `RATE_LIMIT_GET` and `RATE_LIMIT_MUTATION` from env; falls back to defaults |
| `checkRateLimit` | `(req: Request, url: URL, limiter: RateLimiter)` | `Response \| null` | Top-level check — exempts specific paths, extracts client IP, delegates to `RateLimiter.check` |

### Exported Classes

| Class | Description |
|-------|-------------|
| `RateLimiter` | Per-IP sliding-window rate limiter with two independent buckets per IP |

#### RateLimiter Constructor

| Parameter | Type | Description |
|-----------|------|-------------|
| `config` | `RateLimitConfig` | Rate limit thresholds and window size |

#### RateLimiter Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `check` | `(ip: string, method: string)` | `Response \| null` | Returns null if allowed, or a 429 Response if rate-limited |
| `stop` | `()` | `void` | Stops the periodic sweep timer |
| `reset` | `()` | `void` | Clears all tracked clients (for testing) |

## Invariants

1. **Two independent buckets**: Each IP has a separate `read` bucket (GET/HEAD/OPTIONS) and `mutation` bucket (POST/PUT/DELETE). Exhausting one does not affect the other
2. **Sliding window**: Timestamps older than `windowMs` (60 seconds) are pruned on every `check` call. The window slides forward continuously — it is not a fixed-interval reset
3. **Retry-After accuracy**: The 429 response includes a `Retry-After` header (seconds) computed from the oldest timestamp still in the window. Minimum value is 1 second
4. **Exempt paths**: `/api/health` and `/webhooks/github` bypass rate limiting entirely (monitoring probes and webhook callbacks must never be throttled)
5. **WebSocket upgrade exempt**: Requests to `/ws` are not rate-limited (they are one-time upgrades, not repeated HTTP requests)
6. **IP extraction order**: Client IP is resolved from `X-Forwarded-For` (first entry) → `X-Real-IP` → `'unknown'`
7. **Periodic sweep**: A background timer runs every 5 minutes and removes IP entries with no timestamps in the current window, bounding memory to O(active IPs)
8. **Sweep timer unref**: The sweep interval is `unref`'d so it does not prevent process exit
9. **Config validation**: Parsed env values that are non-positive or non-finite fall back to defaults (240 for GET, 60 for mutation)

## Behavioral Examples

### Scenario: Normal request within limits

- **Given** a RateLimiter with `maxMutation = 60`
- **When** a POST request from IP `1.2.3.4` is checked for the first time
- **Then** `check` returns null (allowed), the timestamp is recorded

### Scenario: Mutation limit exceeded

- **Given** IP `1.2.3.4` has made 60 POST requests within the last 60 seconds
- **When** the 61st POST request is checked
- **Then** `check` returns a 429 Response with `Retry-After` header and JSON body `{ "error": "Too many requests", "retryAfter": N }`

### Scenario: Read limit does not affect mutations

- **Given** IP `1.2.3.4` has exhausted the GET limit (600 requests)
- **When** a POST request from the same IP is checked
- **Then** `check` returns null because the mutation bucket is independent

### Scenario: Health endpoint always passes

- **Given** IP `1.2.3.4` has exceeded all rate limits
- **When** a GET request to `/api/health` is checked via `checkRateLimit`
- **Then** `checkRateLimit` returns null (exempt path)

### Scenario: Sweep removes stale entries

- **Given** IP `1.2.3.4` made requests 6 minutes ago but none since
- **When** the sweep timer fires
- **Then** the IP entry is removed from the client map

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Rate limit exceeded (read) | 429 response with JSON body and `Retry-After` header |
| Rate limit exceeded (mutation) | 429 response with JSON body and `Retry-After` header |
| `RATE_LIMIT_GET` set to non-numeric or ≤ 0 | Falls back to 240 |
| `RATE_LIMIT_MUTATION` set to non-numeric or ≤ 0 | Falls back to 60 |
| No `X-Forwarded-For` or `X-Real-IP` header | IP resolves to `'unknown'` — all such requests share one bucket |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/lib/logger.ts` | `createLogger` for rate-limit logging |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/routes/index.ts` | `RateLimiter`, `loadRateLimitConfig`, `checkRateLimit` — instantiated at module level, called before auth/routing |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `RATE_LIMIT_GET` | `600` | Max GET/HEAD/OPTIONS requests per minute per IP |
| `RATE_LIMIT_MUTATION` | `60` | Max POST/PUT/DELETE requests per minute per IP |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-20 | corvid-agent | Initial spec |

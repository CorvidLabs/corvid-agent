---
module: rate-limit
version: 1
status: active
files:
  - server/middleware/rate-limit.ts
db_tables: []
depends_on: []
---

# Rate Limit Middleware

## Purpose

Per-IP HTTP rate limiting using a sliding-window algorithm. Maintains separate read and mutation request buckets per IP address, returns 429 responses with `Retry-After` headers when limits are exceeded, and periodically sweeps stale entries to bound memory usage.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `loadRateLimitConfig` | `()` | `RateLimitConfig` | Reads `RATE_LIMIT_GET` and `RATE_LIMIT_MUTATION` from env |
| `checkRateLimit` | `(req: Request, url: URL, limiter: RateLimiter)` | `Response \| null` | Returns null if allowed, or a 429 Response |

### Exported Types

| Type | Description |
|------|-------------|
| `RateLimitConfig` | `{ maxGet: number; maxMutation: number; windowMs: number }` |

### Exported Classes

| Class | Description |
|-------|-------------|
| `RateLimiter` | Per-IP sliding-window rate limiter with separate read/mutation buckets |

#### RateLimiter Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `check` | `(ip: string, method: string)` | `Response \| null` | Check if request is allowed; returns 429 if rate-limited |
| `stop` | `()` | `void` | Stop the periodic sweep timer |
| `reset` | `()` | `void` | Clear all tracked clients (for testing) |

## Invariants

1. **Separate read/mutation buckets**: GET/HEAD/OPTIONS requests count against the `read` bucket; POST/PUT/DELETE count against the `mutation` bucket. Each bucket is independently rate-limited per IP
2. **Sliding window (1 minute)**: The window is fixed at 60,000ms. Expired timestamps are pruned on each `check()` call
3. **Exempt paths**: `/api/health` and `/webhooks/github` bypass rate limiting entirely
4. **WebSocket exempt**: Requests to `/ws` bypass rate limiting
5. **5-minute sweep timer**: A periodic sweep runs every 5 minutes to remove IP entries with no activity within the window. The timer is `unref`'d so it does not keep the process alive
6. **429 with Retry-After**: When a limit is exceeded, a JSON response with status 429 is returned, including a `Retry-After` header (in seconds, minimum 1)
7. **IP from X-Forwarded-For**: Client IP is extracted from `X-Forwarded-For` (first IP), then `X-Real-IP`, falling back to `'unknown'`
8. **Default limits**: Read defaults to 600/min, mutation defaults to 60/min. Invalid or non-positive env values fall back to 240 (read) and 60 (mutation)

## Behavioral Examples

### Scenario: Normal request within limits

- **Given** a RateLimiter with default config (600 GET/min)
- **When** IP `1.2.3.4` sends a GET request
- **Then** `check` returns null (allowed) and records the timestamp

### Scenario: Rate limit exceeded

- **Given** a RateLimiter with `maxMutation=2`
- **When** IP `1.2.3.4` sends 3 POST requests within 1 minute
- **Then** the 3rd request returns a 429 Response with `Retry-After` header

### Scenario: Exempt path bypasses limit

- **Given** a fully exhausted rate limit for IP `1.2.3.4`
- **When** a GET to `/api/health` arrives from that IP
- **Then** `checkRateLimit` returns null (allowed)

### Scenario: Sweep clears stale entries

- **Given** IP `1.2.3.4` last sent a request 2 minutes ago
- **When** the 5-minute sweep runs
- **Then** the entry for `1.2.3.4` is removed from the client map

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Rate limit exceeded | 429 response with JSON `{ error, retryAfter }` and `Retry-After` header |
| Invalid `RATE_LIMIT_GET` env var | Falls back to 240 |
| Invalid `RATE_LIMIT_MUTATION` env var | Falls back to 60 |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/lib/logger.ts` | `createLogger` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/index.ts` | `loadRateLimitConfig`, `RateLimiter`, `checkRateLimit` |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `RATE_LIMIT_GET` | `600` | Max GET/HEAD/OPTIONS requests per minute per IP |
| `RATE_LIMIT_MUTATION` | `60` | Max POST/PUT/DELETE requests per minute per IP |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-20 | corvid-agent | Initial spec |

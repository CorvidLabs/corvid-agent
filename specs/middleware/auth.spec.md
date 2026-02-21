---
module: auth
version: 1
status: active
files:
  - server/middleware/auth.ts
db_tables: []
depends_on: []
---

# Auth Middleware

## Purpose

HTTP and WebSocket authentication, CORS handling, and startup security validation. Ensures non-localhost deployments require an API key, validates credentials with timing-safe comparison, and manages CORS origin reflection.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `loadAuthConfig` | `()` | `AuthConfig` | Reads `API_KEY`, `BIND_HOST`, `ALLOWED_ORIGINS` from env |
| `validateStartupSecurity` | `(config: AuthConfig)` | `void` | Exits process if non-localhost without API_KEY |
| `checkHttpAuth` | `(req: Request, url: URL, config: AuthConfig)` | `Response \| null` | Returns null if authenticated, 401/403 Response otherwise |
| `checkWsAuth` | `(req: Request, url: URL, config: AuthConfig)` | `boolean` | Returns true if WebSocket upgrade is authenticated |
| `buildCorsHeaders` | `(req: Request, config: AuthConfig)` | `Record<string, string>` | Builds CORS headers with origin reflection |
| `applyCors` | `(response: Response, req: Request, config: AuthConfig)` | `void` | Sets CORS headers on an existing Response |
| `timingSafeEqual` | `(a: string, b: string)` | `boolean` | Constant-time string comparison |

### Exported Types

| Type | Description |
|------|-------------|
| `AuthConfig` | `{ apiKey: string \| null; allowedOrigins: string[]; bindHost: string }` |

## Invariants

1. **Non-localhost without API_KEY exits process**: `validateStartupSecurity` calls `process.exit(1)` if `BIND_HOST` is not `127.0.0.1`, `localhost`, or `::1` and no `API_KEY` is set
2. **Timing-safe comparison**: All API key comparisons use `timingSafeEqual`, which pads to equal length and XORs every byte to prevent timing side-channels
3. **Public path bypass**: `/api/health` and `/.well-known/agent-card.json` bypass HTTP authentication regardless of API key configuration
4. **OPTIONS bypass**: HTTP OPTIONS requests bypass authentication (CORS preflight)
5. **No-key mode**: When `apiKey` is null (localhost-only), `checkHttpAuth` returns null and `checkWsAuth` returns true for all requests
6. **WebSocket auth via Bearer or query param**: `checkWsAuth` checks `Authorization: Bearer <key>` header first, then `?key=<key>` query parameter
7. **CORS origin reflection with Vary**: When `allowedOrigins` is configured, the request origin is reflected if it matches the allowlist; `Vary: Origin` is set when the reflected origin is not `*`
8. **Disallowed origin**: When `allowedOrigins` is set and the request origin is not in the list, `Access-Control-Allow-Origin` is set to empty string (browser blocks the response)

## Behavioral Examples

### Scenario: Non-localhost deployment without API_KEY

- **Given** `BIND_HOST=0.0.0.0` and no `API_KEY` set
- **When** `validateStartupSecurity` is called
- **Then** the process exits with code 1

### Scenario: Authenticated HTTP request

- **Given** `API_KEY=my-secret-key`
- **When** a POST request arrives with `Authorization: Bearer my-secret-key`
- **Then** `checkHttpAuth` returns null (allowed)

### Scenario: Missing auth header

- **Given** `API_KEY=my-secret-key`
- **When** a GET request arrives without an Authorization header
- **Then** `checkHttpAuth` returns a 401 Response with `WWW-Authenticate: Bearer`

### Scenario: Invalid API key

- **Given** `API_KEY=my-secret-key`
- **When** a request arrives with `Authorization: Bearer wrong-key`
- **Then** `checkHttpAuth` returns a 403 Response

### Scenario: WebSocket auth via query param

- **Given** `API_KEY=my-secret-key`
- **When** a WebSocket upgrade request arrives with `?key=my-secret-key`
- **Then** `checkWsAuth` returns true

### Scenario: CORS with allowed origins

- **Given** `ALLOWED_ORIGINS=https://app.example.com`
- **When** a request arrives with `Origin: https://app.example.com`
- **Then** `buildCorsHeaders` returns `Access-Control-Allow-Origin: https://app.example.com` with `Vary: Origin`

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Non-localhost without API_KEY | `process.exit(1)` during startup |
| Missing Authorization header | 401 with `WWW-Authenticate: Bearer` |
| Malformed Authorization header | 401 with `WWW-Authenticate: Bearer` |
| Invalid API key | 403 with `{ error: "Invalid API key" }` |
| WebSocket with invalid/missing auth | Returns false, logs warning |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/lib/logger.ts` | `createLogger` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/index.ts` | `loadAuthConfig`, `validateStartupSecurity`, `checkHttpAuth`, `checkWsAuth`, `buildCorsHeaders`, `applyCors` |
| `server/ws/handler.ts` | `AuthConfig`, `timingSafeEqual` |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `API_KEY` | `null` | API key for authentication. Null disables auth (localhost-only) |
| `BIND_HOST` | `127.0.0.1` | Server bind address. Non-localhost requires API_KEY |
| `ALLOWED_ORIGINS` | `""` (allow all) | Comma-separated list of allowed CORS origins |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-20 | corvid-agent | Initial spec |

---
module: corvid-agent
version: 1
status: draft
files:
  - server/index.ts
db_tables:
  - sessions
  - agents
  - projects
depends_on:
  - specs/bootstrap/bootstrap.spec.md
  - specs/routes/routes.spec.md
  - specs/ws/handler.spec.md
  - specs/db/connection.spec.md
  - specs/algochat/service.spec.md
  - specs/middleware/auth.spec.md
---

# Corvid Agent

## Purpose

Main entry point for the corvid-agent server. Initializes the runtime environment, validates security configuration, bootstraps all services, and starts the Bun HTTP/WebSocket server. Handles graceful shutdown on SIGTERM/SIGINT.

## Public API

_(No exports — this is a top-level entry point script)_

## Startup Sequence

| Step | Action | Details |
|------|--------|---------|
| 1 | Load auth config | `loadAuthConfig()` reads auth configuration |
| 2 | Validate security | `validateStartupSecurity()` ensures secure configuration |
| 3 | Log startup | Display first-run banner if applicable |
| 4 | Async GitHub validation | `validateGitHubTokenOnStartup()` checks token scopes (non-blocking) |
| 5 | Initialize database | `getDb()` establishes connection, `initDb()` runs migrations |
| 6 | Init rate limiter | `initRateLimiterDb(db)` attaches DB to rate limiter |
| 7 | Seed Discord config | `initDiscordConfigFromEnv(db)` seeds from env vars |
| 8 | Bootstrap services | `bootstrapServices(db, startTime)` constructs all services |
| 9 | Init AlgoChat | `initAlgoChat()` initializes blockchain messaging |
| 10 | Wire post-init | `wirePostInit()` connects AlgoChat to services |
| 11 | Setup broadcasting | `wireEventBroadcasting()` connects event system |
| 12 | Start HTTP server | `Bun.serve()` starts listening on configured port |
| 13 | Cleanup pending | Mark restart-pending sessions as failed |
| 14 | Log ready | Log startup time and server URL |

## Shutdown Sequence

| Step | Action | Details |
|------|--------|---------|
| 1 | Signal received | SIGTERM or SIGINT triggers shutdown |
| 2 | Log diagnostics | `logShutdownDiagnostics()` logs active sessions, connections, etc. |
| 3 | Close WebSockets | Server stops accepting new WS, waits for existing to close |
| 4 | Stop services | All bootstrapped services stopped in reverse order |
| 5 | Close database | `closeDb()` closes SQLite connection |
| 6 | Exit process | Process exits with code 0 |

## Invariants

1. Server refuses to start if security configuration is invalid — exits with code 1.
2. Database migrations complete before any services are constructed.
3. All services are constructed before HTTP server accepts connections.
4. WebSocket authentication requires valid session token or admin auth.
5. Static client files are only served for GET requests to unmatched paths.
6. MCP endpoint handles requests at `/mcp` before static file serving.
7. Health check endpoint at `/api/health` responds without full auth for availability checks.
8. Shutdown waits up to 30 seconds for WebSocket connections to close gracefully.

## Behavioral Examples

### Scenario: Successful startup
- **Given** valid security configuration, database accessible
- **When** `bun run server/index.ts` is executed
- **Then** server starts, logs "Server ready at http://127.0.0.1:3000"

### Scenario: Security configuration error
- **Given** invalid or missing admin token
- **When** server attempts to start
- **Then** logs "SECURITY: Admin token must be..." and exits with code 1

### Scenario: Database migration failure
- **Given** database file is locked or corrupted
- **When** `initDb()` is called
- **Then** error logged, server continues but may fail on first DB access

### Scenario: Graceful shutdown
- **Given** server is running with active WebSocket connections
- **When** SIGTERM received
- **Then** stops accepting new connections, waits for existing to close, stops services, exits cleanly

### Scenario: Health check
- **Given** server is running
- **When** GET request to `/api/health`
- **Then** returns 200 with health status JSON

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Security config invalid | Logs error, exits process with code 1 |
| Port already in use | Bun.serve throws, stack trace logged |
| Database locked | Migration fails, logged as error |
| AlgoChat init fails | Logged as warning, services that need it receive undefined |
| Uncaught exception | Process exits after logging error |
| Unhandled rejection | Logged as error, process may continue depending on error |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `PORT` | `3000` | HTTP server port |
| `BIND_HOST` | `127.0.0.1` | Interface to bind to |
| `ADMIN_TOKEN` | _(required)_ | Admin authentication token |
| `DATABASE_PATH` | `corvid-agent.db` | SQLite database file path |
| `CLIENT_DIST` | `../client/dist/client/browser` | Static files directory (relative to server/) |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `bootstrap` | `bootstrapServices()` — constructs all services |
| `routes` | `handleRequest()` — HTTP request routing |
| `ws` | `createWebSocketHandler()` — WebSocket handler |
| `db` | `getDb()`, `initDb()`, `closeDb()` — database lifecycle |
| `algochat` | `initAlgoChat()`, `wirePostInit()`, `switchNetwork()` |
| `events` | `wireEventBroadcasting()` — event system |
| `middleware` | `loadAuthConfig()`, `validateStartupSecurity()`, `checkWsAuth()` |
| `observability` | `createLogger()`, `httpRequestDuration`, `httpRequestsTotal` |
| `mcp` | `handleMcpHttpRequest()` — MCP HTTP endpoint |
| `openapi` | `handleOpenApiRoutes()` — API documentation |

### Consumed By

_(Nothing — this is the entry point)_

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-31 | corvid-agent | Initial spec |

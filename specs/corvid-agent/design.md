---
spec: corvid-agent.spec.md
sources:
  - server/index.ts
---

## Layout

Single entry-point file (`server/index.ts`). No page layout. The module is a linear startup script followed by a `Bun.serve()` call that owns the entire request/response lifecycle.

Request routing order (fast-path first):
1. Pre-flight OPTIONS (CORS)
2. `/api/health` — unauthenticated health check
3. `/metrics` — Prometheus metrics (internal)
4. `/api/audit` — audit log routes
5. `/api/permissions` — permission routes
6. `/mcp` — MCP HTTP transport (handled before static file serving)
7. `/api/docs` / `/api/openapi` — API documentation
8. `/api/ollama` — Ollama proxy routes
9. `handleRequest()` — all other API routes (auth-gated)
10. Static file serving — `GET` only, for unmatched paths

## Components

### Entry-Point Script (`server/index.ts`)

Owns startup and shutdown orchestration. Key subsystems wired here:

| Subsystem | Role |
|-----------|------|
| `loadAuthConfig()` + `validateStartupSecurity()` | Enforce secure config before any services start |
| `getDb()` + `initDb()` | Singleton SQLite connection + migration runner |
| `initRateLimiterDb(db)` | Attaches DB to rate limiter state |
| `initDiscordConfigFromEnv(db)` | Seeds Discord config from env vars |
| `bootstrapServices(db, startTime)` | Constructs all service objects (ProcessManager, WorkTask, AlgoChat, etc.) |
| `initAlgoChat()` + `wirePostInit()` | Blockchain messaging init with service wiring |
| `wireEventBroadcasting()` | Connects service events to WS broadcasting |
| `Bun.serve()` | HTTP + WebSocket server |

### WebSocket Upgrade Handler

`createWebSocketHandler(server, db, processManager, services)` — handles upgrades at the `upgrade` hook. Authentication (`checkWsAuth`) is enforced before upgrade completes.

### Graceful Shutdown

Registered via `process.on('SIGTERM', ...)` and `process.on('SIGINT', ...)`. Calls `logShutdownDiagnostics()`, stops the HTTP server (waits up to 30s for WS connections), stops all services in reverse order, then calls `closeDb()`.

## Tokens

| Env Var | Default | Description |
|---------|---------|-------------|
| `PORT` | `3000` | HTTP server listen port |
| `BIND_HOST` | `127.0.0.1` | Network interface to bind (never `0.0.0.0` in production) |
| `ADMIN_TOKEN` | _(required)_ | Bearer token for admin API access; absence causes exit(1) |
| `DATABASE_PATH` | `corvid-agent.db` | SQLite file path |
| `CLIENT_DIST` | `../client/dist/client/browser` | Angular static asset directory (relative to `server/`) |

## Assets

| Resource | Description |
|----------|-------------|
| `corvid-agent.db` | SQLite database file (created/migrated on startup) |
| `wallet-keystore.json` | Algorand wallet keys (read by AlgoChat init, path-protected) |
| Angular `dist/` | Pre-built client bundle served as static files |
| `/api/health` | Unauthenticated endpoint, used by load balancers and deploy scripts |

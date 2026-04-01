---
spec: corvid-agent.spec.md
---

## User Stories

- As an operator, I want the server to refuse to start with insecure configuration so that production is never accidentally exposed
- As a developer, I want clear startup diagnostics so I can debug initialization issues
- As an operator, I want graceful shutdown so in-flight requests complete before exit

## Acceptance Criteria

- Security configuration is validated before server starts via `validateStartupSecurity()`
- On security config error, server logs specific error and exits with code 1
- GitHub token is validated asynchronously on startup (does not block startup)
- Database is initialized via `getDb()` and file-based migrations run via `initDb()`
- Rate limiter DB is initialized after migrations complete
- Discord config is seeded from environment variables if not in database
- Services are bootstrapped via `bootstrapServices(db, startTime)`
- AlgoChat is initialized with `initAlgoChat()` after DB is ready
- HTTP server starts on `PORT` (default 3000) bound to `BIND_HOST` (default 127.0.0.1)
- WebSocket connections are authenticated via `checkWsAuth()`
- HTTP requests are routed via `handleRequest()` with full service injection
- MCP HTTP endpoint is available at `/mcp` via `handleMcpHttpRequest()`
- OpenAPI docs are served via `handleOpenApiRoutes()`
- Static client files are served from `CLIENT_DIST` for unmatched routes
- Graceful shutdown closes WebSocket connections and stops all services
- SIGTERM/SIGINT trigger shutdown diagnostics and cleanup

## Constraints

- Must validate security config before binding to any port
- Must not expose server with default/weak auth configuration
- Must complete database migrations before accepting connections
- Must handle WebSocket and HTTP on same port (Bun.serve)
- Must serve static client files as fallback (SPA behavior)

## Out of Scope

- Horizontal scaling/clustering (single instance design)
- Hot reloading (restart required for config changes)
- Kubernetes health probes (HTTP `/api/health` exists but not k8s-specific)

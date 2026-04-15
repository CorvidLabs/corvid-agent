---
spec: routes.spec.md
sources:
  - server/routes/index.ts
  - server/routes/projects.ts
  - server/routes/agents.ts
  - server/routes/sessions.ts
  - server/routes/councils.ts
  - server/routes/work-tasks.ts
---

## Module Structure

Fifty-plus route modules under `server/routes/`, each exporting a `handle*Routes(req, url, db, ...deps)` function that pattern-matches URL paths and returns `Response | null`. The barrel `index.ts` exports `handleRequest` which chains every handler in order.

**Request pipeline in `handleRequest`:**
1. CORS preflight (`OPTIONS` → 204)
2. Rate limiting (`initRateLimiterDb` / middleware)
3. Authentication (API key, cookie, or AlgoChat wallet)
4. Route dispatch (try each handler in registration order until one returns non-null)

## Key Classes and Functions

**`handleRequest(req, db, processManager, algochatBridge, ...services)`** — Main entry point wired from `server/index.ts`. Applies the full pipeline and returns the matching handler's response or 404.

**`RouteServices`** — Interface bundling all injectable service dependencies: `processManager`, `algochatBridge`, `scheduler`, `sandbox`, `performanceCollector`, `pluginRegistry`, `permissionBroker`, `reputationScorer`, etc. This is the DI mechanism for route handlers.

**Route handler convention** — Each handler file exports a single named function. Handlers use `url.pathname.startsWith('/api/<resource>')` for prefix matching. `null` return means "not my route, try the next handler."

**`getAllowedRoots()` / `isPathAllowed()`** — Directory traversal protection for the `projects.ts` browse endpoint. Uses configurable root allowlist to prevent agents from reading arbitrary filesystem paths.

## Configuration Values

| Env Var | Default | Description |
|---------|---------|-------------|
| `AUTH_DISABLED` | `"false"` | Bypass authentication for development |
| `RATE_LIMIT_ENABLED` | `"true"` | Enable/disable rate limiting |
| `CORS_ORIGINS` | `*` | Allowed CORS origins |

## Related Resources

**Auth middleware:** `server/middleware/auth.ts` — validates API keys and session tokens.
**Rate limit middleware:** `server/middleware/rate-limit.ts` — per-IP and per-key rate limiting.

**Consumed by:** `server/index.ts` — registers `handleRequest` with the Bun HTTP server.

**Route modules by domain:**

| Domain | Handler | File |
|--------|---------|------|
| Sessions | `handleSessionRoutes` | sessions.ts |
| Agents | `handleAgentRoutes` | agents.ts |
| Projects | `handleProjectRoutes` | projects.ts |
| Schedules | `handleScheduleRoutes` | schedules.ts |
| Reputation | `handleReputationRoutes` | reputation.ts |
| Sandbox | `handleSandboxRoutes` | sandbox.ts |
| Permissions | `handlePermissionRoutes` | permissions.ts |
| Plugins | `handlePluginRoutes` | plugins.ts |
| Performance | `handlePerformanceRoutes` | performance.ts |
| Health | `handleHealthRoutes` | health.ts |

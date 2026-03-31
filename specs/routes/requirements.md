---
spec: routes.spec.md
---

## User Stories

- As an agent operator, I want a unified REST API for managing projects, agents, sessions, and councils so that all platform operations are accessible through a single HTTP interface
- As an agent developer, I want every request to pass through a consistent pipeline (CORS, rate limit, auth, dispatch) so that security and observability are applied uniformly
- As an external agent, I want public health and agent-card endpoints that bypass authentication so that monitoring probes and A2A discovery work without credentials
- As an agent operator, I want marketplace, reputation, and billing endpoints so that I can list agents, track trust scores, and manage subscriptions via API
- As a platform administrator, I want audit log query endpoints so that compliance reviews can retrieve immutable operation records
- As an agent developer, I want GitHub webhook endpoints with HMAC-SHA256 validation so that only authentic GitHub events trigger agent workflows
- As an agent operator, I want schedule, workflow, and work-task endpoints so that I can create and monitor automated agent activities through the dashboard
- As a team agent, I want A2A task protocol endpoints so that agents can invoke each other over HTTP with structured task requests

## Acceptance Criteria

- `handleRequest()` applies the pipeline in order: CORS preflight (OPTIONS returns 204) > rate limiting (exempt: `/api/health`, `/webhooks/github`, `/ws`) > authentication (exempt: `/api/health`, `/.well-known/agent-card.json`) > route dispatch > CORS header application
- Unhandled exceptions in any route handler return a generic 500 JSON response with no error details leaked
- Route dispatch uses sequential handler chain; the first handler returning a non-null Response wins
- `handleProjectRoutes` supports GET/POST/PUT/DELETE for `/api/projects` and `GET /api/browse-dirs` with allowlist filtering via `isPathAllowed()`
- `handleAgentRoutes` supports agent CRUD, balance queries, and invocation endpoints under `/api/agents`
- `handleSessionRoutes` supports session CRUD, message listing, and start/stop under `/api/sessions`
- `handleCouncilRoutes` supports council CRUD, launch, and deliberation; re-exports `launchCouncil`, `waitForSessions`, and event subscription functions
- `handleHealthRoutes` responds to `GET /api/health` with liveness and readiness status without authentication
- `handleA2ARoutes` handles agent-to-agent task protocol at `/.well-known/agent-card.json` and task submission endpoints
- `handleWebhookRoutes` validates incoming GitHub webhooks with HMAC-SHA256 signature via `handleGitHubWebhook()`
- `handleMarketplaceRoutes` supports listing CRUD, review creation, federation instance registration, and subscription management
- `handleReputationRoutes` exposes reputation scores, events, and attestation queries
- `handleAuditRoutes` validates query parameters with `AuditQuerySchema` (Zod) before querying the audit log
- `handleScheduleRoutes` supports schedule CRUD, execution listing, and manual trigger
- `handleWorkflowRoutes` supports workflow CRUD, run listing, and action dispatch
- `handleBrainViewerRoutes` exposes agent memory inspection endpoints for longterm and shortterm tiers
- `handleBuddyRoutes` manages buddy pairings and buddy session CRUD
- `handleOpenRouterRoutes` provides OpenRouter model discovery with pricing information
- `handleToolCatalogRoutes` returns discoverable MCP tool catalog in flat and grouped formats
- All route handlers follow the signature `(req, url, db, ...deps) => Response | null`

## Constraints

- All route modules are organized as focused single-file handlers in `server/routes/`; currently 56 route modules
- Route handlers must return `Response | null`; null passes to the next handler in the chain
- CORS headers are applied to every response, including error responses
- GitHub webhook endpoints must validate HMAC-SHA256 signatures before processing payloads
- The `RouteServices` interface bundles all injectable service dependencies to avoid long parameter lists
- Admin endpoints (e.g., `POST /api/algochat/network`) are gated via `requiresAdminRole()` from the middleware module
- Per-repo rate limiting on webhook endpoints prevents abuse via `_resetRepoRateMap()` (test-only)

## Out of Scope

- WebSocket upgrade handling (done in `server/index.ts` before route dispatch)
- Static file serving or SPA fallback (handled by the client build)
- GraphQL or gRPC endpoints
- Route-level caching or ETag support
- API versioning (all endpoints are unversioned under `/api/`)

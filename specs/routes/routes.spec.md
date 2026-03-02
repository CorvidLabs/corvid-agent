---
module: routes
version: 1
status: draft
files:
  - server/routes/index.ts
  - server/routes/projects.ts
  - server/routes/agents.ts
  - server/routes/sessions.ts
  - server/routes/councils.ts
  - server/routes/work-tasks.ts
  - server/routes/mcp-api.ts
  - server/routes/allowlist.ts
  - server/routes/analytics.ts
  - server/routes/system-logs.ts
  - server/routes/settings.ts
  - server/routes/schedules.ts
  - server/routes/webhooks.ts
  - server/routes/mention-polling.ts
  - server/routes/workflows.ts
  - server/routes/sandbox.ts
  - server/routes/marketplace.ts
  - server/routes/reputation.ts
  - server/routes/billing.ts
  - server/routes/auth-flow.ts
  - server/routes/a2a.ts
  - server/routes/plugins.ts
  - server/routes/personas.ts
  - server/routes/skill-bundles.ts
  - server/routes/mcp-servers.ts
  - server/routes/exam.ts
  - server/routes/ollama.ts
  - server/routes/audit.ts
  - server/routes/github-allowlist.ts
  - server/routes/performance.ts
  - server/routes/slack.ts
  - server/routes/tenants.ts
  - server/routes/usage.ts
db_tables: []
depends_on:
  - specs/middleware/auth.spec.md
  - specs/middleware/rate-limit.spec.md
---

# HTTP Routes Layer

## Purpose

Unified HTTP route dispatch layer for the CorvidAgent server. The central `handleRequest` function in `server/routes/index.ts` receives every HTTP request and applies a pipeline: CORS preflight → rate limiting → authentication → route dispatch. Route handlers are organized into 32 focused modules, each exporting a handler function that pattern-matches URL paths and returns a Response or null (to pass to the next handler). Some routes are handled inline in index.ts.

## Public API

### Exported Functions (index.ts)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `handleRequest` | `(req, db, processManager, algochatBridge, ...services)` | `Promise<Response \| null>` | Main entry point — pipeline of CORS, rate limit, auth, route dispatch |

### Exported Types (index.ts)

| Type | Description |
|------|-------------|
| `RouteServices` | Interface bundling all injectable service dependencies for route handlers |
| `NetworkSwitchFn` | `(network: 'testnet' \| 'mainnet') => Promise<void>` — callback for AlgoChat network switching |

### Route Handler Pattern

Each route module exports a function with the signature:

```typescript
function handleXxxRoutes(req: Request, url: URL, db: Database, ...deps): Response | null
```

Handlers return `Response` for matched routes or `null` to pass to the next handler. Some handlers are `async` (sessions, settings, billing, a2a, exam).

## Request Pipeline

Every request passes through these stages in order:

1. **CORS preflight**: OPTIONS requests return 204 with configured CORS headers
2. **Rate limiting**: `checkRateLimit` — exempt paths: `/api/health`, `/webhooks/github`, `/ws`
3. **Authentication**: `checkHttpAuth` — exempt paths: `/api/health`, `/.well-known/agent-card.json`
4. **Route dispatch**: Sequential handler chain — first non-null response wins
5. **CORS application**: Response headers are augmented with CORS headers
6. **Error boundary**: Unhandled exceptions return generic 500 JSON (no error details leaked)

## Endpoint Table

### Public Endpoints (No Authentication)

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/health` | (built-in) | Health check for monitoring probes |
| GET | `/.well-known/agent-card.json` | (built-in) | A2A agent card discovery |
| POST | `/webhooks/github` | webhooks.ts | GitHub webhook receiver (HMAC-SHA256 validated) |
| POST | `/webhooks/stripe` | billing.ts | Stripe webhook receiver (signature validated) |
| POST | `/api/auth/device` | auth-flow.ts | Initiate device authorization flow |
| POST | `/api/auth/device/token` | auth-flow.ts | Poll for device token |
| POST | `/api/auth/device/authorize` | auth-flow.ts | Authorize a device (from web UI) |
| GET | `/api/auth/verify` | auth-flow.ts | Device authorization verification page (HTML) |

### Projects

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/browse-dirs` | projects.ts | List directory contents with allowlist filtering |
| GET | `/api/projects` | projects.ts | List all projects |
| POST | `/api/projects` | projects.ts | Create new project |
| GET | `/api/projects/:id` | projects.ts | Get single project |
| PUT | `/api/projects/:id` | projects.ts | Update project |
| DELETE | `/api/projects/:id` | projects.ts | Delete project |
| GET | `/api/projects/:id/skills` | skill-bundles.ts | List skill bundles assigned to project |
| POST | `/api/projects/:id/skills` | skill-bundles.ts | Assign skill bundle to project |
| DELETE | `/api/projects/:id/skills/:bundleId` | skill-bundles.ts | Unassign skill bundle from project |

### Agents

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/agents` | agents.ts | List all agents |
| POST | `/api/agents` | agents.ts | Create new agent |
| GET | `/api/agents/:id` | agents.ts | Get single agent |
| PUT | `/api/agents/:id` | agents.ts | Update agent |
| DELETE | `/api/agents/:id` | agents.ts | Delete agent |
| GET | `/api/agents/:id/balance` | agents.ts | Get agent wallet balance |
| POST | `/api/agents/:id/fund` | agents.ts | Fund agent wallet |
| POST | `/api/agents/:id/invoke` | agents.ts | Invoke agent to send message |
| GET | `/api/agents/:id/messages` | agents.ts | List agent messages |
| GET | `/api/agents/:id/agent-card` | agents.ts | Get A2A agent card for agent |
| GET | `/api/agents/:id/persona` | personas.ts | Get agent persona |
| PUT | `/api/agents/:id/persona` | personas.ts | Create/update agent persona |
| DELETE | `/api/agents/:id/persona` | personas.ts | Delete agent persona |
| GET | `/api/agents/:id/spending` | agents.ts | Get agent daily spending vs cap |
| PUT | `/api/agents/:id/spending-cap` | agents.ts | Set agent daily spending cap |
| DELETE | `/api/agents/:id/spending-cap` | agents.ts | Remove agent spending cap |
| GET | `/api/agents/:id/skills` | skill-bundles.ts | List skill bundles assigned to agent |
| POST | `/api/agents/:id/skills` | skill-bundles.ts | Assign skill bundle to agent |
| DELETE | `/api/agents/:id/skills/:bundleId` | skill-bundles.ts | Unassign skill bundle from agent |

### Sessions

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/sessions` | sessions.ts | List sessions (optional `projectId` filter) |
| POST | `/api/sessions` | sessions.ts | Create and optionally start a session |
| GET | `/api/sessions/:id` | sessions.ts | Get single session |
| PUT | `/api/sessions/:id` | sessions.ts | Update session |
| DELETE | `/api/sessions/:id` | sessions.ts | Delete session |
| GET | `/api/sessions/:id/messages` | sessions.ts | List session messages |
| POST | `/api/sessions/:id/stop` | sessions.ts | Stop running session |
| POST | `/api/sessions/:id/resume` | index.ts (inline) | Resume paused session |

### Councils

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/councils` | councils.ts | List all councils |
| POST | `/api/councils` | councils.ts | Create new council |
| GET | `/api/councils/:id` | councils.ts | Get single council |
| PUT | `/api/councils/:id` | councils.ts | Update council |
| DELETE | `/api/councils/:id` | councils.ts | Delete council |
| POST | `/api/councils/:id/launch` | councils.ts | Launch council deliberation |
| GET | `/api/councils/:id/launches` | councils.ts | List launches for council |
| GET | `/api/council-launches` | councils.ts | List all council launches |
| GET | `/api/council-launches/:id` | councils.ts | Get single council launch |
| GET | `/api/council-launches/:id/logs` | councils.ts | Get council launch logs |
| GET | `/api/council-launches/:id/discussion-messages` | councils.ts | Get discussion messages |
| POST | `/api/council-launches/:id/abort` | councils.ts | Abort council launch |
| POST | `/api/council-launches/:id/review` | councils.ts | Trigger peer review stage |
| POST | `/api/council-launches/:id/synthesize` | councils.ts | Trigger synthesis stage |
| POST | `/api/council-launches/:id/chat` | councils.ts | Follow-up chat on completed council |

### Work Tasks

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/work-tasks` | work-tasks.ts | List work tasks (optional `agentId` filter) |
| POST | `/api/work-tasks` | work-tasks.ts | Create new work task |
| GET | `/api/work-tasks/:id` | work-tasks.ts | Get single work task |
| POST | `/api/work-tasks/:id/cancel` | work-tasks.ts | Cancel running work task |

### Schedules

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/schedules` | schedules.ts | List schedules (optional `agentId` filter) |
| POST | `/api/schedules` | schedules.ts | Create new schedule |
| GET | `/api/schedules/:id` | schedules.ts | Get single schedule |
| PUT | `/api/schedules/:id` | schedules.ts | Update schedule |
| DELETE | `/api/schedules/:id` | schedules.ts | Delete schedule |
| GET | `/api/schedules/:id/executions` | schedules.ts | List executions for a schedule |
| GET | `/api/schedule-executions` | schedules.ts | List all schedule executions |
| GET | `/api/schedule-executions/:id` | schedules.ts | Get single execution |
| POST | `/api/schedules/:id/trigger` | schedules.ts | Manually trigger a schedule |
| POST | `/api/schedules/bulk` | schedules.ts | Bulk pause/resume/delete schedules |
| POST | `/api/schedule-executions/:id/cancel` | schedules.ts | Cancel a running execution |
| POST | `/api/schedule-executions/:id/resolve` | schedules.ts | Approve/deny scheduled execution |
| GET | `/api/scheduler/health` | schedules.ts | Get scheduler health/stats |
| GET | `/api/github/status` | schedules.ts | Get GitHub configuration status |

### Webhooks

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/webhooks` | webhooks.ts | List webhook registrations |
| POST | `/api/webhooks` | webhooks.ts | Create webhook registration |
| GET | `/api/webhooks/:id` | webhooks.ts | Get single webhook registration |
| PUT | `/api/webhooks/:id` | webhooks.ts | Update webhook registration |
| DELETE | `/api/webhooks/:id` | webhooks.ts | Delete webhook registration |
| GET | `/api/webhooks/deliveries` | webhooks.ts | List all recent deliveries |
| GET | `/api/webhooks/:id/deliveries` | webhooks.ts | List deliveries for registration |

### Mention Polling

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/mention-polling` | mention-polling.ts | List polling configs |
| POST | `/api/mention-polling` | mention-polling.ts | Create polling config |
| GET | `/api/mention-polling/stats` | mention-polling.ts | Get polling service stats |
| GET | `/api/mention-polling/:id` | mention-polling.ts | Get single polling config |
| PUT | `/api/mention-polling/:id` | mention-polling.ts | Update polling config |
| DELETE | `/api/mention-polling/:id` | mention-polling.ts | Delete polling config |
| GET | `/api/mention-polling/:id/activity` | mention-polling.ts | Get polling activity for config |

### Workflows

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/workflows` | workflows.ts | List workflows |
| POST | `/api/workflows` | workflows.ts | Create new workflow |
| GET | `/api/workflows/:id` | workflows.ts | Get single workflow |
| PUT | `/api/workflows/:id` | workflows.ts | Update workflow |
| DELETE | `/api/workflows/:id` | workflows.ts | Delete workflow |
| POST | `/api/workflows/:id/trigger` | workflows.ts | Trigger workflow execution |
| GET | `/api/workflows/:id/runs` | workflows.ts | List runs for a workflow |
| GET | `/api/workflow-runs` | workflows.ts | List all workflow runs |
| GET | `/api/workflow-runs/:id` | workflows.ts | Get single run with node runs |
| POST | `/api/workflow-runs/:id/action` | workflows.ts | Pause/resume/cancel a run |
| GET | `/api/workflow-runs/:id/nodes` | workflows.ts | List node runs for a run |
| GET | `/api/workflows/health` | workflows.ts | Get workflow service health |

### Sandbox

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/sandbox/stats` | sandbox.ts | Get sandbox pool statistics |
| GET | `/api/sandbox/policies` | sandbox.ts | List all sandbox policies |
| GET | `/api/sandbox/policies/:agentId` | sandbox.ts | Get policy for agent |
| PUT | `/api/sandbox/policies/:agentId` | sandbox.ts | Set/update agent policy |
| DELETE | `/api/sandbox/policies/:agentId` | sandbox.ts | Delete agent policy |
| POST | `/api/sandbox/assign` | sandbox.ts | Assign container to session |
| POST | `/api/sandbox/release/:sessionId` | sandbox.ts | Release container |

### Marketplace

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/marketplace/search` | marketplace.ts | Search marketplace |
| GET | `/api/marketplace/listings` | marketplace.ts | List all listings |
| POST | `/api/marketplace/listings` | marketplace.ts | Create listing |
| GET | `/api/marketplace/listings/:id` | marketplace.ts | Get single listing |
| PUT | `/api/marketplace/listings/:id` | marketplace.ts | Update listing |
| DELETE | `/api/marketplace/listings/:id` | marketplace.ts | Delete listing |
| POST | `/api/marketplace/listings/:id/use` | marketplace.ts | Record listing use |
| GET | `/api/marketplace/listings/:id/reviews` | marketplace.ts | Get reviews for listing |
| POST | `/api/marketplace/listings/:id/reviews` | marketplace.ts | Create review |
| DELETE | `/api/marketplace/reviews/:id` | marketplace.ts | Delete review |
| GET | `/api/marketplace/federation/instances` | marketplace.ts | List federation instances |
| POST | `/api/marketplace/federation/instances` | marketplace.ts | Register federation instance |
| POST | `/api/marketplace/federation/sync` | marketplace.ts | Sync all federated listings |
| DELETE | `/api/marketplace/federation/instances/:url` | marketplace.ts | Remove federation instance |
| GET | `/api/marketplace/federated` | marketplace.ts | Get federated listings |

### Reputation

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/reputation/scores` | reputation.ts | Get all scores (auto-computes stale, 5-min threshold) |
| POST | `/api/reputation/scores` | reputation.ts | Force recompute all agent scores |
| GET | `/api/reputation/scores/:agentId` | reputation.ts | Get/compute score for agent |
| POST | `/api/reputation/scores/:agentId` | reputation.ts | Force recompute score for agent |
| POST | `/api/reputation/events` | reputation.ts | Record reputation event |
| GET | `/api/reputation/events/:agentId` | reputation.ts | Get events for agent |
| GET | `/api/reputation/attestation/:agentId` | reputation.ts | Get attestation for agent |
| GET | `/api/reputation/identities` | reputation.ts | List all identity verifications |
| GET | `/api/reputation/identity/:agentId` | reputation.ts | Get identity verification for agent |
| PUT | `/api/reputation/identity/:agentId` | reputation.ts | Set identity verification tier |
| POST | `/api/reputation/attestation/:agentId` | reputation.ts | Create reputation attestation |

### Billing

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/billing/subscription/:tenantId` | billing.ts | Get subscription |
| POST | `/api/billing/subscription` | billing.ts | Create subscription |
| POST | `/api/billing/subscription/:tenantId/cancel` | billing.ts | Cancel subscription |
| GET | `/api/billing/usage/:tenantId` | billing.ts | Get usage data |
| GET | `/api/billing/invoices/:tenantId` | billing.ts | Get invoices for tenant |
| GET | `/api/billing/calculate` | billing.ts | Calculate cost for credits |

### A2A (Agent-to-Agent)

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| POST | `/a2a/tasks/send` | a2a.ts | Create and start A2A task |
| GET | `/a2a/tasks/:id` | a2a.ts | Poll A2A task status/result |

### MCP API

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| POST | `/api/mcp/send-message` | mcp-api.ts | Send agent-to-agent message |
| POST | `/api/mcp/save-memory` | mcp-api.ts | Save agent memory |
| POST | `/api/mcp/recall-memory` | mcp-api.ts | Recall agent memory |
| GET | `/api/mcp/list-agents` | mcp-api.ts | List available agents |

### MCP Server Configs

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/mcp-servers` | mcp-servers.ts | List MCP server configs |
| POST | `/api/mcp-servers` | mcp-servers.ts | Create MCP server config |
| PUT | `/api/mcp-servers/:id` | mcp-servers.ts | Update MCP server config |
| DELETE | `/api/mcp-servers/:id` | mcp-servers.ts | Delete MCP server config |
| POST | `/api/mcp-servers/:id/test` | mcp-servers.ts | Test MCP server connection |

### Plugins

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/plugins` | plugins.ts | List loaded and available plugins |
| POST | `/api/plugins/load` | plugins.ts | Load a plugin |
| POST | `/api/plugins/:name/unload` | plugins.ts | Unload a plugin |
| POST | `/api/plugins/:name/grant` | plugins.ts | Grant capability to plugin |
| POST | `/api/plugins/:name/revoke` | plugins.ts | Revoke capability from plugin |

### Skill Bundles

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/skill-bundles` | skill-bundles.ts | List all skill bundles |
| POST | `/api/skill-bundles` | skill-bundles.ts | Create skill bundle |
| GET | `/api/skill-bundles/:id` | skill-bundles.ts | Get single bundle |
| PUT | `/api/skill-bundles/:id` | skill-bundles.ts | Update bundle |
| DELETE | `/api/skill-bundles/:id` | skill-bundles.ts | Delete bundle |

### Allowlist

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/allowlist` | allowlist.ts | List all allowlist entries |
| POST | `/api/allowlist` | allowlist.ts | Add address to allowlist |
| PUT | `/api/allowlist/:address` | allowlist.ts | Update allowlist entry |
| DELETE | `/api/allowlist/:address` | allowlist.ts | Remove from allowlist |

### Analytics & Logs

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/analytics/overview` | analytics.ts | Overview stats (sessions, costs, agents, projects) |
| GET | `/api/analytics/spending` | analytics.ts | Daily spending data |
| GET | `/api/analytics/sessions` | analytics.ts | Session statistics |
| GET | `/api/system-logs` | system-logs.ts | Aggregated system logs |
| GET | `/api/system-logs/credit-transactions` | system-logs.ts | Credit transaction ledger |

### Settings

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/settings` | settings.ts | Get all settings (credits config, system stats) |
| PUT | `/api/settings/credits` | settings.ts | Update credit configuration |
| POST | `/api/settings/api-key/rotate` | settings.ts | Rotate the API key |
| GET | `/api/settings/api-key/status` | settings.ts | Get API key rotation and expiry status |

### Ollama

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/ollama/status` | ollama.ts | Get Ollama server status |
| GET | `/api/ollama/models` | ollama.ts | List all Ollama models |
| GET | `/api/ollama/models/running` | ollama.ts | List currently loaded models |
| POST | `/api/ollama/models/pull` | ollama.ts | Pull (download) a model |
| DELETE | `/api/ollama/models` | ollama.ts | Delete a model |
| GET | `/api/ollama/models/pull/status` | ollama.ts | Get active pull statuses |
| GET | `/api/ollama/library` | ollama.ts | Search Ollama library |

### Exam

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| POST | `/api/exam/run` | exam.ts | Run live model exam |
| GET | `/api/exam/categories` | exam.ts | List exam categories |

### Inline Routes (index.ts)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/escalation-queue` | List pending escalation requests |
| POST | `/api/escalation-queue/:id/resolve` | Approve/deny escalation request |
| GET | `/api/operational-mode` | Get operational mode |
| POST | `/api/operational-mode` | Set operational mode |
| GET | `/api/feed/history` | Get agent and algochat message history |
| GET | `/api/algochat/status` | Get AlgoChat status |
| POST | `/api/algochat/network` | Switch AlgoChat network |
| POST | `/api/algochat/conversations` | List conversations |
| GET | `/api/algochat/psk-exchange` | Get PSK exchange URI |
| POST | `/api/algochat/psk-exchange` | Generate new PSK exchange URI |
| GET | `/api/algochat/psk-contacts` | List PSK contacts |
| POST | `/api/algochat/psk-contacts` | Create new PSK contact |
| PATCH | `/api/algochat/psk-contacts/:id` | Rename PSK contact |
| DELETE | `/api/algochat/psk-contacts/:id` | Cancel PSK contact |
| GET | `/api/algochat/psk-contacts/:id/qr` | Get QR URI for PSK contact |
| POST | `/api/backup` | Create database backup |
| POST | `/api/memories/backfill` | Backfill memories to on-chain |
| POST | `/api/selftest/run` | Run self-test suite |
| GET | `/api/wallets/summary` | Get wallet summaries |
| GET | `/api/wallets/:address/messages` | Get messages for wallet |
| POST | `/api/wallets/:address/credits` | Grant credits to a wallet (admin) |

### GitHub Allowlist

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/github-allowlist` | github-allowlist.ts | List GitHub username allowlist entries |
| POST | `/api/github-allowlist` | github-allowlist.ts | Add GitHub username to allowlist |
| PUT | `/api/github-allowlist/:username` | github-allowlist.ts | Update allowlist entry label |
| DELETE | `/api/github-allowlist/:username` | github-allowlist.ts | Remove username from allowlist |

### Audit

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/audit-log` | audit.ts | Query immutable audit log (admin-only) |

### Performance

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/performance/snapshot` | performance.ts | Current performance snapshot |
| GET | `/api/performance/trends` | performance.ts | Time-series performance data |
| GET | `/api/performance/regressions` | performance.ts | Regression detection |
| GET | `/api/performance/report` | performance.ts | Full performance report |
| GET | `/api/performance/metrics` | performance.ts | List available metric names |
| POST | `/api/performance/collect` | performance.ts | Trigger manual metrics collection |

### Usage

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/usage/summary` | usage.ts | Per-schedule usage aggregates + anomaly flags |
| GET | `/api/usage/daily` | usage.ts | Per-day usage breakdown |
| GET | `/api/usage/anomalies` | usage.ts | Current anomaly flags |
| GET | `/api/usage/schedule/:id` | usage.ts | Detailed usage for a specific schedule |

### Tenants

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| POST | `/api/tenants/register` | tenants.ts | Register a new tenant (public) |
| GET | `/api/tenants/me` | tenants.ts | Get current tenant info |
| GET | `/api/tenants/me/members` | tenants.ts | List tenant members |
| POST | `/api/tenants/me/members` | tenants.ts | Add a tenant member |
| DELETE | `/api/tenants/me/members/:keyHash` | tenants.ts | Remove a tenant member |

### Slack

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| POST | `/slack/events` | slack.ts | Slack Events API callbacks (HMAC validated) |

## Invariants

1. **Sequential handler chain**: Route handlers are tried in a fixed order defined in `handleRoutes`. The first handler to return a non-null Response wins. Remaining handlers are not invoked
2. **Global CORS**: Every response (including errors and 429 rate limits) gets CORS headers applied via `applyCors`
3. **Global error boundary**: Any unhandled exception in route handlers is caught by the outer try/catch in `handleRequest` and returns a generic 500 JSON response. Error details are logged server-side but never included in the response
4. **Rate limiting before auth**: Rate limiting runs before authentication to prevent unauthenticated clients from consuming auth resources
5. **Auth before dispatch**: All routes (except explicitly public ones) require authentication before reaching the handler
6. **Module-level singletons**: `authConfig` and `rateLimiter` are initialized once at module load time, not per-request
7. **Service null safety**: Route handlers that depend on optional services (workTaskService, schedulerService, etc.) return 503 when the service is null/unavailable
8. **Validation via Zod**: Mutation endpoints parse request bodies using Zod schemas from `server/lib/validation.ts`. Invalid input returns 400 with error details
9. **Consistent JSON responses**: All routes use `json()` helper from `server/lib/response.ts` for consistent Content-Type and serialization
10. **GitHub webhook validation**: The `/webhooks/github` endpoint validates the `X-Hub-Signature-256` HMAC header independently of the API key auth system
11. **Stripe webhook validation**: The `/webhooks/stripe` endpoint validates the `stripe-signature` header independently of the API key auth system
12. **Auth flow is unauthenticated**: Device authorization endpoints (`/api/auth/device/*`) bypass auth to support CLI login bootstrapping

## Behavioral Examples

### Scenario: Successful authenticated request

- **Given** API_KEY is configured and a valid Bearer token is provided
- **When** a GET request to `/api/projects` is made
- **Then** CORS preflight passes, rate limit passes, auth passes, `handleProjectRoutes` returns the projects list with CORS headers

### Scenario: Rate-limited request

- **Given** an IP has exceeded the mutation rate limit
- **When** a POST request is made from that IP
- **Then** a 429 response is returned with `Retry-After` header and CORS headers, before auth is checked

### Scenario: Unauthenticated request

- **Given** API_KEY is configured and no Authorization header is provided
- **When** a GET request to `/api/agents` is made
- **Then** a 401 response is returned with `WWW-Authenticate: Bearer` header

### Scenario: Service unavailable

- **Given** the workflow service is not initialized (null)
- **When** a POST request to `/api/workflows/wf1/trigger` is made
- **Then** the workflow route handler returns 503 with `"Workflow service not available"`

### Scenario: Unhandled exception in handler

- **Given** a route handler throws an unexpected error
- **When** the error propagates to `handleRequest`
- **Then** the error is logged server-side and a generic 500 response is returned: `{ "error": "Internal server error", "timestamp": "..." }`

## Error Cases

| Condition | Behavior |
|-----------|----------|
| No matching route | `handleRequest` returns null (server returns 404 or static file) |
| Rate limit exceeded | 429 with JSON body and `Retry-After` header |
| Missing Authorization header | 401 with `WWW-Authenticate: Bearer` |
| Invalid API key | 403 with `"Invalid API key"` |
| Invalid request body (Zod) | 400 with validation error details |
| Optional service is null | 503 with `"{service} not available"` |
| Unhandled handler error | 500 with generic `"Internal server error"` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/middleware/auth.ts` | `loadAuthConfig`, `checkHttpAuth`, `buildCorsHeaders`, `applyCors` |
| `server/middleware/rate-limit.ts` | `RateLimiter`, `loadRateLimitConfig`, `checkRateLimit` |
| `server/lib/response.ts` | `json`, `handleRouteError`, `safeNumParam` |
| `server/lib/validation.ts` | Zod schemas, `parseBodyOrThrow`, `ValidationError` |
| `server/process/manager.ts` | `ProcessManager` — session resume, approval management |
| `server/db/*` | Various DB functions used by route handlers |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/index.ts` | `handleRequest` — wired into Bun server's `fetch` handler |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-20 | corvid-agent | Initial spec |
| 2026-02-21 | corvid-agent | Add POST /api/reputation/scores for bulk recompute; update GET /scores description to reflect auto-compute behavior |

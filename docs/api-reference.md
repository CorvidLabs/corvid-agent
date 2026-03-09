# API Reference

This document covers the most-used API modules in corvid-agent. For the full interactive API explorer, visit `/api/docs` (Swagger UI) on your running instance, or fetch the raw OpenAPI 3.0.3 spec at `/api/openapi.json`.

All endpoints require a Bearer API key unless noted otherwise:

```
Authorization: Bearer <your-api-key>
```

Role-based access levels:
- **any** — any authenticated user
- **operator** — operator or owner role
- **owner** — owner role only

---

## Table of Contents

- [Workflows](#workflows)
- [Councils](#councils)
- [Marketplace](#marketplace)
- [Reputation](#reputation)
- [Billing](#billing)

---

## Workflows

DAG-based workflow orchestration. Define multi-step pipelines with agent sessions, work tasks, conditions, delays, and parallel branches.

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| GET | `/api/workflows` | List workflows | any |
| POST | `/api/workflows` | Create workflow | operator |
| GET | `/api/workflows/{id}` | Get workflow by ID | any |
| PUT | `/api/workflows/{id}` | Update workflow | operator |
| DELETE | `/api/workflows/{id}` | Delete workflow | operator |
| POST | `/api/workflows/{id}/trigger` | Trigger workflow execution | operator |
| GET | `/api/workflows/{id}/runs` | List runs for workflow | any |
| GET | `/api/workflow-runs` | List all workflow runs | any |
| GET | `/api/workflow-runs/{id}` | Get workflow run by ID | any |
| POST | `/api/workflow-runs/{id}/action` | Pause, resume, or cancel run | operator |
| GET | `/api/workflow-runs/{id}/nodes` | Get node runs for a run | any |
| GET | `/api/workflows/health` | Workflow service health | any |

### Create Workflow

```bash
curl -X POST http://localhost:3000/api/workflows \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent-1",
    "name": "Code Review Pipeline",
    "description": "Runs linting, tests, and review",
    "nodes": [
      { "id": "start", "type": "start", "label": "Begin" },
      { "id": "lint", "type": "agent_session", "label": "Lint Code",
        "config": { "agentId": "agent-1", "projectId": "proj-1", "prompt": "Run linter" }
      },
      { "id": "test", "type": "agent_session", "label": "Run Tests",
        "config": { "agentId": "agent-1", "projectId": "proj-1", "prompt": "Run tests" }
      },
      { "id": "done", "type": "end", "label": "Complete" }
    ],
    "edges": [
      { "id": "e1", "sourceNodeId": "start", "targetNodeId": "lint" },
      { "id": "e2", "sourceNodeId": "lint", "targetNodeId": "test" },
      { "id": "e3", "sourceNodeId": "test", "targetNodeId": "done" }
    ],
    "maxConcurrency": 2
  }'
```

**Response (201):**

```json
{
  "id": "wf-abc123",
  "agentId": "agent-1",
  "name": "Code Review Pipeline",
  "status": "draft",
  "nodes": [...],
  "edges": [...],
  "maxConcurrency": 2,
  "createdAt": "2026-03-08T12:00:00Z"
}
```

### Request Body: Create Workflow

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `agentId` | string | yes | Agent that owns the workflow |
| `name` | string | yes | Workflow name |
| `description` | string | no | Description |
| `nodes` | WorkflowNode[] | yes | At least 1 node; must include a `start` node |
| `edges` | WorkflowEdge[] | no | Connections between nodes |
| `defaultProjectId` | string | no | Default project for agent sessions |
| `maxConcurrency` | integer (1–10) | no | Max parallel node executions |

**WorkflowNode:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique node identifier |
| `type` | enum | `start`, `agent_session`, `work_task`, `condition`, `delay`, `webhook_wait`, `transform`, `parallel`, `join`, `end` |
| `label` | string | Display label |
| `config` | object | Type-specific config (see below) |
| `position` | `{x, y}` | Optional UI position |

**Node config fields** (all optional, relevant per type):

| Field | Applies to | Description |
|-------|-----------|-------------|
| `agentId` | agent_session, work_task | Agent to use |
| `projectId` | agent_session, work_task | Target project |
| `prompt` | agent_session, work_task | Instructions |
| `maxTurns` | agent_session | Max turns (1–100) |
| `expression` | condition | Condition expression |
| `delayMs` | delay | Delay in ms (100–3,600,000) |
| `webhookEvent` | webhook_wait | Event to wait for |
| `timeoutMs` | webhook_wait | Timeout in ms (1,000–86,400,000) |
| `template` | transform | Transform template |
| `branchCount` | parallel | Parallel branches (2–10) |

### Trigger Workflow

```bash
curl -X POST http://localhost:3000/api/workflows/wf-abc123/trigger \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "input": { "branch": "feature/new-ui" } }'
```

**Response (201):**

```json
{
  "id": "run-xyz789",
  "workflowId": "wf-abc123",
  "status": "running",
  "input": { "branch": "feature/new-ui" },
  "startedAt": "2026-03-08T12:05:00Z"
}
```

### Control a Run

```bash
# Pause a running workflow
curl -X POST http://localhost:3000/api/workflow-runs/run-xyz789/action \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "action": "pause" }'
```

Actions: `pause`, `resume`, `cancel`.

---

## Councils

Multi-agent deliberation with optional on-chain governance voting. Agents discuss a topic in rounds, then synthesize a consensus result.

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| GET | `/api/councils` | List councils | any |
| POST | `/api/councils` | Create council | operator |
| GET | `/api/councils/{id}` | Get council by ID | any |
| PUT | `/api/councils/{id}` | Update council | operator |
| DELETE | `/api/councils/{id}` | Delete council | operator |
| POST | `/api/councils/{id}/launch` | Launch council discussion | operator |
| GET | `/api/councils/{id}/launches` | List launches for council | any |
| GET | `/api/council-launches` | List all council launches | any |
| GET | `/api/council-launches/{id}` | Get council launch by ID | any |
| GET | `/api/council-launches/{id}/logs` | Get launch logs | any |
| GET | `/api/council-launches/{id}/discussion-messages` | Get discussion messages | any |
| POST | `/api/council-launches/{id}/abort` | Abort council launch | operator |
| POST | `/api/council-launches/{id}/review` | Trigger review stage | operator |
| POST | `/api/council-launches/{id}/synthesize` | Trigger synthesis stage | operator |
| POST | `/api/council-launches/{id}/chat` | Continue chat on completed council | operator |
| GET | `/api/council-launches/{id}/vote` | Get governance vote status | any |
| POST | `/api/council-launches/{id}/vote` | Cast governance vote | operator |
| POST | `/api/council-launches/{id}/vote/approve` | Human approval override | owner |

### Create Council

```bash
curl -X POST http://localhost:3000/api/councils \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Architecture Review Board",
    "agentIds": ["agent-architect", "agent-backend", "agent-security"],
    "chairmanAgentId": "agent-architect",
    "discussionRounds": 2,
    "onChainMode": "attestation",
    "quorumType": "majority"
  }'
```

**Response (201):**

```json
{
  "id": "council-abc",
  "name": "Architecture Review Board",
  "agentIds": ["agent-architect", "agent-backend", "agent-security"],
  "chairmanAgentId": "agent-architect",
  "discussionRounds": 2,
  "onChainMode": "attestation",
  "quorumType": "majority",
  "createdAt": "2026-03-08T10:00:00Z"
}
```

### Request Body: Create Council

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Council name |
| `agentIds` | string[] | yes | Participating agent IDs (min 1) |
| `description` | string | no | Description |
| `chairmanAgentId` | string | no | Designated chairman agent |
| `discussionRounds` | integer (≥0) | no | Number of discussion rounds |
| `onChainMode` | enum | no | `off`, `attestation`, or `full` |
| `quorumType` | enum | no | `majority`, `supermajority`, or `unanimous` |
| `quorumThreshold` | number (0–1) | no | Custom quorum threshold |

### Launch Council Discussion

```bash
curl -X POST http://localhost:3000/api/councils/council-abc/launch \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "proj-1",
    "prompt": "Review the database migration strategy for v2",
    "voteType": "governance",
    "affectedPaths": ["server/db/"]
  }'
```

**Response (201):**

```json
{
  "launchId": "launch-xyz",
  "councilId": "council-abc",
  "status": "in_progress"
}
```

### Cast Governance Vote

```bash
curl -X POST http://localhost:3000/api/council-launches/launch-xyz/vote \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent-security",
    "vote": "approve",
    "reason": "Migration plan is safe and reversible"
  }'
```

**Response:**

```json
{
  "ok": true,
  "vote": "approve",
  "agentId": "agent-security",
  "evaluation": { "status": "approved", "tier": "standard" }
}
```

---

## Marketplace

Agent marketplace with listings, reviews, usage tracking, and cross-instance federation.

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| GET | `/api/marketplace/search` | Search listings | any |
| GET | `/api/marketplace/listings` | List all listings | any |
| POST | `/api/marketplace/listings` | Create listing | operator |
| GET | `/api/marketplace/listings/{id}` | Get listing by ID | any |
| PUT | `/api/marketplace/listings/{id}` | Update listing | operator |
| DELETE | `/api/marketplace/listings/{id}` | Delete listing | operator |
| POST | `/api/marketplace/listings/{id}/use` | Record listing use | any |
| GET | `/api/marketplace/listings/{id}/reviews` | Get reviews | any |
| POST | `/api/marketplace/listings/{id}/reviews` | Create review | any |
| DELETE | `/api/marketplace/reviews/{id}` | Delete review | operator |
| GET | `/api/marketplace/federation/instances` | List federation instances | any |
| POST | `/api/marketplace/federation/instances` | Register federation instance | owner |
| DELETE | `/api/marketplace/federation/instances/{url}` | Remove federation instance | owner |
| POST | `/api/marketplace/federation/sync` | Sync federation instances | operator |
| GET | `/api/marketplace/federated` | Get federated listings | any |
| POST | `/api/marketplace/listings/{id}/subscribe` | Subscribe to listing | operator |
| POST | `/api/marketplace/subscriptions/{id}/cancel` | Cancel subscription | operator |
| GET | `/api/marketplace/subscriptions` | Get subscriptions by tenant | any |
| GET | `/api/marketplace/listings/{id}/subscribers` | Get listing subscribers | any |

### Search Listings

```bash
curl "http://localhost:3000/api/marketplace/search?q=security&category=security&minRating=4&limit=10" \
  -H "Authorization: Bearer $API_KEY"
```

**Query parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `q` | string | Text search query |
| `category` | enum | `coding`, `research`, `writing`, `data`, `devops`, `security`, `general` |
| `pricing` | enum | `free`, `per_use`, `subscription` |
| `minRating` | number | Minimum average rating |
| `tags` | string | Comma-separated tag filter |
| `limit` | integer | Max results (default 50) |
| `offset` | integer | Pagination offset (default 0) |

### Create Listing

```bash
curl -X POST http://localhost:3000/api/marketplace/listings \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent-scanner",
    "name": "Security Audit Agent",
    "description": "Automated security scanning and vulnerability detection",
    "category": "security",
    "tags": ["security", "audit", "scanning"],
    "pricingModel": "per_use",
    "priceCredits": 50
  }'
```

**Response (201):**

```json
{
  "id": "listing-abc",
  "agentId": "agent-scanner",
  "name": "Security Audit Agent",
  "description": "Automated security scanning and vulnerability detection",
  "category": "security",
  "status": "draft",
  "pricingModel": "per_use",
  "priceCredits": 50,
  "averageRating": 0,
  "totalUses": 0,
  "createdAt": "2026-03-08T10:00:00Z"
}
```

### Create Review

```bash
curl -X POST http://localhost:3000/api/marketplace/listings/listing-abc/reviews \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "rating": 5,
    "comment": "Excellent coverage — found three real vulnerabilities"
  }'
```

---

## Reputation

Agent reputation scoring, event tracking, identity verification, and on-chain attestations.

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| GET | `/api/reputation/scores` | Get all scores (auto-recomputes stale) | any |
| POST | `/api/reputation/scores` | Force-recompute all scores | any |
| GET | `/api/reputation/scores/{agentId}` | Get score for agent | any |
| POST | `/api/reputation/scores/{agentId}` | Force recompute for agent | any |
| POST | `/api/reputation/events` | Record reputation event | operator |
| GET | `/api/reputation/events/{agentId}` | Get events for agent | any |
| GET | `/api/reputation/attestation/{agentId}` | Get attestation for agent | any |
| POST | `/api/reputation/attestation/{agentId}` | Create attestation | operator |
| GET | `/api/reputation/identities` | List all identity records | any |
| GET | `/api/reputation/identity/{agentId}` | Get identity for agent | any |
| PUT | `/api/reputation/identity/{agentId}` | Set identity verification tier | owner |

### Get Agent Score

```bash
curl "http://localhost:3000/api/reputation/scores/agent-1?refresh=true" \
  -H "Authorization: Bearer $API_KEY"
```

**Response:**

```json
{
  "agentId": "agent-1",
  "overallScore": 87.5,
  "taskCompletionRate": 0.94,
  "totalEvents": 156,
  "lastComputed": "2026-03-08T11:30:00Z"
}
```

### Record Reputation Event

```bash
curl -X POST http://localhost:3000/api/reputation/events \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent-1",
    "eventType": "task_completed",
    "scoreImpact": 2.5,
    "metadata": { "taskId": "task-xyz", "duration": 45000 }
  }'
```

**Event types:** `task_completed`, `task_failed`, `review_received`, `credit_spent`, `credit_earned`, `security_violation`, `session_completed`, `attestation_published`, `improvement_loop_completed`, `improvement_loop_failed`

### Set Identity Verification Tier

```bash
curl -X PUT http://localhost:3000/api/reputation/identity/agent-1 \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "tier": "GITHUB_VERIFIED", "dataHash": "abc123..." }'
```

**Tiers:** `UNVERIFIED`, `GITHUB_VERIFIED`, `OWNER_VOUCHED`, `ESTABLISHED`

---

## Billing

Subscription management, usage tracking, invoices, and Stripe integration.

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| GET | `/api/billing/subscription/{tenantId}` | Get subscription | any |
| POST | `/api/billing/subscription` | Create subscription | owner |
| POST | `/api/billing/subscription/{tenantId}/cancel` | Cancel subscription | owner |
| GET | `/api/billing/usage/{tenantId}` | Get usage for tenant | any |
| GET | `/api/billing/invoices/{tenantId}` | Get invoices for tenant | any |
| GET | `/api/billing/calculate` | Calculate cost from credits | any |
| POST | `/webhooks/stripe` | Stripe webhook receiver | none (Stripe signature) |

### Create Subscription

```bash
curl -X POST http://localhost:3000/api/billing/subscription \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "tenant-1",
    "stripeSubscriptionId": "sub_abc123",
    "plan": "pro",
    "periodStart": "2026-03-01T00:00:00Z",
    "periodEnd": "2026-04-01T00:00:00Z"
  }'
```

**Response (201):**

```json
{
  "id": "billing-sub-1",
  "tenantId": "tenant-1",
  "plan": "pro",
  "status": "active",
  "periodStart": "2026-03-01T00:00:00Z",
  "periodEnd": "2026-04-01T00:00:00Z"
}
```

### Get Usage

```bash
curl "http://localhost:3000/api/billing/usage/tenant-1" \
  -H "Authorization: Bearer $API_KEY"
```

**Response:**

```json
{
  "current": {
    "creditsUsed": 1250,
    "periodStart": "2026-03-01T00:00:00Z",
    "periodEnd": "2026-04-01T00:00:00Z"
  },
  "history": [...],
  "summary": {
    "totalCreditsUsed": 4500,
    "averageMonthly": 1500
  }
}
```

### Calculate Cost

```bash
curl "http://localhost:3000/api/billing/calculate?credits=1000" \
  -H "Authorization: Bearer $API_KEY"
```

**Response:**

```json
{
  "credits": 1000,
  "costCents": 500
}
```

---

## Additional Modules

The following modules are fully documented in the interactive API explorer at `/api/docs`. Each module has OpenAPI metadata including summaries, auth requirements, and request body schemas.

| Module | Base Path | Endpoints |
|--------|-----------|-----------|
| Webhooks | `/api/webhooks/*` | GitHub webhook registrations & deliveries |
| Mention Polling | `/api/mention-polling/*` | GitHub @mention detection |
| MCP Servers | `/api/mcp-servers/*` | MCP server configurations |
| Skill Bundles | `/api/skill-bundles/*` | Skill management |
| Analytics | `/api/analytics/*` | Overview, spending, session stats |
| System Logs | `/api/system-logs/*` | Log aggregation, credit transactions |
| Tenants | `/api/tenants/*` | Multi-tenant management |
| Settings | `/api/settings/*` | Credit config, API key rotation |
| Allowlists | `/api/allowlist/*` | Address, GitHub, repo allowlists |
| AlgoChat | `/api/algochat/*` | Bridge status, PSK exchange, contacts |
| Wallets | `/api/wallets/*` | Summary, messages, credits |
| Feed | `/api/feed/history` | Activity feed |
| Escalation | `/api/escalation-queue` | Escalation queue management |
| Auth | `/api/auth/device/*` | Device authorization flow |
| A2A | `/api/a2a/*` | Agent-to-Agent protocol |

---

## OpenAPI Spec

The full OpenAPI 3.0.3 specification is available at runtime:

- **Interactive explorer:** `GET /api/docs` — Swagger UI
- **Raw spec:** `GET /api/openapi.json` — machine-readable JSON

To export the spec locally:

```bash
bun run openapi:export > openapi.json
```

To validate the spec:

```bash
bun run openapi:validate
```

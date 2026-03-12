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
- [Agents](#agents)
- [Sessions](#sessions)
- [Schedules](#schedules)
- [Work Tasks](#work-tasks)
- [Permissions](#permissions)
- [Sandbox](#sandbox)
- [Ollama](#ollama)
- [Webhooks](#webhooks)
- [Mention Polling](#mention-polling)
- [Auth Flow](#auth-flow)

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
| GET | `/api/marketplace/listings/{id}/badges` | Get listing badges | any |
| GET | `/api/marketplace/listings/{id}/quality-gates` | Check quality gates | any |
| GET | `/api/marketplace/listings/{id}/analytics` | Get listing analytics | any |
| GET | `/api/marketplace/usage` | Get buyer usage | any |
| GET | `/api/marketplace/listings/{id}/tiers` | List pricing tiers | any |
| POST | `/api/marketplace/listings/{id}/tiers` | Create pricing tier | operator |
| GET | `/api/marketplace/tiers/{id}` | Get tier by ID | any |
| PUT | `/api/marketplace/tiers/{id}` | Update tier | operator |
| DELETE | `/api/marketplace/tiers/{id}` | Delete tier | operator |
| POST | `/api/marketplace/listings/{id}/tier-use` | Record tier-based use | any |
| POST | `/api/marketplace/listings/{id}/tier-subscribe` | Tier-based subscription | operator |
| POST | `/api/marketplace/listings/{id}/trial` | Start trial | any |
| GET | `/api/marketplace/listings/{id}/trial` | Get trial status | any |

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

## Agents

Agent lifecycle management, wallet integration, inter-agent invocation, spending caps, and A2A agent cards.

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| GET | `/api/agents` | List all agents | any |
| POST | `/api/agents` | Create agent | operator |
| GET | `/api/agents/{id}` | Get agent by ID | any |
| PUT | `/api/agents/{id}` | Update agent | operator |
| DELETE | `/api/agents/{id}` | Delete agent | operator |
| GET | `/api/agents/{id}/balance` | Get wallet balance | any |
| POST | `/api/agents/{id}/fund` | Fund wallet (localnet only) | operator |
| POST | `/api/agents/{id}/invoke` | Invoke another agent | operator |
| GET | `/api/agents/{id}/messages` | List AlgoChat messages | any |
| GET | `/api/agents/{id}/spending` | Get daily spending & cap | any |
| PUT | `/api/agents/{id}/spending-cap` | Set spending cap | operator |
| DELETE | `/api/agents/{id}/spending-cap` | Remove spending cap | operator |
| GET | `/api/agents/{id}/agent-card` | Get A2A agent card | any |

### Create Agent

```bash
curl -X POST http://localhost:3000/api/agents \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "code-reviewer",
    "description": "Automated code review agent",
    "model": "claude-sonnet-4-20250514",
    "provider": "anthropic",
    "systemPrompt": "You are a code review specialist.",
    "permissionMode": "plan",
    "algochatEnabled": true
  }'
```

**Response (201):**

```json
{
  "id": "agent-abc123",
  "name": "code-reviewer",
  "description": "Automated code review agent",
  "model": "claude-sonnet-4-20250514",
  "provider": "anthropic",
  "permissionMode": "plan",
  "algochatEnabled": true,
  "createdAt": "2026-03-08T10:00:00Z"
}
```

### Request Body: Create Agent

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Agent name (min 1 char) |
| `description` | string | no | Description |
| `model` | string | no | Model identifier |
| `provider` | string | no | LLM provider |
| `systemPrompt` | string | no | System prompt |
| `appendPrompt` | string | no | Appended to system prompt |
| `allowedTools` | string | no | Comma-separated tool list |
| `disallowedTools` | string | no | Comma-separated tool list |
| `permissionMode` | enum | no | `default`, `plan`, `auto-edit`, `full-auto` |
| `maxBudgetUsd` | number \| null | no | Max budget in USD |
| `algochatEnabled` | boolean | no | Enable AlgoChat |
| `algochatAuto` | boolean | no | Auto-respond to messages |
| `customFlags` | object | no | Key-value custom flags |
| `defaultProjectId` | string \| null | no | Default project |
| `mcpToolPermissions` | string[] \| null | no | MCP tool permissions |
| `voiceEnabled` | boolean | no | Enable voice |
| `voicePreset` | enum | no | `alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer` |

### Invoke Another Agent

```bash
curl -X POST http://localhost:3000/api/agents/agent-1/invoke \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "toAgentId": "agent-2",
    "content": "Please review the latest PR",
    "paymentMicro": 100000,
    "projectId": "proj-1"
  }'
```

**Response (201):**

```json
{
  "messageId": "msg-xyz",
  "txid": "ALGO_TX_ID",
  "sessionId": "session-abc"
}
```

### Get Wallet Balance

```bash
curl http://localhost:3000/api/agents/agent-1/balance \
  -H "Authorization: Bearer $API_KEY"
```

**Response:**

```json
{
  "balance": 5000000,
  "address": "ALGO_ADDRESS_HERE"
}
```

### Set Spending Cap

```bash
curl -X PUT http://localhost:3000/api/agents/agent-1/spending-cap \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "dailyLimitMicroalgos": 10000000,
    "dailyLimitUsdc": 5000000
  }'
```

---

## Sessions

Interactive agent sessions with project context. Sessions run agent processes and collect message history.

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| GET | `/api/sessions` | List sessions | any |
| POST | `/api/sessions` | Create session | operator |
| GET | `/api/sessions/{id}` | Get session by ID | any |
| PUT | `/api/sessions/{id}` | Update session | operator |
| DELETE | `/api/sessions/{id}` | Delete session | operator |
| GET | `/api/sessions/{id}/messages` | Get session messages | any |
| POST | `/api/sessions/{id}/stop` | Stop running session | operator |
| POST | `/api/sessions/{id}/resume` | Resume session | operator |

### Create Session

```bash
curl -X POST http://localhost:3000/api/sessions \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "proj-1",
    "agentId": "agent-1",
    "name": "Fix login bug",
    "initialPrompt": "Fix the authentication timeout issue in auth.ts"
  }'
```

**Response (201):**

```json
{
  "id": "session-abc123",
  "projectId": "proj-1",
  "agentId": "agent-1",
  "name": "Fix login bug",
  "status": "running",
  "createdAt": "2026-03-08T10:00:00Z"
}
```

### Request Body: Create Session

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectId` | string | yes | Target project |
| `agentId` | string | no | Agent to use |
| `name` | string | no | Session name |
| `initialPrompt` | string | no | If provided, agent starts immediately |
| `councilLaunchId` | string | no | Link to council launch |
| `councilRole` | enum | no | `member`, `reviewer`, `chairman`, `discusser` |

### Resume Session

```bash
curl -X POST http://localhost:3000/api/sessions/session-abc123/resume \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "prompt": "Now add unit tests for the fix" }'
```

### Stop Session

```bash
curl -X POST http://localhost:3000/api/sessions/session-abc123/stop \
  -H "Authorization: Bearer $API_KEY"
```

**Response:** `{ "ok": true }`

---

## Schedules

Cron-based and event-driven scheduling with approval policies, bulk operations, and execution history.

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| GET | `/api/schedules` | List schedules | any |
| POST | `/api/schedules` | Create schedule | operator |
| GET | `/api/schedules/{id}` | Get schedule by ID | any |
| PUT | `/api/schedules/{id}` | Update schedule | operator |
| DELETE | `/api/schedules/{id}` | Delete schedule | operator |
| POST | `/api/schedules/bulk` | Bulk pause/resume/delete | operator |
| POST | `/api/schedules/{id}/trigger` | Trigger immediately | operator |
| GET | `/api/schedules/{id}/executions` | List executions for schedule | any |
| GET | `/api/schedule-executions` | List all executions | any |
| GET | `/api/schedule-executions/{id}` | Get execution by ID | any |
| POST | `/api/schedule-executions/{id}/cancel` | Cancel execution | operator |
| POST | `/api/schedule-executions/{id}/resolve` | Approve/deny execution | operator |
| GET | `/api/scheduler/health` | Scheduler health | any |
| GET | `/api/scheduler/system-state` | Live system state | any |
| GET | `/api/github/status` | GitHub integration status | any |

### Create Schedule

```bash
curl -X POST http://localhost:3000/api/schedules \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent-1",
    "name": "Nightly Code Review",
    "cronExpression": "0 2 * * *",
    "approvalPolicy": "auto",
    "actions": [
      {
        "type": "review_prs",
        "repos": ["CorvidLabs/corvid-agent"],
        "maxPrs": 10
      }
    ]
  }'
```

**Response (201):**

```json
{
  "id": "sched-abc123",
  "agentId": "agent-1",
  "name": "Nightly Code Review",
  "cronExpression": "0 2 * * *",
  "status": "active",
  "approvalPolicy": "auto",
  "actions": [...],
  "createdAt": "2026-03-08T10:00:00Z"
}
```

### Request Body: Create Schedule

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `agentId` | string | yes | Agent to run |
| `name` | string | yes | Schedule name |
| `description` | string | no | Description |
| `cronExpression` | string | no | Cron expression (at least one of cron/interval/triggerEvents required) |
| `intervalMs` | number | no | Interval in ms (min 60000) |
| `actions` | ScheduleAction[] | yes | At least 1 action |
| `approvalPolicy` | enum | no | `auto`, `owner_approve`, `council_approve` |
| `maxExecutions` | number | no | Max total executions |
| `maxBudgetPerRun` | number | no | Budget cap per run |
| `notifyAddress` | string | no | Notification address |
| `triggerEvents` | TriggerEvent[] | no | Event-based triggers |

**ScheduleAction types:** `star_repo`, `fork_repo`, `review_prs`, `work_task`, `council_launch`, `send_message`, `github_suggest`, `codebase_review`, `dependency_audit`, `improvement_loop`, `memory_maintenance`, `reputation_attestation`, `outcome_analysis`, `daily_review`, `custom`

### Bulk Operations

```bash
curl -X POST http://localhost:3000/api/schedules/bulk \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "pause",
    "ids": ["sched-1", "sched-2", "sched-3"]
  }'
```

**Response:**

```json
{
  "results": [
    { "id": "sched-1", "ok": true },
    { "id": "sched-2", "ok": true },
    { "id": "sched-3", "ok": true }
  ]
}
```

### Approve/Deny Execution

```bash
curl -X POST http://localhost:3000/api/schedule-executions/exec-123/resolve \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "approved": true }'
```

### Scheduler Health

```bash
curl http://localhost:3000/api/scheduler/health \
  -H "Authorization: Bearer $API_KEY"
```

**Response:**

```json
{
  "running": true,
  "activeSchedules": 12,
  "pausedSchedules": 3,
  "runningExecutions": 2,
  "maxConcurrent": 5,
  "recentFailures": 0
}
```

---

## Work Tasks

Standalone work units dispatched to agents. Supports retry and cancellation.

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| GET | `/api/work-tasks/queue-status` | Get task queue status | any |
| GET | `/api/work-tasks` | List work tasks | any |
| POST | `/api/work-tasks` | Create work task | operator |
| GET | `/api/work-tasks/{id}` | Get work task by ID | any |
| POST | `/api/work-tasks/{id}/cancel` | Cancel work task | operator |
| POST | `/api/work-tasks/{id}/retry` | Retry failed task | operator |

### Create Work Task

```bash
curl -X POST http://localhost:3000/api/work-tasks \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent-1",
    "description": "Fix the broken login flow in auth.ts",
    "projectId": "proj-1",
    "source": "web"
  }'
```

**Response (201):**

```json
{
  "id": "task-abc123",
  "agentId": "agent-1",
  "description": "Fix the broken login flow in auth.ts",
  "projectId": "proj-1",
  "status": "pending",
  "source": "web",
  "createdAt": "2026-03-08T10:00:00Z"
}
```

### Request Body: Create Work Task

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `agentId` | string | yes | Agent to assign |
| `description` | string | yes | Task description (min 1 char) |
| `projectId` | string | no | Target project |
| `source` | enum | no | `web`, `algochat`, `agent` (default: `web`) |
| `sourceId` | string | no | Source reference ID |
| `requesterInfo` | object | no | Metadata about requester |

### Cancel Work Task

```bash
curl -X POST http://localhost:3000/api/work-tasks/task-abc123/cancel \
  -H "Authorization: Bearer $API_KEY"
```

### Retry Failed Task

```bash
curl -X POST http://localhost:3000/api/work-tasks/task-abc123/retry \
  -H "Authorization: Bearer $API_KEY"
```

---

## Permissions

Capability-based permission management. Grant, revoke, and check agent permissions for tools and actions. Requires admin API key authentication.

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| POST | `/api/permissions/grant` | Grant permission | admin |
| POST | `/api/permissions/revoke` | Revoke permission | admin |
| POST | `/api/permissions/emergency-revoke` | Emergency revoke all | admin |
| POST | `/api/permissions/check` | Check tool permission | admin |
| GET | `/api/permissions/actions` | List action taxonomy | admin |
| GET | `/api/permissions/{agentId}` | List grants for agent | admin |

### Grant Permission

```bash
curl -X POST http://localhost:3000/api/permissions/grant \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "agent-1",
    "action": "file:write",
    "granted_by": "owner",
    "reason": "Needs write access for code generation"
  }'
```

**Response (201):**

```json
{
  "grant": {
    "id": "grant-abc",
    "agent_id": "agent-1",
    "action": "file:write",
    "granted_by": "owner",
    "reason": "Needs write access for code generation",
    "created_at": "2026-03-08T10:00:00Z"
  }
}
```

### Emergency Revoke

```bash
curl -X POST http://localhost:3000/api/permissions/emergency-revoke \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "agent-1",
    "reason": "Security incident"
  }'
```

**Response:** `{ "affected": 5, "emergency": true }`

### Check Permission

```bash
curl -X POST http://localhost:3000/api/permissions/check \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "agent-1",
    "tool_name": "bash"
  }'
```

---

## Sandbox

Container-based sandboxing for agent sessions. Manage container pool, policies, and assignments.

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| GET | `/api/sandbox/stats` | Get pool statistics | any |
| GET | `/api/sandbox/policies` | List all policies | any |
| GET | `/api/sandbox/policies/{agentId}` | Get policy for agent | any |
| PUT | `/api/sandbox/policies/{agentId}` | Set policy | operator |
| DELETE | `/api/sandbox/policies/{agentId}` | Remove policy | operator |
| POST | `/api/sandbox/assign` | Assign container | operator |
| POST | `/api/sandbox/release/{sessionId}` | Release container | operator |

### Set Sandbox Policy

```bash
curl -X PUT http://localhost:3000/api/sandbox/policies/agent-1 \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "cpuLimit": 2,
    "memoryLimitMb": 1024,
    "networkPolicy": "restricted",
    "timeoutSeconds": 3600
  }'
```

| Field | Type | Description |
|-------|------|-------------|
| `cpuLimit` | number | CPU cores (0.1–16) |
| `memoryLimitMb` | integer | Memory in MB (64–65536) |
| `networkPolicy` | enum | `none`, `host`, `restricted` |
| `timeoutSeconds` | integer | Timeout in seconds (1–86400) |

### Assign Container

```bash
curl -X POST http://localhost:3000/api/sandbox/assign \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent-1",
    "sessionId": "session-abc"
  }'
```

**Response (201):** `{ "containerId": "container-xyz" }`

---

## Ollama

Local LLM management via Ollama. Check status, browse models, pull/delete, and monitor GPU usage.

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| GET | `/api/ollama/status` | Server status & active pulls | any |
| GET | `/api/ollama/models` | List installed models | any |
| GET | `/api/ollama/models/running` | List loaded models | any |
| POST | `/api/ollama/models/pull` | Pull a model (async) | any |
| DELETE | `/api/ollama/models` | Delete a model | any |
| GET | `/api/ollama/models/pull/status` | Get pull progress | any |
| GET | `/api/ollama/library` | Browse model library | any |

### Pull a Model

```bash
curl -X POST http://localhost:3000/api/ollama/models/pull \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "model": "llama3:8b" }'
```

**Response (202):**

```json
{
  "message": "Pull started for model: llama3:8b",
  "status": { "model": "llama3:8b", "status": "pulling", "progress": 0 }
}
```

### Browse Library

```bash
curl "http://localhost:3000/api/ollama/library?category=coding" \
  -H "Authorization: Bearer $API_KEY"
```

**Query params:** `q` (search), `category` (`all`, `cloud`, `recommended`, `coding`, `small`, `large`, `vision`)

---

## Webhooks

GitHub webhook registration and delivery tracking. Incoming webhooks are authenticated via HMAC signature.

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| POST | `/webhooks/github` | Receive GitHub webhook | HMAC signature |
| GET | `/api/webhooks` | List registrations | any |
| POST | `/api/webhooks` | Create registration | operator |
| GET | `/api/webhooks/{id}` | Get registration | any |
| PUT | `/api/webhooks/{id}` | Update registration | operator |
| DELETE | `/api/webhooks/{id}` | Delete registration | operator |
| GET | `/api/webhooks/deliveries` | List all deliveries | any |
| GET | `/api/webhooks/{id}/deliveries` | List deliveries for registration | any |

### Create Registration

```bash
curl -X POST http://localhost:3000/api/webhooks \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent-1",
    "repo": "CorvidLabs/corvid-agent",
    "events": ["issue_comment", "issues"],
    "mentionUsername": "corvid-agent"
  }'
```

**Response (201):**

```json
{
  "id": "wh-abc123",
  "agentId": "agent-1",
  "repo": "CorvidLabs/corvid-agent",
  "events": ["issue_comment", "issues"],
  "mentionUsername": "corvid-agent",
  "status": "active"
}
```

**Event types:** `issue_comment`, `issues`, `pull_request_review_comment`, `issue_comment_pr`

---

## Mention Polling

Poll GitHub for @mentions and automatically trigger agent sessions.

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| GET | `/api/mention-polling` | List configs | any |
| POST | `/api/mention-polling` | Create config | operator |
| GET | `/api/mention-polling/stats` | Polling service stats | any |
| GET | `/api/mention-polling/{id}` | Get config | any |
| PUT | `/api/mention-polling/{id}` | Update config | operator |
| DELETE | `/api/mention-polling/{id}` | Delete config | operator |
| GET | `/api/mention-polling/{id}/activity` | Recent triggered sessions | any |

### Create Polling Config

```bash
curl -X POST http://localhost:3000/api/mention-polling \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent-1",
    "repo": "CorvidLabs/corvid-agent",
    "mentionUsername": "corvid-agent",
    "intervalSeconds": 120,
    "eventFilter": ["issue_comment", "issues"]
  }'
```

**Response (201):**

```json
{
  "id": "poll-abc123",
  "agentId": "agent-1",
  "repo": "CorvidLabs/corvid-agent",
  "mentionUsername": "corvid-agent",
  "intervalSeconds": 120,
  "status": "active"
}
```

---

## Auth Flow

OAuth 2.0 Device Authorization Grant (RFC 8628) for CLI login. All endpoints are unauthenticated.

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| POST | `/api/auth/device` | Start device auth flow | none |
| POST | `/api/auth/device/token` | Poll for access token | none |
| POST | `/api/auth/device/authorize` | Approve/deny device code | none |
| GET | `/api/auth/verify` | Render verification page | none |

### Start Device Auth

```bash
curl -X POST http://localhost:3000/api/auth/device
```

**Response:**

```json
{
  "deviceCode": "uuid-device-code",
  "userCode": "ABCD1234",
  "verificationUrl": "http://localhost:3000/api/auth/verify?code=ABCD1234",
  "expiresIn": 600,
  "interval": 2
}
```

### Poll for Token

```bash
curl -X POST http://localhost:3000/api/auth/device/token \
  -H "Content-Type: application/json" \
  -d '{ "deviceCode": "uuid-device-code" }'
```

**Response (pending):** `{ "error": "authorization_pending" }` (400)

**Response (success):**

```json
{
  "accessToken": "ca_your_token_here",
  "tenantId": "default",
  "tenantName": "Default",
  "email": "user@example.com"
}
```

---

## Additional Modules

The following modules are fully documented in the interactive API explorer at `/api/docs`. Each module has OpenAPI metadata including summaries, auth requirements, and request body schemas.

| Module | Base Path | Endpoints |
|--------|-----------|-----------|
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
| A2A | `/a2a/tasks/*` | Agent-to-Agent protocol inbound tasks |
| Flock Directory | `/api/flock-directory/*` | Cross-instance agent discovery, search, heartbeat |
| Dashboard | `/api/dashboard/summary` | Aggregated dashboard summary |
| Performance | `/api/performance/*` | Snapshots, trends, regression detection |
| Usage | `/api/usage/*` | Schedule usage monitoring, anomaly detection |
| Feedback | `/api/feedback/*` | PR outcome metrics and analysis |
| Audit | `/api/audit-log` | Immutable audit log queries |
| Onboarding | `/api/onboarding/status` | Onboarding status check |
| Security | `/api/security/overview` | Security configuration overview |
| Bridge Delivery | `/api/bridges/delivery` | Bridge delivery metrics |
| Backup | `POST /api/backup` | Database backup trigger |
| Self-Test | `POST /api/selftest/run` | Self-test suite runner |

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

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
- **admin** — requires the admin API key (`ADMIN_API_KEY`)

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
- [Flock Directory](#flock-directory)
- [Marketplace Tiers](#marketplace-tiers)
- [Performance](#performance)
- [Usage](#usage)
- [Feedback](#feedback)
- [Audit](#audit)
- [Onboarding](#onboarding)
- [Security Overview](#security-overview)
- [Bridge Delivery](#bridge-delivery)
- [A2A](#a2a)
- [Backup](#backup)
- [Self-Test](#self-test)
- [Dashboard](#dashboard)
- [Contacts](#contacts)
- [Brain Viewer](#brain-viewer)
- [Flock Testing](#flock-testing)
- [Analytics](#analytics)
- [Exam](#exam)
- [MCP API](#mcp-api)
- [MCP Servers](#mcp-servers)
- [Plugins](#plugins)
- [Allowlist](#allowlist)
- [Repo Blocklist](#repo-blocklist)
- [GitHub Allowlist](#github-allowlist)
- [Projects](#projects)
- [Tenants](#tenants)
- [Settings](#settings)
- [System Logs](#system-logs)
- [Personas](#personas)
- [Skill Bundles](#skill-bundles)
- [Proposals](#proposals)
- [Slack](#slack)
- [Operational Mode](#operational-mode)
- [Escalation Queue](#escalation-queue)
- [Feed](#feed)
- [AlgoChat](#algochat)
- [Wallets](#wallets)

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
| GET | `/api/reputation/explain/{agentId}` | Score explanation breakdown | any |
| GET | `/api/reputation/stats/{agentId}` | Agent reputation statistics | any |
| POST | `/api/reputation/feedback` | Submit feedback for agent | any |
| GET | `/api/reputation/feedback/{agentId}` | Get feedback for agent | any |

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
| POST | `/api/sessions/{id}/escalate` | Escalate session to work task | operator |

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
| GET | `/api/permissions/roles` | List role templates | admin |
| GET | `/api/permissions/roles/{name}` | Get role template | admin |
| POST | `/api/permissions/roles/apply` | Apply role template to agent | admin |
| POST | `/api/permissions/roles/revoke` | Revoke role template from agent | admin |

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

## Flock Directory

Cross-instance agent discovery registry with search, heartbeat, and CRUD operations for agent entries.

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| GET | `/api/flock-directory/search` | Search agents | any |
| GET | `/api/flock-directory/stats` | Directory statistics | any |
| GET | `/api/flock-directory/agents` | List active agents | any |
| POST | `/api/flock-directory/agents` | Register agent | any |
| GET | `/api/flock-directory/agents/{id}` | Get agent by ID | any |
| PATCH | `/api/flock-directory/agents/{id}` | Update agent | any |
| DELETE | `/api/flock-directory/agents/{id}` | Deregister agent | any |
| POST | `/api/flock-directory/agents/{id}/heartbeat` | Send heartbeat | any |
| GET | `/api/flock-directory/lookup/{address}` | Lookup by Algorand address | any |
| POST | `/api/flock-directory/agents/{id}/reputation` | Compute agent reputation | any |

### Search Agents

```bash
curl "http://localhost:3000/api/flock-directory/search?q=code-review&status=active&capability=testing&limit=20" \
  -H "Authorization: Bearer $API_KEY"
```

**Response (200):**

```json
{
  "agents": [
    {
      "id": "fd-abc123",
      "address": "ALGO...",
      "name": "code-reviewer",
      "description": "Automated code review agent",
      "instanceUrl": "https://agent.example.com",
      "capabilities": ["code-review", "testing"],
      "status": "active",
      "lastHeartbeat": "2026-03-13T10:00:00Z",
      "registeredAt": "2026-03-01T00:00:00Z"
    }
  ],
  "total": 1
}
```

### Query Parameters: Search Agents

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `q` | string | — | Free-text search query |
| `status` | enum | — | Filter by status (`active`, `inactive`, `deregistered`) |
| `capability` | string | — | Filter by capability tag |
| `minReputation` | number | — | Minimum reputation score |
| `limit` | number | 50 | Max results per page |
| `offset` | number | 0 | Pagination offset |

### Get Directory Stats

```bash
curl http://localhost:3000/api/flock-directory/stats \
  -H "Authorization: Bearer $API_KEY"
```

**Response (200):**

```json
{
  "totalRegistered": 42,
  "active": 35,
  "inactive": 5,
  "deregistered": 2,
  "uniqueCapabilities": 12
}
```

### Register Agent

```bash
curl -X POST http://localhost:3000/api/flock-directory/agents \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "address": "ALGO_ADDRESS_58_CHARS...",
    "name": "my-agent",
    "description": "General-purpose coding agent",
    "instanceUrl": "https://my-agent.example.com",
    "capabilities": ["code-review", "testing", "docs"]
  }'
```

**Response (201):**

```json
{
  "id": "fd-abc123",
  "address": "ALGO_ADDRESS_58_CHARS...",
  "name": "my-agent",
  "description": "General-purpose coding agent",
  "instanceUrl": "https://my-agent.example.com",
  "capabilities": ["code-review", "testing", "docs"],
  "status": "active",
  "registeredAt": "2026-03-13T10:00:00Z"
}
```

### Request Body: Register Agent

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `address` | string | yes | Algorand address (58-char format) |
| `name` | string | yes | Agent display name (min 1 char) |
| `description` | string | no | Agent description |
| `instanceUrl` | string | no | URL of agent instance (must be valid URL) |
| `capabilities` | string[] | no | List of capability tags |

### Update Agent

```bash
curl -X PATCH http://localhost:3000/api/flock-directory/agents/fd-abc123 \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Updated description",
    "capabilities": ["code-review", "testing", "docs", "security"]
  }'
```

**Response (200):** Returns the updated agent object.

### Request Body: Update Agent

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | no | Agent display name |
| `description` | string | no | Agent description |
| `instanceUrl` | string\|null | no | Instance URL (null to clear) |
| `capabilities` | string[] | no | Capability tags |

### Deregister Agent

```bash
curl -X DELETE http://localhost:3000/api/flock-directory/agents/fd-abc123 \
  -H "Authorization: Bearer $API_KEY"
```

**Response (200):** `{ "ok": true }`

### Send Heartbeat

```bash
curl -X POST http://localhost:3000/api/flock-directory/agents/fd-abc123/heartbeat \
  -H "Authorization: Bearer $API_KEY"
```

**Response (200):** `{ "ok": true }`

### Lookup by Address

```bash
curl http://localhost:3000/api/flock-directory/lookup/ALGO_ADDRESS_58_CHARS... \
  -H "Authorization: Bearer $API_KEY"
```

**Response (200):** Returns the agent object matching the given Algorand address.

---

## Marketplace Tiers

Pricing tier management for marketplace listings. Tiers allow listings to offer multiple pricing levels with different feature sets, rate limits, and billing cycles.

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| GET | `/api/marketplace/listings/{id}/tiers` | List tiers for listing | any |
| POST | `/api/marketplace/listings/{id}/tiers` | Create tier | operator |
| GET | `/api/marketplace/tiers/{id}` | Get tier by ID | any |
| PUT | `/api/marketplace/tiers/{id}` | Update tier | operator |
| DELETE | `/api/marketplace/tiers/{id}` | Delete tier | operator |
| POST | `/api/marketplace/listings/{id}/tier-use` | Record tier-based use | any |
| POST | `/api/marketplace/listings/{id}/tier-subscribe` | Subscribe via tier | operator |
| POST | `/api/marketplace/listings/{id}/trial` | Start free trial | any |
| GET | `/api/marketplace/listings/{id}/trial` | Get trial status | any |

### Create Tier

```bash
curl -X POST http://localhost:3000/api/marketplace/listings/listing-abc/tiers \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Pro",
    "description": "Professional tier with higher limits",
    "priceCredits": 500,
    "billingCycle": "monthly",
    "rateLimit": 1000,
    "features": ["priority-support", "advanced-analytics"],
    "sortOrder": 2
  }'
```

**Response (201):**

```json
{
  "id": "tier-xyz",
  "listingId": "listing-abc",
  "name": "Pro",
  "description": "Professional tier with higher limits",
  "priceCredits": 500,
  "billingCycle": "monthly",
  "rateLimit": 1000,
  "features": ["priority-support", "advanced-analytics"],
  "sortOrder": 2,
  "createdAt": "2026-03-13T10:00:00Z"
}
```

### Request Body: Create Tier

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Tier name (min 1 char) |
| `description` | string | no | Tier description |
| `priceCredits` | integer | yes | Price in credits (>= 0) |
| `billingCycle` | enum | no | `one_time`, `daily`, `weekly`, `monthly` (default: `one_time`) |
| `rateLimit` | integer | no | Max uses per billing cycle (>= 0) |
| `features` | string[] | no | List of feature tags |
| `sortOrder` | integer | no | Display ordering (>= 0) |

### Update Tier

```bash
curl -X PUT http://localhost:3000/api/marketplace/tiers/tier-xyz \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "priceCredits": 750,
    "rateLimit": 2000
  }'
```

**Response (200):** Returns the updated tier object.

### Request Body: Update Tier

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | no | Tier name |
| `description` | string | no | Tier description |
| `priceCredits` | integer | no | Price in credits |
| `billingCycle` | enum | no | `one_time`, `daily`, `weekly`, `monthly` |
| `rateLimit` | integer | no | Max uses per billing cycle |
| `features` | string[] | no | Feature tags |
| `sortOrder` | integer | no | Display ordering |

### Delete Tier

```bash
curl -X DELETE http://localhost:3000/api/marketplace/tiers/tier-xyz \
  -H "Authorization: Bearer $API_KEY"
```

**Response (200):** `{ "ok": true }`

### Record Tier-Based Use

Record a per-use billing event against a specific tier. Credits are deducted at the tier's price.

```bash
curl -X POST http://localhost:3000/api/marketplace/listings/listing-abc/tier-use \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "tierId": "tier-xyz" }'
```

**Response (200):**

```json
{
  "ok": true,
  "creditsDeducted": 500,
  "escrowId": "escrow-123"
}
```

**Error (402):** `{ "error": "Insufficient credits", "required": 500 }`

**Error (429):** `{ "error": "Rate limit exceeded", "limit": 1000 }`

### Request Body: Tier Use

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tierId` | string | yes | ID of the tier to bill against |

### Subscribe via Tier

Create a subscription using a specific tier's pricing and billing cycle.

```bash
curl -X POST http://localhost:3000/api/marketplace/listings/listing-abc/tier-subscribe \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "tierId": "tier-xyz",
    "subscriberTenantId": "tenant-123"
  }'
```

**Response (201):**

```json
{
  "id": "sub-abc",
  "listingId": "listing-abc",
  "subscriberTenantId": "tenant-123",
  "status": "active",
  "billingCycle": "monthly",
  "priceCredits": 500,
  "createdAt": "2026-03-13T10:00:00Z",
  "nextBillingAt": "2026-04-13T10:00:00Z"
}
```

### Request Body: Tier Subscribe

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tierId` | string | yes | ID of the tier |
| `subscriberTenantId` | string | yes | Subscribing tenant ID |

### Start Free Trial

```bash
curl -X POST http://localhost:3000/api/marketplace/listings/listing-abc/trial \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "tenantId": "tenant-123" }'
```

**Response (201):**

```json
{
  "id": "trial-abc",
  "listingId": "listing-abc",
  "tenantId": "tenant-123",
  "status": "active",
  "usesRemaining": 10,
  "expiresAt": "2026-03-20T10:00:00Z",
  "createdAt": "2026-03-13T10:00:00Z"
}
```

### Request Body: Start Trial

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tenantId` | string | yes | Tenant requesting the trial |

### Get Trial Status

```bash
curl "http://localhost:3000/api/marketplace/listings/listing-abc/trial?tenantId=tenant-123" \
  -H "Authorization: Bearer $API_KEY"
```

**Response (200):** Returns the trial object with current status and remaining uses.

---

## Performance

Performance monitoring with snapshots, time-series trends, regression detection, and metric collection.

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| GET | `/api/performance/snapshot` | Current performance snapshot | any |
| GET | `/api/performance/trends` | Time-series trend data | any |
| GET | `/api/performance/regressions` | Detect performance regressions | any |
| GET | `/api/performance/report` | Full performance report | any |
| GET | `/api/performance/metrics` | List available metric names | any |
| POST | `/api/performance/collect` | Trigger manual collection | any |

### Get Snapshot

```bash
curl http://localhost:3000/api/performance/snapshot \
  -H "Authorization: Bearer $API_KEY"
```

**Response (200):**

```json
{
  "timestamp": "2026-03-13T10:00:00Z",
  "memory": {
    "heapUsed": 52428800,
    "heapTotal": 67108864,
    "rss": 104857600,
    "external": 2097152
  },
  "db": {
    "sizeBytes": 10485760,
    "latencyMs": 0.5,
    "tableCount": 42
  },
  "uptime": 86400
}
```

### Get Trends

```bash
curl "http://localhost:3000/api/performance/trends?days=7&metric=memory_rss" \
  -H "Authorization: Bearer $API_KEY"
```

**Response (200) — single metric:**

```json
{
  "metric": "memory_rss",
  "days": 7,
  "series": [
    { "timestamp": "2026-03-06T10:00:00Z", "value": 104857600 },
    { "timestamp": "2026-03-07T10:00:00Z", "value": 105906176 }
  ]
}
```

**Response (200) — all metrics (omit `metric` param):**

```json
{
  "days": 7,
  "trends": {
    "memory_rss": [{ "timestamp": "...", "value": 104857600 }],
    "memory_heap_used": [{ "timestamp": "...", "value": 52428800 }],
    "db_size": [{ "timestamp": "...", "value": 10485760 }],
    "db_latency": [{ "timestamp": "...", "value": 0.5 }],
    "uptime": [{ "timestamp": "...", "value": 86400 }]
  }
}
```

### Query Parameters: Get Trends

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `days` | number | 7 | Number of days of history (1-365) |
| `metric` | string | — | Specific metric name; omit for all key metrics |

### Detect Regressions

```bash
curl "http://localhost:3000/api/performance/regressions?threshold=25" \
  -H "Authorization: Bearer $API_KEY"
```

**Response (200):**

```json
{
  "threshold": 25,
  "regressions": [
    {
      "metric": "memory_rss",
      "currentAvg": 115343360,
      "previousAvg": 89128960,
      "changePercent": 29.4,
      "severity": "warning"
    }
  ],
  "hasRegressions": true,
  "criticalCount": 0
}
```

### Query Parameters: Detect Regressions

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `threshold` | number | 25 | Percentage threshold for regression detection |

### Get Performance Report

```bash
curl http://localhost:3000/api/performance/report \
  -H "Authorization: Bearer $API_KEY"
```

**Response (200):**

```json
{
  "snapshot": { "timestamp": "...", "memory": {...}, "db": {...}, "uptime": 86400 },
  "regressions": [],
  "slowQueriestoday": 0,
  "metricsStoredTotal": 1440
}
```

### List Metric Names

```bash
curl http://localhost:3000/api/performance/metrics \
  -H "Authorization: Bearer $API_KEY"
```

**Response (200):**

```json
{
  "metrics": ["db_latency", "db_size", "memory_heap_used", "memory_rss", "uptime"]
}
```

### Trigger Manual Collection

```bash
curl -X POST http://localhost:3000/api/performance/collect \
  -H "Authorization: Bearer $API_KEY"
```

**Response (200):**

```json
{
  "ok": true,
  "snapshot": {
    "timestamp": "2026-03-13T10:00:00Z",
    "memory": {...},
    "db": {...},
    "uptime": 86400
  }
}
```

---

## Usage

Per-schedule and per-day usage aggregates for scheduled sessions, including cost tracking and anomaly detection.

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| GET | `/api/usage/summary` | Per-schedule usage summary | any |
| GET | `/api/usage/daily` | Daily usage breakdown | any |
| GET | `/api/usage/anomalies` | Anomaly detection flags | any |
| GET | `/api/usage/schedule/{id}` | Detailed usage for one schedule | any |

### Get Usage Summary

```bash
curl "http://localhost:3000/api/usage/summary?days=30" \
  -H "Authorization: Bearer $API_KEY"
```

**Response (200):**

```json
{
  "days": 30,
  "totals": {
    "executions": 142,
    "completed": 135,
    "failed": 5,
    "running": 2,
    "costUsd": 12.75,
    "turns": 4280
  },
  "schedules": [
    {
      "scheduleId": "sched-abc",
      "scheduleName": "nightly-maintenance",
      "agentId": "agent-1",
      "executionCount": 30,
      "completedCount": 29,
      "failedCount": 1,
      "totalCostUsd": 4.50,
      "avgCostUsd": 0.15,
      "totalDurationSec": 5400,
      "avgDurationSec": 180,
      "totalTurns": 900,
      "avgTurns": 30,
      "lastExecutionAt": "2026-03-13T06:00:00Z"
    }
  ]
}
```

### Query Parameters: Usage Summary

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `days` | number | 30 | Lookback period in days (1-365) |

### Get Daily Usage

```bash
curl "http://localhost:3000/api/usage/daily?days=7" \
  -H "Authorization: Bearer $API_KEY"
```

**Response (200):**

```json
{
  "days": 7,
  "daily": [
    {
      "date": "2026-03-07",
      "executionCount": 18,
      "completedCount": 17,
      "failedCount": 1,
      "totalCostUsd": 2.10,
      "totalDurationSec": 1800,
      "totalTurns": 540,
      "uniqueSchedules": 6
    }
  ]
}
```

### Get Anomalies

```bash
curl "http://localhost:3000/api/usage/anomalies?days=7" \
  -H "Authorization: Bearer $API_KEY"
```

**Response (200):**

```json
{
  "days": 7,
  "anomalies": [
    {
      "executionId": "exec-xyz",
      "scheduleId": "sched-abc",
      "scheduleName": "nightly-maintenance",
      "actionType": "session",
      "durationSec": 2400,
      "costUsd": 0.85,
      "startedAt": "2026-03-12T06:00:00Z",
      "completedAt": "2026-03-12T06:40:00Z",
      "anomalyType": "long_running"
    }
  ],
  "counts": {
    "longRunning": 1,
    "costSpikes": 0,
    "total": 1
  }
}
```

Anomaly types:
- `long_running` — execution exceeded 30 minutes
- `cost_spike` — latest execution cost >2x the rolling average

### Query Parameters: Anomalies

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `days` | number | 7 | Lookback period in days (1-30) |

### Get Schedule Usage Detail

```bash
curl "http://localhost:3000/api/usage/schedule/sched-abc?days=30" \
  -H "Authorization: Bearer $API_KEY"
```

**Response (200):**

```json
{
  "schedule": {
    "id": "sched-abc",
    "name": "nightly-maintenance",
    "agentId": "agent-1",
    "status": "active",
    "cronExpression": "0 6 * * *",
    "maxBudgetPerRun": 1.00
  },
  "days": 30,
  "stats": {
    "executionCount": 30,
    "completedCount": 29,
    "failedCount": 1,
    "totalCostUsd": 4.50,
    "avgCostUsd": 0.15,
    "avgDurationSec": 180,
    "totalTurns": 900
  },
  "daily": [
    { "date": "2026-03-12", "execution_count": 1, "cost_usd": 0.14, "turns": 28 }
  ],
  "recent": [
    {
      "id": "exec-001",
      "status": "completed",
      "actionType": "session",
      "sessionId": "session-xyz",
      "costUsd": 0.14,
      "turns": 28,
      "durationSec": 165,
      "startedAt": "2026-03-12T06:00:00Z",
      "completedAt": "2026-03-12T06:02:45Z"
    }
  ]
}
```

---

## Feedback

PR outcome tracking metrics, weekly analysis, and context generation for agent prompt improvement.

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| GET | `/api/feedback/metrics` | Current outcome metrics | any |
| GET | `/api/feedback/analysis` | Weekly analysis | any |
| GET | `/api/feedback/context` | Outcome context for prompts | any |

### Get Metrics

```bash
curl "http://localhost:3000/api/feedback/metrics?since=2026-03-06T00:00:00Z" \
  -H "Authorization: Bearer $API_KEY"
```

**Response (200):**

```json
{
  "overall": {
    "total": 25,
    "merged": 20,
    "closed": 3,
    "open": 2,
    "mergeRate": 0.87
  },
  "byRepo": {
    "CorvidLabs/corvid-agent": {
      "total": 20,
      "merged": 17,
      "closed": 2,
      "open": 1,
      "mergeRate": 0.89
    }
  },
  "failureReasons": {
    "test_failure": 2,
    "style_issues": 1
  },
  "recentOutcomes": [
    {
      "prNumber": 998,
      "repo": "CorvidLabs/corvid-agent",
      "status": "merged",
      "title": "chore: v0.26.0 release prep"
    }
  ],
  "workTaskSuccessRate": 0.92
}
```

### Query Parameters: Get Metrics

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `since` | string | — | ISO 8601 date to filter outcomes from |

### Get Weekly Analysis

```bash
curl "http://localhost:3000/api/feedback/analysis?agentId=agent-1" \
  -H "Authorization: Bearer $API_KEY"
```

**Response (200):**

```json
{
  "period": { "start": "2026-03-06T00:00:00Z", "end": "2026-03-13T00:00:00Z" },
  "prOutcomes": {
    "total": 25,
    "merged": 20,
    "closed": 3,
    "open": 2,
    "mergeRate": 0.87
  },
  "byRepo": {...},
  "failureReasons": {...},
  "workTasks": {
    "total": 15,
    "completed": 14,
    "failed": 1,
    "successRate": 0.93
  }
}
```

### Query Parameters: Weekly Analysis

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `agentId` | string | — | Filter to a specific agent |

### Get Outcome Context

Returns a formatted text string summarizing PR outcomes for injection into agent prompts.

```bash
curl http://localhost:3000/api/feedback/context \
  -H "Authorization: Bearer $API_KEY"
```

**Response (200):**

```json
{
  "context": "## PR Outcome Feedback (past 7 days)\n- Total PRs tracked: 25\n- Merged: 20 | Closed: 3 | Open: 2\n- Merge rate: 87%\n\n### By Repository\n- CorvidLabs/corvid-agent: 20 PRs (89% merged)"
}
```

---

## Audit

Read-only query interface for the immutable audit log.

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| GET | `/api/audit-log` | Query audit log entries | any |

### Query Audit Log

```bash
curl "http://localhost:3000/api/audit-log?action=session.create&actor=agent-1&start_date=2026-03-01&limit=20" \
  -H "Authorization: Bearer $API_KEY"
```

**Response (200):**

```json
{
  "entries": [
    {
      "id": 1234,
      "timestamp": "2026-03-13T10:00:00Z",
      "action": "session.create",
      "actor": "agent-1",
      "resourceType": "session",
      "resourceId": "session-abc",
      "detail": "Created new session for project proj-1",
      "traceId": "trace-xyz",
      "ipAddress": "127.0.0.1"
    }
  ],
  "total": 156,
  "offset": 0,
  "limit": 20
}
```

### Query Parameters: Audit Log

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `action` | string | — | Filter by action type (e.g. `session.create`, `agent.update`) |
| `actor` | string | — | Filter by actor ID |
| `resource_type` | string | — | Filter by resource type (e.g. `session`, `agent`) |
| `start_date` | string | — | ISO date; return entries after this date |
| `end_date` | string | — | ISO date; return entries before this date |
| `offset` | number | 0 | Pagination offset |
| `limit` | number | 50 | Page size (max 500) |

---

## Onboarding

Returns the current setup progress for new users, checking wallet, bridge, agent, and project configuration.

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| GET | `/api/onboarding/status` | Get onboarding status | any |

### Get Onboarding Status

```bash
curl http://localhost:3000/api/onboarding/status \
  -H "Authorization: Bearer $API_KEY"
```

**Response (200):**

```json
{
  "wallet": {
    "configured": true,
    "address": "ALGO_ADDRESS_58_CHARS...",
    "funded": true
  },
  "bridge": {
    "running": true,
    "network": "testnet"
  },
  "agent": {
    "exists": true,
    "count": 3,
    "walletConfigured": true
  },
  "project": {
    "exists": true,
    "count": 5
  },
  "complete": true
}
```

The `complete` field is `true` when all four conditions are met: wallet configured and funded, bridge running, at least one agent exists, and at least one project exists.

---

## Security Overview

Read-only aggregation of all security configuration: protected paths, code scanner patterns, approved domains, governance tiers, branch protection, and allowlist/blocklist counts.

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| GET | `/api/security/overview` | Get security configuration | any |

### Get Security Overview

```bash
curl http://localhost:3000/api/security/overview \
  -H "Authorization: Bearer $API_KEY"
```

**Response (200):**

```json
{
  "protectedBasenames": [".env", "id_rsa", "credentials.json"],
  "protectedSubstrings": ["secret", "private_key"],
  "approvedDomains": ["api.github.com", "registry.npmjs.org"],
  "blockedPatterns": [
    {
      "name": "hardcoded-secret",
      "category": "secrets",
      "severity": "critical"
    }
  ],
  "governanceTiers": [
    {
      "tier": 0,
      "label": "Layer 0 — Constitutional",
      "description": "Core protocol changes requiring full council approval",
      "quorumThreshold": 1.0,
      "requiresHumanApproval": true,
      "allowsAutomation": false
    }
  ],
  "governancePaths": {
    "layer0": {
      "basenames": ["constitution.md"],
      "substrings": ["governance"]
    },
    "layer1": {
      "basenames": ["package.json"],
      "substrings": ["migration"]
    }
  },
  "autoMergeEnabled": true,
  "branchProtection": {
    "enforced": true,
    "requiredReviews": 1,
    "dismissStaleReviews": true,
    "blockForcePushes": true,
    "blockDeletions": true,
    "enforceAdmins": true,
    "requiredStatusChecks": [
      "Build & Test (ubuntu-latest)",
      "Build & Test (macos-latest)",
      "Build & Test (windows-latest)"
    ]
  },
  "allowlistCount": 12,
  "blocklistCount": 3
}
```

---

## Bridge Delivery

Delivery receipt metrics for all bridge platforms (Discord, Telegram, Slack).

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| GET | `/api/bridges/delivery` | Get delivery metrics | any |

### Get Delivery Metrics

```bash
curl http://localhost:3000/api/bridges/delivery \
  -H "Authorization: Bearer $API_KEY"
```

**Response (200):**

```json
{
  "discord": {
    "total": 150,
    "success": 148,
    "failure": 2,
    "successRate": 0.987,
    "recentFailures": [
      { "timestamp": 1710300000000, "error": "Rate limited by Discord API" }
    ]
  },
  "telegram": {
    "total": 0,
    "success": 0,
    "failure": 0,
    "successRate": 0,
    "recentFailures": []
  },
  "slack": {
    "total": 25,
    "success": 25,
    "failure": 0,
    "successRate": 1.0,
    "recentFailures": []
  }
}
```

---

## A2A

Agent-to-Agent (A2A) protocol inbound task handling. Allows external agents to send tasks and poll for results.

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| POST | `/a2a/tasks/send` | Create and start a task | any |
| GET | `/a2a/tasks/{id}` | Poll task status/result | any |

### Send Task

```bash
curl -X POST http://localhost:3000/a2a/tasks/send \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "params": {
      "message": "Review the PR at https://github.com/org/repo/pull/42",
      "skill": "code-review",
      "timeoutMs": 300000
    }
  }'
```

**Response (200):**

```json
{
  "id": "a2a-task-abc123",
  "status": "working",
  "message": "Review the PR at https://github.com/org/repo/pull/42"
}
```

### Request Body: Send Task

The body accepts either a top-level format or a `params` wrapper:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `params.message` | string | yes* | Task instruction message (min 1 char) |
| `params.skill` | string | no | Requested skill/capability |
| `params.timeoutMs` | integer | no | Timeout in ms (1000-600000) |
| `message` | string | yes* | Alternative top-level message field |
| `skill` | string | no | Alternative top-level skill field |
| `timeoutMs` | integer | no | Alternative top-level timeout field |

*Either `params.message` or top-level `message` must be provided.

### Poll Task Status

```bash
curl http://localhost:3000/a2a/tasks/a2a-task-abc123 \
  -H "Authorization: Bearer $API_KEY"
```

**Response (200) — in progress:**

```json
{
  "id": "a2a-task-abc123",
  "status": "working",
  "message": "Review the PR at https://github.com/org/repo/pull/42"
}
```

**Response (200) — completed:**

```json
{
  "id": "a2a-task-abc123",
  "status": "completed",
  "message": "Review the PR at https://github.com/org/repo/pull/42",
  "result": "PR looks good. Approved with minor suggestions..."
}
```

Task statuses: `submitted`, `working`, `input-required`, `completed`, `failed`, `canceled`

---

## Backup

Trigger a database backup. Creates a timestamped copy and prunes old backups.

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| POST | `/api/backup` | Create database backup | any |

### Create Backup

```bash
curl -X POST http://localhost:3000/api/backup \
  -H "Authorization: Bearer $API_KEY"
```

**Response (200):**

```json
{
  "path": "backups/corvid-agent-2026-03-13T10-00-00-000Z.db",
  "timestamp": "2026-03-13T10:00:00.000Z",
  "sizeBytes": 10485760,
  "pruned": 2
}
```

| Field | Type | Description |
|-------|------|-------------|
| `path` | string | Path to the created backup file |
| `timestamp` | string | ISO 8601 timestamp of the backup |
| `sizeBytes` | number | Size of the backup in bytes |
| `pruned` | number | Number of old backups removed |

---

## Discord Image

Send an image to a Discord channel. Accepts JSON or multipart form data.

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| POST | `/api/discord/send-image` | Send image to Discord channel | any |

### Send Image (JSON)

```bash
curl -X POST http://localhost:3000/api/discord/send-image \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "channelId": "123456789",
    "imageBase64": "<base64-encoded-image>",
    "filename": "screenshot.png",
    "contentType": "image/png",
    "message": "Here is the image",
    "replyToMessageId": "987654321"
  }'
```

### Send Image (Multipart)

```bash
curl -X POST http://localhost:3000/api/discord/send-image \
  -H "Authorization: Bearer $API_KEY" \
  -F "channelId=123456789" \
  -F "image=@screenshot.png" \
  -F "message=Here is the image"
```

**Response (200):**

```json
{
  "success": true,
  "messageId": "1234567890"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `channelId` | string | **Required.** Discord channel ID |
| `imageBase64` | string | Base64-encoded image (JSON mode) |
| `imagePath` | string | Local file path (JSON mode, alternative to base64) |
| `filename` | string | Attachment filename (default: `image.png`) |
| `contentType` | string | MIME type (default: `image/png`) |
| `message` | string | Optional text message |
| `replyToMessageId` | string | Message ID to reply to |

---

## Memory Backfill

Re-send memories with missing on-chain transaction IDs. Retries all memories in `pending` or `failed` status.

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| POST | `/api/memories/backfill` | Backfill pending memories on-chain | any |

### Backfill Memories

```bash
curl -X POST http://localhost:3000/api/memories/backfill \
  -H "Authorization: Bearer $API_KEY"
```

**Response (200):**

```json
{
  "ok": true,
  "backfilled": 3,
  "total": 5,
  "results": [
    { "id": "mem-1", "key": "user-leif", "agentId": "abc-123", "txid": "TXID..." },
    { "id": "mem-2", "key": "feedback-x", "agentId": "abc-123", "txid": null, "error": "Failed to publish memory" }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `ok` | boolean | Always `true` on success |
| `backfilled` | number | Number of memories successfully published |
| `total` | number | Total memories attempted |
| `results` | array | Per-memory results with txid or error |

---

## Self-Test

Trigger the self-test suite to run unit tests, end-to-end tests, or both.

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| POST | `/api/selftest/run` | Run self-test suite | any |

### Run Self-Test

```bash
curl -X POST http://localhost:3000/api/selftest/run \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "testType": "all" }'
```

**Response (200):**

```json
{
  "sessionId": "session-test-abc123"
}
```

The test runs asynchronously in an agent session. Poll the session endpoint to check progress and results.

### Request Body: Run Self-Test

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `testType` | enum | no | `unit`, `e2e`, or `all` (default: `all`) |

---

## Dashboard

Aggregated dashboard summary providing agent, session, council, and work task counts plus a recent activity feed in a single request.

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| GET | `/api/dashboard/summary` | Get dashboard summary | any |

### Get Dashboard Summary

```bash
curl "http://localhost:3000/api/dashboard/summary?activityLimit=10" \
  -H "Authorization: Bearer $API_KEY"
```

**Response (200):**

```json
{
  "agents": {
    "total": 3
  },
  "sessions": {
    "active": 2,
    "byStatus": {
      "running": 2,
      "completed": 145,
      "failed": 3,
      "paused": 0
    }
  },
  "councils": {
    "active": 1
  },
  "workTasks": {
    "total": 42,
    "byStatus": {
      "pending": 2,
      "running": 1,
      "completed": 35,
      "failed": 4
    }
  },
  "recentActivity": [
    {
      "id": 5678,
      "timestamp": "2026-03-13T10:00:00Z",
      "action": "session.create",
      "actor": "agent-1",
      "resource_type": "session",
      "resource_id": "session-xyz",
      "detail": "Started scheduled session"
    }
  ]
}
```

### Query Parameters: Dashboard Summary

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `activityLimit` | number | 20 | Number of recent activity entries (1-100) |

---

## Contacts

Manage cross-platform contact identities with linked platform accounts (Discord, AlgoChat, GitHub).

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| GET | `/api/contacts` | List contacts (search, pagination) | any |
| POST | `/api/contacts` | Create contact | any |
| GET | `/api/contacts/lookup` | Lookup by name or platform+platform_id | any |
| GET | `/api/contacts/{id}` | Get contact by ID | any |
| PUT | `/api/contacts/{id}` | Update contact | any |
| DELETE | `/api/contacts/{id}` | Delete contact | any |
| POST | `/api/contacts/{id}/links` | Add platform link (discord, algochat, github) | any |
| DELETE | `/api/contacts/{id}/links/{linkId}` | Remove platform link | any |
| PUT | `/api/contacts/{id}/links/{linkId}/verify` | Mark platform link as verified | any |

---

## Brain Viewer

Read-only dashboard endpoints for inspecting agent memory state across both tiers (longterm on-chain, shortterm SQLite-only).

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| GET | `/api/dashboard/memories` | List memories (filter by agent, tier, status, category, search) | dashboard |
| GET | `/api/dashboard/memories/stats` | Memory statistics (counts by status, category, agent) | dashboard |
| GET | `/api/dashboard/memories/sync-status` | Sync status (pending/failed counts, recent failures) | dashboard |
| GET | `/api/dashboard/memories/{id}` | Get memory detail with categories and decay score | dashboard |
| GET | `/api/dashboard/memories/observations` | List observations | dashboard |
| GET | `/api/dashboard/memories/observations/stats` | Observation statistics | dashboard |
| POST | `/api/dashboard/memories/observations/{id}/graduate` | Force graduate observation | dashboard |
| POST | `/api/dashboard/memories/observations/{id}/boost` | Boost observation score | dashboard |

---

## Flock Testing

Test result tracking for Flock Directory agents with score decay.

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| GET | `/api/flock-directory/testing/stats` | Aggregate test statistics | any |
| GET | `/api/flock-directory/testing/agents/{agentId}/results` | Agent test results (with limit) | any |
| GET | `/api/flock-directory/testing/agents/{agentId}/latest` | Latest test result for agent | any |
| GET | `/api/flock-directory/testing/agents/{agentId}/score` | Effective score with decay multiplier | any |

---

## Analytics

Dashboard analytics for sessions, spending, and agent activity.

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| GET | `/api/analytics/overview` | Aggregate overview stats | any |
| GET | `/api/analytics/spending` | Daily spending breakdown | any |
| GET | `/api/analytics/sessions` | Session distribution by agent, source, status | any |
| GET | `/api/analytics/session-metrics` | Session performance metrics (filterable) | any |
| GET | `/api/analytics/session-metrics/{sessionId}` | Metrics for a single session | any |

### Get Overview

```bash
curl http://localhost:3000/api/analytics/overview \
  -H "Authorization: Bearer $API_KEY"
```

**Response (200):**

```json
{
  "totalSessions": 1250,
  "totalCostUsd": 45.23,
  "totalAlgoSpent": 120.5,
  "totalTurns": 8400,
  "totalCreditsConsumed": 2500,
  "activeSessions": 3,
  "totalAgents": 5,
  "totalProjects": 12,
  "workTasks": { "total": 340, "active": 2, "completed": 335 },
  "agentMessages": 1500,
  "algochatMessages": 820,
  "todaySpending": { "algoMicro": 3500000, "apiCostUsd": 1.20 }
}
```

### Query Parameters: Spending

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `days` | number | 30 | Number of days to include (1-365) |

---

## Exam

Model evaluation runner. Execute categorized exams against any configured model and browse historical results.

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| POST | `/api/exam/run` | Run an exam | any |
| GET | `/api/exam/categories` | List available exam categories | any |
| GET | `/api/exam/runs` | List past exam runs | any |
| GET | `/api/exam/models` | List models with exam results | any |
| GET | `/api/exam/runs/{id}` | Get a specific exam run | any |
| DELETE | `/api/exam/runs/{id}` | Delete an exam run | any |

### Run an Exam

```bash
curl -X POST http://localhost:3000/api/exam/run \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-20250514",
    "categories": ["coding", "tools"]
  }'
```

### Request Body: Run Exam

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `model` | string | yes | Model identifier to evaluate |
| `categories` | string[] | no | Subset of categories (coding, context, tools, algochat, council, instruction) |

---

## MCP API

Internal MCP tool endpoints exposed as REST. Used by agents to send messages, manage memories, and discover other agents.

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| POST | `/api/mcp/send-message` | Send AlgoChat message to another agent | any |
| POST | `/api/mcp/save-memory` | Save a memory entry | any |
| POST | `/api/mcp/recall-memory` | Recall a memory by key or query | any |
| POST | `/api/mcp/read-on-chain-memories` | Read ARC-69 on-chain memories | any |
| POST | `/api/mcp/sync-on-chain-memories` | Sync on-chain memories to local store | any |
| POST | `/api/mcp/delete-memory` | Delete a memory entry | any |
| GET | `/api/mcp/list-agents` | List known agents | any |
| POST | `/api/mcp/record-observation` | Record a new observation | any |
| POST | `/api/mcp/list-observations` | List observations for agent | any |
| POST | `/api/mcp/boost-observation` | Boost observation score | any |
| POST | `/api/mcp/dismiss-observation` | Dismiss an observation | any |
| POST | `/api/mcp/observation-stats` | Get observation statistics | any |

### Send Message

```bash
curl -X POST http://localhost:3000/api/mcp/send-message \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent-1",
    "toAgent": "agent-2",
    "message": "Hello from agent-1"
  }'
```

**Response (200):**

```json
{
  "response": "Message sent successfully",
  "isError": false
}
```

### Request Body: Send Message

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `agentId` | string | yes | Sending agent ID |
| `toAgent` | string | yes | Recipient agent name or address |
| `message` | string | yes | Message content |

### Request Body: Save Memory

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `agentId` | string | yes | Agent ID |
| `key` | string | yes | Memory key |
| `content` | string | yes | Memory content |

### Request Body: Recall Memory

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `agentId` | string | yes | Agent ID |
| `key` | string | no | Exact memory key |
| `query` | string | no | Semantic search query |

---

## MCP Servers

Manage external MCP server configurations for agent tool access.

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| GET | `/api/mcp-servers` | List MCP server configs | any |
| POST | `/api/mcp-servers` | Add MCP server config | operator |
| PUT | `/api/mcp-servers/{id}` | Update MCP server config | operator |
| DELETE | `/api/mcp-servers/{id}` | Remove MCP server config | operator |
| POST | `/api/mcp-servers/{id}/test` | Test connection and list tools | operator |

### Test MCP Server

```bash
curl -X POST http://localhost:3000/api/mcp-servers/mcp-1/test \
  -H "Authorization: Bearer $API_KEY"
```

**Response (200):**

```json
{
  "ok": true,
  "tools": [
    { "name": "search", "description": "Search the web" },
    { "name": "fetch", "description": "Fetch a URL" }
  ]
}
```

---

## Plugins

Load, unload, and manage runtime plugins with capability-based access control.

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| GET | `/api/plugins` | List loaded and available plugins | any |
| POST | `/api/plugins/load` | Load a plugin | any |
| POST | `/api/plugins/{name}/unload` | Unload a plugin | any |
| POST | `/api/plugins/{name}/grant` | Grant a capability to a plugin | any |
| POST | `/api/plugins/{name}/revoke` | Revoke a capability from a plugin | any |

### Load a Plugin

```bash
curl -X POST http://localhost:3000/api/plugins/load \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "packageName": "corvid-plugin-analytics",
    "autoGrant": true
  }'
```

### Request Body: Load Plugin

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `packageName` | string | yes | Plugin package name |
| `autoGrant` | boolean | no | Automatically grant requested capabilities |

---

## Allowlist

Manage the Algorand address allowlist for trusted interactions.

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| GET | `/api/allowlist` | List allowlisted addresses | any |
| POST | `/api/allowlist` | Add address to allowlist | any |
| PUT | `/api/allowlist/{address}` | Update allowlist entry label | any |
| DELETE | `/api/allowlist/{address}` | Remove address from allowlist | any |

### Add Address

```bash
curl -X POST http://localhost:3000/api/allowlist \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "address": "ALGO...",
    "label": "Trusted partner"
  }'
```

### Request Body: Add Address

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `address` | string | yes | Algorand address |
| `label` | string | no | Human-readable label |

---

## Repo Blocklist

Manage repositories that agents are blocked from interacting with. Tenant-scoped.

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| GET | `/api/repo-blocklist` | List blocked repos | any |
| POST | `/api/repo-blocklist` | Add repo to blocklist | any |
| DELETE | `/api/repo-blocklist/{repo}` | Remove repo from blocklist | any |

### Add Repo to Blocklist

```bash
curl -X POST http://localhost:3000/api/repo-blocklist \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "repo": "org/dangerous-repo",
    "reason": "Contains untrusted code",
    "source": "manual"
  }'
```

### Request Body: Add Repo

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `repo` | string | yes | Repository in `owner/name` format |
| `reason` | string | no | Reason for blocking |
| `source` | string | no | How the block was added (manual, automated) |
| `prUrl` | string | no | Related PR URL |

---

## GitHub Allowlist

Manage the GitHub username allowlist for trusted contributors.

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| GET | `/api/github-allowlist` | List allowlisted GitHub users | any |
| POST | `/api/github-allowlist` | Add GitHub user to allowlist | any |
| PUT | `/api/github-allowlist/{username}` | Update allowlist entry label | any |
| DELETE | `/api/github-allowlist/{username}` | Remove user from allowlist | any |

### Add GitHub User

```bash
curl -X POST http://localhost:3000/api/github-allowlist \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "octocat",
    "label": "Core contributor"
  }'
```

### Request Body: Add GitHub User

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `username` | string | yes | GitHub username |
| `label` | string | no | Human-readable label |

---

## Projects

Manage projects — working directories that agents operate within.

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| GET | `/api/projects` | List projects | any |
| POST | `/api/projects` | Create project | operator |
| GET | `/api/projects/{id}` | Get project by ID | any |
| PUT | `/api/projects/{id}` | Update project | operator |
| DELETE | `/api/projects/{id}` | Delete project | operator |
| GET | `/api/browse-dirs` | Browse allowed directories | any |

### Browse Directories

```bash
curl "http://localhost:3000/api/browse-dirs?path=/home/user/repos" \
  -H "Authorization: Bearer $API_KEY"
```

**Response (200):**

```json
{
  "current": "/home/user/repos",
  "parent": "/home/user",
  "dirs": ["project-a", "project-b", "project-c"]
}
```

### Query Parameters: Browse Directories

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `path` | string | — | Directory path to browse (must be within allowed roots) |
| `showHidden` | boolean | false | Include hidden directories |

---

## Tenants

Multi-tenant management. Register tenants, view membership, and manage API key holders.

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| POST | `/api/tenants/register` | Register a new tenant | public |
| GET | `/api/tenants/me` | Get current tenant info | any |
| GET | `/api/tenants/me/members` | List tenant members | owner |
| POST | `/api/tenants/me/members` | Add a member | owner |
| DELETE | `/api/tenants/me/members/{keyHash}` | Remove a member | owner |

### Register Tenant

```bash
curl -X POST http://localhost:3000/api/tenants/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme Corp",
    "slug": "acme-corp",
    "ownerEmail": "admin@acme.com",
    "plan": "starter"
  }'
```

**Response (201):**

```json
{
  "tenant": {
    "id": "tenant-abc123",
    "name": "Acme Corp",
    "slug": "acme-corp",
    "plan": "starter"
  },
  "apiKey": "ca_live_..."
}
```

### Request Body: Register Tenant

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Tenant display name |
| `slug` | string | yes | URL-safe identifier (3-48 chars, lowercase alphanumeric + hyphens) |
| `ownerEmail` | string | yes | Owner email address |
| `plan` | string | no | Plan tier: free, starter, pro, enterprise (default: free) |

### Add Member

```bash
curl -X POST http://localhost:3000/api/tenants/me/members \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "keyHash": "sha256-of-api-key",
    "role": "operator"
  }'
```

### Request Body: Add Member

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `keyHash` | string | yes | SHA-256 hash of the member's API key |
| `role` | string | no | Role: viewer, operator, owner (default: viewer) |

---

## Settings

Credit configuration, API key rotation, Discord config, and test data management.

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| GET | `/api/settings` | Get settings (admin sees full config) | any |
| PUT | `/api/settings/credits` | Update credit configuration | owner |
| POST | `/api/settings/api-key/rotate` | Rotate API key | owner |
| GET | `/api/settings/api-key/status` | Check API key rotation status | any |
| GET | `/api/settings/discord` | Get Discord config | operator |
| PUT | `/api/settings/discord` | Update Discord config | owner |
| DELETE | `/api/settings/discord/{key}` | Delete a Discord config key | owner |
| POST | `/api/settings/purge-test-data` | Purge test data (dry-run by default) | any |

### Rotate API Key

```bash
curl -X POST http://localhost:3000/api/settings/api-key/rotate \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "ttlDays": 90 }'
```

**Response (200):**

```json
{
  "ok": true,
  "apiKey": "ca_live_new...",
  "expiresAt": "2026-06-18T00:00:00Z",
  "gracePeriodExpiry": "2026-03-26T00:00:00Z"
}
```

### Request Body: Rotate API Key

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ttlDays` | number | no | Days until expiry |

### Purge Test Data

```bash
curl -X POST http://localhost:3000/api/settings/purge-test-data \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "force": true }'
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `force` | boolean | no | Set `true` to actually delete; omit for dry-run |

---

## System Logs

Aggregated system logs from councils, escalations, and work tasks. Also exposes credit transaction history.

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| GET | `/api/system-logs` | List system logs | any |
| GET | `/api/system-logs/credit-transactions` | List credit transactions | any |

### Query Parameters: System Logs

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | number | 50 | Results per page (1-500) |
| `offset` | number | 0 | Pagination offset |
| `type` | string | all | Filter: all, council, escalation, work-task |
| `level` | string | — | Filter by log level: info, warn, error |
| `search` | string | — | Full-text search across log messages |

### Query Parameters: Credit Transactions

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | number | 50 | Results per page |
| `offset` | number | 0 | Pagination offset |

---

## Personas

Agent persona configuration — archetype, traits, and voice customization.

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| GET | `/api/agents/{id}/persona` | Get agent persona | any |
| PUT | `/api/agents/{id}/persona` | Create or update agent persona | operator |
| DELETE | `/api/agents/{id}/persona` | Delete agent persona | operator |

### Set Agent Persona

```bash
curl -X PUT http://localhost:3000/api/agents/agent-1/persona \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "archetype": "engineer",
    "traits": ["precise", "thorough"],
    "voice": "Professional and concise"
  }'
```

---

## Skill Bundles

Reusable skill packages that can be assigned to agents and projects. Includes preset and custom bundles.

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| GET | `/api/skill-bundles` | List all skill bundles | any |
| POST | `/api/skill-bundles` | Create a skill bundle | operator |
| GET | `/api/skill-bundles/{id}` | Get skill bundle by ID | any |
| PUT | `/api/skill-bundles/{id}` | Update a skill bundle | operator |
| DELETE | `/api/skill-bundles/{id}` | Delete a skill bundle (not presets) | operator |
| GET | `/api/agents/{id}/skills` | List skills assigned to agent | any |
| POST | `/api/agents/{id}/skills` | Assign skill bundle to agent | operator |
| DELETE | `/api/agents/{id}/skills/{bundleId}` | Unassign skill from agent | operator |
| GET | `/api/projects/{id}/skills` | List skills assigned to project | any |
| POST | `/api/projects/{id}/skills` | Assign skill bundle to project | operator |
| DELETE | `/api/projects/{id}/skills/{bundleId}` | Unassign skill from project | operator |

### Assign Skill to Agent

```bash
curl -X POST http://localhost:3000/api/agents/agent-1/skills \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "bundleId": "bundle-code-review",
    "sortOrder": 1
  }'
```

### Request Body: Assign Skill Bundle

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `bundleId` | string | yes | Skill bundle ID to assign |
| `sortOrder` | number | no | Display/priority order (default: 0) |

---

## Proposals

Governance proposals with lifecycle management and vote evaluation.

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| GET | `/api/proposals` | List proposals (filter by council, status) | any |
| POST | `/api/proposals` | Create a proposal | operator |
| GET | `/api/proposals/{id}` | Get proposal by ID | any |
| PUT | `/api/proposals/{id}` | Update a proposal (draft/open only) | operator |
| DELETE | `/api/proposals/{id}` | Delete a proposal (draft only) | operator |
| POST | `/api/proposals/{id}/transition` | Transition proposal status | operator |
| GET | `/api/proposals/{id}/evaluate` | Evaluate votes and compute decision | any |

### Create Proposal

```bash
curl -X POST http://localhost:3000/api/proposals \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "councilId": "council-1",
    "title": "Adopt new logging standard",
    "description": "Proposal to switch to structured JSON logging",
    "proposedBy": "agent-1"
  }'
```

### Transition Proposal

```bash
curl -X POST http://localhost:3000/api/proposals/prop-1/transition \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "closed",
    "decision": "approved"
  }'
```

Lifecycle: `draft` → `open` → `voting` → `closed` (with decision: approved/rejected/tabled).

### Request Body: Transition

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `status` | string | yes | Target status |
| `decision` | string | no | Decision when closing (approved, rejected, tabled) |

---

## Slack

Slack Events API webhook for interactive question dispatching and thread replies.

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| POST | `/slack/events` | Slack Events API webhook | Slack signature |

This endpoint handles two payload formats:

- **Events API (JSON):** Processes `url_verification` challenges and `event_callback` messages. Thread replies matching active question dispatches are routed to the owner question manager.
- **Interactive (form-urlencoded):** Processes `block_actions` from button clicks on dispatched questions.

Authentication uses Slack's HMAC-SHA256 signature verification (`SLACK_SIGNING_SECRET`). Signatures older than 5 minutes are rejected.

---

## Operational Mode

Get or set the agent's operational mode (autonomous, supervised, paused).

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| GET | `/api/operational-mode` | Get current operational mode | any |
| POST | `/api/operational-mode` | Set operational mode | any |

---

## Escalation Queue

View and resolve escalated items that require human attention.

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| GET | `/api/escalation-queue` | List escalation queue | any |
| POST | `/api/escalation-queue/{id}/resolve` | Resolve escalation | any |

---

## Feed

Aggregated activity feed combining agent messages and AlgoChat history.

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| GET | `/api/feed/history` | Get feed history | any |

---

## AlgoChat

Algorand-based encrypted messaging status, network switching, and PSK (pre-shared key) contact management.

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| GET | `/api/algochat/status` | AlgoChat connection status | any |
| POST | `/api/algochat/network` | Switch network (testnet/mainnet) | any |
| POST | `/api/algochat/conversations` | List conversations | any |
| GET | `/api/algochat/psk-exchange` | Get PSK exchange URI | any |
| POST | `/api/algochat/psk-exchange` | Generate PSK exchange URI | any |
| GET | `/api/algochat/psk-contacts` | List PSK contacts | any |
| POST | `/api/algochat/psk-contacts` | Create PSK contact | any |
| PATCH | `/api/algochat/psk-contacts/{id}` | Rename PSK contact | any |
| DELETE | `/api/algochat/psk-contacts/{id}` | Cancel PSK contact | any |
| GET | `/api/algochat/psk-contacts/{id}/qr` | Get QR URI for PSK contact | any |

---

## Wallets

Wallet balance summaries, message history, and credit grants.

### Endpoints

| Method | Path | Summary | Auth |
|--------|------|---------|------|
| GET | `/api/wallets/summary` | Wallet summary | any |
| GET | `/api/wallets/{address}/messages` | Wallet messages | any |
| POST | `/api/wallets/{address}/credits` | Grant credits to wallet | any |

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

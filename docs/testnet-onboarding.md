# Testnet Onboarding Guide

This guide walks you through registering a tenant on a corvid-agent instance running in multi-tenant mode, creating agents, launching sessions, and managing your team. All examples use `curl` with a base URL of `https://your-corvid-instance.example.com`.

## Prerequisites

- A corvid-agent instance with `MULTI_TENANT=true` enabled.
- `curl` (or any HTTP client).
- An Anthropic API key configured on the server (or Ollama for local models).

## Registration

Register a new tenant to get an API key. This endpoint is public and does not require authentication.

```bash
curl -X POST https://your-corvid-instance.example.com/api/tenants/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Team",
    "slug": "my-team",
    "ownerEmail": "you@example.com",
    "plan": "free"
  }'
```

**Request body:**

| Field | Required | Description |
|---|---|---|
| `name` | Yes | Display name for your tenant |
| `slug` | Yes | URL-safe identifier, 3-48 chars, lowercase alphanumeric and hyphens |
| `ownerEmail` | Yes | Owner email address |
| `plan` | No | Plan tier: `free` (default), `starter`, `pro`, `enterprise` |

**Response (201 Created):**

```json
{
  "tenant": {
    "id": "t_abc123...",
    "name": "My Team",
    "slug": "my-team",
    "ownerEmail": "you@example.com",
    "plan": "free",
    "maxAgents": 3,
    "maxConcurrentSessions": 2,
    "sandboxEnabled": false,
    "status": "active",
    "createdAt": "2026-02-28T12:00:00.000Z",
    "updatedAt": "2026-02-28T12:00:00.000Z"
  },
  "apiKey": "your-api-key-here"
}
```

Save the `apiKey` value. It is shown only once.

## Using the API Key

All authenticated endpoints require the API key in the `Authorization` header:

```bash
Authorization: Bearer your-api-key-here
```

For convenience, export it as an environment variable:

```bash
export CORVID_API_KEY="your-api-key-here"
```

Then use it in every request:

```bash
curl -H "Authorization: Bearer $CORVID_API_KEY" \
  https://your-corvid-instance.example.com/api/tenants/me
```

## Tenant Info

Retrieve your current tenant details, plan, and role:

```bash
curl https://your-corvid-instance.example.com/api/tenants/me \
  -H "Authorization: Bearer $CORVID_API_KEY"
```

**Response:**

```json
{
  "id": "t_abc123...",
  "name": "My Team",
  "slug": "my-team",
  "ownerEmail": "you@example.com",
  "plan": "free",
  "maxAgents": 3,
  "maxConcurrentSessions": 2,
  "sandboxEnabled": false,
  "status": "active",
  "multiTenant": true,
  "role": "owner",
  "createdAt": "2026-02-28T12:00:00.000Z",
  "updatedAt": "2026-02-28T12:00:00.000Z"
}
```

## Creating Agents

Create an agent scoped to your tenant:

```bash
curl -X POST https://your-corvid-instance.example.com/api/agents \
  -H "Authorization: Bearer $CORVID_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "code-reviewer",
    "description": "Reviews pull requests and suggests improvements",
    "model": "claude-sonnet-4-20250514",
    "systemPrompt": "You are a thorough code reviewer. Focus on correctness, security, and readability.",
    "permissionMode": "plan"
  }'
```

**Request body:**

| Field | Required | Description |
|---|---|---|
| `name` | Yes | Agent name (must be non-empty) |
| `description` | No | Human-readable description |
| `model` | No | Model identifier (e.g. `claude-sonnet-4-20250514`) |
| `provider` | No | Provider name (`anthropic`, `ollama`) |
| `systemPrompt` | No | Custom system prompt |
| `appendPrompt` | No | Text appended to the system prompt |
| `allowedTools` | No | Comma-separated list of allowed tools |
| `disallowedTools` | No | Comma-separated list of disallowed tools |
| `permissionMode` | No | `default`, `plan`, `auto-edit`, `full-auto` |
| `maxBudgetUsd` | No | Maximum budget in USD (null for unlimited) |

**Response (201 Created):**

```json
{
  "id": "a_xyz789...",
  "name": "code-reviewer",
  "description": "Reviews pull requests and suggests improvements",
  "model": "claude-sonnet-4-20250514",
  "status": "idle",
  "tenantId": "t_abc123...",
  "createdAt": "2026-02-28T12:01:00.000Z",
  "updatedAt": "2026-02-28T12:01:00.000Z"
}
```

### Listing Agents

```bash
curl https://your-corvid-instance.example.com/api/agents \
  -H "Authorization: Bearer $CORVID_API_KEY"
```

### Getting a Single Agent

```bash
curl https://your-corvid-instance.example.com/api/agents/a_xyz789 \
  -H "Authorization: Bearer $CORVID_API_KEY"
```

### Deleting an Agent

```bash
curl -X DELETE https://your-corvid-instance.example.com/api/agents/a_xyz789 \
  -H "Authorization: Bearer $CORVID_API_KEY"
```

## Creating Sessions

Sessions are execution contexts where agents process prompts. A session requires a `projectId` (the working directory for the agent).

```bash
curl -X POST https://your-corvid-instance.example.com/api/sessions \
  -H "Authorization: Bearer $CORVID_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "proj_abc123",
    "agentId": "a_xyz789",
    "name": "Review main branch",
    "initialPrompt": "Review the latest 5 commits on main and summarize any issues."
  }'
```

**Request body:**

| Field | Required | Description |
|---|---|---|
| `projectId` | Yes | Project ID (the working directory context) |
| `agentId` | No | Agent ID to run in this session |
| `name` | No | Human-readable session name |
| `initialPrompt` | No | If provided, the session starts immediately with this prompt |

**Response (201 Created):**

```json
{
  "id": "s_sess456...",
  "projectId": "proj_abc123",
  "agentId": "a_xyz789",
  "name": "Review main branch",
  "status": "running",
  "tenantId": "t_abc123...",
  "createdAt": "2026-02-28T12:02:00.000Z",
  "updatedAt": "2026-02-28T12:02:00.000Z"
}
```

When `initialPrompt` is provided, the session starts running immediately. Without it, the session is created in `idle` status and can be resumed later.

### Listing Sessions

```bash
curl https://your-corvid-instance.example.com/api/sessions \
  -H "Authorization: Bearer $CORVID_API_KEY"
```

### Getting Session Messages

```bash
curl https://your-corvid-instance.example.com/api/sessions/s_sess456/messages \
  -H "Authorization: Bearer $CORVID_API_KEY"
```

### Stopping a Session

```bash
curl -X POST https://your-corvid-instance.example.com/api/sessions/s_sess456/stop \
  -H "Authorization: Bearer $CORVID_API_KEY"
```

### Resuming a Session

```bash
curl -X POST https://your-corvid-instance.example.com/api/sessions/s_sess456/resume \
  -H "Authorization: Bearer $CORVID_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Now focus on the security implications."}'
```

## Plan Limits

Each plan tier enforces limits on the number of agents and concurrent sessions your tenant can use:

| Plan | Max Agents | Max Concurrent Sessions | Monthly Credits | Storage | Sandbox | Marketplace | Federation |
|---|---|---|---|---|---|---|---|
| **free** | 3 | 2 | 1,000 | 100 MB | No | No | No |
| **starter** | 10 | 5 | 10,000 | 1 GB | Yes | Yes | No |
| **pro** | 50 | 20 | 100,000 | 10 GB | Yes | Yes | Yes |
| **enterprise** | Unlimited | Unlimited | Unlimited | Unlimited | Yes | Yes | Yes |

When you hit a limit, the API returns an error. For example, creating a 4th agent on the free plan:

```json
{
  "error": "Agent limit reached for plan 'free' (max: 3)"
}
```

To upgrade your plan, contact the instance administrator or use the billing API if Stripe integration is enabled.

## Member Management

Tenant owners can manage team members. Members are identified by the SHA-256 hash of their API key.

### List Members

```bash
curl https://your-corvid-instance.example.com/api/tenants/me/members \
  -H "Authorization: Bearer $CORVID_API_KEY"
```

**Response:**

```json
{
  "members": [
    {
      "tenantId": "t_abc123...",
      "keyHash": "a1b2c3d4e5f6...",
      "role": "owner",
      "createdAt": "2026-02-28T12:00:00.000Z",
      "updatedAt": "2026-02-28T12:00:00.000Z"
    }
  ]
}
```

### Add a Member

To add a member, you need the SHA-256 hash of their API key. Roles are `owner`, `operator`, or `viewer`.

```bash
curl -X POST https://your-corvid-instance.example.com/api/tenants/me/members \
  -H "Authorization: Bearer $CORVID_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "keyHash": "sha256-hash-of-their-api-key",
    "role": "operator"
  }'
```

**Response (201 Created):**

```json
{
  "ok": true,
  "keyHash": "sha256-hash-of-their-api-key",
  "role": "operator"
}
```

### Remove a Member

```bash
curl -X DELETE https://your-corvid-instance.example.com/api/tenants/me/members/sha256-hash-of-their-api-key \
  -H "Authorization: Bearer $CORVID_API_KEY"
```

**Response:**

```json
{
  "ok": true
}
```

### RBAC Roles

| Role | Permissions |
|---|---|
| `owner` | Full access. Can manage members, billing, and all resources. |
| `operator` | Can create and manage agents, sessions, projects. Cannot manage members or billing. |
| `viewer` | Read-only access to agents, sessions, and project data. |

Only `owner` role can access the member management endpoints (`GET/POST/DELETE /api/tenants/me/members`).

## Rate Limits

The server enforces per-IP rate limits on all endpoints. Limits vary by authentication tier:

| Tier | GET (per minute) | Mutations (per minute) |
|---|---|---|
| Public (unauthenticated) | 300 | 30 |
| User (authenticated with API key) | 600 | 60 |
| Admin | 1,200 | 120 |

These are default values. The instance administrator may configure different thresholds via `RATE_LIMIT_GET` and `RATE_LIMIT_MUTATION` environment variables.

Every response includes rate limit headers:

```
X-RateLimit-Limit: 600
X-RateLimit-Remaining: 594
X-RateLimit-Reset: 1740700860
```

When the limit is exceeded, the server returns HTTP `429 Too Many Requests`. Wait until the `X-RateLimit-Reset` timestamp (Unix epoch seconds) before retrying.

Exempt endpoints (not rate-limited):

- `/api/health` and `/health/*`
- `/webhooks/github`
- `/ws` (WebSocket)
- `/.well-known/agent-card.json`

## Example Workflows

### Workflow 1: Register, Create an Agent, Run a Task

A complete end-to-end flow from registration to getting agent output.

```bash
# 1. Register a tenant
RESPONSE=$(curl -s -X POST https://your-corvid-instance.example.com/api/tenants/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Demo Team",
    "slug": "demo-team",
    "ownerEmail": "dev@example.com"
  }')

# Extract the API key (requires jq)
export CORVID_API_KEY=$(echo "$RESPONSE" | jq -r '.apiKey')
echo "API Key: $CORVID_API_KEY"

# 2. Create a project (the working directory for the agent)
PROJECT=$(curl -s -X POST https://your-corvid-instance.example.com/api/projects \
  -H "Authorization: Bearer $CORVID_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-app",
    "path": "/home/user/projects/my-app"
  }')

PROJECT_ID=$(echo "$PROJECT" | jq -r '.id')

# 3. Create an agent
AGENT=$(curl -s -X POST https://your-corvid-instance.example.com/api/agents \
  -H "Authorization: Bearer $CORVID_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "assistant",
    "description": "General-purpose development assistant",
    "permissionMode": "plan"
  }')

AGENT_ID=$(echo "$AGENT" | jq -r '.id')

# 4. Create a session with an initial prompt (starts immediately)
SESSION=$(curl -s -X POST https://your-corvid-instance.example.com/api/sessions \
  -H "Authorization: Bearer $CORVID_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"projectId\": \"$PROJECT_ID\",
    \"agentId\": \"$AGENT_ID\",
    \"name\": \"Initial review\",
    \"initialPrompt\": \"List all TODO comments in the codebase and summarize what needs to be done.\"
  }")

SESSION_ID=$(echo "$SESSION" | jq -r '.id')
echo "Session started: $SESSION_ID"

# 5. Poll for messages (or connect via WebSocket for real-time updates)
sleep 10
curl -s https://your-corvid-instance.example.com/api/sessions/$SESSION_ID/messages \
  -H "Authorization: Bearer $CORVID_API_KEY" | jq '.'
```

### Workflow 2: Team Onboarding

Add a team member with operator access so they can create agents and sessions but cannot manage billing or members.

```bash
# The new team member needs an API key.
# Generate one (the instance admin or owner does this):

# Compute the SHA-256 hash of the new member's API key
# (The member shares their key hash, not the raw key)
KEY_HASH=$(echo -n "their-api-key" | shasum -a 256 | cut -d' ' -f1)

# Add them as an operator
curl -X POST https://your-corvid-instance.example.com/api/tenants/me/members \
  -H "Authorization: Bearer $CORVID_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"keyHash\": \"$KEY_HASH\",
    \"role\": \"operator\"
  }"

# Verify the member list
curl -s https://your-corvid-instance.example.com/api/tenants/me/members \
  -H "Authorization: Bearer $CORVID_API_KEY" | jq '.members'
```

### Workflow 3: Check Tenant Status and Plan Usage

```bash
# View your tenant info and plan
curl -s https://your-corvid-instance.example.com/api/tenants/me \
  -H "Authorization: Bearer $CORVID_API_KEY" | jq '{
    name: .name,
    plan: .plan,
    maxAgents: .maxAgents,
    maxConcurrentSessions: .maxConcurrentSessions,
    status: .status
  }'

# Count current agents
AGENT_COUNT=$(curl -s https://your-corvid-instance.example.com/api/agents \
  -H "Authorization: Bearer $CORVID_API_KEY" | jq 'length')

echo "Agents used: $AGENT_COUNT"

# Count current sessions
SESSION_COUNT=$(curl -s https://your-corvid-instance.example.com/api/sessions \
  -H "Authorization: Bearer $CORVID_API_KEY" | jq 'length')

echo "Sessions used: $SESSION_COUNT"
```

## WebSocket Real-Time Updates

For real-time session output, connect to the WebSocket endpoint instead of polling:

```
wss://your-corvid-instance.example.com/ws?key=your-api-key-here
```

The WebSocket streams session events (messages, status changes, errors) as they happen.

## Error Responses

The API returns consistent JSON error responses:

| Status | Meaning |
|---|---|
| `400` | Bad request -- invalid or missing fields |
| `401` | Authentication required -- missing or malformed `Authorization` header |
| `403` | Forbidden -- invalid API key |
| `404` | Resource not found |
| `409` | Conflict -- e.g. slug already taken during registration |
| `429` | Rate limit exceeded |
| `503` | Service unavailable -- e.g. multi-tenant mode not enabled |

Example error:

```json
{
  "error": "slug must be 3-48 chars, lowercase alphanumeric and hyphens only"
}
```

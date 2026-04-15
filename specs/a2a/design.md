---
spec: a2a.spec.md
sources:
  - server/a2a/types.ts
  - server/a2a/client.ts
  - server/a2a/task-handler.ts
  - server/a2a/agent-card.ts
  - server/a2a/invocation-guard.ts
---

## Layout

The A2A module lives in `server/a2a/` and is organized into five focused files:

- `types.ts` — all shared TypeScript types and the `DepthExceededError` class
- `client.ts` — outbound HTTP client: agent card fetching, task submission, polling
- `task-handler.ts` — inbound task processing, in-memory task store, state machine
- `agent-card.ts` — builds A2A-compliant Agent Card documents for this instance and per-agent
- `invocation-guard.ts` — `SessionInvocationBudget` and `InboundA2ARateLimiter` classes

Routes are handled by `server/routes/a2a.ts` which imports from this module.

## Components

### TaskStore (in-memory, module-level)
A `Map<string, A2ATask>` capped at 1000 entries. Pruning removes up to 100 completed/failed tasks when capacity is exceeded. Tasks are never persisted to SQLite — they live only for the process lifetime. The store is accessible via `handleTaskGet` and cleared via `clearTaskStore` (test helper).

### Task State Machine
Forward-only transitions: `submitted` → `working` → `completed | failed`. Transitions are driven by `ProcessManager` events:
- `assistant` event → append agent message
- `session_exited` / `session_stopped` → completed
- `error` event → failed
- Timeout timer (default 5 min) → failed

### Agent Card Cache (module-level Map)
Maps base URL strings to `{ card, fetchedAt }` entries. TTL is 5 minutes. Stale entries are pruned on next fetch for that URL.

### SessionInvocationBudget
Per-session tracker with three limits:
- `invocationLimit` — max total remote invocations per session
- `uniqueAgentLimit` — max distinct remote agents per session
- Cooldown window — prevents rapid-fire calls to the same agent

### InboundA2ARateLimiter
Sliding-window rate limiter keyed by source agent ID. Limits inbound task submissions per source agent per time window.

## Tokens

| Constant | Value | Location |
|----------|-------|----------|
| `MAX_A2A_DEPTH` | `3` | `server/a2a/types.ts` |
| Task store cap | `1000` entries | `server/a2a/task-handler.ts` |
| Prune batch size | `100` entries | `server/a2a/task-handler.ts` |
| Default task timeout | `5 minutes` | `server/a2a/task-handler.ts` |
| Poll interval | `3 seconds` | `server/a2a/client.ts` |
| Agent card cache TTL | `5 minutes` | `server/a2a/client.ts` |
| `PORT` env var | `3000` | Used in agent card URL |
| `BIND_HOST` env var | `127.0.0.1` | Used in agent card URL |

## Assets

### Related Routes
- `POST /a2a/tasks/send` — inbound task submission (calls `handleTaskSend`)
- `GET /a2a/tasks/:id` — task status polling (calls `handleTaskGet`)
- `GET /.well-known/agent-card.json` — serve instance-level agent card (calls `buildAgentCard`)
- `GET /api/agents/:id/agent-card` — per-agent card (calls `buildAgentCardForAgent`)

### External Dependencies
- Remote A2A agents accessed via HTTPS REST calls
- MCP tool registry (for building skills list in agent cards)
- SQLite `agents` table (for finding default agent for inbound tasks)
- `ProcessManager` event bus (drives task state transitions)

---
spec: a2a.spec.md
---

## User Stories

- As a team agent, I want to invoke a remote agent by URL and receive its response so that I can delegate specialized tasks without human intervention
- As an agent operator, I want to view the A2A Agent Card for any agent on my platform so that I can verify its advertised capabilities and skills
- As an external agent, I want to submit tasks to the corvid-agent instance via the A2A protocol so that I can request work and receive structured results
- As a platform administrator, I want to configure invocation budgets and rate limits so that agents cannot exhaust resources through runaway A2A call chains
- As an agent developer, I want inbound A2A tasks to automatically route to the correct agent and create sessions so that I do not have to manually wire up task processing
- As a platform administrator, I want A2A invocation depth capped at a fixed limit so that recursive agent-to-agent calls cannot cause infinite loops

## Acceptance Criteria

- `fetchAgentCard` retrieves a remote agent card from `/.well-known/agent-card.json` and caches it for 5 minutes; stale entries trigger a fresh HTTP request
- `discoverAgent` returns `null` on any fetch failure instead of throwing
- `validateUrl` throws `ValidationError` for non-HTTP/HTTPS URLs
- `invokeRemoteAgent` submits a task via POST to `/a2a/tasks/send`, then polls `GET /a2a/tasks/:id` every 3 seconds until a terminal state or timeout
- `invokeRemoteAgent` extracts the last `role: 'agent'` message text as `responseText` on completion
- `handleTaskSend` selects the first agent with a `defaultProjectId`, creates a session with `source: 'agent'`, and starts a process
- `handleTaskSend` throws `NotFoundError('Agent with default project')` when no suitable agent exists
- Task state transitions follow `submitted -> working -> (completed | failed)` with no backward transitions
- Tasks stuck in `working` beyond `timeoutMs` (default 5 minutes) transition to `failed` with "Task timed out"
- The in-memory task store is capped at 1000 entries; oldest completed/failed tasks are pruned 100 at a time
- `buildAgentCard` produces an A2A-compliant Agent Card with all registered MCP tools mapped as skills
- `buildAgentCardForAgent` respects agent-specific `mcpToolPermissions` when listing skills
- Agent card validation rejects cards missing `name` or `version` with `ValidationError`
- `SessionInvocationBudget` enforces per-session invocation limits, unique agent limits, and cooldown periods
- `InboundA2ARateLimiter` applies sliding-window rate limiting on inbound tasks per source agent
- `DepthExceededError` is thrown when invocation chain depth exceeds `MAX_A2A_DEPTH` (3)

## Constraints

- All remote agent card fetches and task submissions require valid HTTPS or HTTP URLs
- Polling interval is fixed at 3 seconds; not configurable per-call
- Task store is entirely in-memory; tasks are lost on server restart
- Agent card cache TTL is 5 minutes and is not configurable at runtime
- Invocation guard configuration is loaded from environment variables at startup via `loadInvocationGuardConfig`
- The module depends on the process manager for session lifecycle events; it does not manage processes directly

## Out of Scope

- Persistent task storage across server restarts
- Streaming or push-based task status updates (WebSocket/SSE)
- Authentication or authorization of remote agents beyond rate limiting
- Multi-turn conversational A2A interactions (each task is a single request/response)
- Custom transport protocols (only HTTP/HTTPS supported)
- Agent card discovery via DNS or other non-HTTP mechanisms

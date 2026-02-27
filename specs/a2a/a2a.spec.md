---
module: a2a-protocol
version: 1
status: draft
files:
  - server/a2a/types.ts
  - server/a2a/client.ts
  - server/a2a/task-handler.ts
  - server/a2a/agent-card.ts
db_tables: []
depends_on: []
---

# A2A Protocol

## Purpose

Agent-to-Agent (A2A) protocol implementation for inter-agent communication. Handles both outbound invocations (fetching remote agent cards, submitting tasks, polling for results) and inbound task processing (creating sessions, running agent processes, capturing results). Also generates A2A-compliant Agent Card documents describing this agent's capabilities and skills.

## Public API

### Exported Types

| Type | Description |
|------|-------------|
| `A2ATaskState` | Union: `'submitted' \| 'working' \| 'completed' \| 'failed'` |
| `A2AMessage` | Message with role (`user` or `agent`) and text parts |
| `A2ATask` | Task with id, state, messages, sessionId, and timestamps |
| `A2ATaskSendRequest` | Inbound request shape for `tasks/send` method |
| `A2ATaskDeps` | Dependency injection for task handler (db, processManager, optional overrides) |
| `RemoteInvocationResult` | Result of remote agent invocation: success, taskId, responseText, error |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `fetchAgentCard` | `(baseUrl: string)` | `Promise<A2AAgentCard>` | Fetch remote agent card from `/.well-known/agent-card.json` with 5-min cache |
| `discoverAgent` | `(baseUrl: string)` | `Promise<A2AAgentCard \| null>` | Safe wrapper — returns null on fetch failure |
| `clearAgentCardCache` | `()` | `void` | Clear the in-memory agent card cache |
| `invokeRemoteAgent` | `(baseUrl, message, options?)` | `Promise<RemoteInvocationResult>` | Submit task to remote agent and poll until completion |
| `handleTaskSend` | `(deps, body)` | `A2ATask` | Handle inbound task: resolve agent, create session, start process |
| `handleTaskGet` | `(taskId: string)` | `A2ATask \| null` | Retrieve a task by ID from in-memory store |
| `clearTaskStore` | `()` | `void` | Clear all tasks from in-memory store |
| `buildAgentCard` | `(baseUrl?: string)` | `A2AAgentCard` | Build the primary instance-level A2A Agent Card |
| `buildAgentCardForAgent` | `(agent, baseUrl?, db?)` | `A2AAgentCard` | Build an agent-specific A2A Agent Card |

## Invariants

1. **Task state machine is forward-only**: Tasks transition `submitted` -> `working` -> (`completed` | `failed`). No backward transitions are possible.
2. **Task state transitions are event-driven**: Completion and failure are triggered by process manager events (`session_exited`/`session_stopped` -> completed, `error` -> failed), not by internal polling.
3. **First agent with defaultProjectId is selected**: Inbound tasks are always routed to the first agent that has a `defaultProjectId` configured.
4. **Task store is capped at 1000 entries**: When the cap is exceeded, the oldest completed/failed tasks are pruned (100 entries removed per pruning cycle).
5. **Active tasks are never pruned**: Only tasks in `completed` or `failed` state are eligible for eviction.
6. **Timeout produces a failed task**: If a task stays in `working` state beyond `timeoutMs` (default 5 minutes), it transitions to `failed` with a "Task timed out" message.
7. **Timeout is cleared on session exit**: When the session exits or an error occurs, the timeout timer is cancelled to prevent double state transitions.
8. **Agent card cache TTL is 5 minutes**: Cached cards are returned if fetched within the last 5 minutes; stale entries are pruned on the next fetch.
9. **Agent card validation requires name and version**: Cards missing `name` or `version` throw `ValidationError`.
10. **Remote invocation polls every 3 seconds**: After task submission, the client polls `GET /a2a/tasks/:id` at 3-second intervals until a terminal state or timeout.
11. **Remote invocation extracts last agent message**: On completion, the response text is extracted from the last message with `role = 'agent'`.
12. **Agent cards include all registered MCP tools as skills**: Tools are mapped to skills using humanized names and tag categories.
13. **Sessions created for A2A tasks use `source: 'agent'`**: Distinguishes agent-originated sessions from user-originated ones.
14. **Agent-specific cards respect `mcpToolPermissions`**: If an agent has custom tool permissions, only those tools appear as skills; otherwise, the default set is used.

## Behavioral Examples

### Scenario: Inbound task lifecycle

- **Given** an agent with `defaultProjectId` exists in the database
- **When** `handleTaskSend(deps, { message: 'Hello' })` is called
- **Then** a task is created with `state = 'submitted'`, transitions to `working` after session creation
- **When** the process manager emits an `assistant` event with content "Hi there"
- **Then** an agent message is appended to the task's messages array
- **When** the process manager emits `session_exited`
- **Then** task transitions to `completed`

### Scenario: Inbound task timeout

- **Given** a task is in `working` state with `timeoutMs = 5000`
- **When** 5 seconds elapse without a session exit event
- **Then** task transitions to `failed` with message "Task timed out"

### Scenario: Remote agent invocation

- **Given** a remote agent at `https://agent.example.com`
- **When** `invokeRemoteAgent('https://agent.example.com', 'Summarize this')` is called
- **Then** a POST is sent to `/a2a/tasks/send` with the message
- **When** polling returns `{ state: 'completed', messages: [{ role: 'agent', parts: [{ text: 'Summary...' }] }] }`
- **Then** returns `{ success: true, taskId: '...', responseText: 'Summary...' }`

### Scenario: Agent card caching

- **Given** `fetchAgentCard('https://agent.example.com')` was called 2 minutes ago
- **When** `fetchAgentCard('https://agent.example.com')` is called again
- **Then** the cached card is returned without making an HTTP request
- **When** called after 6 minutes
- **Then** a fresh HTTP request is made

### Scenario: No suitable agent for inbound task

- **Given** no agents have `defaultProjectId` set
- **When** `handleTaskSend(deps, { message: 'Hello' })` is called
- **Then** `NotFoundError('Agent with default project')` is thrown

## Error Cases

| Condition | Behavior |
|-----------|----------|
| No agent with `defaultProjectId` | `NotFoundError('Agent with default project')` |
| Remote agent card fetch fails (non-2xx) | `ExternalServiceError` with HTTP status |
| Remote agent card missing name/version | `ValidationError` with field details |
| Remote agent discovery fails | `discoverAgent` returns `null` (error swallowed) |
| Task submission to remote fails (non-2xx) | Returns `{ success: false, error: 'Submit failed: HTTP ...' }` |
| Remote task poll times out | Returns `{ success: false, error: 'Timed out after ...ms' }` |
| Remote task enters `failed` state | Returns `{ success: false, error: responseText \|\| 'Task failed' }` |
| Process manager emits `error` event | Task transitions to `failed`, timeout cleared |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `bun:sqlite` | `Database` type |
| `shared/types` | `A2AAgentCard`, `A2AAgentSkill`, `A2AProtocolExtension`, `Agent` |
| `server/lib/logger` | `createLogger` |
| `server/lib/errors` | `ExternalServiceError`, `ValidationError`, `NotFoundError` |
| `server/process/manager` | `ProcessManager` (subscribe, startProcess) |
| `server/db/agents` | `listAgents` |
| `server/db/sessions` | `createSession` |
| `server/db/personas` | `getPersona` (agent card enrichment) |
| `server/db/skill-bundles` | `getAgentBundles` (agent card enrichment) |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/index.ts` | `buildAgentCard` for startup |
| `server/routes/a2a.ts` | `handleTaskSend`, `handleTaskGet`, `A2ATaskDeps` |
| `server/routes/agents.ts` | `buildAgentCardForAgent` |
| `server/mcp/tool-handlers/index.ts` | `handleDiscoverAgent`, `handleInvokeRemoteAgent` |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `PORT` | `3000` | Server port used in agent card URL |
| `BIND_HOST` | `127.0.0.1` | Host used in agent card URL |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-26 | corvid-agent | Initial spec |

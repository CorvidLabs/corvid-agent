---
spec: a2a.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/__tests__/a2a-tasks.test.ts` | Unit | Task store CRUD, state machine transitions, pruning at 1000-entry cap, timeout behavior |
| `server/__tests__/a2a-agent-card.test.ts` | Unit | `buildAgentCard`, `buildAgentCardForAgent`, tool-to-skill mapping, `mcpToolPermissions` filtering |
| `server/__tests__/a2a-invoke.test.ts` | Unit | `invokeRemoteAgent`: task submission, polling, success/failure/timeout paths, last-agent-message extraction |
| `server/__tests__/a2a-invoke-handler.test.ts` | Unit | `handleTaskSend`: session creation, agent routing, event-driven state transitions |
| `server/__tests__/a2a-invocation-guard.test.ts` | Unit | `SessionInvocationBudget` limits, `InboundA2ARateLimiter` sliding window |
| `server/__tests__/a2a-routes-guard.test.ts` | Integration | `MAX_A2A_DEPTH` header enforcement, guard rejection paths |
| `server/__tests__/routes-a2a.test.ts` | Integration | HTTP route handlers for `/a2a/tasks/send` and `/a2a/tasks/:id` |

## Manual Testing

- [ ] Start a local corvid-agent instance and verify `GET /.well-known/agent-card.json` returns a valid A2A card with name, version, and skills matching registered MCP tools
- [ ] Use `invokeRemoteAgent` via the `corvid_invoke_remote_agent` MCP tool against a second local instance; confirm the task completes and returns the agent's response text
- [ ] Verify that submitting a task when no agent has `defaultProjectId` set returns a 404 with a clear error message
- [ ] Send a task and let it time out (set `timeoutMs` to a short value in testing); confirm the task transitions to `failed` with "Task timed out"
- [ ] Confirm the agent card cache works: fetch the same remote card twice within 5 minutes and verify no second HTTP request is made (check logs)

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| Task store at exactly 1000 entries | Next insert triggers pruning of 100 oldest completed/failed tasks |
| Task store at 1000 but all tasks are `working` | Pruning finds nothing eligible; store grows past 1000 (active tasks are never evicted) |
| `session_exited` fires after timeout already set task to `failed` | No double transition — task remains `failed`, timeout timer was already cleared |
| `handleTaskSend` called with multiple agents having `defaultProjectId` | First matching agent is selected (list order) |
| `invokeRemoteAgent` poll returns `working` indefinitely | Times out after `pollTimeoutMs`, returns `{ success: false, error: 'Timed out after ...ms' }` |
| Agent card missing `name` | `validateUrl` throws `ValidationError` |
| Agent card missing `version` | `validateUrl` throws `ValidationError` |
| `discoverAgent` called with unreachable URL | Returns `null` silently (no throw) |
| A2A depth header at `MAX_A2A_DEPTH` (3) | Request is rejected with `DepthExceededError` |
| Concurrent `ensureBrowser`-style calls to `fetchAgentCard` | Only one HTTP request fires; second caller awaits cache |

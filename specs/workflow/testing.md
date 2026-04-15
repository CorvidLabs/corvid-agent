---
spec: service.spec.md
---

## Automated Testing

No test files currently exist for this module. Recommended test file:

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/workflow/service.test.ts` | Integration | Linear execution, conditional branching, parallel+join, pause/resume/cancel, max-node-runs safety, node failure cascade, delay cap, template resolution, condition expression evaluation |

Key fixtures: in-memory SQLite with `workflows`/`workflow_runs`/`workflow_node_runs`; stub `ProcessManager` with controllable session events; stub `WorkTaskService`; a helper that constructs node/edge graphs inline.

## Manual Testing

- [ ] Create a simple linear workflow (start → agent_session → end) via the UI; trigger it and verify it runs to completion with the session output captured.
- [ ] Create a conditional workflow; trigger it and verify only the correct branch executes based on the condition result.
- [ ] Create a parallel workflow with two work_task nodes; verify both execute concurrently (start within seconds of each other) and the join node waits for both.
- [ ] Pause a running workflow mid-execution; verify no new nodes advance; then resume and verify it completes.
- [ ] Cancel a running workflow; verify status becomes `cancelled` and no further nodes execute.
- [ ] Restart the server while a workflow run is `running`; verify the run resumes on the next polling tick without being marked failed.

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| Trigger workflow that is not `active` | Throws `"Workflow is not active (status: {status})"` |
| Workflow has no `start` node | Throws `"Workflow has no start node"` |
| Run exceeds 100 node runs | Run marked `failed` with `"Max node runs (100) exceeded"` |
| `MAX_CONCURRENT_NODES` (4) already executing | New eligible nodes wait until a slot frees |
| Join node: one predecessor still pending | Join node stays pending until all predecessors complete |
| Condition node: expression throws | Logs warning; defaults to `{ conditionResult: false }` |
| Condition edge: `conditionResult = true`, edge condition = `"false"` | Edge not traversed |
| Delay node: `config.delayMs` > 3,600,000 | Capped at 3,600,000 ms (1 hour) |
| `agent_session` node: no agent ID configured | Throws `"No agent ID configured"` |
| `agent_session` node: agent not found | Throws `"Agent not found: {id}"` |
| `agent_session` node: session times out | Throws `"Session {id} timed out after {N}s"` |
| `agent_session` node: session ends with error | Throws `"Session {id} ended with error"` |
| `work_task` node: `WorkTaskService` not injected | Throws `"Work task service not available"` |
| `webhook_wait` node executed by polling loop | Throws immediately (must be completed via API) |
| Unknown node type | Throws `"Unknown node type: {type}"` |
| Any node fails | Entire run marked `failed` with `"Node \"{label}\" failed: {message}"` |
| Event callback throws | Caught and logged; other callbacks still fire |
| `pauseRun` on non-running run | Returns `false` |
| `resumeRun` on non-paused run | Returns `false` |
| `cancelRun` on terminal run | Returns `false` |
| Template `{{missing.path}}` in prompt | Resolved to empty string (no error) |

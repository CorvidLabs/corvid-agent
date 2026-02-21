---
module: workflow-service
version: 1
status: draft
files:
  - server/workflow/service.ts
db_tables:
  - workflows
  - workflow_runs
  - workflow_node_runs
depends_on:
  - specs/process/process-manager.spec.md
  - specs/work/work-task-service.spec.md
  - specs/db/sessions.spec.md
---

# Workflow Service

## Purpose

Graph-based workflow orchestration engine. Executes workflow graphs by traversing nodes (agent sessions, work tasks, conditions, delays, transforms, parallel/join) and following edges to determine the next steps. Supports parallel execution within concurrency limits, conditional branching with simple expression evaluation, data passing between nodes via predecessor outputs, and template variable resolution.

## Public API

### Exported Classes

| Class | Description |
|-------|-------------|
| `WorkflowService` | Orchestrates workflow execution: triggers runs, advances nodes, manages lifecycle |

#### WorkflowService Constructor

| Parameter | Type | Description |
|-----------|------|-------------|
| `db` | `Database` | SQLite database handle |
| `processManager` | `ProcessManager` | For spawning agent sessions |
| `workTaskService` | `WorkTaskService \| null` | Optional — for executing `work_task` nodes |
| `agentMessenger` | `AgentMessenger \| null` | Optional — for agent messaging (set later via setter) |

#### WorkflowService Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `setAgentMessenger` | `(messenger: AgentMessenger)` | `void` | Late-inject agent messenger (set after async AlgoChat init) |
| `start` | `()` | `void` | Start the execution polling loop; recovers stale runs on startup |
| `stop` | `()` | `void` | Stop the polling loop |
| `onEvent` | `(callback: WorkflowEventCallback)` | `() => void` | Subscribe to workflow events; returns unsubscribe function |
| `triggerWorkflow` | `(workflowId: string, input?: Record<string, unknown>)` | `Promise<WorkflowRun>` | Trigger a new workflow execution |
| `pauseRun` | `(runId: string)` | `boolean` | Pause a running workflow |
| `resumeRun` | `(runId: string)` | `Promise<boolean>` | Resume a paused workflow |
| `cancelRun` | `(runId: string)` | `boolean` | Cancel a running or paused workflow |
| `getStats` | `()` | `{ running, activeRuns, runningNodes, totalWorkflows, hasMessenger }` | Service health statistics |

## Node Types

| Type | Behavior |
|------|----------|
| `start` | Entry point — passes workflow input through. Automatically completed on trigger |
| `end` | Terminal node — marks completion with `{ completed: true }` merged with input |
| `agent_session` | Spawns an agent session with a resolved prompt template, waits for completion |
| `work_task` | Creates a work task via WorkTaskService |
| `condition` | Evaluates a simple expression, outputs `{ conditionResult: boolean }` for edge routing |
| `delay` | Waits for `config.delayMs` milliseconds (capped at 1 hour) |
| `transform` | Resolves a `{{var}}` template against input data |
| `parallel` | Pass-through node — branching is handled by graph edges |
| `join` | Pass-through node — requires ALL incoming edges' source nodes to complete before executing |
| `webhook_wait` | Not executed internally — must be completed externally via the API |

## Invariants

1. **Workflow must be active**: `triggerWorkflow` rejects workflows with status other than `active`
2. **Start node required**: `triggerWorkflow` rejects workflows that have no `start` node
3. **Graph snapshot**: Each run stores a snapshot of the workflow's nodes and edges at trigger time, isolating it from subsequent graph edits
4. **Polling loop**: Active runs are checked every 5 seconds for nodes that can be advanced
5. **Join semantics**: Join nodes require ALL predecessor nodes to be completed. All other node types require ANY single predecessor to be completed
6. **Condition edge routing**: Edges from condition nodes have a `condition` field (string). Only edges whose condition matches `String(conditionResult)` are traversed
7. **Max concurrent nodes**: At most 4 nodes execute concurrently across all runs (`MAX_CONCURRENT_NODES = 4`)
8. **Max node runs safety**: If a workflow run exceeds 100 node runs, it is marked as failed to prevent infinite loops
9. **Node failure propagation**: If any node fails, the entire workflow run is marked as failed with the node's error message
10. **Input merging**: Node input is gathered by merging the workflow's initial input with all predecessor outputs. The last predecessor's output is also available as `prev`
11. **Template resolution**: `{{var.path}}` patterns in prompts and templates are resolved against the input data using dot-path traversal
12. **Condition expression evaluation**: Supports `true`/`false` literals, `includes()` string method, comparison operators (`===`, `!==`, `>`, `<`, `>=`, `<=`), and truthy path checks. Unknown expressions default to the truthiness of the resolved path
13. **Session wait polling**: `agent_session` nodes poll for session completion every 2 seconds with a timeout of `maxTurns * 30s`
14. **Delay cap**: Delay nodes are capped at 1 hour (3,600,000ms) regardless of `config.delayMs`
15. **Run completion detection**: A run completes when all end nodes are complete, or when any end node is complete and no active/pending nodes remain (for conditional flows)
16. **Stale run recovery**: On startup, runs that were `running` when the server shut down are not failed — the service attempts to advance them in the next tick
17. **Event broadcasting**: All run and node status changes emit events for WebSocket forwarding

## Behavioral Examples

### Scenario: Simple linear workflow execution

- **Given** a workflow with nodes: start → agent_session → end
- **When** `triggerWorkflow(workflowId, { task: "Write tests" })` is called
- **Then** a run is created, the start node completes immediately with the input
- **And** the agent_session node creates a session with the resolved prompt, waits for it to finish
- **When** the session completes
- **Then** the end node completes and the run status becomes `completed`

### Scenario: Conditional branching

- **Given** a workflow: start → condition → (true: agent_session_A, false: agent_session_B) → end
- **When** the condition node evaluates `prev.status === 'success'` and the result is `true`
- **Then** agent_session_A is executed (edge condition matches `"true"`)
- **And** agent_session_B is never executed

### Scenario: Parallel execution with join

- **Given** a workflow: start → parallel → [task_A, task_B] → join → end
- **When** the parallel node completes (pass-through)
- **Then** task_A and task_B are executed concurrently
- **When** both tasks complete
- **Then** the join node executes with merged outputs from both tasks

### Scenario: Pause and resume

- **Given** a running workflow
- **When** `pauseRun(runId)` is called
- **Then** the run status becomes `paused` and no nodes advance during tick
- **When** `resumeRun(runId)` is called
- **Then** the run status becomes `running` and `advanceRun` is called immediately

### Scenario: Node failure cascades to run

- **Given** a running workflow with an agent_session node
- **When** the session ends with an error
- **Then** the node run is marked `failed`, and the workflow run is marked `failed` with error `"Node "{label}" failed: {message}"`

### Scenario: Max node runs exceeded

- **Given** a workflow run that has accumulated 100 node runs (e.g., a loop)
- **When** the service attempts to advance the run
- **Then** the run is marked `failed` with error `"Max node runs (100) exceeded"`

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Workflow not found | Throws `"Workflow not found: {id}"` |
| Workflow not active | Throws `"Workflow is not active (status: {status}). Activate it first."` |
| No start node | Throws `"Workflow has no start node"` |
| `pauseRun` on non-running run | Returns `false` |
| `resumeRun` on non-paused run | Returns `false` |
| `cancelRun` on non-running/paused run | Returns `false` |
| agent_session: no agent ID | Throws `"No agent ID configured for agent_session node"` |
| agent_session: agent not found | Throws `"Agent not found: {id}"` |
| agent_session: no project ID | Throws `"No project ID configured for agent_session node"` |
| agent_session: session timeout | Throws `"Session {id} timed out after {N}s"` |
| agent_session: session error | Throws `"Session {id} ended with error"` |
| work_task: service not available | Throws `"Work task service not available"` |
| work_task: run not found | Throws `"Run not found"` |
| webhook_wait node executed | Throws `"webhook_wait nodes are completed externally via the API"` |
| Unknown node type | Throws `"Unknown node type: {type}"` |
| Condition evaluation error | Logs warning, defaults to `{ conditionResult: false }` |
| Node execution error | Node marked failed, run marked failed, event emitted |
| Event callback error | Caught and logged, does not propagate |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/process/manager.ts` | `ProcessManager` — startProcess for agent_session nodes |
| `server/work/service.ts` | `WorkTaskService` — create for work_task nodes |
| `server/algochat/agent-messenger.ts` | `AgentMessenger` (late-injected) |
| `server/db/workflows.ts` | `getWorkflow`, `createWorkflowRun`, `getWorkflowRun`, `listActiveRuns`, `updateWorkflowRunStatus`, `createNodeRun`, `updateNodeRunStatus`, `getNodeRunByNodeId`, `listNodeRuns` |
| `server/db/agents.ts` | `getAgent` |
| `server/db/sessions.ts` | `createSession`, `getSession` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/routes/workflows.ts` | `triggerWorkflow`, `pauseRun`, `resumeRun`, `cancelRun`, `getStats` |
| `server/process/manager.ts` | Injected as `mcpWorkflowService` for MCP tools |
| `server/mcp/tool-handlers.ts` | `handleManageWorkflow` uses the service |

## Configuration

| Constant | Value | Description |
|----------|-------|-------------|
| `POLL_INTERVAL_MS` | `5000` | How often active runs are checked for advanceable nodes |
| `MAX_CONCURRENT_NODES` | `4` | Maximum nodes executing simultaneously |
| `MAX_NODE_RUNS_PER_WORKFLOW` | `100` | Safety limit to prevent infinite loops |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-20 | corvid-agent | Initial spec |

---
spec: service.spec.md
---

## User Stories

- As an agent operator, I want to define graph-based workflows with multiple node types (agent sessions, work tasks, conditions, delays, transforms) so that I can orchestrate complex multi-step automation
- As an agent operator, I want conditional branching in workflows so that different execution paths are followed based on prior step outputs
- As a team agent, I want workflow nodes to pass data between steps via predecessor outputs and template variable resolution so that each step can use results from earlier steps
- As an agent operator, I want to pause, resume, and cancel running workflows so that I can control workflow execution in real-time
- As a platform administrator, I want safety limits on concurrent nodes and total node runs so that runaway workflows do not consume unbounded resources

## Acceptance Criteria

- `WorkflowService.triggerWorkflow` rejects workflows with status other than `active` or workflows with no `start` node
- Each workflow run stores a snapshot of the workflow's nodes and edges at trigger time, isolating it from subsequent graph edits
- The polling loop checks active runs every `POLL_INTERVAL_MS` (5,000ms) for nodes that can be advanced
- Join nodes require ALL predecessor nodes to be completed; all other node types require ANY single predecessor
- Condition nodes evaluate expressions supporting `true`/`false` literals, `includes()`, comparison operators (`===`, `!==`, `>`, `<`, `>=`, `<=`), and truthy path checks; unknown expressions default to truthiness of the resolved path
- Edges from condition nodes have a `condition` field; only edges whose condition matches `String(conditionResult)` are traversed
- At most `MAX_CONCURRENT_NODES` (4) nodes execute concurrently across all runs
- If a workflow run exceeds `MAX_NODE_RUNS_PER_WORKFLOW` (100) node runs, it is marked as failed to prevent infinite loops
- If any node fails, the entire workflow run is marked as failed with the node's error message
- Node input is gathered by merging the workflow's initial input with all predecessor outputs; the last predecessor's output is also available as `prev`
- `{{var.path}}` patterns in prompts and templates are resolved against input data using dot-path traversal
- `agent_session` nodes poll for session completion every 2 seconds with a timeout of `maxTurns * 30s`
- Delay nodes are capped at 1 hour (3,600,000ms) regardless of `config.delayMs`
- `webhook_wait` nodes cannot be executed internally; they must be completed externally via the API
- A run completes when all end nodes are complete, or when any end node is complete and no active/pending nodes remain
- On startup, runs that were `running` when the server shut down are not failed; the service attempts to advance them in the next tick
- All run and node status changes emit events via `onEvent` for WebSocket forwarding
- `pauseRun` sets status to `paused` and prevents node advancement; `resumeRun` sets status to `running` and calls `advanceRun` immediately
- `cancelRun` works on `running` or `paused` runs; returns `false` for other states

## Constraints

- `start` and `end` nodes are pass-through; `parallel` and `join` nodes are also pass-through (branching/merging is handled by graph edges)
- Maximum concurrent nodes is a global limit across all runs, not per-run
- Condition expression evaluation errors are logged as warnings and default to `{ conditionResult: false }`
- Event callback errors are caught and logged, never propagated

## Out of Scope

- Workflow graph editor UI
- Workflow versioning or migration between graph schemas
- Distributed workflow execution across multiple server instances
- Built-in retry logic for failed nodes (failure cascades immediately to the run)
- Workflow templates or marketplace

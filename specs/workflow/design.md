---
spec: service.spec.md
sources:
  - server/workflow/service.ts
---

## Module Structure

`server/workflow/` contains a single file:

- `service.ts` — `WorkflowService` class: graph execution engine that traverses nodes, manages concurrency, evaluates conditions, and polls for active runs

The service is instantiated in `server/index.ts` with `db`, `processManager`, and optional `workTaskService`/`agentMessenger`. Routes (`server/routes/workflows.ts`) and MCP tools (`server/mcp/tool-handlers/workflow.ts`) call into it. The `start()` method begins a 5-second polling loop.

## Key Classes and Functions

### WorkflowService

**`triggerWorkflow(workflowId, input?)`** — validates the workflow is `active` and has a `start` node. Creates a `workflow_run` record with a snapshot of the nodes and edges. Immediately completes the `start` node with the input data. Returns the new run.

**Polling loop (`start`/`stop`)** — every 5 seconds: queries all `running` workflow runs, calls `advanceRun(run)` on each. Stale runs (from previous server instance) are not failed on startup; they are advanced on the next tick.

**`advanceRun(run)`** — for each run:
1. Check `MAX_NODE_RUNS_PER_WORKFLOW` (100): if exceeded, fail the run
2. Find all nodes whose predecessors have completed but are themselves `pending`
3. For join nodes: require ALL predecessors complete; for others: ANY predecessor
4. Filter to at most `MAX_CONCURRENT_NODES` (4) new executions
5. Execute each qualifying node via `executeNode`
6. Check if the run is complete (all end nodes done, or any end done + no active/pending nodes)

**`executeNode(run, node, input)`** — dispatches by node type:
- `start`: immediate pass-through
- `end`: mark complete with `{ completed: true, ...input }`
- `agent_session`: create session + `processManager.startProcess`, poll every 2 seconds up to `maxTurns * 30s` for completion
- `work_task`: delegate to `workTaskService.create`
- `condition`: evaluate expression against input, output `{ conditionResult: boolean }`
- `delay`: `setTimeout` capped at 1 hour
- `transform`: resolve `{{var}}` templates from input
- `parallel` / `join`: pass-through (join waits for all preds via graph logic)
- `webhook_wait`: throws immediately (must be completed externally)

**Condition expression evaluator** — supports: `true`/`false` literals, `includes()` string calls, comparison operators (`===`, `!==`, `>`, `<`, `>=`, `<=`), truthy path checks. Failures default to `{ conditionResult: false }`.

**Template resolution** — `{{var.nested.path}}` resolved via dot-path traversal against the merged input object. Unresolved paths left as empty string.

**Input merging** — for each node, the merged input = workflow initial input + all predecessor node outputs. `prev` = last predecessor output.

## Configuration Values / Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `POLL_INTERVAL_MS` | `5000` | How often active runs are checked |
| `MAX_CONCURRENT_NODES` | `4` | Max simultaneously executing nodes across all runs |
| `MAX_NODE_RUNS_PER_WORKFLOW` | `100` | Safety limit to prevent infinite loops |
| Session poll interval | `2000` ms | Frequency of session completion polling in `agent_session` nodes |
| Session timeout | `maxTurns * 30s` | Per-session timeout in `agent_session` nodes |
| Delay cap | `3,600,000` ms (1 hour) | Maximum delay for `delay` nodes |

## Related Resources

**DB tables:**
- `workflows` — workflow definitions with nodes/edges JSON, `status`
- `workflow_runs` — run instances with input/status snapshot
- `workflow_node_runs` — per-node execution records with input/output/status

**Consumed by:**
- `server/routes/workflows.ts` — REST endpoints for trigger/pause/resume/cancel/stats
- `server/mcp/tool-handlers/workflow.ts` — `corvid_manage_workflow` MCP tool

**Optional integrations:**
- `WorkTaskService` — required for `work_task` nodes
- `AgentMessenger` — late-injected for inter-agent notifications

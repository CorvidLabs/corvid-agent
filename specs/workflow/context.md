# Workflow — Context

## Why This Module Exists

Some tasks are multi-step pipelines — run tests, then if they pass, create a PR, then notify the team. The workflow module provides a DAG-based execution engine where nodes represent actions and edges represent dependencies/conditions. This enables complex automation without custom scripting.

## Architectural Role

Workflow is a **pipeline orchestration engine** — it manages multi-step processes with conditional branching, parallel execution, and failure handling.

## Key Design Decisions

- **DAG execution**: Workflows are directed acyclic graphs, not linear sequences. Nodes can run in parallel when their dependencies are met.
- **Node-level tracking**: Each node run is tracked individually (`workflow_node_runs`), enabling granular retry and debugging.
- **Work task integration**: Individual workflow nodes can create work tasks, bridging orchestration with execution.
- **Process manager integration**: Nodes that require agent interaction spawn sessions through the process manager.

## Relationship to Other Modules

- **Work Tasks**: Workflow nodes can create and monitor work tasks.
- **Process Manager**: Agent sessions are spawned for nodes that need AI.
- **Events**: Workflow progress is broadcast for real-time dashboard updates.
- **DB**: State tracked in `workflows`, `workflow_runs`, `workflow_node_runs`.

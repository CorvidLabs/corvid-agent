---
module: workflows-db
version: 1
status: draft
files:
  - server/db/workflows.ts
db_tables:
  - workflows
  - workflow_runs
  - workflow_node_runs
depends_on:
  - specs/tenant/tenant.spec.md
---

# Workflows DB

## Purpose
Provides CRUD and query operations for graph-based workflow definitions, workflow execution runs, and individual node runs within those executions. Supports multi-tenant isolation and stores workflow graphs as JSON-serialized nodes and edges.

## Public API

### Exported Functions
| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `createWorkflow` | `db: Database, input: CreateWorkflowInput, tenantId?: string` | `Workflow` | Inserts a new workflow with generated UUID, status 'draft', and returns it |
| `getWorkflow` | `db: Database, id: string, tenantId?: string` | `Workflow \| null` | Retrieves a workflow by ID with tenant ownership check |
| `listWorkflows` | `db: Database, agentId?: string, tenantId?: string` | `Workflow[]` | Lists workflows, optionally filtered by agent ID, ordered by updated_at DESC |
| `updateWorkflow` | `db: Database, id: string, input: UpdateWorkflowInput, tenantId?: string` | `Workflow \| null` | Partially updates a workflow (name, description, nodes, edges, status, defaultProjectId, maxConcurrency) |
| `deleteWorkflow` | `db: Database, id: string, tenantId?: string` | `boolean` | Deletes a workflow by ID with tenant ownership check; returns true if deleted |
| `createWorkflowRun` | `db: Database, workflowId: string, agentId: string, input: Record<string, unknown>, workflowSnapshot: { nodes: WorkflowNode[]; edges: WorkflowEdge[] }` | `WorkflowRun` | Creates a new workflow run with status 'running' and a snapshot of the workflow graph |
| `getWorkflowRun` | `db: Database, id: string, tenantId?: string` | `WorkflowRun \| null` | Retrieves a workflow run by ID, including its nodeRuns populated via `listNodeRuns` |
| `listWorkflowRuns` | `db: Database, workflowId?: string, limit?: number, tenantId?: string` | `WorkflowRun[]` | Lists workflow runs, optionally filtered by workflow ID, ordered by started_at DESC with configurable limit (default 50); nodeRuns are NOT populated |
| `listActiveRuns` | `db: Database` | `WorkflowRun[]` | Lists all runs with status 'running' or 'paused', with nodeRuns populated; no tenant filter |
| `updateWorkflowRunStatus` | `db: Database, id: string, status: WorkflowRunStatus, updates?: { output?: Record<string, unknown>; currentNodeIds?: string[]; error?: string }` | `void` | Updates a run's status and optionally sets output, currentNodeIds, and error; auto-sets completed_at for terminal statuses |
| `createNodeRun` | `db: Database, runId: string, nodeId: string, nodeType: WorkflowNodeType, input: Record<string, unknown>` | `WorkflowNodeRun` | Creates a new node run with status 'pending' |
| `getNodeRun` | `db: Database, id: string` | `WorkflowNodeRun \| null` | Retrieves a node run by its primary key |
| `listNodeRuns` | `db: Database, runId: string` | `WorkflowNodeRun[]` | Lists all node runs for a given run ID, ordered by started_at ASC (NULLs last) |
| `updateNodeRunStatus` | `db: Database, id: string, status: WorkflowNodeRunStatus, updates?: { output?: Record<string, unknown>; sessionId?: string; workTaskId?: string; error?: string }` | `void` | Updates a node run's status and optionally sets output, sessionId, workTaskId, and error; auto-sets started_at on 'running'/'waiting' and completed_at on terminal statuses |
| `getNodeRunByNodeId` | `db: Database, runId: string, nodeId: string` | `WorkflowNodeRun \| null` | Finds a node run by run_id + node_id combination (for checking if a node was already executed) |

### Exported Types
| Type | Description |
|------|-------------|
| _(none)_ | All types are imported from `shared/types/workflows` |

## Invariants
1. Every workflow, workflow run, and node run has a UUID primary key generated via `crypto.randomUUID()`.
2. New workflows are always created with status `'draft'`.
3. New workflow runs are always created with status `'running'`.
4. New node runs are always created with status `'pending'`.
5. `nodes` and `edges` are stored as JSON-serialized text in the `workflows` table; `input`, `output`, `workflow_snapshot`, and `current_node_ids` are similarly JSON-serialized in their respective tables.
6. `getWorkflowRun` populates `nodeRuns` by calling `listNodeRuns`; `listWorkflowRuns` does NOT populate `nodeRuns` (returns empty arrays).
7. `listActiveRuns` populates `nodeRuns` for each returned run and ignores tenant filtering (global view for the engine).
8. `updateNodeRunStatus` uses `COALESCE(started_at, datetime('now'))` to set `started_at` only on the first transition to 'running' or 'waiting', preserving the original start time on subsequent updates.
9. Terminal statuses for workflow runs are: `'completed'`, `'failed'`, `'cancelled'`.
10. Terminal statuses for node runs are: `'completed'`, `'failed'`, `'skipped'`.
11. `updateWorkflow` is a no-op (returns existing) if no fields are provided in the input.
12. `maxConcurrency` defaults to 2 when not specified.
13. Tenant ownership is validated before read/update/delete operations when tenantId differs from DEFAULT_TENANT_ID.
14. Workflow runs store a `workflow_snapshot` capturing the graph at execution time, ensuring the run is reproducible even if the workflow definition is later modified.

## Behavioral Examples
### Scenario: Creating and starting a workflow
- **Given** an agent and project exist
- **When** `createWorkflow` is called with name, nodes, and edges
- **Then** a new workflow is created with status 'draft' and maxConcurrency 2

### Scenario: Executing a workflow
- **Given** an active workflow exists with nodes [start, agent_session, end]
- **When** `createWorkflowRun` is called with the workflow's nodes/edges as a snapshot
- **Then** a new run is created with status 'running', the snapshot is stored, and currentNodeIds is '[]'
- **When** `createNodeRun` is called for the start node
- **Then** a node run is created with status 'pending'
- **When** `updateNodeRunStatus` is called with status 'running'
- **Then** started_at is set to the current time

### Scenario: Checking if a node was already executed
- **Given** a workflow run has a node run for node 'step-1'
- **When** `getNodeRunByNodeId(db, runId, 'step-1')` is called
- **Then** the existing node run is returned
- **When** `getNodeRunByNodeId(db, runId, 'step-2')` is called for a non-executed node
- **Then** `null` is returned

### Scenario: Completing a workflow run
- **Given** a workflow run is in status 'running'
- **When** `updateWorkflowRunStatus(db, id, 'completed', { output: { result: 'success' } })` is called
- **Then** the run's status is set to 'completed', output is stored as JSON, and completed_at is set

## Error Cases
| Condition | Behavior |
|-----------|----------|
| `getWorkflow` with non-existent ID | Returns `null` |
| `getWorkflow` with wrong tenant ID | Returns `null` (tenant ownership check fails) |
| `updateWorkflow` with non-existent ID | Returns `null` |
| `deleteWorkflow` with wrong tenant ID | Returns `false` |
| `deleteWorkflow` with non-existent ID | Returns `false` (changes === 0) |
| `getWorkflowRun` with non-existent ID | Returns `null` |
| `getNodeRun` with non-existent ID | Returns `null` |
| `getNodeRunByNodeId` with non-existent node | Returns `null` |

## Dependencies
### Consumes
| Module | What is used |
|--------|-------------|
| `shared/types/workflows` | `Workflow`, `WorkflowRun`, `WorkflowNodeRun`, `WorkflowNode`, `WorkflowEdge`, `WorkflowStatus`, `WorkflowRunStatus`, `WorkflowNodeRunStatus`, `WorkflowNodeType`, `CreateWorkflowInput`, `UpdateWorkflowInput` |
| `server/tenant/types` | `DEFAULT_TENANT_ID` |
| `server/tenant/db-filter` | `withTenantFilter`, `validateTenantOwnership` |

### Consumed By
| Module | What is used |
|--------|-------------|
| `server/workflow/service.ts` | Full CRUD for workflows, runs, and node runs; `listActiveRuns` |
| `server/mcp/tool-handlers/workflow.ts` | `listWorkflows`, `createWorkflow`, `updateWorkflow`, `getWorkflow`, `listWorkflowRuns`, `getWorkflowRun` |
| `server/routes/workflows.ts` | Workflow and run CRUD and listing |

## Database Tables
### workflows
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID identifier |
| agent_id | TEXT | NOT NULL, FK agents(id) ON DELETE CASCADE | Owning agent |
| name | TEXT | NOT NULL | Human-readable workflow name |
| description | TEXT | DEFAULT '' | Optional description |
| nodes | TEXT | NOT NULL, DEFAULT '[]' | JSON-serialized array of WorkflowNode objects |
| edges | TEXT | NOT NULL, DEFAULT '[]' | JSON-serialized array of WorkflowEdge objects |
| status | TEXT | DEFAULT 'draft' | Workflow status: draft, active, running, paused, completed, failed |
| default_project_id | TEXT | DEFAULT NULL | Default project for agent sessions in this workflow |
| max_concurrency | INTEGER | DEFAULT 2 | Maximum concurrent node executions |
| tenant_id | TEXT | NOT NULL, DEFAULT 'default' | Multi-tenant isolation key |
| created_at | TEXT | DEFAULT datetime('now') | ISO 8601 creation timestamp |
| updated_at | TEXT | DEFAULT datetime('now') | ISO 8601 last-update timestamp |

**Indexes:** `idx_workflows_agent(agent_id)`, `idx_workflows_status(status)`

### workflow_runs
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID identifier |
| workflow_id | TEXT | NOT NULL, FK workflows(id) ON DELETE CASCADE | Parent workflow |
| agent_id | TEXT | NOT NULL, FK agents(id) ON DELETE CASCADE | Agent executing the run |
| status | TEXT | DEFAULT 'running' | Run status: running, paused, completed, failed, cancelled |
| input | TEXT | DEFAULT '{}' | JSON-serialized input parameters |
| output | TEXT | DEFAULT NULL | JSON-serialized output data |
| workflow_snapshot | TEXT | NOT NULL, DEFAULT '{}' | JSON snapshot of nodes/edges at execution start |
| current_node_ids | TEXT | DEFAULT '[]' | JSON array of currently executing node IDs |
| error | TEXT | DEFAULT NULL | Error message if run failed |
| tenant_id | TEXT | NOT NULL, DEFAULT 'default' | Multi-tenant isolation key |
| started_at | TEXT | DEFAULT datetime('now') | ISO 8601 start timestamp |
| completed_at | TEXT | DEFAULT NULL | ISO 8601 completion timestamp |

**Indexes:** `idx_workflow_runs_workflow(workflow_id)`, `idx_workflow_runs_status(status)`

### workflow_node_runs
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID identifier |
| run_id | TEXT | NOT NULL, FK workflow_runs(id) ON DELETE CASCADE | Parent workflow run |
| node_id | TEXT | NOT NULL | Identifier of the node within the workflow graph |
| node_type | TEXT | NOT NULL | Node type: start, agent_session, work_task, condition, delay, webhook_wait, transform, parallel, join, end |
| status | TEXT | DEFAULT 'pending' | Node run status: pending, running, completed, failed, skipped, waiting |
| input | TEXT | DEFAULT '{}' | JSON-serialized input for this node |
| output | TEXT | DEFAULT NULL | JSON-serialized output from this node |
| session_id | TEXT | DEFAULT NULL | Agent session ID if this node spawned one |
| work_task_id | TEXT | DEFAULT NULL | Work task ID if this node created one |
| error | TEXT | DEFAULT NULL | Error message if node failed |
| started_at | TEXT | DEFAULT NULL | ISO 8601 start timestamp (set on first run/wait) |
| completed_at | TEXT | DEFAULT NULL | ISO 8601 completion timestamp |

**Indexes:** `idx_workflow_node_runs_run(run_id)`, `idx_workflow_node_runs_status(status)`, `idx_workflow_node_runs_session(session_id)`

## Change Log
| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |

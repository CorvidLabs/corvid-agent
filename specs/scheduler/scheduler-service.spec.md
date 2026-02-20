---
module: scheduler-service
version: 1
status: active
files:
  - server/scheduler/service.ts
db_tables:
  - agent_schedules
  - schedule_executions
depends_on:
  - specs/db/sessions.spec.md
  - specs/work/work-task-service.spec.md
  - specs/process/process-manager.spec.md
---

# Scheduler Service

## Purpose

Cron/interval-based automation engine that transforms the agent from a reactive system into a proactive one. Polls for due schedules every 30 seconds, dispatches actions (star repos, review PRs, create work tasks, send messages, etc.), manages approval workflows, and enforces safety rails (concurrency limits, auto-pause on failure, minimum interval enforcement).

See ADR-001 (`docs/decisions/001-autonomous-scheduler.md`) for full architectural rationale.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `validateScheduleFrequency` | `(cronExpression?: string \| null, intervalMs?: number \| null)` | `void` | Throws if schedule fires more often than every 5 minutes |

### Exported Classes

| Class | Description |
|-------|-------------|
| `SchedulerService` | Main scheduler: polling loop, action dispatch, approval resolution |

#### SchedulerService Constructor

| Parameter | Type | Description |
|-----------|------|-------------|
| `db` | `Database` | SQLite database handle |
| `processManager` | `ProcessManager` | For spawning agent sessions |
| `workTaskService` | `WorkTaskService \| null` | Optional: for `work_task` actions |
| `agentMessenger` | `AgentMessenger \| null` | Optional: for messaging and notifications |

#### SchedulerService Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `setAgentMessenger` | `(messenger: AgentMessenger)` | `void` | Late-inject messenger after AlgoChat init |
| `setImprovementLoopService` | `(service: AutonomousLoopService)` | `void` | Late-inject improvement loop service |
| `setReputationServices` | `(scorer: ReputationScorer, attestation: ReputationAttestation)` | `void` | Late-inject reputation services |
| `start` | `()` | `void` | Start polling loop. Initializes next_run_at for schedules missing it. Runs first tick immediately |
| `stop` | `()` | `void` | Stop polling loop |
| `getStats` | `()` | `{ running, activeSchedules, pausedSchedules, runningExecutions, maxConcurrent, recentFailures }` | Health check stats |
| `onEvent` | `(callback)` | `() => void` | Subscribe to schedule events (returns unsubscribe function) |
| `resolveApproval` | `(executionId: string, approved: boolean)` | `ScheduleExecution \| null` | Approve or deny a pending execution. If approved, executes the action |

## Invariants

1. **Minimum schedule interval**: No schedule may fire more often than every 5 minutes (`MIN_SCHEDULE_INTERVAL_MS = 300,000`). Validated at schedule creation by `validateScheduleFrequency`
2. **Max concurrent executions**: At most `MAX_CONCURRENT_EXECUTIONS` (2) actions run simultaneously. Skips tick if limit reached
3. **Auto-pause on failure**: After `MAX_CONSECUTIVE_FAILURES` (5) consecutive failures, the schedule is automatically paused
4. **Execution deduplication**: When `maxExecutions` is reached, the schedule status is set to `completed` and no further executions occur
5. **Approval policy enforcement**: Actions requiring approval (based on `approvalPolicy` and action type) are held in `awaiting_approval` state until explicitly resolved
6. **Destructive actions need approval**: Under `owner_approve` policy, these action types require approval: `work_task`, `github_suggest`, `fork_repo`, `codebase_review`, `dependency_audit`, `improvement_loop`. Under `council_approve`, all actions need approval. Under `auto`, none do
7. **Config snapshot isolation**: Each execution captures a snapshot of the schedule config at creation time, so mid-flight edits don't corrupt running executions
8. **No missed-run catch-up**: On startup, `next_run_at` is computed from now, not from `last_run_at`. Prevents thundering herd after restart
9. **Idempotent start**: Calling `start()` when already running is a no-op
10. **Notification best-effort**: On-chain notifications to `notifyAddress` are fire-and-forget; failures are logged but don't affect execution status

## Behavioral Examples

### Scenario: Cron schedule fires and creates a work task

- **Given** an active schedule with `cronExpression: "0 9 * * 1"` and action type `work_task`, approval policy `auto`
- **When** the poll tick fires and the schedule is due
- **Then** an execution record is created, `last_run_at` is updated, `next_run_at` is recalculated
- **And** the `work_task` action is dispatched immediately (no approval needed for `auto`)

### Scenario: Owner approval required

- **Given** a schedule with `approvalPolicy: "owner_approve"` and action type `github_suggest`
- **When** the schedule fires
- **Then** execution status is set to `awaiting_approval` and a `schedule_approval_request` event is emitted
- **When** `resolveApproval(executionId, true)` is called
- **Then** execution status changes to `running` and the action executes

### Scenario: Auto-pause after failures

- **Given** a schedule that has failed 4 consecutive times
- **When** the 5th execution also fails
- **Then** the schedule status is set to `paused` and `consecutiveFailures` is reset

### Scenario: Cron expression too frequent

- **Given** a cron expression `* * * * *` (every minute)
- **When** `validateScheduleFrequency("* * * * *")` is called
- **Then** throws Error with message about minimum 5-minute interval

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Invalid cron expression | `validateScheduleFrequency` throws `Error("Invalid cron expression: ...")` |
| Interval too short (< 5min) | `validateScheduleFrequency` throws `Error("Schedule interval too short: ...")` |
| Agent not found during execution | Execution skipped with warning log |
| WorkTaskService not available | Execution fails with "Work task service not available" |
| AgentMessenger not available | `send_message` execution fails; notifications silently skipped |
| Unknown action type | Execution marked as failed |
| Max concurrent reached | Tick skipped entirely |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/process/manager.ts` | `ProcessManager` for starting sessions |
| `server/work/service.ts` | `WorkTaskService.create` for work_task actions |
| `server/db/schedules.ts` | All schedule/execution CRUD functions |
| `server/db/agents.ts` | `getAgent` |
| `server/db/sessions.ts` | `createSession` |
| `server/github/operations.ts` | `starRepo`, `forkRepo`, `listOpenPrs` |
| `server/routes/councils.ts` | `launchCouncil` |
| `server/scheduler/cron-parser.ts` | `getNextCronDate` |
| `server/algochat/agent-messenger.ts` | For messaging and notification actions |
| `server/improvement/service.ts` | `AutonomousLoopService` for improvement_loop action |
| `server/memory/summarizer.ts` | `summarizeOldMemories` for memory_maintenance action |
| `server/reputation/scorer.ts` | `ReputationScorer` for reputation_attestation action |
| `server/reputation/attestation.ts` | `ReputationAttestation` for on-chain publishing |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/process/manager.ts` | Injected as `mcpSchedulerService` |
| `server/routes/schedules.ts` | All public methods |
| `server/index.ts` | Lifecycle: `start()`, `stop()`, service wiring |

## Database Tables

### agent_schedules

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| name | TEXT | NOT NULL | Human-readable schedule name |
| description | TEXT | DEFAULT '' | Schedule description |
| agent_id | TEXT | NOT NULL | Agent that executes actions |
| project_id | TEXT | nullable | Default project context |
| cron_expression | TEXT | nullable | 5-field cron expression |
| interval_ms | INTEGER | nullable | Alternative: fixed interval in milliseconds |
| actions | TEXT | NOT NULL | JSON array of ScheduleAction objects |
| approval_policy | TEXT | DEFAULT 'owner_approve' | auto/owner_approve/council_approve |
| max_executions | INTEGER | nullable | NULL = unlimited |
| execution_count | INTEGER | DEFAULT 0 | Lifetime execution count |
| notify_address | TEXT | nullable | Algorand address for on-chain notifications |
| status | TEXT | DEFAULT 'active' | active/paused/completed |
| consecutive_failures | INTEGER | DEFAULT 0 | Reset on success, pause at 5 |
| last_run_at | TEXT | nullable | Last execution timestamp |
| next_run_at | TEXT | nullable | Pre-computed for fast scanning |
| created_at | TEXT | DEFAULT datetime('now') | Creation timestamp |
| updated_at | TEXT | DEFAULT datetime('now') | Last modification |

### schedule_executions

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| schedule_id | TEXT | NOT NULL, FK agent_schedules(id) | Parent schedule |
| agent_id | TEXT | NOT NULL | Executing agent |
| action_type | TEXT | NOT NULL | Action being executed |
| action_input | TEXT | NOT NULL | JSON: action parameters |
| config_snapshot | TEXT | NOT NULL | JSON: schedule config at execution time |
| status | TEXT | DEFAULT 'pending' | pending/running/awaiting_approval/completed/failed/approved/denied |
| session_id | TEXT | nullable | Linked agent session |
| work_task_id | TEXT | nullable | Linked work task |
| result | TEXT | nullable | Execution output/summary |
| started_at | TEXT | DEFAULT datetime('now') | Execution start time |
| completed_at | TEXT | nullable | Execution end time |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| (hardcoded) `POLL_INTERVAL_MS` | `30000` | How often to check for due schedules |
| (hardcoded) `MAX_CONCURRENT_EXECUTIONS` | `2` | Max simultaneous executions |
| (hardcoded) `MAX_CONSECUTIVE_FAILURES` | `5` | Failures before auto-pause |
| (hardcoded) `MIN_SCHEDULE_INTERVAL_MS` | `300000` | Minimum 5-minute interval |

## Action Types

| Type | Description | Requires |
|------|-------------|----------|
| `star_repo` | Star GitHub repositories | `repos[]` |
| `fork_repo` | Fork GitHub repositories | `repos[]` |
| `review_prs` | Review open PRs and post comments | `repos[]`, optional `maxPrs` |
| `work_task` | Create a work task (branch + implement + PR) | `description` |
| `council_launch` | Launch a council deliberation | `councilId`, `projectId`, `description` |
| `send_message` | Send agent-to-agent message | `toAgentId`, `message` |
| `github_suggest` | Analyze repos and suggest improvements | `repos[]`, optional `autoCreatePr` |
| `codebase_review` | Run tsc/tests, find TODOs, create work tasks | optional `description` |
| `dependency_audit` | Check outdated/vulnerable dependencies | optional `description` |
| `improvement_loop` | Run autonomous improvement loop | optional `maxImprovementTasks`, `focusArea` |
| `memory_maintenance` | Summarize and archive old memories | (none) |
| `reputation_attestation` | Compute score and publish on-chain attestation | (none) |
| `custom` | Freeform prompt (owner-only creation) | `prompt` |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-19 | corvid-agent | Initial spec |

---
module: scheduler-execution
version: 1
status: active
files:
  - server/scheduler/execution.ts
  - server/scheduler/orchestration.ts
db_tables:
  - schedule_executions
  - agent_schedules
depends_on:
  - specs/scheduler/scheduler-service.spec.md
  - specs/scheduler/handlers.spec.md
  - specs/scheduler/cron-parser.spec.md
---

# Scheduler Execution & Orchestration

## Purpose

Provides the execution lifecycle layer for scheduled actions. `execution.ts` wraps handler dispatch with error handling, failure tracking, lock cleanup, and notifications. `orchestration.ts` provides per-action pre-dispatch checks: health gating, approval workflows, and repo locking. Together they sit between the `SchedulerService` polling loop and the individual action handlers.

## Public API

### Exported Types

#### execution.ts

| Type | Description |
|------|-------------|
| `RunActionDeps` | Interface describing runtime dependencies for `runAction`: `db`, `agentMessenger`, `runningExecutions`, `consecutiveFailures`, `emit` |

### Exported Functions

#### execution.ts

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `runAction` | `(deps: RunActionDeps, hctx: HandlerContext, executionId: string, schedule: AgentSchedule, action: ScheduleAction)` | `Promise<void>` | Executes an action with full lifecycle: dispatch to handler, error handling, lock cleanup, failure tracking, notifications, and AlgoChat broadcasting |

#### orchestration.ts

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `needsApproval` | `(schedule: AgentSchedule, action: ScheduleAction)` | `boolean` | Returns true if the action requires approval based on the schedule's approval policy and action type |
| `resolveActionRepos` | `(action: ScheduleAction)` | `string[]` | Extracts the list of repos an action targets; falls back to `project:{projectId}` if no repos specified |
| `shouldSkipByHealthGate` | `(db: Database, schedule: AgentSchedule, execution: ScheduleExecution, action: ScheduleAction, lastSystemState: SystemStateResult \| null, emit: EmitFn)` | `boolean` | Evaluates health-based gating; if the action should be skipped, marks execution as cancelled and records an audit entry |
| `handleApprovalIfNeeded` | `(db: Database, schedule: AgentSchedule, execution: ScheduleExecution, action: ScheduleAction, notificationService: NotificationService \| null, emit: EmitFn)` | `boolean` | If the action needs approval, sets execution to `awaiting_approval`, emits approval request event, sends notification; returns true if approval is needed |
| `handleRepoLocking` | `(db: Database, schedule: AgentSchedule, execution: ScheduleExecution, action: ScheduleAction, emit: EmitFn)` | `boolean` | Attempts to acquire locks for all target repos; if any lock fails, releases already-acquired locks, cancels execution, and records audit; returns true if blocked |

## Invariants

1. `runAction` always removes the execution from `runningExecutions` and releases all repo locks in the `finally` block, regardless of success or failure.
2. After `MAX_CONSECUTIVE_FAILURES` (5), the schedule is auto-paused and `consecutiveFailures` is reset.
3. On successful completion, `consecutiveFailures` for that schedule is cleared.
4. AlgoChat broadcast is only sent for action types in `BROADCAST_ACTION_TYPES`: `work_task`, `council_launch`, `daily_review`, `review_prs`, `github_suggest`, `codebase_review`, `dependency_audit`, `improvement_loop`, `custom`, `status_checkin`, `blog_write`.
5. Notifications to `notifyAddress` are fire-and-forget; failures are logged but do not affect execution status.
6. Unknown action types result in the execution being marked as `failed`.
7. `needsApproval` returns false for `auto` policy, checks destructive actions list for `owner_approve`, and returns true for `council_approve`.
8. Destructive actions (requiring approval under `owner_approve`) are: `work_task`, `github_suggest`, `fork_repo`, `codebase_review`, `dependency_audit`, `improvement_loop`.
9. Health gating only applies when a `SystemStateResult` is available; if null, the action proceeds.
10. When health gate skips an action, the execution status is set to `cancelled` (not `failed`), and an audit record is created.
11. Repo locking is all-or-nothing: if any repo lock fails, all previously acquired locks for that execution are released.

## Behavioral Examples

### Scenario: Action completes successfully

- **Given** a schedule with action type `star_repo` and approval policy `auto`
- **When** `runAction` is called and the handler succeeds
- **Then** the execution is emitted as `schedule_execution_update`, notification is sent to `notifyAddress`, and `consecutiveFailures` is cleared

### Scenario: Action fails and triggers auto-pause

- **Given** a schedule that has failed 4 consecutive times
- **When** `runAction` is called and the 5th execution also fails
- **Then** the schedule is paused, `consecutiveFailures` is deleted, and a `schedule_update` event is emitted

### Scenario: Health gate skips a feature work action

- **Given** system state includes `ci_broken` and the action is `work_task` (category `feature_work`)
- **When** `shouldSkipByHealthGate` is called
- **Then** execution is marked `cancelled` with gate reasons, an audit entry is recorded, and the function returns true

### Scenario: Approval required for destructive action

- **Given** a schedule with `approvalPolicy: 'owner_approve'` and action type `github_suggest`
- **When** `handleApprovalIfNeeded` is called
- **Then** execution is set to `awaiting_approval`, an approval request event is emitted, a notification is sent, and the function returns true

### Scenario: Repo lock contention

- **Given** two repos are targeted but the second is already locked by another execution
- **When** `handleRepoLocking` is called
- **Then** the first lock is released, execution is cancelled with a message identifying the blocked repo, and an audit entry is recorded

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Handler throws an exception | `runAction` catches it, marks execution as `failed`, logs the error |
| Unknown action type in dispatch | Execution marked as `failed` with "Unknown action type" message |
| `agentMessenger` is null | Broadcast and notifications silently skipped |
| `notificationService` is null | Approval notification silently skipped |
| Repo lock acquisition fails | Execution cancelled, all acquired locks released |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/scheduler/handlers` | All `exec*` handler functions via `dispatchAction` |
| `server/scheduler/handlers/types` | `HandlerContext` interface |
| `server/scheduler/priority-rules` | `evaluateAction` for health gating |
| `server/scheduler/system-state` | `SystemStateResult` type |
| `server/db/schedules` | `updateExecutionStatus`, `getExecution`, `updateSchedule`, `getSchedule` |
| `server/db/repo-locks` | `acquireRepoLock`, `releaseAllLocks` |
| `server/db/audit` | `recordAudit` for skip/gate audit trail |
| `server/lib/logger` | `createLogger` for structured logging |
| `server/algochat/agent-messenger` | `AgentMessenger` for notifications and broadcasting |
| `server/notifications/service` | `NotificationService` for approval notifications |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/scheduler/service.ts` | `runAction`, `RunActionDeps`, `needsApproval`, `resolveActionRepos`, `shouldSkipByHealthGate`, `handleApprovalIfNeeded`, `handleRepoLocking` |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-13 | corvid-agent | Initial spec |

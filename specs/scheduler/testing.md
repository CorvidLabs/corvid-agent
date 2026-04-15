---
spec: scheduler-service.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/__tests__/scheduler-service.test.ts` | Unit | Poll tick, due schedule detection, `resolveApproval` approve/deny, `validateScheduleFrequency`, auto-pause after failures, `getStats` |
| `server/__tests__/scheduler.test.ts` | Integration | Full scheduler lifecycle with mocked dependencies |
| `server/__tests__/cron-parser.test.ts` | Unit | `getNextCronDate` for various cron expressions, invalid expression error |
| `server/__tests__/scheduler-pipeline-execution.test.ts` | Unit | Execution pipeline: create record, approval check, action dispatch, finalize |
| `server/__tests__/scheduler-pipeline.test.ts` | Unit | Pipeline state transitions |
| `server/__tests__/scheduler-work-task-handler.test.ts` | Unit | `work_task` action creates a work task, links execution |
| `server/__tests__/scheduler-discord-post.test.ts` | Unit | Discord message action via scheduler |
| `server/__tests__/scheduler-flock-reputation-refresh.test.ts` | Unit | `flock_reputation_refresh` action type |
| `server/__tests__/scheduler-github-comment-monitor.test.ts` | Unit | GitHub comment monitor handler |
| `server/__tests__/scheduler-tool-gating.test.ts` | Unit | Tool permission gating for scheduled actions |
| `server/__tests__/schedules.test.ts` | Unit | DB layer: schedule CRUD, execution CRUD |
| `server/__tests__/schedule-output-destinations.test.ts` | Unit | Output notification routing |

## Manual Testing

- [ ] Create a schedule with `intervalMs: 300000` and confirm it fires after 5 minutes
- [ ] Create a schedule with `cronExpression: "* * * * *"` and confirm `validateScheduleFrequency` rejects it
- [ ] Create a schedule with `approvalPolicy: 'owner_approve'` and action type `work_task`; confirm execution stays in `awaiting_approval` until `resolveApproval` is called
- [ ] Let a schedule fail 5 times and confirm its status changes to `paused`
- [ ] Start the scheduler when two executions are already running and confirm the tick is skipped (no new executions created)
- [ ] Call `start()` twice and confirm only one polling interval runs

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| `validateScheduleFrequency` with `* * * * *` (1-min cron) | Throws with "minimum 5-minute interval" message |
| `validateScheduleFrequency` with `intervalMs: 60000` (1 min) | Throws with "interval too short" message |
| `validateScheduleFrequency` with invalid cron syntax | Throws with "Invalid cron expression" message |
| Agent not found during execution | Execution skipped with warning; not counted as failure |
| `WorkTaskService` is null for `work_task` action | Execution marked failed with "service not available" |
| `AgentMessenger` is null for `send_message` action | Execution fails; no crash |
| Unknown action type | Execution marked failed with unknown-type error |
| `maxExecutions` reached | Schedule status set to `completed`; no further executions |
| On startup with active schedules missing `next_run_at` | `next_run_at` set synchronously during `start()` |
| Config snapshot captured at execution creation | Mid-flight schedule edits do not affect running execution |

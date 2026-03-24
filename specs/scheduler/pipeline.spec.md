---
module: scheduler-pipeline
version: 1
status: active
files:
  - server/scheduler/pipeline.ts
db_tables:
  - schedule_executions
  - agent_schedules
depends_on:
  - specs/scheduler/execution.spec.md
  - specs/scheduler/handlers.spec.md
---

# Pipeline Execution Engine

## Purpose

Runs schedule actions sequentially with shared context as composable multi-step pipelines. Each step executes one action, captures its result, and passes context to subsequent steps. Steps can be conditional on prior step outcomes. Also provides built-in pipeline templates for common workflows.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `shouldStepRun` | `(condition: PipelineStepCondition, ctx: PipelineContext, stepIndex: number)` | `boolean` | Determines if a step should execute based on its condition and prior context. First step (index 0) always runs |
| `buildPipelineSummary` | `(ctx: PipelineContext)` | `string` | Builds a human-readable summary string from all step results with status icons, action type, duration, and result snippet |
| `executePipeline` | `(deps: RunActionDeps, hctx: HandlerContext, schedule: AgentSchedule, steps: PipelineStep[], emitFn)` | `Promise<PipelineContext>` | Executes all pipeline steps sequentially with shared context, creating execution records for each step |
| `getPipelineTemplate` | `(templateId: string)` | `SchedulePipelineTemplate \| undefined` | Looks up a pipeline template by ID |
| `listPipelineTemplates` | `()` | `SchedulePipelineTemplate[]` | Returns a copy of all available pipeline templates |

### Exported Constants

| Constant | Type | Description |
|----------|------|-------------|
| `PIPELINE_TEMPLATES` | `SchedulePipelineTemplate[]` | Built-in pipeline templates: `github-digest-discord`, `audit-and-improve`, `review-and-report`, `daily-digest-discord`, `release-announcement`, `cross-channel-summary` |

## Invariants

1. **First step always runs**: Regardless of condition, the step at index 0 always executes
2. **Sequential execution**: Steps run in order; each step completes before the next starts
3. **Context propagation**: Each step's result is added to `ctx.stepResults` before the next step runs
4. **Failure flag sticky**: Once `ctx.hasFailure` is set to true, it remains true for all subsequent steps
5. **Template immutability**: `listPipelineTemplates()` returns a shallow copy to prevent mutation
6. **Execution record per step**: Each pipeline step creates its own `schedule_execution` record via `createExecution`
7. **Variable interpolation**: `{{pipeline.summary}}`, `{{pipeline.hasFailure}}`, and `{{pipeline.steps.<label>.result}}` are replaced in action messages/prompts before execution

## Behavioral Examples

### Scenario: Two-step pipeline with successful first step

- **Given** a pipeline with steps [review, notify] where notify has condition `on_success`
- **When** the review step completes successfully
- **Then** the notify step runs and its message contains the review result via `{{pipeline.steps.review.result}}`

### Scenario: Conditional step skipped on failure

- **Given** a pipeline with steps [audit, improve] where improve has condition `on_success`
- **When** the audit step fails
- **Then** the improve step is skipped with status `'skipped'` and `durationMs: 0`

### Scenario: Step with `on_failure` condition

- **Given** a pipeline with steps [build, rollback] where rollback has condition `on_failure`
- **When** the build step fails
- **Then** the rollback step runs because `ctx.hasFailure` is true

### Scenario: Template lookup

- **Given** the built-in templates are loaded
- **When** `getPipelineTemplate('github-digest-discord')` is called
- **Then** returns the template with 2 steps: review and notify

### Scenario: Daily digest pipeline template

- **Given** the `daily-digest-discord` template is used
- **When** the pipeline runs
- **Then** step 1 runs `daily_review`, step 2 runs `discord_post` with `embedTitle: 'Daily Digest'` and the review result interpolated into the message

### Scenario: Release announcement pipeline template

- **Given** the `release-announcement` template is used
- **When** the pipeline runs
- **Then** step 1 runs `custom` to generate release notes, step 2 runs `discord_post` with `embedTitle: 'New Release'` and the notes interpolated

### Scenario: Cross-channel summary pipeline template

- **Given** the `cross-channel-summary` template is used
- **When** the pipeline runs
- **Then** step 1 runs `daily_review`, step 2 runs `status_checkin`, step 3 runs `discord_post` aggregating both results

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Step action throws | `runAction` handles error internally; step status is `'failed'`, `ctx.hasFailure` set to true |
| Unknown template ID | `getPipelineTemplate` returns `undefined` |
| Unknown condition value | `shouldStepRun` returns `true` (default case) |
| Missing step result reference in template variable | Interpolates to `(no result for <label>)` |
| Empty pipeline summary | Interpolates `{{pipeline.summary}}` to `(no prior results)` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/db/schedules.ts` | `createExecution`, `getExecution` |
| `server/db/audit.ts` | `recordAudit` |
| `server/lib/logger.ts` | `createLogger` |
| `server/scheduler/execution.ts` | `runAction`, `RunActionDeps` |
| `shared/types` | `AgentSchedule`, `PipelineStep`, `PipelineContext`, `PipelineStepCondition`, `SchedulePipelineTemplate` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/scheduler/orchestration.ts` | `executePipeline` for pipeline-mode schedule execution |
| Schedule API routes | `getPipelineTemplate`, `listPipelineTemplates` |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-22 | corvid-agent | Initial spec |
| 2026-03-23 | corvid-agent | Added 3 Discord proactive messaging templates: daily-digest-discord, release-announcement, cross-channel-summary |

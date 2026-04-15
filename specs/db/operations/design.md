---
spec: projects.spec.md
sources:
  - server/db/projects.ts
  - server/db/credits.ts
  - server/db/spending.ts
  - server/db/work-tasks.ts
  - server/db/councils.ts
  - server/db/schedules.ts
  - server/db/webhooks.ts
  - server/db/workflows.ts
  - server/db/pr-outcomes.ts
  - server/db/repo-blocklist.ts
  - server/db/repo-locks.ts
  - server/db/proposals.ts
---

## Layout

Operational data-access layer. Multiple focused files, each managing one domain of business operations. Projects are the top-level organizational container; all other entities reference them.

```
server/db/
  projects.ts      — Project CRUD (top-level org unit)
  credits.ts       — Credit ledger, transactions, reservations, deductions
  spending.ts      — Daily spending tracking and budget caps
  work-tasks.ts    — Work task lifecycle (branch, run, validate, PR)
  councils.ts      — Council/launch/discussion/vote DB operations
  schedules.ts     — Agent schedule definitions and execution records
  webhooks.ts      — Webhook registrations and delivery tracking
  workflows.ts     — Workflow definitions, runs, and node runs
  pr-outcomes.ts   — Pull request outcome tracking
  repo-blocklist.ts — Repository blocklist management
  repo-locks.ts    — Repository locking for concurrent work tasks
  proposals.ts     — Governance proposal CRUD and vote management
```

## Components

### `projects.ts` — Top-Level Org Unit

Standard CRUD with multi-tenant isolation. Projects own sessions, work tasks, and council launches. `deleteProject` uses a DB transaction to clean up all dependent records. `envVars` stored as JSON.

### `credits.ts` — Financial Operations

Append-only `credit_ledger` model: all balance mutations recorded as transactions (`purchase`, `deduction`, `agent_message`, `reserve`, `release`, `grant`, `refund`). Balance computed from ledger sum, not a mutable field. Supports:
- ALGO → credit conversion
- Per-turn deductions (conversation + agent message)
- Reservation system for group messages (reserve → deduct → release)
- First-time user bonuses

Critical module — bugs mean real money lost.

### `work-tasks.ts` — Work Task Lifecycle

Tracks work tasks through states: `pending → running → validating → complete / failed`. Each task has a repo, branch, and associated PR outcome. `repo-locks.ts` provides advisory locking to prevent concurrent tasks on the same repo.

### `councils.ts` — Council DB Operations

All council-related DB queries: council CRUD, launch records, stage updates, discussion messages, log entries, governance vote records, and member vote tracking.

### `schedules.ts` — Agent Scheduling

`agent_schedules` definitions (cron expression, target agent, output destinations) and `schedule_executions` run history with pagination.

### `proposals.ts` — Governance Proposals

Governance proposal lifecycle: creation, vote opening/closing, veto tracking, quorum configuration. Integrates with council governance vote evaluation.

## Tokens

| Constant | Description |
|----------|-------------|
| Credit transaction types | `purchase`, `deduction`, `agent_message`, `reserve`, `release`, `grant`, `refund` |
| Work task states | `pending`, `running`, `validating`, `complete`, `failed` |
| Council stages | `responding`, `discussing`, `reviewing`, `synthesizing`, `complete` |
| Governance vote statuses | `pending`, `approved`, `rejected`, `expired`, `awaiting_human` |

## Assets

| Resource | Description |
|----------|-------------|
| `projects` table | Top-level org unit |
| `credit_ledger` + `credit_transactions` + `credit_config` | Financial data |
| `daily_spending` + `agent_daily_spending` | Spend tracking tables |
| `work_tasks` + `pr_outcomes` | Work task lifecycle |
| `councils` + `council_members` + `council_launches` | Council definitions |
| `council_launch_logs` + `council_discussion_messages` | Council runtime data |
| `governance_proposals` + `governance_votes` + `governance_member_votes` + `proposal_vetoes` | Governance data |
| `agent_schedules` + `schedule_executions` | Scheduling data |
| `webhook_registrations` + `webhook_deliveries` | Webhook data |
| `workflows` + `workflow_runs` + `workflow_node_runs` | Workflow data |
| `repo_blocklist` + `repo_locks` | Repository access control |

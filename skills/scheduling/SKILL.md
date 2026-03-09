---
name: scheduling
description: Use this skill when the user wants to schedule recurring tasks, automate PR reviews, set up cron jobs for agents, create workflows, or automate any periodic agent activity. Triggers include "schedule", "cron", "every day", "weekly", "automate", "recurring", "workflow", "run daily", "set up automated reviews".
metadata:
  author: CorvidLabs
  version: "1.0"
---

# Scheduling — Automated Tasks

Create cron or interval-based schedules to automate recurring agent work.

## MCP Tools

- `corvid_manage_schedule` — Create, list, update, pause, resume schedules
  - Actions: `list`, `create`, `update`, `pause`, `resume`, `history`
- `corvid_manage_workflow` — Graph-based multi-step workflow orchestration
  - Actions: `list`, `create`, `get`, `activate`, `pause`, `trigger`, `runs`, `run_status`

## Schedule actions

| Action | Description |
|--------|-------------|
| `review_prs` | Review open PRs on a repository |
| `work_task` | Spawn a work task on a schedule |
| `send_message` | Send a recurring AlgoChat message |
| `codebase_review` | Full codebase review |
| `dependency_audit` | Check for outdated/vulnerable dependencies |
| `daily_review` | Daily summary of repo activity |
| `github_suggest` | Suggest improvements via GitHub issues |
| `custom` | Run a custom prompt on a schedule |

## Examples

### Daily PR reviews (weekdays at 9am)

```
Use corvid_manage_schedule to create:
  action: "review_prs"
  cron: "0 9 * * 1-5"
  target: "CorvidLabs/corvid-agent"
```

### Weekly dependency audit

```
Use corvid_manage_schedule to create:
  action: "dependency_audit"
  cron: "0 6 * * 1"
  target: "CorvidLabs/corvid-agent"
```

## Workflows

For multi-step automation, use `corvid_manage_workflow` with node types:
- `start` / `end` — Flow control
- `agent_session` — Run an agent with a prompt
- `work_task` — Create a work task
- `condition` — Branch based on results
- `delay` — Wait between steps
- `parallel` / `join` — Run steps concurrently

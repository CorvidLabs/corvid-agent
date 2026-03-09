---
name: work-tasks
description: Use this skill when the user wants to create an autonomous coding task, spawn an agent to implement a feature or fix a bug, or automate code changes with PR creation. Triggers include "create a work task", "implement this feature", "fix this bug autonomously", "spawn an agent to", "create a PR for", or any request to delegate coding work to an autonomous agent session.
metadata:
  author: CorvidLabs
  version: "1.0"
---

# Work Tasks — Autonomous Coding

Create work tasks that spawn autonomous agent sessions. Each task gets its own branch, implements changes, runs validation, and creates a PR.

## MCP Tools

- `corvid_create_work_task` — Create a work task
  - Parameters: `project` (project name), `description` (what to implement), `agent` (optional, agent to use)

## Workflow

1. Describe the task clearly — what to change, where, and why
2. Call `corvid_create_work_task` with the project and description
3. The agent creates a branch, implements changes, runs tests, and opens a PR
4. Monitor progress on the dashboard or via `corvid_manage_schedule`

## Examples

### Feature implementation

```
Use corvid_create_work_task:
  project: "my-app"
  description: "Add a dark mode toggle to the settings page. Use CSS custom properties for theming. Add a test for the toggle component."
```

### Bug fix

```
Use corvid_create_work_task:
  project: "my-app"
  description: "Fix session timeout not refreshing on user activity. The token refresh logic in auth.ts skips renewal when the tab is backgrounded."
```

## Rules

- Only 1 active task per project at a time
- Rate limit: 100 tasks per agent per day
- Tasks run in sandboxed environments
- Be specific in descriptions — include file paths and expected behavior

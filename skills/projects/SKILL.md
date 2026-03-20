---
name: projects
description: Use this skill when the user wants to list available projects, check which project is active, or understand the project context. Triggers include "list projects", "what projects", "current project", "which project", "project info", or any reference to project selection and context.
metadata:
  author: CorvidLabs
  version: "1.0"
---

# Projects — Project Context

List available projects and check the current active project context.

## MCP Tools

- `corvid_list_projects` — List all available projects with IDs, names, and directories
- `corvid_current_project` — Show the current agent's default project

## Examples

### List all projects

```
Use corvid_list_projects
```

### Check current project

```
Use corvid_current_project
```

## Notes

- Projects determine the working directory for coding tasks and work tasks
- Each project has a unique ID, name, and associated directory
- Work tasks are scoped to a specific project

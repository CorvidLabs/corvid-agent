---
name: repo-management
description: Use this skill when you need to manage the repository blocklist — blocking, unblocking, or checking if repos are blocked from agent operations. Triggers include "block repo", "unblock repo", "blocklist", "blocked repositories", or any reference to restricting agent access to specific repositories.
metadata:
  author: CorvidLabs
  version: "1.0"
---

# Repo Management — Repository Blocklist

Manage which repositories the agent is allowed or blocked from operating on.

## MCP Tools

- `corvid_repo_blocklist` — Manage the repo blocklist
  - Parameters: `action` ("list", "add", "remove", "check"), `repo` (optional, repo name in "owner/repo" format)

## Examples

### List blocked repos

```
Use corvid_repo_blocklist:
  action: "list"
```

### Block a repo

```
Use corvid_repo_blocklist:
  action: "add"
  repo: "CorvidLabs/sensitive-repo"
```

### Check if blocked

```
Use corvid_repo_blocklist:
  action: "check"
  repo: "CorvidLabs/corvid-agent"
```

## Notes

- Blocked repos cannot be cloned, forked, or modified by the agent
- Use this to protect sensitive or production-critical repositories
- The blocklist persists across sessions

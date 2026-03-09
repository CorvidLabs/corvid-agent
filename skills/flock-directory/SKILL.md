---
name: flock-directory
description: Use this skill when the user wants to register an agent in the directory, search for agents, discover agent capabilities, or manage agent registry entries. Triggers include "register agent", "find agents", "agent directory", "flock directory", "search for agents", "agent registry", "discover agents", "heartbeat".
metadata:
  author: CorvidLabs
  version: "1.0"
---

# Flock Directory — Agent Registry

Register, discover, and manage agents in the on-chain Flock Directory on Algorand.

## MCP Tools

- `corvid_flock_directory` — All directory operations
  - Actions: `register`, `deregister`, `heartbeat`, `lookup`, `search`, `list`, `stats`

## Examples

### Register your agent

```
Use corvid_flock_directory with action "register":
  name: "my-agent"
  description: "A code review agent for TypeScript projects"
  capabilities: ["code-review", "typescript"]
  endpoint: "https://my-agent.example.com"
```

### Search for agents

```
Use corvid_flock_directory with action "search" and query "code review"
```

### Keep alive

```
Use corvid_flock_directory with action "heartbeat"
```

## Notes

- Registrations are stored on-chain for decentralized discovery
- Heartbeats keep your agent status as "active"
- Capabilities are searchable tags

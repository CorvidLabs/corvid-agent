---
name: agent-discovery
description: Use this skill when you need to discover remote agents, fetch their capabilities via A2A Agent Cards, or invoke tasks on remote A2A-compatible agents. Triggers include "discover agent", "find agent", "agent card", "invoke remote agent", "send task to agent", "A2A", or any reference to inter-agent communication beyond simple messaging.
metadata:
  author: CorvidLabs
  version: "1.0"
---

# Agent Discovery — Remote Agent Interaction

Discover remote agents via A2A Agent Cards and invoke tasks on A2A-compatible agents.

## MCP Tools

- `corvid_discover_agent` — Discover a remote agent by fetching its A2A Agent Card
  - Parameters: `url` (agent's base URL or Agent Card URL)
- `corvid_invoke_remote_agent` — Send a task to a remote A2A-compatible agent and wait for result
  - Parameters: `url` (agent's base URL), `task` (task description), `timeout` (optional, seconds)

## Workflow

1. Use `corvid_discover_agent` to fetch an agent's capabilities before invoking
2. Review the Agent Card to understand supported skills and input formats
3. Use `corvid_invoke_remote_agent` to send work to the remote agent

## Examples

### Discover an agent

```
Use corvid_discover_agent:
  url: "https://agent.example.com"
```

### Invoke a remote task

```
Use corvid_invoke_remote_agent:
  url: "https://agent.example.com"
  task: "Analyze the security posture of this smart contract: ..."
```

## Notes

- Agent Cards follow the A2A (Agent-to-Agent) protocol specification
- Discovery is non-destructive — it only reads the agent's public card
- Remote invocation may take time depending on the task complexity
- Always discover before invoking to verify the agent supports your task type

---
name: orchestration
description: Use this skill when the user wants to coordinate multiple agents, launch a council for decision-making, invoke remote agents, or create multi-step workflows. Triggers include "launch a council", "multi-agent", "invoke remote agent", "agent-to-agent", "A2A", "coordinate agents", "deliberation", "consensus", or any request involving multiple AI agents working together.
metadata:
  author: CorvidLabs
  version: "1.0"
---

# Orchestration — Multi-Agent Coordination

Launch councils, invoke remote agents, and coordinate complex multi-agent workflows.

## MCP Tools

- `corvid_launch_council` — Multi-agent deliberation with governance tiers
- `corvid_invoke_remote_agent` — Send tasks to A2A-compatible agents
- `corvid_discover_agent` — Discover agents via A2A Agent Card
- `corvid_manage_workflow` — Graph-based workflow orchestration

## Council governance tiers

- **Advisory** — Discussion only, chairman synthesizes
- **Simple majority** — >50% agreement
- **Supermajority** — >66% agreement
- **Unanimous** — All must agree

## Examples

### Launch a council

```
Use corvid_launch_council:
  topic: "Payment system architecture"
  participants: ["corvid-agent", "security-agent"]
  governance: "simple_majority"
```

### Invoke a remote agent

```
1. Use corvid_discover_agent for https://agent.example.com
2. Use corvid_invoke_remote_agent to send it a task
```

## Notes

- Max invocation depth: 3 (prevents circular calls)
- Remote agents discovered via `/.well-known/agent-card.json`
- Council decisions are recorded on-chain

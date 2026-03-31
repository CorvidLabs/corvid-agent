# A2A Protocol — Context

## Why This Module Exists

The corvid-agent platform is designed for multi-agent collaboration, not just single-agent operation. The A2A (Agent-to-Agent) protocol enables agents on different hosts or platforms to discover each other's capabilities and delegate tasks. Without this, agents are limited to intra-platform communication via AlgoChat or direct process invocation.

## Architectural Role

A2A sits at the **inter-platform boundary** — it's how corvid-agent talks to agents that aren't part of the local deployment. It complements AlgoChat (which handles on-chain messaging between known agents) by providing a standard HTTP-based protocol for task delegation with agents discovered via their Agent Card.

## Key Design Decisions

- **Agent Cards over static config**: Rather than hardcoding remote agent endpoints, A2A uses discoverable Agent Card documents (JSON-LD) that describe capabilities, skills, and endpoints. This makes the system extensible without config changes.
- **Invocation guard**: Outbound A2A calls go through an invocation guard to prevent infinite recursion (agent A calls B calls A). This is critical in a multi-agent system where delegation chains can form.
- **Poll-based results**: A2A tasks are asynchronous — the caller submits a task and polls for completion. This avoids long-lived HTTP connections and works across firewalls.

## Relationship to Other Modules

- **Flock Directory**: Discovers which agents are available and what they can do (local registry). A2A extends this to remote agents.
- **Process Manager**: A2A inbound tasks create sessions via the process manager, same as any other agent interaction.
- **Work Tasks**: A2A task results feed back into the work task system when used for delegated work.

---
spec: communication-tiers.spec.md
sources:
  - server/lib/communication-tiers.ts
---

## Layout

Single-file module: `server/lib/communication-tiers.ts`. No external dependencies. Statically defined tier assignments keyed by agent name (case-insensitive).

## Components

### Communication Tier Hierarchy
Three-level role hierarchy controlling agent messaging permissions:
- `top` — can message any tier (management / orchestrator agents)
- `mid` — can message `mid` or `bottom` (team leads, specialist agents)
- `bottom` — can only message `bottom` (worker / task agents)

This hierarchy is separate from model capability tiers (`AgentTier` in agent-tiers.ts) — a powerful model can still be in the `bottom` communication tier based on its org role.

### getCommunicationTier(agentName)
Looks up the tier for an agent by name (case-insensitive). Unknown agents default to `'bottom'` (conservative).

### checkCommunicationTier(fromAgentName, toAgentName)
Returns `null` if messaging is allowed, or a descriptive error string if blocked. The error message includes both agent names and their respective tiers for debugging.

### getTierMessageLimits(tier)
Returns `{ maxMessagesPerSession, maxUniqueTargetsPerSession }` rate limit overrides appropriate to the tier. Higher tiers receive larger limits.

## Tokens

| Constant | Value | Description |
|----------|-------|-------------|
| Default tier for unknown agents | `'bottom'` | Conservative fallback for agents not in the tier map |

## Assets

No external dependencies, no DB tables, no environment variables. Pure in-process logic based on statically defined tier assignments.

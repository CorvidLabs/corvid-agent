---
module: communication-tiers
version: 1
status: active
files:
  - server/lib/communication-tiers.ts
db_tables: []
depends_on: []
---

# Communication Tiers

## Purpose

Role-based communication hierarchy that controls which agents can message which other agents. Agents are assigned a tier (top, mid, bottom) and messages flow downward — higher-tier agents can message lower-tier agents but not vice versa.

## Public API

### Exported Types

| Type | Description |
|------|-------------|
| `CommunicationTier` | `'top' \| 'mid' \| 'bottom'` — agent communication tier levels |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `getCommunicationTier` | `(agentName: string)` | `CommunicationTier` | Get the communication tier for an agent by name. Returns `'bottom'` for unknown agents |
| `checkCommunicationTier` | `(fromAgentName: string, toAgentName: string)` | `string \| null` | Check if an agent can message another. Returns `null` if allowed, or an error message if blocked |
| `getTierMessageLimits` | `(tier: CommunicationTier)` | `{ maxMessagesPerSession, maxUniqueTargetsPerSession }` | Get rate limit overrides for a communication tier |

## Invariants

1. **Downward flow**: top can message anyone, mid can message mid/bottom, bottom can message bottom only
2. **Default to bottom**: Unknown agents default to `'bottom'` tier (conservative)
3. **Rate limits scale with tier**: top=20msg/10targets, mid=10msg/5targets, bottom=5msg/2targets

## Behavioral Examples

### Scenario: Top-tier agent messages mid-tier agent

- **Given** CorvidAgent (top) wants to message Rook (mid)
- **When** `checkCommunicationTier('CorvidAgent', 'Rook')` is called
- **Then** returns `null` (allowed — top can message mid)

### Scenario: Bottom-tier agent messages top-tier agent

- **Given** Magpie (bottom) wants to message CorvidAgent (top)
- **When** `checkCommunicationTier('Magpie', 'CorvidAgent')` is called
- **Then** returns an error string explaining the tier violation

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Unknown agent name | Defaults to `'bottom'` tier (conservative) |
| Bottom-tier agent messages higher tier | Returns descriptive error string |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/lib/logger.ts` | `createLogger` for tier violation warnings |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/mcp/tool-handlers/messaging.ts` | Tier checks before sending agent messages |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-27 | corvid-agent | Initial spec |

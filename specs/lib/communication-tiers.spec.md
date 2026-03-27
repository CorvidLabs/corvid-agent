---
module: communication-tiers
version: 1
status: draft
files:
  - server/lib/communication-tiers.ts
db_tables: []
depends_on:
  - specs/lib/infra.spec.md
---

# Communication Tiers

## Purpose

Role-based communication hierarchy that controls which agents can message which other agents. Separate from model capability tiers — an agent could run on a powerful model but still be junior in the org hierarchy. Messages flow downward: top can message anyone, mid can message same tier or below, bottom can message same tier only.

## Public API

### Exported Functions

#### communication-tiers.ts
| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `getCommunicationTier` | `agentName: string` | `CommunicationTier` | Returns the communication tier for an agent by name (lowercase lookup). Unknown agents default to `'bottom'` (conservative). |
| `checkCommunicationTier` | `fromAgentName: string, toAgentName: string` | `string \| null` | Returns `null` if the sender can message the target, or an error message string if blocked by the tier hierarchy. |
| `getTierMessageLimits` | `tier: CommunicationTier` | `{ maxMessagesPerSession: number; maxUniqueTargetsPerSession: number }` | Returns rate-limit overrides appropriate for a communication tier. Higher tiers get more messaging capacity. |

### Exported Types

#### communication-tiers.ts
| Type | Kind | Description |
|------|------|-------------|
| `CommunicationTier` | type | `'top' \| 'mid' \| 'bottom'` — the three hierarchy levels. |

## Invariants

- Tier hierarchy is strictly `top` (rank 3) > `mid` (rank 2) > `bottom` (rank 1).
- An agent can always message agents at the same rank or below, never above.
- Unknown agents always resolve to `'bottom'` tier.
- Rate limits increase monotonically with tier rank.

## Behavioral Examples

- `checkCommunicationTier('corvidagent', 'magpie')` → `null` (top → bottom: allowed)
- `checkCommunicationTier('magpie', 'corvidagent')` → error string (bottom → top: blocked)
- `checkCommunicationTier('rook', 'jackdaw')` → `null` (mid → mid: allowed)
- `getCommunicationTier('unknown-agent')` → `'bottom'`

## Error Cases

- `checkCommunicationTier` returns an error string (not null) when a lower-tier agent attempts to message a higher-tier agent. The string includes both agent names and their tiers.

## Dependencies

- `server/lib/logger.ts` — createLogger for warning on tier violations.

## Change Log

| Date | Change |
|------|--------|
| 2026-03-27 | Initial spec |

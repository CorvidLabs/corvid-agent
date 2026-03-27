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

Role-based communication hierarchy that controls which agents can message which other agents. Separate from model capability tiers — an agent could run on a powerful model but still be junior in the org hierarchy. Messages flow downward: top-tier agents can message anyone, mid-tier can message same or below, bottom-tier can only message same tier.

## Public API

### Exported Types

| Type | Description |
|------|-------------|
| `CommunicationTier` | `'top' \| 'mid' \| 'bottom'` — the three hierarchy levels |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `getCommunicationTier` | `(agentName: string)` | `CommunicationTier` | Get the communication tier for an agent by name. Returns `'bottom'` for unknown agents |
| `checkCommunicationTier` | `(fromAgentName: string, toAgentName: string)` | `string \| null` | Check whether an agent is allowed to message another. Returns `null` if allowed, or an error message if blocked |
| `getTierMessageLimits` | `(tier: CommunicationTier)` | `{ maxMessagesPerSession: number; maxUniqueTargetsPerSession: number }` | Get rate limit overrides appropriate for a communication tier. Higher tiers get more capacity |

## Invariants

- Unknown agents always default to `'bottom'` tier (conservative).
- Top-tier agents can message any tier. Mid-tier can message mid or bottom. Bottom can only message bottom.
- Agent name lookup is case-insensitive.

## Behavioral Examples

- CorvidAgent (top) → Rook (mid): allowed (top can message anyone).
- Magpie (bottom) → Rook (mid): blocked — bottom cannot message mid.
- Jackdaw (mid) → Magpie (bottom): allowed (mid can message below).
- Unknown agent → anyone: treated as bottom tier.

## Error Cases

- `checkCommunicationTier` returns a descriptive error string when a lower-tier agent attempts to message a higher-tier agent. The error includes both agent names and their tiers.

## Dependencies

None.

## Change Log

| Version | Date | Description |
|---------|------|-------------|
| 1 | 2026-03-27 | Initial spec |

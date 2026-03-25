---
module: buddy-seed
version: 1
status: draft
files:
  - server/buddy/seed.ts
db_tables: []
depends_on:
  - specs/db/buddy.spec.md
  - specs/conversational/presets.spec.md
---

# Buddy Seed

## Purpose

Seeds default buddy pairings on startup so buddy mode works out of the box. Pairs the main agent (first algochatAuto-enabled agent) with every conversational preset agent as a reviewer buddy with 3 rounds. Idempotent — safe to call multiple times.

## Public API

### Exported Types

| Type | Description |
|------|-------------|
| `SeedBuddyPairingsOpts` | `{ db: Database }` — options for the seed function |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `seedDefaultBuddyPairings` | `(opts: SeedBuddyPairingsOpts)` | `void` | Seeds pairings between the main agent and all preset agents that aren't already paired |

## Key Behaviors

1. **Main agent lookup** — finds the first agent with `algochatAuto` enabled
2. **Preset agent discovery** — finds agents whose `customFlags.presetKey` matches a known conversational preset
3. **Idempotent seeding** — skips agents that are already paired or would be self-paired
4. **Default config** — all seeded pairings use `buddyRole: 'reviewer'` and `maxRounds: 3`

## Invariants

- Calling `seedDefaultBuddyPairings` multiple times never creates duplicate pairings
- Self-pairings (main agent paired with itself) are never created
- If no main agent exists, the function returns without error

## Behavioral Examples

- First call with 5 preset agents and no existing pairings → creates 5 pairings
- Second call with same state → creates 0 pairings (all already exist)
- Call with no algochatAuto agent → logs debug message and returns

## Error Cases

- No algochatAuto-enabled agent found → silently returns (debug log only)
- No conversational preset agents found → silently returns (debug log only)

## Dependencies

- `server/db/agents.ts` — Agent queries (`getAlgochatEnabledAgents`, `listAgents`)
- `server/db/buddy.ts` — Buddy pairing CRUD (`listBuddyPairings`, `createBuddyPairing`)
- `server/conversational/presets.ts` — `CONVERSATIONAL_PRESETS` array

## Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1 | 2026-03-24 | Initial version — auto-seed preset agents as reviewer buddies |

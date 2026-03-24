---
module: conversational-presets
version: 1
status: active
files:
  - server/conversational/presets.ts
db_tables: []
depends_on: []
---

# Conversational Presets

## Purpose

Defines the starter conversational agent presets that are seeded on startup. Each preset specifies the agent's name, system prompt, model, AlgoChat settings, rate limits, and Flock Directory metadata. These presets serve as the default set of conversational agents available for discovery via the Flock Directory.

## Public API

### Exported Types

| Type | Description |
|------|-------------|
| `ConversationalPreset` | Extends `CreateAgentInput` with `presetKey`, `flockCapabilities`, and `flockDescription` for Flock Directory registration |

### Exported Constants

| Constant | Type | Description |
|----------|------|-------------|
| `CONVERSATIONAL_PRESETS` | `ConversationalPreset[]` | Array of 3 starter agent presets: `algorand-helper`, `corvid-guide`, `general-assistant` |

## Invariants

1. Every preset MUST have a unique `presetKey` string
2. Every preset MUST have `algochatEnabled: true` (conversational agents communicate via AlgoChat)
3. Every preset MUST have a non-empty `flockCapabilities` array and `flockDescription` string
4. Every preset MUST include `conversationRateLimitWindow` and `conversationRateLimitMax` to prevent abuse

## Behavioral Examples

### Scenario: Accessing presets at startup

- **Given** the module is imported
- **When** `CONVERSATIONAL_PRESETS` is read
- **Then** it contains exactly 3 presets with unique `presetKey` values

## Error Cases

| Condition | Behavior |
|-----------|----------|
| N/A | This module is a static constant definition with no runtime error paths |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `shared/types` | `CreateAgentInput` type |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/conversational/seed.ts` | `CONVERSATIONAL_PRESETS`, `ConversationalPreset` |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-24 | corvid-agent | Initial spec |

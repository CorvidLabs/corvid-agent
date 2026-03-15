---
module: chain-continuation
version: 1
status: active
files:
  - server/work/chain-continuation.ts
db_tables: []
depends_on:
  - specs/providers/model-dispatch.spec.md
---

# Chain Continuation

## Purpose

Detects when a limited-tier model stalls mid tool-chain and surfaces a signal to escalate to a higher tier. A "stalled step" is a model turn (`message_stop` event) that produced no `tool_use` content blocks. When consecutive stalled steps reach the configurable threshold, the caller should escalate the session to the next `ModelTier`.

## Public API

### Exported Constants

| Constant | Type | Default | Description |
|----------|------|---------|-------------|
| `CHAIN_CONTINUATION_THRESHOLD` | `number` | `5` | Number of consecutive stalled turns before escalation; overridable via `MODEL_CHAIN_CONTINUATION_THRESHOLD` env var |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `escalateTier` | `(tier: ModelTier)` | `ModelTier \| null` | Maps a tier to the next higher tier (HAIKU->SONNET->OPUS); returns null if already OPUS |
| `inferModelTier` | `(model: string)` | `ModelTier` | Infers ModelTier from a model identifier string; defaults to HAIKU when unrecognized |
| `modelForTier` | `(tier: ModelTier)` | `string` | Returns the canonical Claude model string for a given tier via `CLAUDE_TIER_MODELS` |
| `serializeChainState` | `(opts: { taskDescription, fromTier, toTier, stalledSteps, sessionSummary? })` | `string` | Serializes chain state for escalated task context with sensitive pattern redaction |
| `logEscalation` | `(opts: { taskId, sessionId, fromTier, toTier, stalledSteps, newTaskId? })` | `void` | Logs an escalation event at INFO level with tier metadata only |

### Exported Classes

| Class | Description |
|-------|-------------|
| `StallDetector` | Tracks per-session stall state and fires escalation signals when threshold is reached |

### StallDetector Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `track` | `(sessionId: string)` | `void` | Begin tracking stall state for a session |
| `onEvent` | `(sessionId, eventType, contentBlockType?)` | `boolean` | Process a stream event; returns true when stall threshold is crossed for first time |
| `getStalledSteps` | `(sessionId: string)` | `number` | Return current consecutive stalled-step count |
| `markEscalated` | `(sessionId: string)` | `void` | Mark session as escalated to prevent double-escalation |
| `remove` | `(sessionId: string)` | `void` | Remove all stall state for a session |
| `trackedSessionCount` | _(getter)_ | `number` | Number of sessions currently being tracked |

### Exported Types (re-export)

| Type | Description |
|------|-------------|
| `ModelTier` | Re-exported from `server/providers/types` |

## Invariants

1. **Stall counter resets on productive turn**: If a turn produces at least one `tool_use` content block, `stalledSteps` resets to 0
2. **Single escalation per session**: Once `markEscalated` is called, `onEvent` always returns false for that session
3. **No sensitive data in serialized state**: `serializeChainState` redacts API keys, mnemonics, PEM blocks, and wallet credentials
4. **Session summary truncation**: Serialized session summaries are capped at 800 characters
5. **Unknown models default to HAIKU**: `inferModelTier` returns HAIKU for unrecognized model strings (most restrictive tier)
6. **OPUS cannot escalate**: `escalateTier(ModelTier.OPUS)` returns null

## Behavioral Examples

### Scenario: Detect stalled session and trigger escalation

- **Given** a StallDetector with threshold 3 and a tracked session "s1"
- **When** 3 consecutive `message_stop` events arrive with no preceding `tool_use` content blocks
- **Then** the third `onEvent` call returns true

### Scenario: Productive turn resets counter

- **Given** a StallDetector tracking session "s1" with 2 stalled steps
- **When** a `content_block_start` event with type `tool_use` arrives, followed by `message_stop`
- **Then** stalled steps reset to 0 and `onEvent` returns false

### Scenario: Redact secrets in chain state

- **Given** a task description containing `ANTHROPIC_API_KEY=sk-abc123xyz`
- **When** `serializeChainState` is called with that description
- **Then** the output contains `[REDACTED]` in place of the key value

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `onEvent` called for untracked session | Returns false (no-op) |
| `getStalledSteps` for untracked session | Returns 0 |
| `markEscalated` for untracked session | No-op |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/providers/types` | `ModelTier` enum |
| `server/providers/router` | `CLAUDE_TIER_MODELS` mapping |
| `server/lib/logger` | `createLogger` factory |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/process/direct-process.ts` | `StallDetector`, `escalateTier`, `serializeChainState`, `logEscalation` |

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `MODEL_CHAIN_CONTINUATION_THRESHOLD` | `5` | Number of consecutive stalled turns before escalation signal |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-14 | corvid-agent | Initial spec |

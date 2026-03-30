---
module: cursor-provider
version: 1
status: active
files:
  - server/providers/cursor/provider.ts
db_tables: []
depends_on:
  - specs/providers/model-capabilities.spec.md
---

# Cursor Provider

## Purpose

Cursor LLM provider wrapping the cursor-agent CLI as a first-class `LlmProvider`. Spawns cursor-agent as a subprocess with `--print --output-format stream-json`, parses streaming JSON events, and returns a normalized `LlmCompletionResult`. Supports concurrency limiting via slot-based scheduling.

## Public API

### Exported Classes

| Class | Description |
|-------|-------------|
| `CursorProvider` | Main Cursor provider extending `BaseLlmProvider` |

#### CursorProvider Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `getInfo` | `()` | `LlmProviderInfo` | Return provider metadata including models, execution mode, capabilities |
| `isAvailable` | `()` | `Promise<boolean>` | Check cursor-agent binary exists and passes `--version` |
| `acquireSlot` | `(model, signal?, onStatus?)` | `Promise<boolean>` | Acquire a concurrency slot, queues if full |
| `releaseSlot` | `(model)` | `void` | Release slot and wake next queued waiter |
| `getSlotStatus` | `()` | `{ active, max, queued }` | Current slot usage for observability |
| `maxConcurrent` | getter | `number` | Maximum concurrent cursor-agent processes |
| `doComplete` | `(params)` | `Promise<LlmCompletionResult>` | Spawn cursor-agent, parse stream-json, return result |

## Invariants

1. **Slot-based concurrency**: `activeSlots` never exceeds `maxSlots` (default 4, configurable via `CURSOR_MAX_CONCURRENT`). Never goes negative — clamped to 0
2. **Slot always released**: Every `acquireSlot` returning `true` must have a corresponding `releaseSlot`, even on abort or error
3. **Abort removes from queue**: If an abort signal fires while queued, the waiter is removed and `acquireSlot` returns `false`
4. **Completion timeout (15 min, configurable)**: Cursor-agent process is killed after `CURSOR_COMPLETION_TIMEOUT` ms (default 15 minutes). Stream idle timeout is `CURSOR_STREAM_IDLE_TIMEOUT` ms (default 120 seconds)
5. **Readiness probe**: `isAvailable()` runs `cursor-agent --version` — binary must exist AND exit 0
6. **Stream-json parsing**: Non-JSON lines from stdout are silently skipped; only structured events are processed

## Behavioral Examples

### Scenario: Slot acquisition when full

- **Given** `maxSlots=4` (default) and all slots occupied
- **When** a request beyond the limit calls `acquireSlot`
- **Then** it queues (not rejected) and the `onStatus` callback reports the queue position
- **And** when a slot is released, the queued request resolves with `true`

### Scenario: Abort during slot wait

- **Given** a request waiting in the slot queue
- **When** the abort signal fires
- **Then** the waiter is removed from the queue
- **And** `acquireSlot` returns `false`

### Scenario: Cursor binary not available

- **Given** `hasCursorAccess()` returns `false`
- **When** `isAvailable()` is called
- **Then** it returns `false` without spawning a process

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Cursor binary missing | `isAvailable()` returns false; provider not registered |
| Binary exists but `--version` fails | `isAvailable()` returns false; bootstrap logs warning |
| Process exits non-zero | Completion returns partial content; warning logged |
| Completion timeout (10 min) | Process killed; partial content returned |
| Abort signal during completion | Process killed via signal handler |
| Empty messages array | `complete()` throws `[cursor] at least one message is required` |
| Empty model string | `complete()` throws `[cursor] model is required` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/providers/base.ts` | `BaseLlmProvider` base class |
| `server/providers/types.ts` | `LlmProviderType`, `ExecutionMode`, `LlmCompletionParams`, `LlmCompletionResult`, `LlmProviderInfo` |
| `server/providers/cost-table.ts` | `getModelsForProvider` |
| `server/process/cursor-process.ts` | `hasCursorAccess`, `getCursorBinPath` |
| `server/lib/logger.ts` | `createLogger` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/providers/registry.ts` | Registered as `cursor` provider |
| `server/process/direct-process.ts` | `acquireSlot`, `releaseSlot`, `complete` via `LlmProvider` interface |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `CURSOR_MAX_CONCURRENT` | `4` | Maximum parallel cursor-agent processes (queued, not rejected when exceeded) |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-27 | corvid-agent | Initial spec for CursorProvider (#1529) |
| 2026-03-28 | corvid-agent | Rename CURSOR_MAX_PARALLEL → CURSOR_MAX_CONCURRENT, default 2→4, add getSlotStatus/maxConcurrent (#1532) |

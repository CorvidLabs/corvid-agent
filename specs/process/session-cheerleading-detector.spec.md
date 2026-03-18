---
module: session-cheerleading-detector
version: 1
status: draft
files:
  - server/process/session-cheerleading-detector.ts
db_tables: []
depends_on:
  - specs/lib/session-analysis.spec.md
  - specs/process/process-manager.spec.md
---

# Session Cheerleading Detector

## Purpose

Passive observer that tracks consecutive cheerleading response turns per session. Attaches globally to a ProcessManager (or any `IEventSubscribable`) via `subscribeAll()` and maintains per-session state independently of the process manager core, keeping detection logic out of the Constitutional (Layer 0) manager.ts file.

## Public API

### Exported Interfaces

| Interface | Description |
|-----------|-------------|
| `IEventSubscribable` | Minimal contract for an event source: `subscribeAll(callback)` and `unsubscribeAll(callback)`. |

### Exported Classes

| Class | Description |
|-------|-------------|
| `SessionCheerleadingDetector` | Stateful observer that subscribes to all session events and tracks consecutive cheerleading turns per session. |

#### SessionCheerleadingDetector Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `constructor` | `eventSource: IEventSubscribable` | — | Subscribes to all events from the event source. |
| `getConsecutiveCheerleadingCount` | `sessionId: string` | `number` | Returns the current consecutive cheerleading count for a session (0 if unknown). |
| `destroy` | `eventSource: IEventSubscribable` | `void` | Unsubscribes from the event source and clears all per-session state. |

## Invariants

1. Per-session state is created lazily on first event for a given session ID.
2. Events accumulate in a per-session buffer until a `result` event signals the end of a response turn.
3. On `result` event, the accumulated turn events are analyzed via `isCheerleadingResponse`; if cheerleading, the consecutive count increments; otherwise it resets to 0.
4. Session end events (as determined by `isSessionEndEvent`) cause per-session state to be deleted, preventing unbounded memory growth.
5. When `consecutiveCount` reaches `CHEERLEADING_WARNING_THRESHOLD` (2), a warning is logged indicating the session may be stuck.
6. `getConsecutiveCheerleadingCount` returns 0 for unknown session IDs (never throws).
7. `destroy` removes the event subscription and clears all tracked state.

## Behavioral Examples

### Scenario: Single cheerleading turn
- **Given** a session emits events for a turn with no tool calls and text "I'll look into that!"
- **When** the `result` event arrives
- **Then** `getConsecutiveCheerleadingCount` returns 1

### Scenario: Consecutive cheerleading triggers warning
- **Given** a session has already had 1 cheerleading turn (count = 1)
- **When** the next turn is also cheerleading and the `result` event arrives
- **Then** `getConsecutiveCheerleadingCount` returns 2 and a warning is logged

### Scenario: Substantive turn resets count
- **Given** a session has consecutive count of 2
- **When** the next turn includes tool_use events and the `result` event arrives
- **Then** `getConsecutiveCheerleadingCount` resets to 0

### Scenario: Session end cleans up state
- **Given** a session has accumulated state
- **When** a session end event is received
- **Then** the session's state is deleted from the internal map

### Scenario: Unknown session
- **Given** no events have been received for session "unknown-id"
- **When** `getConsecutiveCheerleadingCount("unknown-id")` is called
- **Then** returns 0

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Events for unknown session | State is created lazily; no error |
| `getConsecutiveCheerleadingCount` for nonexistent session | Returns 0 |
| `destroy` called when no state exists | Clears empty map; no error |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `process/types` | `ClaudeStreamEvent`, `isSessionEndEvent` |
| `process/interfaces` | `EventCallback` type |
| `lib/session-analysis` | `isCheerleadingResponse`, `CHEERLEADING_WARNING_THRESHOLD` |
| `lib/logger` | `createLogger` for structured logging |

### Consumed By

| Module | What is used |
|--------|-------------|
| `process/manager` | `SessionCheerleadingDetector` instance attached to the process manager |

## Change Log

| Version | Date | Description |
|---------|------|-------------|
| 1 | 2026-03-18 | Initial spec — passive cheerleading observer with per-session state tracking. |

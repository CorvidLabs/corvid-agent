---
module: claude-process
version: 1
status: draft
files:
  - server/process/claude-process.ts
  - server/process/event-bus.ts
  - server/process/interfaces.ts
  - server/process/types.ts
db_tables: []
depends_on:
  - specs/lib/infra.spec.md
---

# Claude Process

## Purpose

Provides the CLI-based Claude process spawning mechanism (deprecated in favor of SDK path), the session event bus for pub/sub event distribution, and the shared type definitions and interfaces that underpin the entire process management subsystem.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `spawnClaudeProcess` | `options: ClaudeProcessOptions` | `ClaudeProcess` | **(Deprecated)** Spawns a Claude CLI process with stream-json I/O, wires up stdout/stderr parsing, stdin message delivery, and exit monitoring. Retained for reference; all agents now use the SDK path. |
| `extractContentText` | `content: string \| ContentBlock[] \| undefined` | `string` | Extracts plain text from a content value — returns the string directly, or concatenates all `text`-type blocks from an array. Returns `''` for `undefined`. |
| `isResultEvent` | `e: ClaudeStreamEvent` | `e is ResultEvent` | Type guard: returns `true` if the event is a `result` event. |
| `isErrorEvent` | `e: ClaudeStreamEvent` | `e is ErrorEvent` | Type guard: returns `true` if the event is an `error` event. |
| `isApprovalEvent` | `e: ClaudeStreamEvent` | `e is ApprovalRequestEvent` | Type guard: returns `true` if the event is an `approval_request` event. |
| `isSessionEndEvent` | `e: ClaudeStreamEvent` | `e is SessionExitedEvent \| SessionStoppedEvent` | Type guard: returns `true` if the event is `session_exited` or `session_stopped`. |
| `isSessionErrorRecoveryEvent` | `e: ClaudeStreamEvent` | `e is SessionErrorRecoveryEvent` | Type guard: returns `true` if the event is a `session_error` event. |

### Exported Types

| Type | Description |
|------|-------------|
| `ContentBlock` | Interface with `type: string` and optional `text: string`. Represents a content block in assistant messages. |
| `ClaudeStreamEvent` | Discriminated union of all 18 stream event types, discriminated on the `type` field. The canonical event type for the process subsystem. |
| `ClaudeStreamEventType` | String literal union of all event type discriminants (`'message_start' \| 'message_delta' \| ...`). |
| `MessageStartEvent` | Event emitted when a message begins. Contains optional `message` with `role` and `content`. |
| `MessageDeltaEvent` | Event emitted for incremental message content. Contains optional `delta` with `type` and `text`. |
| `MessageStopEvent` | Event emitted when a message ends. |
| `ContentBlockStartEvent` | Event emitted when a content block begins streaming. Contains `content_block` with `type`, optional `text`, `name`, `input`. |
| `ContentBlockDeltaEvent` | Event emitted for incremental content block content. |
| `ContentBlockStopEvent` | Event emitted when a content block ends. |
| `AssistantEvent` | Event carrying a complete assistant message with `role: 'assistant'` and `content`. |
| `ThinkingEvent` | Event indicating thinking/heartbeat status via `thinking: boolean`. |
| `ResultEvent` | Event emitted on session completion. Contains required `total_cost_usd` and optional `result`. |
| `ErrorEvent` | Event carrying an error with `message` and `type` fields. |
| `ToolStatusEvent` | Synthetic event for tool execution status updates. Contains `statusMessage`. |
| `SystemEvent` | Synthetic system notification. Contains optional `statusMessage` and `message`. |
| `ApprovalRequestEvent` | Synthetic event for tool approval requests. Contains `id`, `sessionId`, `toolName`, `description`, `createdAt`, `timeoutMs`. |
| `SessionStartedEvent` | Synthetic event emitted by ProcessManager when a session starts. |
| `SessionExitedEvent` | Event emitted when a session process exits. Contains optional `result`. |
| `SessionStoppedEvent` | Event emitted when a session is stopped by user/system. |
| `QueueStatusEvent` | Event for inference slot queue waiting. Contains `statusMessage`. |
| `SessionErrorRecoveryEvent` | Event emitted for session errors with structured recovery info. Contains `error` with `message`, `errorType`, `severity`, and `recoverable` fields. |
| `PerformanceEvent` | Event carrying inference metrics: `model`, `tokensPerSecond`, `outputTokens`, `evalDurationMs`. |
| `RawStreamEvent` | Raw SDK event passthrough. Contains optional `message` with `content`. |
| `ClaudeInputMessage` | Interface for messages sent to Claude via stdin: `{ type: 'user', message: { role: 'user', content: string } }`. |
| `ProcessInfo` | Interface tracking a running process: `sessionId`, `pid`, `proc`, `subscribers` set. |
| `EventCallback` | Type alias `(sessionId: string, event: ClaudeStreamEvent) => void` for session and global event callbacks. |
| `ClaudeProcessOptions` | Interface for `spawnClaudeProcess` options: `session`, `project`, `agent`, `resume`, `prompt`, `mcpEnabled`, `onEvent`, `onExit`. |
| `ClaudeProcess` | Interface for the returned process handle: `proc`, `pid`, `sendMessage`, `kill`. |
| `DirectProcessMetrics` | Interface for metrics collected during a direct-process run: `model`, `tier`, iteration counts, tool-call counts, nudge counts, stall info, `terminationReason`, `durationMs`, `needsSummary`. |
| `ISessionEventBus` | Interface contract for the session event bus, defining subscribe/unsubscribe/emit/cleanup methods. |

### Exported Classes

| Class | Description |
|-------|-------------|
| `SessionEventBus` | Implements `ISessionEventBus`. Manages session-scoped and global event subscriptions with error-isolated emission. |

#### SessionEventBus Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `subscribe` | `sessionId: string, callback: EventCallback` | `void` | Subscribe to events for a specific session. Multiple callbacks per session supported. |
| `unsubscribe` | `sessionId: string, callback: EventCallback` | `void` | Unsubscribe a callback from a session. Auto-cleans the session entry when empty. |
| `subscribeAll` | `callback: EventCallback` | `void` | Subscribe to events from all sessions (global listener). |
| `unsubscribeAll` | `callback: EventCallback` | `void` | Unsubscribe a global listener. |
| `emit` | `sessionId: string, event: ClaudeStreamEvent` | `void` | Emit an event to all session-scoped and global subscribers. Errors in individual callbacks are caught and logged. |
| `removeSessionSubscribers` | `sessionId: string` | `void` | Remove all subscribers for a session. Used during session cleanup. |
| `clearAllSessionSubscribers` | — | `void` | Remove all session-scoped subscribers (shutdown). Does not clear global subscribers. |
| `getSubscriberCount` | — | `number` | Returns the number of session entries with active subscribers (Map size). |
| `getGlobalSubscriberCount` | — | `number` | Returns the number of global subscriber callbacks. |
| `pruneSubscribers` | `shouldPrune: (sessionId: string) => boolean` | `number` | Remove subscribers for sessions matching the predicate. Returns count of pruned entries. |

## Invariants

1. `ClaudeStreamEvent` is a discriminated union on the `type` field; all event consumers must narrow via `event.type` for type safety.
2. `SessionEventBus.emit` catches and logs errors from individual callbacks, ensuring one failing subscriber cannot break the event pipeline for others.
3. Global subscribers receive events from all sessions; they are NOT cleared by `clearAllSessionSubscribers` (they belong to long-lived services).
4. `removeSessionSubscribers` and `pruneSubscribers` prevent memory leaks by cleaning up subscriber sets for ended sessions.
5. The `spawnClaudeProcess` function is deprecated; all production agents route through the SDK path (`sdk-process.ts`).
6. `BaseStreamEvent` common fields (`total_cost_usd`, `num_turns`, `duration_ms`, `session_id`, `subtype`) are optional on all event variants; narrowing to `ResultEvent` makes `total_cost_usd` required.
7. `extractContentText` always returns a string (never `undefined` or `null`).
8. Type guard functions (`isResultEvent`, etc.) use TypeScript type predicates for safe narrowing.

## Behavioral Examples

### Scenario: Session-scoped event delivery
- **Given** a callback is subscribed to session `"sess-1"` via `subscribe("sess-1", cb)`
- **When** `emit("sess-1", event)` is called
- **Then** `cb("sess-1", event)` is invoked

### Scenario: Global subscriber receives all events
- **Given** a global callback is registered via `subscribeAll(globalCb)`
- **When** `emit("sess-1", event1)` and `emit("sess-2", event2)` are called
- **Then** `globalCb` is invoked for both events with their respective session IDs

### Scenario: Error isolation in emit
- **Given** subscriber A throws an error, subscriber B is also registered for the same session
- **When** `emit(sessionId, event)` is called
- **Then** subscriber A's error is caught and logged, subscriber B still receives the event

### Scenario: Session subscriber cleanup
- **Given** a session has active subscribers
- **When** `removeSessionSubscribers(sessionId)` is called
- **Then** all callbacks for that session are removed and subsequent emits to that session deliver only to global subscribers

### Scenario: Orphan subscriber pruning
- **Given** sessions `"a"`, `"b"`, `"c"` have subscribers, but only `"b"` has an active process
- **When** `pruneSubscribers(id => id !== "b")` is called
- **Then** subscribers for `"a"` and `"c"` are removed, returns `2`

### Scenario: Content text extraction from blocks
- **Given** `content = [{ type: 'text', text: 'Hello' }, { type: 'image', text: undefined }, { type: 'text', text: ' world' }]`
- **When** `extractContentText(content)` is called
- **Then** returns `'Hello world'`

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Subscriber callback throws during `emit` | Error is caught and logged; other subscribers still receive the event |
| `spawnClaudeProcess` stdin write fails | Logs warning, `sendMessage` returns `false` |
| `spawnClaudeProcess` exit promise rejects | Logs error, calls `onExit(1)` |
| Stdout line is not valid JSON | Treated as a `raw` event with the line content |
| `extractContentText` receives `undefined` | Returns empty string `''` |
| `unsubscribe` called for non-existent callback | No-op (Set.delete on missing element) |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `lib/logger` | `createLogger` for structured logging in `SessionEventBus` and `ClaudeProcess` |
| `shared/types` | `Session`, `Agent`, `Project` types used in `ClaudeProcessOptions` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `process/manager` | `SessionEventBus` instance, `ClaudeStreamEvent` type, event type guards |
| `process/sdk-process` | `ClaudeStreamEvent` type for event emission |
| `process/approval-manager` | (indirect) event types for approval request events |
| `routes/*` | `ClaudeStreamEvent` and subtypes for SSE/WebSocket streaming |
| `ws/handler` | `EventCallback` type, event subscription |
| `algochat/bridge` | Global event subscription via `subscribeAll` |
| `discord/bridge` | Global event subscription via `subscribeAll` |
| `telegram/bridge` | Global event subscription via `subscribeAll` |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |

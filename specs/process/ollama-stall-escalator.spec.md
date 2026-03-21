---
module: ollama-stall-escalator
version: 1
status: draft
files:
  - server/process/ollama-stall-escalator.ts
db_tables: []
depends_on:
  - specs/lib/session-analysis.spec.md
  - specs/db/sessions.spec.md
  - specs/db/agents.spec.md
  - specs/work/work-task-service.spec.md
---

# Ollama Stall Escalator

## Purpose

Passive observer that detects when an Ollama-backed session stalls for N consecutive turns and escalates the goal to the work task queue. Attaches to any event source implementing `IEventSubscribable` and monitors response turns for stall patterns (cheerleading or short no-tool-call responses). When the threshold is reached, creates a new work task and notifies the user.

## Public API

### Exported Constants

| Constant | Type | Description |
|----------|------|-------------|
| `OLLAMA_STALL_THRESHOLD` | `number` | Consecutive stalled turns before escalation (default 3, overridden by env var). |
| `OLLAMA_STALL_ESCALATION_ENABLED` | `boolean` | Whether auto-escalation is enabled (default true, disabled by env var). |

### Exported Types

| Type | Description |
|------|-------------|
| `IEventSubscribable` | Interface requiring `subscribeAll` and `unsubscribeAll` methods for event observation. |

### Exported Classes

| Class | Description |
|-------|-------------|
| `OllamaStallEscalator` | Monitors Ollama sessions for stalled turns and escalates to work task queue when threshold is reached. |

#### OllamaStallEscalator Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `constructor` | `opts: { eventSource, db, notificationService, threshold?, enabled?, getSession?, getAgent?, createWorkTask? }` | `OllamaStallEscalator` | Attaches to event source and begins monitoring. |
| `getConsecutiveStalledTurns` | `(sessionId: string)` | `number` | Returns current consecutive stall count for a session (0 if unknown). |
| `isEscalated` | `(sessionId: string)` | `boolean` | Returns true if the session has already been escalated. |
| `destroy` | `(eventSource: IEventSubscribable)` | `void` | Detaches from event source and clears state. |

## Invariants

1. Only Ollama-provider sessions are monitored; non-Ollama sessions are ignored after the first event.
2. A session is escalated at most once (the `escalated` flag prevents double-escalation).
3. A productive turn (tool call or substantive response) resets the consecutive stall counter to 0.
4. Session state is cleaned up on terminal events (session end).
5. When disabled via `OLLAMA_STALL_ESCALATION_ENABLED=false`, no events are processed.
6. The escalated work task carries `escalated_from_session_id` in its `requesterInfo` for traceability.

## Behavioral Examples

### Scenario: Three consecutive stalled turns trigger escalation

- **Given** an Ollama session with threshold=3
- **When** 3 consecutive response turns are stalled (no tool calls, short text)
- **Then** a new work task is created with `escalation_reason: 'ollama_stall'` and the user is notified

### Scenario: Productive turn resets counter

- **Given** an Ollama session with 2 consecutive stalled turns
- **When** the next turn contains a tool call
- **Then** the consecutive stall counter resets to 0

### Scenario: Non-Ollama session ignored

- **Given** a session using the Anthropic provider
- **When** events are received
- **Then** no stall tracking occurs

### Scenario: Disabled via env var

- **Given** `OLLAMA_STALL_ESCALATION_ENABLED=false`
- **When** any event is received
- **Then** the handler returns immediately without processing

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Session not found in DB during provider resolution | Provider cached as empty string; session treated as non-Ollama |
| Session not found during escalation | Escalation aborted with warning log |
| Notification send fails | Error logged; escalation still considered complete |
| Escalation work task creation fails | Error logged; `escalated` flag reset so future events can retry |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/lib/session-analysis.ts` | `isStallTurn` |
| `server/db/sessions.ts` | `getSession` |
| `server/db/agents.ts` | `getAgent` |
| `server/db/work-tasks.ts` | `createWorkTask` |
| `server/notifications/service.ts` | `NotificationService.notify` |
| `server/process/types.ts` | `ClaudeStreamEvent`, `isSessionEndEvent` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/process/manager.ts` | Instantiated and attached to ProcessManager event source |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `OLLAMA_STALL_THRESHOLD` | `3` | Consecutive stalled turns before escalation |
| `OLLAMA_STALL_ESCALATION_ENABLED` | `true` | Set `false` to disable entirely |

## Change Log

| Version | Date | Description |
|---------|------|-------------|
| 1 | 2026-03-20 | Initial spec -- auto-escalation for stalled Ollama sessions. |

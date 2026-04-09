---
module: buddy-service
version: 2
status: draft
files:
  - server/buddy/service.ts
db_tables: []
depends_on:
  - specs/db/sessions/buddy.spec.md
---

# Buddy Service

## Purpose

Orchestrates paired agent collaboration (buddy mode). When buddy mode is active, a lead agent processes a prompt, then a buddy agent reviews the output. They alternate for up to `maxRounds` rounds. The buddy can approve early (LGTM) to short-circuit. This is intentionally lighter than councils — no voting, no synthesis, just a simple request-response loop.

## Public API

### Exported Types

| Type | Description |
|------|-------------|
| `BuddyServiceDeps` | Interface: `{ db: Database; processManager: ProcessManager }` |
| `BuddyRoundCallback` | `(round: BuddyRoundEvent) => Promise<void>` — called after each agent turn |
| `BuddyRoundEvent` | `{ buddySessionId: string; agentId: string; agentName: string; role: 'lead' \| 'buddy'; round: number; maxRounds: number; content: string; approved: boolean }` |

### Exported Classes

| Class | Description |
|-------|-------------|
| `BuddyService` | Manages buddy session lifecycle and the lead-buddy conversation loop |

#### BuddyService Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `constructor` | `(deps: BuddyServiceDeps)` | `BuddyService` | Initializes with database and process manager references |
| `onSessionUpdate` | `(cb: (session: BuddySession) => void)` | `() => void` | Registers a callback for session update events; returns unsubscribe function |
| `startSession` | `(input: CreateBuddySessionInput)` | `Promise<BuddySession>` | Validates agents, creates session record, kicks off conversation loop asynchronously, returns session immediately |

## Invariants

1. **Lead and buddy must differ**: `startSession` throws if `leadAgentId === buddyAgentId`
2. **Both agents must exist**: `startSession` throws if either agent ID is not found in the database
3. **maxRounds clamped**: Input `maxRounds` is clamped to the range `[1, 10]`; defaults to 3 if not provided
4. **Asynchronous loop**: The conversation loop runs asynchronously after `startSession` returns — callers get the session record immediately
5. **Loop failure isolation**: If the conversation loop throws, the session status is set to `failed` and an update event is emitted; the error does not propagate to the caller
6. **Turn timeout**: Each agent turn has a 5-minute safety timeout; if exceeded, the process is stopped and partial output (if any) is used
7. **Early approval**: If the buddy's response is a short approval (under 300 chars, contains "lgtm"/"approved"/etc., no negative qualifiers), the loop ends early
8. **Negative qualifier rejection**: Responses containing "not approved", "but", "however", "issues" near approval words are NOT treated as approvals
9. **Read-only buddy tools**: Buddy sessions use `toolAllowList` with `BUDDY_DEFAULT_TOOLS` (Read, Glob, Grep) — buddies can inspect code but not modify it. MCP servers are not loaded for restricted-tool sessions.
10. **Optional round callback**: `CreateBuddySessionInput.onRoundComplete` is called after every agent turn (lead and buddy). Callback errors are logged but do not break the conversation loop.
11. **Approved flag in callback**: The `approved` field in `BuddyRoundEvent` is `true` only on the final buddy turn when the buddy approves (LGTM). All other rounds have `approved: false`.

## Behavioral Examples

### Scenario: Simple one-round approval
- **Given** a buddy session with maxRounds=3
- **When** the lead produces output and the buddy responds "LGTM"
- **Then** the session completes after round 1 with status `completed`

### Scenario: Multi-round feedback
- **Given** a buddy session with maxRounds=3
- **When** the buddy provides feedback (not an approval) in round 1
- **Then** the lead receives the feedback and produces a revised output for round 2

### Scenario: Lead agent not found
- **Given** a `CreateBuddySessionInput` with an invalid `leadAgentId`
- **When** `startSession` is called
- **Then** it throws `Error: Lead agent not found: <id>`

### Scenario: Buddy fails to respond
- **Given** a buddy session in progress
- **When** the buddy agent fails to produce output
- **Then** the loop breaks and completes with the last lead output

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Lead agent ID not found | Throws `Error: Lead agent not found: <id>` |
| Buddy agent ID not found | Throws `Error: Buddy agent not found: <id>` |
| Lead and buddy are the same agent | Throws `Error: Lead and buddy agent cannot be the same` |
| Conversation loop throws | Session status set to `failed`, update event emitted |
| Agent turn times out (5 min) | Process stopped, partial output used or null returned |
| Buddy agent fails to respond | Loop breaks, session completes with last lead output |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/db/buddy` | `createBuddySession`, `updateBuddySessionStatus`, `addBuddyMessage`, `getBuddySession` |
| `server/db/agents` | `getAgent` |
| `server/db/sessions` | `createSession` |
| `server/process/manager` | `ProcessManager` (subscribe, unsubscribe, startProcess, stopProcess) |
| `server/process/types` | `ClaudeStreamEvent`, `extractContentText` |
| `shared/types/buddy` | `BuddySession`, `CreateBuddySessionInput`, `BUDDY_DEFAULT_TOOLS` |
| `shared/types/sessions` | `Session` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/routes/buddy` | Route handlers start buddy sessions via this service |
| `server/discord/command-handlers/message-commands` | Passes `onRoundComplete` for visible buddy conversations |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-24 | corvid-agent | Initial spec |
| 2026-03-24 | corvid-agent | v2: Add BuddyRoundCallback and onRoundComplete for visible conversations |

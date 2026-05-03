---
module: session-lifecycle
version: 1
status: active
files:
  - server/process/session-lifecycle.ts
db_tables:
  - sessions
  - session_messages
  - escalation_queue
  - algochat_conversations
depends_on:
  - specs/db/connection.spec.md
  - specs/lib/infra/infra.spec.md
  - specs/lib/security/security.spec.md
  - specs/process/protected-paths.spec.md
---

# Session Lifecycle

## Purpose

Manages automated session cleanup, TTL-based expiration, per-project session limits, and orphaned resource reclamation.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
(none — all functions are class methods on `SessionLifecycleManager`)

### Exported Types

| Type | Description |
|------|-------------|
| `SessionLifecycleConfig` | Configuration interface: `sessionTtlMs` (default 7 days), `cleanupIntervalMs` (default 1 hour), `maxSessionsPerProject` (default 100). |
| `SessionCleanupStats` | Cleanup result stats: `expiredSessions`, `orphanedProcesses`, `staleSubscriptions`, `memoryFreedMB`. |

### Exported Constants

(none)

### Exported Classes

| Class | Description |
|-------|-------------|
| `SessionLifecycleManager` | Manages automated session cleanup with configurable TTL, periodic cleanup cycles, per-project session limits, and orphaned resource reclamation. |

#### SessionLifecycleManager Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `constructor` | `db: Database, config?: Partial<SessionLifecycleConfig>` | — | Initializes with database and merged configuration (defaults: 7-day TTL, 1-hour interval, 100 sessions/project). |
| `start` | — | `void` | Starts the automatic cleanup process. Runs an initial cleanup immediately, then schedules periodic cleanup at `cleanupIntervalMs`. |
| `stop` | — | `void` | Stops the automatic cleanup timer. |
| `runCleanup` | — | `Promise<SessionCleanupStats>` | Runs a full cleanup cycle: expires old sessions, removes orphaned messages, enforces project session limits, and reports memory delta. |
| `getStats` | — | `{ activeSessions, totalSessions, sessionsByStatus, oldestSessionAge }` | Returns current session statistics from the database. |
| `canCreateSession` | `projectId: string` | `boolean` | Returns whether a new session can be created for the given project (under the max limit). |
| `cleanupSession` | `sessionId: string` | `Promise<boolean>` | Force-deletes a specific session and all related data (messages, escalations, algochat conversation references) in a transaction. |
| `getAndClearRestartPendingSessions` | — | `string[]` | Returns session IDs marked `restart_pending = 1` (interrupted by server restart) and clears the flag. Called on startup to resume orphaned sessions. |

## Invariants

1. Sessions in `'running'` or `'waiting'` status are never cleaned up by automated expiration or limit enforcement. Both states represent live processes that must not be killed by the lifecycle manager — only the ProcessManager's inactivity timeout (2h) may terminate a `waiting` session. Sessions in `'paused'` status are protected from TTL expiration but are subject to per-project limit enforcement if older than 24 hours.
2. Session TTL expiration only applies to sessions in terminal states (`'idle'`, `'completed'`, `'error'`, `'stopped'`). The `waiting` state is non-terminal — the process is alive and may resume at any moment — so it is excluded from TTL expiration.
3. Per-project session limit enforcement deletes the oldest non-`'running'` sessions first (including `'paused'`), but only those older than 24 hours. Sessions younger than 24 hours are protected from limit-based cleanup to prevent a burst of new sessions from evicting recently-created sessions that users still expect to be resumable.
4. All session deletions cascade within a transaction: `algochat_conversations` FK nullified, `session_messages` deleted, `escalation_queue` entries deleted, then the session row itself.
5. The cleanup timer is idempotent: calling `start()` when already running logs a warning and does not create a duplicate timer.
6. Expired session cleanup is batched (up to 100 per cycle) to avoid blocking the event loop.
7. `cleanupSession` is transactional: either all related data is deleted or none is.

## Behavioral Examples

### Scenario: Automatic session expiration
- **Given** the SessionLifecycleManager is started with a 7-day TTL
- **When** the periodic cleanup runs and finds sessions in `'idle'` status that were last updated more than 7 days ago
- **Then** those sessions and their related data are deleted in a transaction

### Scenario: Per-project session limit enforcement
- **Given** `maxSessionsPerProject` is 100 and project `"proj-1"` has 110 non-running sessions all older than 24 hours
- **When** `runCleanup` executes
- **Then** the 10 oldest non-running sessions for `"proj-1"` are deleted

### Scenario: Young sessions protected from limit enforcement
- **Given** `maxSessionsPerProject` is 100 and project `"proj-1"` has 110 non-running sessions, but 15 of the oldest are younger than 24 hours
- **When** `runCleanup` executes
- **Then** only sessions older than 24 hours are deleted; younger sessions are preserved even though the project remains over the limit

### Scenario: Waiting session protected from TTL expiration

- **Given** the SessionLifecycleManager is started with a 7-day TTL
- **When** the periodic cleanup runs and finds a session in `'waiting'` status last updated 10 days ago
- **Then** that session is NOT expired — it has a live process and is protected by invariant #1
- **And** only the ProcessManager's 2-hour inactivity timeout (not the lifecycle TTL) can terminate it

### Scenario: Waiting session excluded from per-project limit enforcement

- **Given** `maxSessionsPerProject` is 100 and project `"proj-1"` has 105 sessions: 100 idle + 5 waiting
- **When** `runCleanup` executes
- **Then** the 5 `waiting` sessions are excluded from limit enforcement
- **And** only idle sessions older than 24 hours are candidates for deletion

### Scenario: Session creation gating
- **Given** project `"proj-1"` has 100 sessions
- **When** `canCreateSession("proj-1")` is called
- **Then** returns `false`

### Scenario: Force cleanup of a specific session
- **Given** session `"sess-123"` exists with messages and escalation entries
- **When** `cleanupSession("sess-123")` is called
- **Then** all related data is deleted in a transaction and the method returns `true`

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `start()` called when already running | Logs warning, does not create duplicate timer |
| `runCleanup` throws during execution | Error is caught and logged; returns stats collected so far |
| `cleanupSession` fails (e.g. DB error) | Logs error, returns `false` |
| `cleanupExpiredSessions` finds no expired sessions | Returns `0`, no DB writes |
| `canCreateSession` with nonexistent project | Returns `true` (count is 0, which is under limit) |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `db/types` | `queryCount` helper for counting rows |
| `lib/logger` | `createLogger` for structured logging |

### Consumed By

| Module | What is used |
|--------|-------------|
| `process/manager` | `SessionLifecycleManager` instance for automated cleanup |
| `routes/sessions` | `canCreateSession` for session creation validation, `getStats` for monitoring |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
| 2026-03-18 | corvid-agent | v3: Removed protected-paths exports (now in dedicated `protected-paths.spec.md`). Added 24-hour minimum age guard to `enforceSessionLimits`. Fixes #1221 |
| 2026-05-02 | Jackdaw | Session keep-alive: `waiting` status protected from TTL expiration and limit enforcement (same as `running`). Invariants 1-2 updated, behavioral examples added (#2233) |

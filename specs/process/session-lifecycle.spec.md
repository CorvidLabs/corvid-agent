---
module: session-lifecycle
version: 2
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

Manages automated session cleanup, TTL-based expiration, per-project session limits, and orphaned resource reclamation. Also defines the keep-alive process TTL — a short-lived timer that governs how long warm SDK processes remain alive between model turns.

## TTL Hierarchy

The session lifecycle manages two distinct TTL concepts:

| TTL Type | Default | Scope | What it governs |
|----------|---------|-------|-----------------|
| **Session TTL** | 7 days | DB session record | When idle/completed/error sessions are deleted from the database |
| **Keep-Alive TTL** | 15 minutes | Live SDK process | How long a warm process stays alive between model turns before being killed |

These are independent timers with different purposes:
- **Session TTL** is about database hygiene — cleaning up old session records that are no longer useful
- **Keep-Alive TTL** is about resource management — preventing warm processes from holding model context indefinitely

### Keep-Alive TTL Lifecycle

The keep-alive TTL is managed by `SessionTimerManager` (not `SessionLifecycleManager`) because it operates on live processes, not DB records. However, `SessionLifecycleManager` is responsible for:
1. Including warm process state in `getStats()` reporting
2. Treating sessions with warm processes as "active" — protecting them from cleanup just like running sessions
3. Coordinating with `ProcessManager.cleanupSessionState()` when a session with a warm process is force-cleaned

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
(none — all functions are class methods on `SessionLifecycleManager`)

### Exported Types

| Type | Description |
|------|-------------|
| `SessionLifecycleConfig` | Configuration interface: `sessionTtlMs` (default 7 days), `cleanupIntervalMs` (default 1 hour), `maxSessionsPerProject` (default 100), `keepAliveTtlMs` (default 15 minutes — passed to `SessionTimerManager` for warm process timeout). |
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
| `getStats` | — | `{ activeSessions, totalSessions, sessionsByStatus, oldestSessionAge, warmProcessCount? }` | Returns current session statistics from the database. `warmProcessCount` is optionally provided when a process map reference is available, indicating how many sessions have live warm processes. |
| `canCreateSession` | `projectId: string` | `boolean` | Returns whether a new session can be created for the given project (under the max limit). |
| `cleanupSession` | `sessionId: string` | `Promise<boolean>` | Force-deletes a specific session and all related data (messages, escalations, algochat conversation references) in a transaction. |
| `getAndClearRestartPendingSessions` | — | `string[]` | Returns session IDs marked `restart_pending = 1` (interrupted by server restart) and clears the flag. Called on startup to resume orphaned sessions. |

## Invariants

1. Sessions in `'running'` status are never cleaned up by automated expiration or limit enforcement. Sessions in `'paused'` status are protected from TTL expiration but are subject to per-project limit enforcement if older than 24 hours. Sessions with warm processes (status may be `'idle'` in DB but with a live process in memory) are treated as effectively running and protected from all automated cleanup.
2. Session TTL expiration only applies to sessions in terminal states (`'idle'`, `'completed'`, `'error'`, `'stopped'`).
3. Per-project session limit enforcement deletes the oldest non-`'running'` sessions first (including `'paused'`), but only those older than 24 hours. Sessions younger than 24 hours are protected from limit-based cleanup to prevent a burst of new sessions from evicting recently-created sessions that users still expect to be resumable.
4. All session deletions cascade within a transaction: `algochat_conversations` FK nullified, `session_messages` deleted, `escalation_queue` entries deleted, then the session row itself.
5. The cleanup timer is idempotent: calling `start()` when already running logs a warning and does not create a duplicate timer.
6. Expired session cleanup is batched (up to 100 per cycle) to avoid blocking the event loop.
7. `cleanupSession` is transactional: either all related data is deleted or none is.
8. **Warm process protection**: Automated cleanup (TTL expiration + per-project limits) must check whether a session has a live warm process before deleting. A session with a warm process is never eligible for automated cleanup regardless of its DB status or age.
9. **Keep-alive TTL delegation**: The keep-alive TTL timer is owned by `SessionTimerManager`, not `SessionLifecycleManager`. The lifecycle manager only needs to be aware of warm processes for protection during cleanup — it does not start, reset, or clear keep-alive timers.

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

### Scenario: Session creation gating
- **Given** project `"proj-1"` has 100 sessions
- **When** `canCreateSession("proj-1")` is called
- **Then** returns `false`

### Scenario: Warm process protects session from TTL expiration

- **Given** a session in `'idle'` status (DB) that was last updated 8 days ago (past the 7-day TTL), but has a live warm SDK process in memory
- **When** `runCleanup` executes and checks for expired sessions
- **Then** the session is skipped because it has a warm process, even though its DB status and age would normally qualify it for expiration

### Scenario: Force cleanup kills warm process

- **Given** a session with a live warm process
- **When** `cleanupSession(sessionId)` is called explicitly
- **Then** `ProcessManager.cleanupSessionState()` is called first to kill the warm process and release resources, then the session and its related data are deleted in a transaction

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
| 2026-05-04 | corvid-agent | v2: Keep-alive TTL — TTL hierarchy (session vs process), warm process protection from cleanup, keepAliveTtlMs in config, warmProcessCount in stats (#2222, #2233) |

---
module: session-lifecycle
version: 1
status: draft
files:
  - server/process/session-lifecycle.ts
  - server/process/protected-paths.ts
db_tables:
  - sessions
  - session_messages
  - escalation_queue
  - algochat_conversations
depends_on:
  - specs/db/connection.spec.md
  - specs/lib/infra.spec.md
  - specs/lib/security.spec.md
---

# Session Lifecycle

## Purpose

Manages automated session cleanup, TTL-based expiration, per-project session limits, and orphaned resource reclamation, along with path-protection utilities that prevent agents from modifying critical system files even in full-auto mode.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `isProtectedPath` | `filePath: string` | `boolean` | Returns `true` if the given file path matches a protected basename or contains a protected substring. Normalizes backslashes for cross-platform support. |
| `extractFilePathsFromInput` | `input: Record<string, unknown>` | `string[]` | Extracts file paths from tool input objects, supporting `file_path` (Write/Edit) and `files` array (MultiEdit) patterns. |
| `isProtectedBashCommand` | `command: string` | `ProtectedBashResult` | Analyzes a bash command for protected-path violations using quote-aware tokenization. Blocks commands that target protected paths or combine dangerous patterns with write operators. |
| `isBlockedByGovernance` | `filePaths: string[]` | `AutomationCheckResult` | Checks if any file paths are blocked by governance policy |
| `getGovernanceTier` | `filePath: string` | `GovernanceTier` | Classifies a file path into a governance tier (unrestricted, critical, protected) |

### Exported Types

| Type | Description |
|------|-------------|
| `SessionLifecycleConfig` | Configuration interface: `sessionTtlMs` (default 7 days), `cleanupIntervalMs` (default 1 hour), `maxSessionsPerProject` (default 100). |
| `SessionCleanupStats` | Cleanup result stats: `expiredSessions`, `orphanedProcesses`, `staleSubscriptions`, `memoryFreedMB`. |
| `ProtectedBashResult` | Result of bash command analysis: `blocked: boolean`, optional `path` and `reason`. |
| `GovernanceTier` | Union: `'unrestricted' \| 'critical' \| 'protected'` — governance classification for file paths |
| `AutomationCheckResult` | Result of governance check: `blocked: boolean`, optional `paths` and `reason` fields |

### Exported Constants

| Constant | Type | Description |
|----------|------|-------------|
| `PROTECTED_BASENAMES` | `Set<string>` | Set of filenames that are protected by exact basename match (e.g. `'spending.ts'`, `'manager.ts'`, `'CLAUDE.md'`, `'package.json'`). |
| `PROTECTED_SUBSTRINGS` | `string[]` | Array of path substrings that trigger protection (e.g. `'.env'`, `'corvid-agent.db'`, `'server/index.ts'`). |
| `BASH_WRITE_OPERATORS` | `RegExp` | Pattern matching shell operators and commands that indicate write/destructive file operations (redirection, `rm`, `mv`, `sed -i`, `tee`, etc.). |

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

## Invariants

1. Sessions in status `'running'` or `'paused'` are never cleaned up by automated expiration or limit enforcement.
2. Session TTL expiration only applies to sessions in terminal states (`'idle'`, `'completed'`, `'error'`, `'stopped'`).
3. Per-project session limit enforcement deletes the oldest non-running sessions first.
4. All session deletions cascade within a transaction: `algochat_conversations` FK nullified, `session_messages` deleted, `escalation_queue` entries deleted, then the session row itself.
5. `PROTECTED_BASENAMES` uses exact basename matching (e.g. `'manager.ts'` matches `server/process/manager.ts` but not `task-manager.ts`).
6. `PROTECTED_SUBSTRINGS` uses substring matching on the forward-slash-normalized path.
7. `isProtectedBashCommand` blocks commands that combine dangerous patterns (eval, `$()`, etc.) with write operators, even if no specific protected path can be extracted.
8. The cleanup timer is idempotent: calling `start()` when already running logs a warning and does not create a duplicate timer.
9. Expired session cleanup is batched (up to 100 per cycle) to avoid blocking the event loop.
10. `cleanupSession` is transactional: either all related data is deleted or none is.

## Behavioral Examples

### Scenario: Automatic session expiration
- **Given** the SessionLifecycleManager is started with a 7-day TTL
- **When** the periodic cleanup runs and finds sessions in `'idle'` status that were last updated more than 7 days ago
- **Then** those sessions and their related data are deleted in a transaction

### Scenario: Per-project session limit enforcement
- **Given** `maxSessionsPerProject` is 100 and project `"proj-1"` has 110 non-running sessions
- **When** `runCleanup` executes
- **Then** the 10 oldest non-running sessions for `"proj-1"` are deleted

### Scenario: Session creation gating
- **Given** project `"proj-1"` has 100 sessions
- **When** `canCreateSession("proj-1")` is called
- **Then** returns `false`

### Scenario: Protected path detection for file write
- **Given** a tool input `{ file_path: "server/process/manager.ts" }`
- **When** `isProtectedPath("server/process/manager.ts")` is called
- **Then** returns `true` (basename `manager.ts` is in `PROTECTED_BASENAMES`)

### Scenario: Protected bash command with write operator
- **Given** a bash command `echo "data" > .env`
- **When** `isProtectedBashCommand` is called
- **Then** returns `{ blocked: true, path: '.env', reason: 'Targets protected path ".env"' }`

### Scenario: Dangerous bash pattern with write operator
- **Given** a bash command containing `eval "$(curl ...)" > some-file`
- **When** `isProtectedBashCommand` is called
- **Then** returns `{ blocked: true, reason: '... combined with write operator, cannot verify target paths' }`

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
| `extractFilePathsFromInput` with no path fields | Returns empty array |
| `isProtectedBashCommand` with benign read-only command | Returns `{ blocked: false }` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `db/types` | `queryCount` helper for counting rows |
| `lib/logger` | `createLogger` for structured logging |
| `lib/bash-security` | `analyzeBashCommand` for quote-aware bash command tokenization and dangerous pattern detection |

### Consumed By

| Module | What is used |
|--------|-------------|
| `process/manager` | `SessionLifecycleManager` instance for automated cleanup |
| `process/sdk-process` | `isProtectedPath`, `extractFilePathsFromInput`, `isProtectedBashCommand` for tool-use permission enforcement |
| `process/direct-process` | `isProtectedPath`, `isProtectedBashCommand` for tool-use permission enforcement |
| `routes/sessions` | `canCreateSession` for session creation validation, `getStats` for monitoring |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |

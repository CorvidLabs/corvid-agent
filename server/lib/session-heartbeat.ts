/**
 * Constants and utilities for session heartbeat polling.
 *
 * Heartbeat polling is a safety net against missed process-exit events
 * in council discussions (fixes #710). The actual integration into
 * councils/discussion.ts requires a manual commit (Layer 0 path).
 */

/** Heartbeat interval for polling isRunning as a safety net against missed events. */
export const HEARTBEAT_INTERVAL_MS = 30 * 1000; // 30 seconds

/** Idle timeout: auto-advance if all sessions are idle (not running) for this long. */
export const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

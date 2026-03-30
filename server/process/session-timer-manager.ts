/**
 * SessionTimerManager — Manages all timer-based concerns for session processes:
 * stable-period timers, per-session inactivity timeouts, and the fallback
 * timeout checker.
 *
 * Extracted from ProcessManager following the compose-by-delegation pattern
 * established in the EventBus / ApprovalManager decompositions.
 *
 * @module
 */
import { createLogger } from '../lib/logger';

const log = createLogger('SessionTimerManager');

export interface SessionTimerCallbacks {
  /** Called when a session exceeds its inactivity timeout. */
  onTimeout: (sessionId: string) => void;
  /** Called when a session has been stable long enough to reset its restart counter. */
  onStablePeriod: (sessionId: string) => void;
  /** Check whether a session has an active process. */
  isRunning: (sessionId: string) => boolean;
  /** Get the last activity timestamp for a session (epoch ms), or undefined if not tracked. */
  getLastActivityAt: (sessionId: string) => number | undefined;
}

export interface SessionTimerConfig {
  /** Inactivity timeout per session in ms. Default: 30 minutes. */
  agentTimeoutMs: number;
  /** How long a session must run without restarting before its restart counter resets. */
  stablePeriodMs: number;
  /** Interval for the fallback timeout checker. Default: 60s. */
  timeoutCheckIntervalMs: number;
}

const DEFAULT_CONFIG: SessionTimerConfig = {
  agentTimeoutMs: parseInt(process.env.AGENT_TIMEOUT_MS ?? String(30 * 60 * 1000), 10),
  stablePeriodMs: 10 * 60 * 1000,
  timeoutCheckIntervalMs: 60_000,
};

export class SessionTimerManager {
  private readonly callbacks: SessionTimerCallbacks;
  private readonly config: SessionTimerConfig;

  private stableTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private sessionTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private timeoutTimer: ReturnType<typeof setInterval> | null = null;

  constructor(callbacks: SessionTimerCallbacks, config: Partial<SessionTimerConfig> = {}) {
    this.callbacks = callbacks;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start the stable-period timer for a session.
   * After STABLE_PERIOD_MS of continuous uptime, fires onStablePeriod.
   */
  startStableTimer(sessionId: string): void {
    this.clearStableTimer(sessionId);
    const timer = setTimeout(() => {
      this.stableTimers.delete(sessionId);
      this.callbacks.onStablePeriod(sessionId);
    }, this.config.stablePeriodMs);
    this.stableTimers.set(sessionId, timer);
  }

  clearStableTimer(sessionId: string): void {
    const timer = this.stableTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.stableTimers.delete(sessionId);
    }
  }

  /**
   * Start (or reset) the per-session inactivity timeout.
   * Called on every event to keep the session alive while it's making progress.
   */
  startSessionTimeout(sessionId: string, timeoutMs?: number): void {
    this.clearSessionTimeout(sessionId);
    const effectiveTimeout = timeoutMs ?? this.config.agentTimeoutMs;
    const timer = setTimeout(() => {
      this.sessionTimeouts.delete(sessionId);
      if (!this.callbacks.isRunning(sessionId)) return;
      const lastActivity = this.callbacks.getLastActivityAt(sessionId);
      const inactiveMs = lastActivity ? Date.now() - lastActivity : effectiveTimeout;
      log.warn(`Session ${sessionId} exceeded inactivity timeout`, {
        inactiveMs,
        timeoutMs: effectiveTimeout,
      });
      this.callbacks.onTimeout(sessionId);
    }, effectiveTimeout);
    this.sessionTimeouts.set(sessionId, timer);
  }

  /**
   * Extend a running session's timeout. Returns false if session not found.
   */
  extendTimeout(sessionId: string, additionalMs: number): boolean {
    if (!this.callbacks.isRunning(sessionId)) return false;
    const maxTimeout = this.config.agentTimeoutMs * 4;
    const clamped = Math.min(additionalMs, maxTimeout);
    log.info(`Session ${sessionId} timeout extended`, { additionalMs: clamped });
    this.startSessionTimeout(sessionId, clamped);
    return true;
  }

  clearSessionTimeout(sessionId: string): void {
    const timer = this.sessionTimeouts.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.sessionTimeouts.delete(sessionId);
    }
  }

  /**
   * Start the polling fallback that catches sessions surviving past their
   * inactivity timeout (e.g. timer lost due to a bug). Safety net only —
   * per-session setTimeout is the primary mechanism.
   *
   * @param getSessionIds - returns the list of session IDs to check each tick
   */
  startTimeoutChecker(getSessionIds?: () => string[]): void {
    this.timeoutTimer = setInterval(() => {
      if (!getSessionIds) return;
      this.checkTimeouts(getSessionIds());
    }, this.config.timeoutCheckIntervalMs);
  }

  /**
   * Check all provided session IDs for timeout violations.
   */
  checkTimeouts(sessionIds: string[]): void {
    const now = Date.now();
    for (const sessionId of sessionIds) {
      if (!this.callbacks.isRunning(sessionId)) continue;
      const lastActivity = this.callbacks.getLastActivityAt(sessionId);
      if (lastActivity === undefined) continue;
      const inactiveMs = now - lastActivity;
      if (inactiveMs > this.config.agentTimeoutMs) {
        log.warn(`Session ${sessionId} exceeded inactivity timeout (fallback checker)`, {
          inactiveMs,
          timeoutMs: this.config.agentTimeoutMs,
        });
        this.callbacks.onTimeout(sessionId);
      }
    }
  }

  /**
   * Clean up all timers for a specific session.
   * Called during session cleanup to prevent timer leaks.
   */
  cleanupSession(sessionId: string): void {
    this.clearStableTimer(sessionId);
    this.clearSessionTimeout(sessionId);
  }

  /**
   * Get the count of active timers for monitoring.
   */
  getStats(): { sessionTimeouts: number; stableTimers: number } {
    return {
      sessionTimeouts: this.sessionTimeouts.size,
      stableTimers: this.stableTimers.size,
    };
  }

  /**
   * Shut down all timers.
   */
  shutdown(): void {
    if (this.timeoutTimer) {
      clearInterval(this.timeoutTimer);
      this.timeoutTimer = null;
    }
    for (const timer of this.stableTimers.values()) {
      clearTimeout(timer);
    }
    this.stableTimers.clear();
    for (const timer of this.sessionTimeouts.values()) {
      clearTimeout(timer);
    }
    this.sessionTimeouts.clear();
  }
}

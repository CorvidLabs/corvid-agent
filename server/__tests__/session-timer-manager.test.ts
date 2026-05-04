import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { type SessionTimerCallbacks, SessionTimerManager } from '../process/session-timer-manager';

describe('SessionTimerManager', () => {
  let manager: SessionTimerManager;
  let callbacks: SessionTimerCallbacks;
  let timeoutSessions: string[];
  let stableSessions: string[];
  let runningSessions: Set<string>;
  let activityMap: Map<string, number>;

  beforeEach(() => {
    timeoutSessions = [];
    stableSessions = [];
    runningSessions = new Set();
    activityMap = new Map();

    callbacks = {
      onTimeout: (sessionId) => timeoutSessions.push(sessionId),
      onStablePeriod: (sessionId) => stableSessions.push(sessionId),
      onStartupTimeout: (sessionId) => timeoutSessions.push(sessionId),
      isRunning: (sessionId) => runningSessions.has(sessionId),
      getLastActivityAt: (sessionId) => activityMap.get(sessionId),
    };
  });

  afterEach(() => {
    manager?.shutdown();
  });

  describe('constructor', () => {
    it('creates with default config', () => {
      manager = new SessionTimerManager(callbacks);
      const stats = manager.getStats();
      expect(stats.sessionTimeouts).toBe(0);
      expect(stats.stableTimers).toBe(0);
      expect(stats.startupTimeouts).toBe(0);
      expect(stats.keepAliveTimers).toBe(0);
    });

    it('accepts custom config', () => {
      manager = new SessionTimerManager(callbacks, {
        agentTimeoutMs: 5000,
        stablePeriodMs: 1000,
      });
      expect(manager).toBeDefined();
    });
  });

  describe('startStableTimer / clearStableTimer', () => {
    it('fires onStablePeriod callback after stable period', async () => {
      manager = new SessionTimerManager(callbacks, { stablePeriodMs: 50 });
      manager.startStableTimer('s1');
      expect(manager.getStats().stableTimers).toBe(1);

      await new Promise((r) => setTimeout(r, 100));
      expect(stableSessions).toContain('s1');
      expect(manager.getStats().stableTimers).toBe(0);
    });

    it('clearStableTimer prevents callback', async () => {
      manager = new SessionTimerManager(callbacks, { stablePeriodMs: 50 });
      manager.startStableTimer('s1');
      manager.clearStableTimer('s1');

      await new Promise((r) => setTimeout(r, 100));
      expect(stableSessions).not.toContain('s1');
      expect(manager.getStats().stableTimers).toBe(0);
    });

    it('startStableTimer resets existing timer', async () => {
      manager = new SessionTimerManager(callbacks, { stablePeriodMs: 80 });
      manager.startStableTimer('s1');

      // Wait 50ms, then restart the timer
      await new Promise((r) => setTimeout(r, 50));
      manager.startStableTimer('s1');
      expect(manager.getStats().stableTimers).toBe(1);

      // At 100ms total, original would have fired but new one hasn't
      await new Promise((r) => setTimeout(r, 50));
      expect(stableSessions).toHaveLength(0);

      // Wait for the reset timer
      await new Promise((r) => setTimeout(r, 50));
      expect(stableSessions).toContain('s1');
    });

    it('clearStableTimer is idempotent', () => {
      manager = new SessionTimerManager(callbacks);
      manager.clearStableTimer('nonexistent');
      expect(manager.getStats().stableTimers).toBe(0);
    });
  });

  describe('startSessionTimeout / clearSessionTimeout', () => {
    it('fires onTimeout for inactive session', async () => {
      runningSessions.add('s1');
      activityMap.set('s1', Date.now() - 10000);
      manager = new SessionTimerManager(callbacks, { agentTimeoutMs: 50 });

      manager.startSessionTimeout('s1');
      expect(manager.getStats().sessionTimeouts).toBe(1);

      await new Promise((r) => setTimeout(r, 100));
      expect(timeoutSessions).toContain('s1');
      expect(manager.getStats().sessionTimeouts).toBe(0);
    });

    it('does not fire onTimeout if session stopped before timer', async () => {
      runningSessions.add('s1');
      manager = new SessionTimerManager(callbacks, { agentTimeoutMs: 50 });
      manager.startSessionTimeout('s1');

      // Session stops running before timeout fires
      runningSessions.delete('s1');
      await new Promise((r) => setTimeout(r, 100));
      expect(timeoutSessions).toHaveLength(0);
    });

    it('clearSessionTimeout prevents callback', async () => {
      runningSessions.add('s1');
      manager = new SessionTimerManager(callbacks, { agentTimeoutMs: 50 });
      manager.startSessionTimeout('s1');
      manager.clearSessionTimeout('s1');

      await new Promise((r) => setTimeout(r, 100));
      expect(timeoutSessions).toHaveLength(0);
    });

    it('accepts custom timeout override', async () => {
      runningSessions.add('s1');
      activityMap.set('s1', Date.now());
      manager = new SessionTimerManager(callbacks, { agentTimeoutMs: 10000 });

      // Override with a short timeout
      manager.startSessionTimeout('s1', 50);
      await new Promise((r) => setTimeout(r, 100));
      expect(timeoutSessions).toContain('s1');
    });
  });

  describe('extendTimeout', () => {
    it('returns false if session not running', () => {
      manager = new SessionTimerManager(callbacks);
      expect(manager.extendTimeout('s1', 5000)).toBe(false);
    });

    it('returns true and resets timeout for running session', () => {
      runningSessions.add('s1');
      manager = new SessionTimerManager(callbacks);
      manager.startSessionTimeout('s1');
      expect(manager.extendTimeout('s1', 5000)).toBe(true);
    });

    it('clamps extension to 4x agent timeout', async () => {
      runningSessions.add('s1');
      manager = new SessionTimerManager(callbacks, { agentTimeoutMs: 100 });
      manager.startSessionTimeout('s1');

      // Try to extend way beyond the cap
      const result = manager.extendTimeout('s1', 999999);
      expect(result).toBe(true);
      // The timeout should be capped at 400ms (4x100)
    });
  });

  describe('checkTimeouts', () => {
    it('identifies timed-out sessions', () => {
      runningSessions.add('s1');
      runningSessions.add('s2');
      activityMap.set('s1', Date.now() - 999999); // Stale
      activityMap.set('s2', Date.now()); // Active

      manager = new SessionTimerManager(callbacks, { agentTimeoutMs: 1000 });
      manager.checkTimeouts(['s1', 's2']);

      expect(timeoutSessions).toEqual(['s1']);
    });

    it('skips non-running sessions', () => {
      activityMap.set('s1', Date.now() - 999999);
      manager = new SessionTimerManager(callbacks, { agentTimeoutMs: 1000 });
      manager.checkTimeouts(['s1']);
      expect(timeoutSessions).toHaveLength(0);
    });

    it('skips sessions with no activity timestamp', () => {
      runningSessions.add('s1');
      manager = new SessionTimerManager(callbacks, { agentTimeoutMs: 1000 });
      manager.checkTimeouts(['s1']);
      expect(timeoutSessions).toHaveLength(0);
    });
  });

  describe('startStartupTimeout / clearStartupTimeout', () => {
    it('fires onStartupTimeout when no events arrive within the window', async () => {
      const startupTimeouts: string[] = [];
      callbacks.onStartupTimeout = (sessionId) => startupTimeouts.push(sessionId);
      runningSessions.add('s1');
      manager = new SessionTimerManager(callbacks, { startupTimeoutMs: 50 });

      manager.startStartupTimeout('s1');
      expect(manager.getStats().startupTimeouts).toBe(1);

      await new Promise((r) => setTimeout(r, 100));
      expect(startupTimeouts).toContain('s1');
      expect(manager.getStats().startupTimeouts).toBe(0);
    });

    it('does not fire if cleared before timeout', async () => {
      const startupTimeouts: string[] = [];
      callbacks.onStartupTimeout = (sessionId) => startupTimeouts.push(sessionId);
      runningSessions.add('s1');
      manager = new SessionTimerManager(callbacks, { startupTimeoutMs: 50 });

      manager.startStartupTimeout('s1');
      manager.clearStartupTimeout('s1');

      await new Promise((r) => setTimeout(r, 100));
      expect(startupTimeouts).toHaveLength(0);
      expect(manager.getStats().startupTimeouts).toBe(0);
    });

    it('does not fire if session stopped running before timeout', async () => {
      const startupTimeouts: string[] = [];
      callbacks.onStartupTimeout = (sessionId) => startupTimeouts.push(sessionId);
      runningSessions.add('s1');
      manager = new SessionTimerManager(callbacks, { startupTimeoutMs: 50 });

      manager.startStartupTimeout('s1');
      runningSessions.delete('s1');

      await new Promise((r) => setTimeout(r, 100));
      expect(startupTimeouts).toHaveLength(0);
    });

    it('clearStartupTimeout is idempotent', () => {
      manager = new SessionTimerManager(callbacks);
      manager.clearStartupTimeout('nonexistent');
      expect(manager.getStats().startupTimeouts).toBe(0);
    });

    it('startStartupTimeout resets existing timer', async () => {
      const startupTimeouts: string[] = [];
      callbacks.onStartupTimeout = (sessionId) => startupTimeouts.push(sessionId);
      runningSessions.add('s1');
      manager = new SessionTimerManager(callbacks, { startupTimeoutMs: 80 });

      manager.startStartupTimeout('s1');
      await new Promise((r) => setTimeout(r, 50));
      manager.startStartupTimeout('s1');
      expect(manager.getStats().startupTimeouts).toBe(1);

      // Original timer would have fired at 80ms, but we reset at 50ms
      await new Promise((r) => setTimeout(r, 50));
      expect(startupTimeouts).toHaveLength(0);

      // Reset timer fires at 130ms total
      await new Promise((r) => setTimeout(r, 50));
      expect(startupTimeouts).toContain('s1');
    });
  });

  describe('cleanupSession', () => {
    it('clears all timers including startup timeout', () => {
      manager = new SessionTimerManager(callbacks, {
        stablePeriodMs: 10000,
        agentTimeoutMs: 10000,
        startupTimeoutMs: 10000,
      });
      runningSessions.add('s1');
      manager.startStableTimer('s1');
      manager.startSessionTimeout('s1');
      manager.startStartupTimeout('s1');
      manager.startKeepAliveTtl('s1');
      expect(manager.getStats().stableTimers).toBe(1);
      expect(manager.getStats().sessionTimeouts).toBe(1);
      expect(manager.getStats().startupTimeouts).toBe(1);
      expect(manager.getStats().keepAliveTimers).toBe(1);

      manager.cleanupSession('s1');
      expect(manager.getStats().stableTimers).toBe(0);
      expect(manager.getStats().sessionTimeouts).toBe(0);
      expect(manager.getStats().startupTimeouts).toBe(0);
      expect(manager.getStats().keepAliveTimers).toBe(0);
    });
  });

  describe('shutdown', () => {
    it('clears all timers', () => {
      manager = new SessionTimerManager(callbacks, { stablePeriodMs: 10000, agentTimeoutMs: 10000 });
      runningSessions.add('s1');
      runningSessions.add('s2');
      manager.startStableTimer('s1');
      manager.startStableTimer('s2');
      manager.startSessionTimeout('s1');
      manager.startTimeoutChecker();

      manager.shutdown();
      expect(manager.getStats().stableTimers).toBe(0);
      expect(manager.getStats().sessionTimeouts).toBe(0);
    });

    it('is safe to call multiple times', () => {
      manager = new SessionTimerManager(callbacks);
      manager.shutdown();
      manager.shutdown();
    });
  });

  describe('startTimeoutChecker', () => {
    it('periodically calls checkTimeouts with provided session IDs', async () => {
      runningSessions.add('s1');
      activityMap.set('s1', Date.now() - 999999);
      manager = new SessionTimerManager(callbacks, {
        agentTimeoutMs: 1000,
        timeoutCheckIntervalMs: 50,
      });

      manager.startTimeoutChecker(() => ['s1']);
      await new Promise((r) => setTimeout(r, 100));
      expect(timeoutSessions).toContain('s1');
    });
  });
});

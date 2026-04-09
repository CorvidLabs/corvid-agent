import { describe, expect, it, mock } from 'bun:test';
import type { EventCallback, ProcessManager } from '../process/manager';
import type { ClaudeStreamEvent } from '../process/types';
import { waitForSessions } from '../routes/councils';

// ─── Mock ProcessManager ─────────────────────────────────────────────────────

function createMockPM() {
  const subscribers = new Map<string, Set<EventCallback>>();
  const running = new Set<string>();

  const pm: Pick<
    ProcessManager,
    'subscribe' | 'unsubscribe' | 'isRunning' | 'stopProcess' | 'startProcess' | 'sendMessage'
  > = {
    subscribe: (sessionId: string, cb: EventCallback) => {
      if (!subscribers.has(sessionId)) subscribers.set(sessionId, new Set());
      subscribers.get(sessionId)!.add(cb);
    },
    unsubscribe: (sessionId: string, cb: EventCallback) => {
      subscribers.get(sessionId)?.delete(cb);
    },
    isRunning: (sessionId: string) => running.has(sessionId),
    stopProcess: mock((sessionId: string) => {
      running.delete(sessionId);
    }),
    startProcess: mock(() => {}),
    sendMessage: mock(() => true),
  };

  return {
    pm: pm as unknown as ProcessManager,
    markRunning(sessionId: string) {
      running.add(sessionId);
    },
    markStopped(sessionId: string) {
      // Simulate process dying WITHOUT emitting event (the race condition)
      running.delete(sessionId);
    },
    emitExit(sessionId: string) {
      running.delete(sessionId);
      const cbs = subscribers.get(sessionId);
      if (cbs) {
        for (const cb of cbs) {
          cb(sessionId, { type: 'session_exited', exitCode: 0, duration: 1000 } as ClaudeStreamEvent);
        }
      }
    },
    subscribers,
    running,
  };
}

// ─── Normal flow ─────────────────────────────────────────────────────────────

describe('waitForSessions: normal flow', () => {
  it('resolves when all sessions emit exit events', async () => {
    const { pm, markRunning, emitExit } = createMockPM();

    markRunning('s1');
    markRunning('s2');
    markRunning('s3');

    const promise = waitForSessions(pm, ['s1', 's2', 's3'], 5000);

    emitExit('s1');
    emitExit('s2');
    emitExit('s3');

    const result = await promise;
    expect(result.completed.sort()).toEqual(['s1', 's2', 's3']);
    expect(result.timedOut).toEqual([]);
  });

  it('resolves immediately for sessions already not running', async () => {
    const { pm } = createMockPM();

    const result = await waitForSessions(pm, ['s1', 's2'], 5000);
    expect(result.completed.sort()).toEqual(['s1', 's2']);
    expect(result.timedOut).toEqual([]);
  });

  it('cleans up subscriptions after completion', async () => {
    const { pm, subscribers } = createMockPM();

    await waitForSessions(pm, ['s1', 's2'], 5000);

    for (const [, cbs] of subscribers) {
      expect(cbs.size).toBe(0);
    }
  });
});

// ─── Heartbeat catches missed exits ──────────────────────────────────────────

describe('waitForSessions: heartbeat catches missed exits', () => {
  it('detects sessions that exited without emitting event via heartbeat', async () => {
    const { pm, markRunning, markStopped } = createMockPM();

    markRunning('s1');
    markRunning('s2');

    // Use very short heartbeat for testing
    const promise = waitForSessions(pm, ['s1', 's2'], 5000, {
      heartbeatMs: 50,
      safetyTimeoutMs: 60000,
    });

    // Simulate race condition: sessions die without emitting events
    markStopped('s1');
    markStopped('s2');

    // Heartbeat should catch them within ~50ms
    const result = await promise;
    expect(result.completed.sort()).toEqual(['s1', 's2']);
    expect(result.timedOut).toEqual([]);
  });

  it('heartbeat catches one missed exit while another completes normally', async () => {
    const { pm, markRunning, markStopped, emitExit } = createMockPM();

    markRunning('normal');
    markRunning('missed');

    const promise = waitForSessions(pm, ['normal', 'missed'], 5000, {
      heartbeatMs: 50,
      safetyTimeoutMs: 60000,
    });

    // normal exits properly
    emitExit('normal');

    // missed dies silently (race condition)
    markStopped('missed');

    const result = await promise;
    expect(result.completed.sort()).toEqual(['missed', 'normal']);
    expect(result.timedOut).toEqual([]);
  });

  it('heartbeat does not double-count sessions already completed by event', async () => {
    const { pm, markRunning, emitExit } = createMockPM();

    markRunning('s1');

    const promise = waitForSessions(pm, ['s1'], 5000, {
      heartbeatMs: 30,
      safetyTimeoutMs: 60000,
    });

    // Session exits normally via event
    emitExit('s1');

    const result = await promise;
    // Should only appear once in completed
    expect(result.completed).toEqual(['s1']);
    expect(result.completed.filter((id) => id === 's1')).toHaveLength(1);
  });

  it('cleans up heartbeat interval after completion', async () => {
    const { pm, markRunning, markStopped } = createMockPM();

    markRunning('s1');

    const promise = waitForSessions(pm, ['s1'], 5000, {
      heartbeatMs: 50,
      safetyTimeoutMs: 60000,
    });

    markStopped('s1');

    const result = await promise;
    expect(result.completed).toEqual(['s1']);

    // Wait a bit to confirm no errors from lingering interval
    await new Promise((r) => setTimeout(r, 120));
  });
});

// ─── Safety timeout ──────────────────────────────────────────────────────────

describe('waitForSessions: safety timeout', () => {
  it('auto-advances when all pending sessions are dead after safety timeout', async () => {
    const { pm, markRunning, markStopped } = createMockPM();

    markRunning('s1');
    markRunning('s2');

    // Use long heartbeat (won't fire before safety timeout) and short safety timeout
    const promise = waitForSessions(pm, ['s1', 's2'], 60000, {
      heartbeatMs: 60000, // won't fire
      safetyTimeoutMs: 100,
    });

    // Sessions die silently
    markStopped('s1');
    markStopped('s2');

    const result = await promise;
    expect(result.completed.sort()).toEqual(['s1', 's2']);
    expect(result.timedOut).toEqual([]);
  });

  it('safety timeout does not fire if sessions are still running', async () => {
    const { pm, markRunning } = createMockPM();

    markRunning('s1');

    const promise = waitForSessions(pm, ['s1'], 500, {
      heartbeatMs: 60000,
      safetyTimeoutMs: 100,
    });

    // Safety timeout fires at 100ms, but s1 is still running
    // so it should not auto-advance — instead the main timeout at 500ms fires
    const result = await promise;
    expect(result.timedOut).toEqual(['s1']);
  });

  it('safety timeout marks all dead pending sessions as completed', async () => {
    const mock = createMockPM();
    const { pm, markRunning, markStopped } = mock;

    markRunning('alive');
    markRunning('dead1');
    markRunning('dead2');

    const promise = waitForSessions(pm, ['alive', 'dead1', 'dead2'], 60000, {
      heartbeatMs: 60000,
      safetyTimeoutMs: 100,
    });

    // One exits normally
    mock.emitExit('alive');

    // Two die silently
    markStopped('dead1');
    markStopped('dead2');

    const result = await promise;
    expect(result.completed.sort()).toEqual(['alive', 'dead1', 'dead2']);
    expect(result.timedOut).toEqual([]);
  });

  it('cleans up all timers after safety timeout fires', async () => {
    const { pm, markRunning, markStopped } = createMockPM();

    markRunning('s1');

    const promise = waitForSessions(pm, ['s1'], 60000, {
      heartbeatMs: 60000,
      safetyTimeoutMs: 80,
    });

    markStopped('s1');

    await promise;

    // Wait to confirm no lingering timers cause errors
    await new Promise((r) => setTimeout(r, 200));
  });
});

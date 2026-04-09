import { describe, expect, it } from 'bun:test';
import type { CouncilAgentError } from '../../shared/types';
import type { CouncilAgentErrorInfo, ErrorSeverity, SessionErrorInfo } from '../../shared/ws-protocol';
import { broadcastAgentError, onCouncilAgentError } from '../councils/discussion';
import type { ClaudeStreamEvent, SessionErrorRecoveryEvent } from '../process/types';
import { isSessionErrorRecoveryEvent } from '../process/types';

// ─── SessionErrorRecoveryEvent type guard ─────────────────────────────────

describe('isSessionErrorRecoveryEvent', () => {
  it('returns true for session_error events', () => {
    const event: SessionErrorRecoveryEvent = {
      type: 'session_error',
      error: {
        message: 'Session crashed',
        errorType: 'crash',
        severity: 'error',
        recoverable: true,
      },
    };
    expect(isSessionErrorRecoveryEvent(event)).toBe(true);
  });

  it('returns false for other event types', () => {
    const resultEvent: ClaudeStreamEvent = {
      type: 'result',
      result: 'done',
      total_cost_usd: 0.01,
    };
    expect(isSessionErrorRecoveryEvent(resultEvent)).toBe(false);

    const errorEvent: ClaudeStreamEvent = {
      type: 'error',
      error: { message: 'Something failed', type: 'unknown' },
    };
    expect(isSessionErrorRecoveryEvent(errorEvent)).toBe(false);

    const exitEvent: ClaudeStreamEvent = {
      type: 'session_exited',
      result: 'exited',
    };
    expect(isSessionErrorRecoveryEvent(exitEvent)).toBe(false);
  });
});

// ─── SessionErrorRecoveryEvent structure ──────────────────────────────────

describe('SessionErrorRecoveryEvent', () => {
  it('supports all error types', () => {
    const errorTypes: SessionErrorRecoveryEvent['error']['errorType'][] = [
      'spawn_error',
      'credits_exhausted',
      'timeout',
      'crash',
      'unknown',
    ];

    for (const errorType of errorTypes) {
      const event: SessionErrorRecoveryEvent = {
        type: 'session_error',
        error: {
          message: `Test ${errorType}`,
          errorType,
          severity: 'error',
          recoverable: errorType !== 'spawn_error',
        },
      };
      expect(event.error.errorType).toBe(errorType);
    }
  });

  it('supports all severity levels', () => {
    const severities: SessionErrorRecoveryEvent['error']['severity'][] = ['info', 'warning', 'error', 'fatal'];

    for (const severity of severities) {
      const event: SessionErrorRecoveryEvent = {
        type: 'session_error',
        error: {
          message: 'Test',
          errorType: 'crash',
          severity,
          recoverable: true,
        },
      };
      expect(event.error.severity).toBe(severity);
    }
  });

  it('includes optional session_id from base event', () => {
    const event: SessionErrorRecoveryEvent = {
      type: 'session_error',
      session_id: 'sess-123',
      error: {
        message: 'Crashed',
        errorType: 'crash',
        severity: 'error',
        recoverable: true,
      },
    };
    expect(event.session_id).toBe('sess-123');
  });
});

// ─── ErrorSeverity type ───────────────────────────────────────────────────

describe('ErrorSeverity type', () => {
  it('accepts all valid severity values', () => {
    const severities: ErrorSeverity[] = ['info', 'warning', 'error', 'fatal'];
    expect(severities).toHaveLength(4);
  });
});

// ─── SessionErrorInfo type ────────────────────────────────────────────────

describe('SessionErrorInfo', () => {
  it('contains required fields', () => {
    const info: SessionErrorInfo = {
      message: 'Session crashed with exit code 1',
      errorType: 'crash',
      severity: 'error',
      recoverable: true,
    };
    expect(info.message).toBe('Session crashed with exit code 1');
    expect(info.errorType).toBe('crash');
    expect(info.severity).toBe('error');
    expect(info.recoverable).toBe(true);
  });

  it('accepts optional sessionStatus', () => {
    const info: SessionErrorInfo = {
      message: 'Spawn failed',
      errorType: 'spawn_error',
      severity: 'fatal',
      recoverable: false,
      sessionStatus: 'error',
    };
    expect(info.sessionStatus).toBe('error');
  });
});

// ─── CouncilAgentErrorInfo type ───────────────────────────────────────────

describe('CouncilAgentErrorInfo', () => {
  it('contains required fields', () => {
    const info: CouncilAgentErrorInfo = {
      message: 'Agent timed out',
      errorType: 'timeout',
      severity: 'warning',
      stage: 'discussing',
    };
    expect(info.message).toBe('Agent timed out');
    expect(info.errorType).toBe('timeout');
    expect(info.severity).toBe('warning');
    expect(info.stage).toBe('discussing');
  });

  it('accepts optional sessionId and round', () => {
    const info: CouncilAgentErrorInfo = {
      message: 'Agent crashed',
      errorType: 'crash',
      severity: 'error',
      stage: 'reviewing',
      sessionId: 'sess-456',
      round: 2,
    };
    expect(info.sessionId).toBe('sess-456');
    expect(info.round).toBe(2);
  });
});

// ─── CouncilAgentError shared type ────────────────────────────────────────

describe('CouncilAgentError', () => {
  it('contains all required fields', () => {
    const error: CouncilAgentError = {
      launchId: 'launch-1',
      agentId: 'agent-1',
      agentName: 'TestAgent',
      errorType: 'spawn_error',
      severity: 'error',
      message: 'Failed to start session',
      stage: 'member',
    };
    expect(error.launchId).toBe('launch-1');
    expect(error.agentId).toBe('agent-1');
    expect(error.agentName).toBe('TestAgent');
    expect(error.errorType).toBe('spawn_error');
    expect(error.severity).toBe('error');
    expect(error.message).toBe('Failed to start session');
    expect(error.stage).toBe('member');
  });

  it('accepts optional sessionId and round', () => {
    const error: CouncilAgentError = {
      launchId: 'launch-1',
      agentId: 'agent-1',
      agentName: 'TestAgent',
      errorType: 'timeout',
      severity: 'warning',
      message: 'Discusser timed out in round 2',
      stage: 'discussing',
      sessionId: 'sess-123',
      round: 2,
    };
    expect(error.sessionId).toBe('sess-123');
    expect(error.round).toBe(2);
  });
});

// ─── Council agent error broadcast mechanism ──────────────────────────────

describe('council agent error broadcasting', () => {
  it('onCouncilAgentError registers and receives callbacks', () => {
    const received: CouncilAgentError[] = [];
    const unsubscribe = onCouncilAgentError((error) => {
      received.push(error);
    });

    const testError: CouncilAgentError = {
      launchId: 'launch-1',
      agentId: 'agent-1',
      agentName: 'TestAgent',
      errorType: 'spawn_error',
      severity: 'error',
      message: 'Failed to start session',
      stage: 'member',
    };

    broadcastAgentError(testError);

    expect(received).toHaveLength(1);
    expect(received[0].launchId).toBe('launch-1');
    expect(received[0].agentName).toBe('TestAgent');
    expect(received[0].errorType).toBe('spawn_error');

    unsubscribe();
  });

  it('unsubscribe removes callback', () => {
    const received: CouncilAgentError[] = [];
    const unsubscribe = onCouncilAgentError((error) => {
      received.push(error);
    });

    unsubscribe();

    broadcastAgentError({
      launchId: 'launch-2',
      agentId: 'agent-2',
      agentName: 'TestAgent2',
      errorType: 'timeout',
      severity: 'warning',
      message: 'Timed out',
      stage: 'discussing',
    });

    expect(received).toHaveLength(0);
  });

  it('broadcasts to multiple listeners', () => {
    const received1: CouncilAgentError[] = [];
    const received2: CouncilAgentError[] = [];

    const unsub1 = onCouncilAgentError((error) => received1.push(error));
    const unsub2 = onCouncilAgentError((error) => received2.push(error));

    broadcastAgentError({
      launchId: 'launch-3',
      agentId: 'agent-3',
      agentName: 'TestAgent3',
      errorType: 'crash',
      severity: 'error',
      message: 'Crashed',
      stage: 'reviewing',
      sessionId: 'sess-789',
    });

    expect(received1).toHaveLength(1);
    expect(received2).toHaveLength(1);

    unsub1();
    unsub2();
  });

  it('continues broadcasting even if a listener throws', () => {
    const received: CouncilAgentError[] = [];

    const unsub1 = onCouncilAgentError(() => {
      throw new Error('listener error');
    });
    const unsub2 = onCouncilAgentError((error) => received.push(error));

    broadcastAgentError({
      launchId: 'launch-4',
      agentId: 'agent-4',
      agentName: 'TestAgent4',
      errorType: 'unknown',
      severity: 'error',
      message: 'Unknown error',
      stage: 'member',
    });

    // Second listener should still receive despite first throwing
    expect(received).toHaveLength(1);

    unsub1();
    unsub2();
  });
});

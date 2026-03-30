/**
 * SessionCheerleadingDetector — Observes session events to detect consecutive
 * "cheerleading" responses: agent turns that acknowledge without making
 * substantive progress.
 *
 * Attaches globally to a ProcessManager via `subscribeAll()` and maintains
 * per-session state independently of the process manager core. This keeps
 * the detection logic out of the Constitutional (Layer 0) manager.ts file.
 *
 * @module
 */

import { createLogger } from '../lib/logger';
import { CHEERLEADING_WARNING_THRESHOLD, isCheerleadingResponse } from '../lib/session-analysis';
import type { EventCallback } from './interfaces';
import type { ClaudeStreamEvent } from './types';
import { isSessionEndEvent } from './types';

const log = createLogger('SessionCheerleadingDetector');

/** Minimal contract needed for the detector to attach to an event source. */
export interface IEventSubscribable {
  subscribeAll(callback: EventCallback): void;
  unsubscribeAll(callback: EventCallback): void;
}

interface CheerleadingSessionState {
  currentTurnEvents: ClaudeStreamEvent[];
  consecutiveCount: number;
}

/**
 * Passive observer that tracks consecutive cheerleading turns per session.
 *
 * Usage:
 * ```ts
 * const detector = new SessionCheerleadingDetector(processManager);
 * // later:
 * const count = detector.getConsecutiveCheerleadingCount(sessionId);
 * ```
 */
export class SessionCheerleadingDetector {
  private readonly sessionState = new Map<string, CheerleadingSessionState>();
  private readonly boundCallback: EventCallback;

  constructor(eventSource: IEventSubscribable) {
    this.boundCallback = (sessionId, event) => this.handleEvent(sessionId, event);
    eventSource.subscribeAll(this.boundCallback);
  }

  /**
   * Returns the number of consecutive cheerleading turns detected for the
   * given session (0 if none or session not found).
   */
  getConsecutiveCheerleadingCount(sessionId: string): number {
    return this.sessionState.get(sessionId)?.consecutiveCount ?? 0;
  }

  /**
   * Detach from the event source. Call during shutdown to prevent leaks.
   */
  destroy(eventSource: IEventSubscribable): void {
    eventSource.unsubscribeAll(this.boundCallback);
    this.sessionState.clear();
  }

  private getOrCreateState(sessionId: string): CheerleadingSessionState {
    let state = this.sessionState.get(sessionId);
    if (!state) {
      state = { currentTurnEvents: [], consecutiveCount: 0 };
      this.sessionState.set(sessionId, state);
    }
    return state;
  }

  private handleEvent(sessionId: string, event: ClaudeStreamEvent): void {
    // Clean up per-session state on terminal events to prevent unbounded growth
    if (isSessionEndEvent(event)) {
      this.sessionState.delete(sessionId);
      return;
    }

    const state = this.getOrCreateState(sessionId);

    // Accumulate all events for the current response turn
    state.currentTurnEvents.push(event);

    // On result event, analyse the completed turn and reset the accumulator
    if (event.type === 'result') {
      const turnEvents = state.currentTurnEvents;

      if (isCheerleadingResponse(turnEvents)) {
        state.consecutiveCount++;
        log.warn('Cheerleading response detected', {
          sessionId,
          consecutiveCount: state.consecutiveCount,
        });
        if (state.consecutiveCount >= CHEERLEADING_WARNING_THRESHOLD) {
          log.warn('Consecutive cheerleading threshold reached — session may be stuck', {
            sessionId,
            consecutiveCount: state.consecutiveCount,
            threshold: CHEERLEADING_WARNING_THRESHOLD,
          });
        }
      } else {
        state.consecutiveCount = 0;
      }

      // Reset accumulator for the next turn
      state.currentTurnEvents = [];
    }
  }
}

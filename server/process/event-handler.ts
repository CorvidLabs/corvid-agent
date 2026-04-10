/**
 * Session event handling — processes SDK/direct-process events, persists
 * messages and metrics, broadcasts activity status, and handles cost/credit
 * updates.
 *
 * Extracted from manager.ts to isolate event processing from session lifecycle.
 *
 * @module
 */

import type { Database } from 'bun:sqlite';
import { deductTurnCredits, getCreditConfig } from '../db/credits';
import { insertSessionMetrics } from '../db/session-metrics';
import { addSessionMessage, getParticipantForSession, updateSessionCost, updateSessionStatus } from '../db/sessions';
import { recordApiCost } from '../db/spending';
import { createLogger } from '../lib/logger';
import type { ISessionEventBus } from './interfaces';
import type {
  ClaudeStreamEvent,
  ContentBlockStartEvent,
  DirectProcessMetrics,
  ThinkingEvent,
} from './types';
import { extractContentText } from './types';

const log = createLogger('EventHandler');

/** Dependencies needed by the event handler. */
export interface EventHandlerDeps {
  db: Database;
  eventBus: ISessionEventBus;
  broadcastFn: ((topic: string, data: string) => void) | null;
  isOwnerAddress: ((address: string) => boolean) | null;
  getSessionMeta: (sessionId: string) => SessionMetaForEvents | undefined;
  stopProcess: (sessionId: string, reason?: string) => void;
  resetSessionTimeout: (sessionId: string) => void;
}

export interface SessionMetaForEvents {
  lastActivityAt: number;
  lastKnownCostUsd: number;
  source: string;
}

/**
 * Apply a cost update from an event. Returns false if the session was stopped
 * (e.g. credits exhausted) and the caller must abort.
 */
export function applyCostUpdate(
  deps: EventHandlerDeps,
  sessionId: string,
  event: Pick<ClaudeStreamEvent, 'total_cost_usd' | 'num_turns'>,
): boolean {
  if (event.total_cost_usd === undefined) return true;

  updateSessionCost(deps.db, sessionId, event.total_cost_usd, event.num_turns ?? 0);

  const meta = deps.getSessionMeta(sessionId);
  if (meta) {
    const delta = event.total_cost_usd - meta.lastKnownCostUsd;
    if (delta > 0) {
      try {
        recordApiCost(deps.db, delta);
      } catch (err) {
        log.warn(`Failed to record API cost`, { error: err instanceof Error ? err.message : String(err) });
      }
    }
    meta.lastKnownCostUsd = event.total_cost_usd;

    if (meta.source === 'algochat') {
      const participantAddr = getParticipantForSession(deps.db, sessionId);
      if (participantAddr && deps.isOwnerAddress?.(participantAddr)) {
        // Owners are exempt from credit deduction
      } else if (participantAddr) {
        const creditResult = deductTurnCredits(deps.db, participantAddr, sessionId);
        if (!creditResult.success) {
          log.warn(`Credits exhausted mid-session -- pausing session ${sessionId}`, {
            participantAddr: `${participantAddr.slice(0, 8)}...`,
          });
          deps.eventBus.emit(sessionId, {
            type: 'error',
            error: {
              message: `Session paused: credits exhausted. Send ALGO to resume. Use /credits to check balance.`,
              type: 'credits_exhausted',
            },
          } as ClaudeStreamEvent);
          deps.eventBus.emit(sessionId, {
            type: 'session_error',
            session_id: sessionId,
            error: {
              message: 'Session paused: credits exhausted. Send ALGO to resume.',
              errorType: 'credits_exhausted',
              severity: 'warning',
              recoverable: true,
            },
          } as ClaudeStreamEvent);
          deps.stopProcess(sessionId, 'credits_exhausted');
          return false;
        }
        if (creditResult.isLow) {
          const config = getCreditConfig(deps.db);
          log.info(`Low credits warning for session ${sessionId}`, {
            remaining: creditResult.creditsRemaining,
            threshold: config.lowCreditThreshold,
          });
          deps.eventBus.emit(sessionId, {
            type: 'system',
            statusMessage: `Low credits: ${creditResult.creditsRemaining} remaining. Send ALGO to top up.`,
          });
        }
      }
    }
  }
  return true;
}

/** Persist direct-process session metrics to the database. */
export function persistDirectSessionMetrics(db: Database, sessionId: string, metrics: DirectProcessMetrics): void {
  try {
    insertSessionMetrics(db, {
      sessionId,
      model: metrics.model,
      tier: metrics.tier,
      totalIterations: metrics.totalIterations,
      toolCallCount: metrics.toolCallCount,
      maxChainDepth: metrics.maxChainDepth,
      nudgeCount: metrics.nudgeCount,
      midChainNudgeCount: metrics.midChainNudgeCount,
      explorationDriftCount: metrics.explorationDriftCount,
      stallDetected: metrics.stallDetected,
      stallType: metrics.stallType,
      terminationReason: metrics.terminationReason,
      durationMs: metrics.durationMs,
      needsSummary: metrics.needsSummary,
    });
  } catch (err) {
    log.warn('Failed to persist session metrics', {
      sessionId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Handle an incoming session event: update activity timestamps, persist
 * messages, apply cost updates, broadcast status, and emit to subscribers.
 */
export function handleSessionEvent(deps: EventHandlerDeps, sessionId: string, event: ClaudeStreamEvent): void {
  const meta = deps.getSessionMeta(sessionId);
  if (meta) {
    meta.lastActivityAt = Date.now();
    deps.resetSessionTimeout(sessionId);
  }

  // Cursor (and similar): per-turn cost/metrics without broadcasting `result`
  // (Discord / work-queue listeners treat `result` as end-of-session).
  if (event.type === 'session_turn_metrics') {
    if (!applyCostUpdate(deps, sessionId, event)) return;
    persistDirectSessionMetrics(deps.db, sessionId, (event as { metrics: DirectProcessMetrics }).metrics);
    return;
  }

  // Broadcast granular activity status so the dashboard reflects what the agent is doing
  broadcastActivityStatus(deps, sessionId, event);

  if (event.type === 'assistant' && event.message?.content) {
    const text = extractContentText(event.message.content);
    if (text?.trim()) {
      addSessionMessage(deps.db, sessionId, 'assistant', text);
    }
  }

  if (!applyCostUpdate(deps, sessionId, event)) return;

  if (event.type === 'result' && 'metrics' in event && event.metrics) {
    persistDirectSessionMetrics(deps.db, sessionId, event.metrics as DirectProcessMetrics);
  }

  deps.eventBus.emit(sessionId, event);
}

/**
 * Broadcast a session_status message when the agent's activity state changes.
 * Maps SDK events to human-readable status so the dashboard accurately reflects
 * whether an agent is thinking, using tools, or idle.
 */
export function broadcastActivityStatus(
  deps: Pick<EventHandlerDeps, 'db' | 'broadcastFn' | 'eventBus'>,
  sessionId: string,
  event: ClaudeStreamEvent,
): void {
  let status: string | null = null;

  switch (event.type) {
    case 'thinking':
      status = (event as ThinkingEvent).thinking ? 'thinking' : 'running';
      break;
    case 'content_block_start': {
      const block = (event as ContentBlockStartEvent).content_block;
      if (block?.type === 'tool_use') {
        status = 'tool_use';
      } else {
        status = 'running';
      }
      break;
    }
    case 'assistant':
    case 'message_start':
      status = 'running';
      break;
    case 'result':
    case 'session_exited':
      status = 'idle';
      break;
  }

  if (!status) return;

  // Update DB so page refreshes also show the correct status
  if (status === 'thinking' || status === 'tool_use') {
    updateSessionStatus(deps.db, sessionId, 'running');
  }

  // Broadcast to all WS subscribers watching this session
  if (deps.broadcastFn) {
    const msg = JSON.stringify({ type: 'session_status', sessionId, status });
    deps.broadcastFn('sessions', msg);
  }

  // Also emit directly to session subscribers (for the detail page)
  deps.eventBus.emit(sessionId, {
    type: 'system',
    statusMessage: `__status:${status}`,
  } as ClaudeStreamEvent);
}

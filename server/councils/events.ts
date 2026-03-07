/**
 * Council event bus — pub/sub infrastructure for real-time WS broadcasting.
 *
 * Provides listener registration and broadcast functions for 4 council event
 * types: stage changes, logs, discussion messages, and agent errors.
 * Plus the `emitLog` helper that persists a log entry and broadcasts it.
 *
 * Zero coupling to business logic, DB schemas, or process management.
 * Consumed by discussion.ts, synthesis.ts, routes/councils.ts, and the WS layer.
 */

import type { Database } from 'bun:sqlite';
import { addCouncilLaunchLog } from '../db/councils';
import type { CouncilLogLevel, CouncilLaunchLog, CouncilDiscussionMessage, CouncilAgentError } from '../../shared/types';
import { createLogger } from '../lib/logger';

const log = createLogger('CouncilEvents');

// ─── Stage change events ─────────────────────────────────────────────────────

type StageChangeCallback = (launchId: string, stage: string, sessionIds?: string[]) => void;
const stageChangeListeners = new Set<StageChangeCallback>();

export function onCouncilStageChange(cb: StageChangeCallback): () => void {
    stageChangeListeners.add(cb);
    return () => { stageChangeListeners.delete(cb); };
}

export function broadcastStageChange(launchId: string, stage: string, sessionIds?: string[]): void {
    for (const cb of stageChangeListeners) {
        try { cb(launchId, stage, sessionIds); } catch { /* ignore */ }
    }
}

// ─── Log events ──────────────────────────────────────────────────────────────

type LogCallback = (logEntry: CouncilLaunchLog) => void;
const logListeners = new Set<LogCallback>();

export function onCouncilLog(cb: LogCallback): () => void {
    logListeners.add(cb);
    return () => { logListeners.delete(cb); };
}

export function broadcastLog(entry: CouncilLaunchLog): void {
    for (const cb of logListeners) {
        try { cb(entry); } catch { /* ignore */ }
    }
}

// ─── Discussion message events ───────────────────────────────────────────────

type DiscussionMessageCallback = (message: CouncilDiscussionMessage) => void;
const discussionMessageListeners = new Set<DiscussionMessageCallback>();

export function onCouncilDiscussionMessage(cb: DiscussionMessageCallback): () => void {
    discussionMessageListeners.add(cb);
    return () => { discussionMessageListeners.delete(cb); };
}

export function broadcastDiscussionMessage(message: CouncilDiscussionMessage): void {
    for (const cb of discussionMessageListeners) {
        try { cb(message); } catch { /* ignore */ }
    }
}

// ─── Agent error events ──────────────────────────────────────────────────────

type AgentErrorCallback = (error: CouncilAgentError) => void;
const agentErrorListeners = new Set<AgentErrorCallback>();

export function onCouncilAgentError(cb: AgentErrorCallback): () => void {
    agentErrorListeners.add(cb);
    return () => { agentErrorListeners.delete(cb); };
}

export function broadcastAgentError(error: CouncilAgentError): void {
    for (const cb of agentErrorListeners) {
        try { cb(error); } catch { /* ignore */ }
    }
}

// ─── emitLog helper ──────────────────────────────────────────────────────────

/** Persist a log entry and broadcast it to WS clients. */
export function emitLog(db: Database, launchId: string, level: CouncilLogLevel, message: string, detail?: string): void {
    const entry = addCouncilLaunchLog(db, launchId, level, message, detail);
    broadcastLog(entry);
    // Also log to server console
    if (level === 'error') log.error(message, detail ? { detail } : undefined);
    else if (level === 'warn') log.warn(message, detail ? { detail } : undefined);
    else log.info(message, detail ? { detail } : undefined);
}

/**
 * Thread↔session mapping and lookup.
 *
 * Owns the in-memory state types for thread-based Discord conversations and
 * the DB-backed recovery logic for restoring mappings after server restart.
 */

import type { Database } from 'bun:sqlite';
import type { EventCallback } from '../process/interfaces';
import { createLogger } from '../lib/logger';

const log = createLogger('DiscordThreadSessionMap');

export interface ThreadSessionInfo {
    sessionId: string;
    agentName: string;
    agentModel: string;
    ownerUserId: string;
    topic?: string;
    projectName?: string;
    displayColor?: string | null;
    displayIcon?: string | null;
    avatarUrl?: string | null;
    /**
     * Permission level of the user who created this thread.
     * Used to enforce per-tier access: BASIC users cannot interact with
     * threads created by STANDARD/ADMIN users (which may have tool access).
     */
    creatorPermLevel?: number;
    /** Buddy config for end-of-session review (if specified). */
    buddyConfig?: {
        buddyAgentId: string;
        buddyAgentName: string;
        maxRounds?: number;
    };
}

export interface ThreadCallbackInfo {
    sessionId: string;
    callback: EventCallback;
}

/**
 * Normalize a SQLite UTC timestamp by appending 'Z' if it doesn't already
 * have a timezone indicator, so `new Date()` parses it as UTC rather than local.
 * Exported for testing.
 */
export function normalizeTimestamp(ts: string): string {
    return ts.endsWith('Z') ? ts : ts + 'Z';
}

/**
 * Format a duration in milliseconds as a human-readable string.
 * Returns "Xm Ys" for durations >= 1 minute, or "Xs" for shorter.
 * Exported for testing.
 */
export function formatDuration(ms: number): string {
    const durationMs = Math.max(0, ms);
    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000);
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

/**
 * Try to recover a thread-to-session mapping from the database.
 * Sessions are named `Discord thread:{threadId}` so we can look them up.
 */
export function tryRecoverThread(
    db: Database,
    threadSessions: Map<string, ThreadSessionInfo>,
    threadId: string,
): ThreadSessionInfo | null {
    try {
        const row = db.query(
            `SELECT s.id, s.agent_id, s.initial_prompt, a.name as agent_name, a.model as agent_model, a.display_color, a.display_icon, a.avatar_url, p.name as project_name
             FROM sessions s
             LEFT JOIN agents a ON a.id = s.agent_id
             LEFT JOIN projects p ON p.id = s.project_id
             WHERE s.name = ? AND s.source = 'discord'
             ORDER BY s.created_at DESC LIMIT 1`,
        ).get(`Discord thread:${threadId}`) as { id: string; agent_id: string; initial_prompt: string; agent_name: string; agent_model: string; display_color: string | null; display_icon: string | null; avatar_url: string | null; project_name: string | null } | null;

        if (!row) return null;

        const info: ThreadSessionInfo = {
            sessionId: row.id,
            agentName: row.agent_name || 'Agent',
            agentModel: row.agent_model || 'unknown',
            ownerUserId: '',
            topic: row.initial_prompt || undefined,
            projectName: row.project_name || undefined,
            displayColor: row.display_color ?? undefined,
            displayIcon: row.display_icon ?? undefined,
            avatarUrl: row.avatar_url ?? undefined,
        };
        threadSessions.set(threadId, info);
        log.info('Recovered thread session from DB', { threadId, sessionId: row.id });
        return info;
    } catch (err) {
        log.warn('Failed to recover thread session', { threadId, error: err instanceof Error ? err.message : String(err) });
        return null;
    }
}

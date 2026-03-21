/**
 * Discord thread helper utilities.
 *
 * Pure functions and static helpers extracted from thread-manager.ts:
 * timestamp normalization, duration formatting, thread archival,
 * standalone thread creation, and agent resolution.
 */

import type { Database } from 'bun:sqlite';
import type { ProcessManager } from '../process/manager';
import type { DiscordBridgeConfig } from './types';
import { ButtonStyle } from './types';
import type { EventCallback } from '../process/interfaces';
import type { DeliveryTracker } from '../lib/delivery-tracker';
import { createLogger } from '../lib/logger';
import {
    sendEmbedWithButtons,
    buildActionRow,
    assertSnowflake,
} from './embeds';

const log = createLogger('DiscordThreadManager');

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

export interface ThreadSessionInfo {
    sessionId: string;
    agentName: string;
    agentModel: string;
    ownerUserId: string;
    topic?: string;
    projectName?: string;
    displayColor?: string | null;
}

export interface ThreadCallbackInfo {
    sessionId: string;
    callback: EventCallback;
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
            `SELECT s.id, s.agent_id, s.initial_prompt, a.name as agent_name, a.model as agent_model, a.display_color, p.name as project_name
             FROM sessions s
             LEFT JOIN agents a ON a.id = s.agent_id
             LEFT JOIN projects p ON p.id = s.project_id
             WHERE s.name = ? AND s.source = 'discord'
             ORDER BY s.created_at DESC LIMIT 1`,
        ).get(`Discord thread:${threadId}`) as { id: string; agent_id: string; initial_prompt: string; agent_name: string; agent_model: string; display_color: string | null; project_name: string | null } | null;

        if (!row) return null;

        const info: ThreadSessionInfo = {
            sessionId: row.id,
            agentName: row.agent_name || 'Agent',
            agentModel: row.agent_model || 'unknown',
            ownerUserId: '',
            topic: row.initial_prompt || undefined,
            projectName: row.project_name || undefined,
            displayColor: row.display_color ?? undefined,
        };
        threadSessions.set(threadId, info);
        log.info('Recovered thread session from DB', { threadId, sessionId: row.id });
        return info;
    } catch (err) {
        log.warn('Failed to recover thread session', { threadId, error: err instanceof Error ? err.message : String(err) });
        return null;
    }
}

/**
 * Archive threads that have been inactive for staleThresholdMs.
 */
export async function archiveStaleThreads(
    processManager: ProcessManager,
    delivery: DeliveryTracker,
    botToken: string,
    threadLastActivity: Map<string, number>,
    threadSessions: Map<string, ThreadSessionInfo>,
    threadCallbacks: Map<string, ThreadCallbackInfo>,
    staleThresholdMs: number,
): Promise<void> {
    const now = Date.now();
    const staleThreads: string[] = [];

    for (const [threadId, lastActive] of threadLastActivity) {
        if (now - lastActive >= staleThresholdMs) {
            staleThreads.push(threadId);
        }
    }

    for (const threadId of staleThreads) {
        try {
            await sendEmbedWithButtons(delivery, botToken, threadId, {
                description: 'This conversation has been idle. Archiving thread.',
                color: 0x95a5a6,
            }, [
                buildActionRow(
                    { label: 'Resume', customId: 'resume_thread', style: ButtonStyle.SUCCESS, emoji: '🔄' },
                ),
            ]);

            await archiveThread(botToken, threadId);
            threadLastActivity.delete(threadId);
            threadSessions.delete(threadId);
            const cb = threadCallbacks.get(threadId);
            if (cb) {
                processManager.unsubscribe(cb.sessionId, cb.callback);
                threadCallbacks.delete(threadId);
            }
            log.info('Auto-archived stale thread', { threadId });
        } catch (err) {
            log.warn('Failed to archive stale thread', {
                threadId,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }
}

/**
 * Archive a thread via the Discord API.
 */
export async function archiveThread(botToken: string, threadId: string): Promise<void> {
    assertSnowflake(threadId, 'thread ID');
    const response = await fetch(
        `https://discord.com/api/v10/channels/${threadId}`,
        {
            method: 'PATCH',
            headers: {
                'Authorization': `Bot ${botToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ archived: true }),
        },
    );

    if (!response.ok) {
        const error = await response.text();
        log.warn('Failed to archive thread', { threadId, status: response.status, error: error.slice(0, 200) });
    }
}

/**
 * Create a standalone Discord thread (not attached to a message).
 * Used by /session command. Returns the thread channel ID, or null on failure.
 */
export async function createStandaloneThread(botToken: string, channelId: string, name: string): Promise<string | null> {
    assertSnowflake(channelId, 'channel ID');
    const safeChannelId = encodeURIComponent(channelId);
    const response = await fetch(
        `https://discord.com/api/v10/channels/${safeChannelId}/threads`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bot ${botToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: name.slice(0, 100),
                type: 11, // GUILD_PUBLIC_THREAD
                auto_archive_duration: 1440, // 24 hours
            }),
        },
    );

    if (response.ok) {
        const thread = await response.json() as { id: string };
        log.info('Discord standalone thread created', { threadId: thread.id, name: name.slice(0, 60) });
        return thread.id;
    }

    const error = await response.text();
    log.error('Failed to create Discord thread', { status: response.status, error: error.slice(0, 200) });
    return null;
}

/**
 * Resolve the default agent.
 * Priority: config default > first agent.
 */
export function resolveDefaultAgent(
    db: Database,
    config: DiscordBridgeConfig,
): import('../../shared/types').Agent | null {
    const { listAgents } = require('../db/agents') as typeof import('../db/agents');
    const agents = listAgents(db);
    if (agents.length === 0) return null;

    if (config.defaultAgentId) {
        const defaultAgent = agents.find(a => a.id === config.defaultAgentId);
        if (defaultAgent) return defaultAgent;
    }

    return agents[0];
}

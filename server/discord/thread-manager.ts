/**
 * Discord thread lifecycle management.
 *
 * Handles response streaming into threads, thread recovery after server restart,
 * stale thread archival, and standalone thread creation.
 */

import type { Database } from 'bun:sqlite';
import type { ProcessManager } from '../process/manager';
import type { DiscordBridgeConfig } from './types';
import { ButtonStyle } from './types';
import type { EventCallback } from '../process/interfaces';
import type { DeliveryTracker } from '../lib/delivery-tracker';
import { extractContentText } from '../process/types';
import { createLogger } from '../lib/logger';
import {
    sendEmbed,
    sendEmbedWithButtons,
    buildActionRow,
    sendTypingIndicator,
    agentColor,
    assertSnowflake,
    splitEmbedDescription,
} from './embeds';

const log = createLogger('DiscordThreadManager');

export interface ThreadSessionInfo {
    sessionId: string;
    agentName: string;
    agentModel: string;
    ownerUserId: string;
    topic?: string;
}

export interface ThreadCallbackInfo {
    sessionId: string;
    callback: EventCallback;
}

/**
 * Subscribe for agent responses and send them as rich embeds in a Discord thread.
 * Shows agent name and model in the embed footer.
 */
export function subscribeForResponseWithEmbed(
    processManager: ProcessManager,
    delivery: DeliveryTracker,
    botToken: string,
    threadCallbacks: Map<string, ThreadCallbackInfo>,
    sessionId: string,
    threadId: string,
    agentName: string,
    agentModel: string,
): void {
    // Unsubscribe the previous callback for this thread to prevent duplicates
    const prev = threadCallbacks.get(threadId);
    if (prev) {
        processManager.unsubscribe(prev.sessionId, prev.callback);
    }

    let buffer = '';
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let lastStatusTime = 0;
    let lastTypingTime = 0;
    const STATUS_DEBOUNCE_MS = 3000;
    const TYPING_REFRESH_MS = 8000;
    const TYPING_TIMEOUT_MS = 10 * 60 * 1000; // 10 minute safety timeout

    // Keep typing indicator alive continuously until response completes
    const typingInterval = setInterval(() => {
        sendTypingIndicator(botToken, threadId).catch((err) => {
            log.debug('Typing indicator failed', { threadId, error: err instanceof Error ? err.message : String(err) });
        });
    }, TYPING_REFRESH_MS);

    // Safety timeout: clear typing if no terminal event arrives
    const typingSafetyTimeout = setTimeout(() => {
        clearInterval(typingInterval);
        log.warn('Typing indicator safety timeout reached', { sessionId, threadId });
    }, TYPING_TIMEOUT_MS);

    const clearTyping = () => {
        clearInterval(typingInterval);
        clearTimeout(typingSafetyTimeout);
    };

    const color = agentColor(agentName);

    const flush = async () => {
        if (!buffer) return;
        const text = buffer;
        buffer = '';

        const parts = splitEmbedDescription(text);
        for (const part of parts) {
            await sendEmbed(delivery, botToken, threadId, {
                description: part,
                color,
                footer: { text: `${agentName} · ${agentModel}` },
            });
        }
    };

    const callback: EventCallback = (_sid, event) => {
        if (event.type === 'assistant' && event.message) {
            const msg = event.message as { content?: unknown };
            const content = extractContentText(msg.content as string | import('../process/types').ContentBlock[] | undefined);

            if (content) {
                buffer += content;
                if (debounceTimer) clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => flush(), 1500);
            }

            const now = Date.now();
            if (now - lastTypingTime >= TYPING_REFRESH_MS) {
                lastTypingTime = now;
                sendTypingIndicator(botToken, threadId).catch((err) => {
                    log.debug('Typing indicator failed', { threadId, error: err instanceof Error ? err.message : String(err) });
                });
            }
        }

        if (event.type === 'tool_status' && event.statusMessage) {
            const now = Date.now();
            if (now - lastStatusTime >= STATUS_DEBOUNCE_MS) {
                lastStatusTime = now;
                sendEmbed(delivery, botToken, threadId, {
                    description: `⏳ ${event.statusMessage}`,
                    color: 0x95a5a6,
                    footer: { text: `${agentName} · working...` },
                }).catch((err) => {
                    log.debug('Tool status embed failed', { threadId, error: err instanceof Error ? err.message : String(err) });
                });
            }
            if (now - lastTypingTime >= TYPING_REFRESH_MS) {
                lastTypingTime = now;
                sendTypingIndicator(botToken, threadId).catch((err) => {
                    log.debug('Typing indicator failed', { threadId, error: err instanceof Error ? err.message : String(err) });
                });
            }
        }

        if (event.type === 'result') {
            clearTyping();
            if (debounceTimer) clearTimeout(debounceTimer);
            flush();
            threadCallbacks.delete(threadId);

            sendEmbedWithButtons(delivery, botToken, threadId, {
                description: 'Session complete. Send a message to continue, or use the buttons below.',
                color: 0x57f287,
                footer: { text: `${agentName} · done` },
            }, [
                buildActionRow(
                    { label: 'Resume', customId: 'resume_thread', style: ButtonStyle.SUCCESS, emoji: '🔄' },
                    { label: 'New Session', customId: 'new_session', style: ButtonStyle.SECONDARY, emoji: '➕' },
                ),
            ]).catch((err) => {
                log.debug('Session complete embed failed', { threadId, error: err instanceof Error ? err.message : String(err) });
            });
        }

        if (event.type === 'session_error') {
            clearTyping();
            const errEvent = event as { error?: { message?: string; errorType?: string } };
            const errMsg = errEvent.error?.message || 'Unknown error';
            sendEmbedWithButtons(delivery, botToken, threadId, {
                title: 'Session Error',
                description: errMsg.slice(0, 4096),
                color: 0xff3355,
                footer: { text: `${agentName} · ${errEvent.error?.errorType || 'error'}` },
            }, [
                buildActionRow(
                    { label: 'Resume', customId: 'resume_thread', style: ButtonStyle.SUCCESS, emoji: '🔄' },
                ),
            ]).catch((err) => {
                log.debug('Session error embed failed', { threadId, error: err instanceof Error ? err.message : String(err) });
            });
        }

        if (event.type === 'session_exited') {
            clearTyping();
            if (debounceTimer) clearTimeout(debounceTimer);
            flush();
            threadCallbacks.delete(threadId);
        }
    };

    processManager.subscribe(sessionId, callback);
    threadCallbacks.set(threadId, { sessionId, callback });
}

/**
 * Subscribe for agent response and send it as an inline reply in the channel.
 * Used for one-off @mention responses.
 */
export function subscribeForInlineResponse(
    processManager: ProcessManager,
    delivery: DeliveryTracker,
    botToken: string,
    sessionId: string,
    channelId: string,
    replyToMessageId: string,
    agentName: string,
    agentModel: string,
): void {
    let buffer = '';
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const TYPING_REFRESH_MS = 8000;
    const TYPING_TIMEOUT_MS = 10 * 60 * 1000; // 10 minute safety timeout
    const color = agentColor(agentName);

    // Keep typing indicator alive continuously until response completes
    const typingInterval = setInterval(() => {
        sendTypingIndicator(botToken, channelId).catch((err) => {
            log.debug('Typing indicator failed (inline)', { channelId, error: err instanceof Error ? err.message : String(err) });
        });
    }, TYPING_REFRESH_MS);

    // Safety timeout: clear typing if no terminal event arrives
    const typingSafetyTimeout = setTimeout(() => {
        clearInterval(typingInterval);
        log.warn('Typing indicator safety timeout reached (inline)', { sessionId, channelId });
    }, TYPING_TIMEOUT_MS);

    const clearTyping = () => {
        clearInterval(typingInterval);
        clearTimeout(typingSafetyTimeout);
    };

    // Import sendReplyEmbed inline to avoid circular dependency
    const { sendReplyEmbed } = require('./embeds') as typeof import('./embeds');

    const flush = async () => {
        if (!buffer) return;
        const text = buffer;
        buffer = '';

        const parts = splitEmbedDescription(text);
        for (let i = 0; i < parts.length; i++) {
            if (i === 0) {
                await sendReplyEmbed(delivery, botToken, channelId, replyToMessageId, {
                    description: parts[i],
                    color,
                    footer: { text: `${agentName} · ${agentModel}` },
                });
            } else {
                await sendEmbed(delivery, botToken, channelId, {
                    description: parts[i],
                    color,
                    footer: { text: `${agentName} · ${agentModel}` },
                });
            }
        }
    };

    processManager.subscribe(sessionId, (_sid, event) => {
        if (event.type === 'assistant' && event.message) {
            const msg = event.message as { content?: unknown };
            const content = extractContentText(msg.content as string | import('../process/types').ContentBlock[] | undefined);
            if (content) {
                buffer += content;
                if (debounceTimer) clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => flush(), 1500);
            }
        }

        if (event.type === 'result') {
            clearTyping();
            if (debounceTimer) clearTimeout(debounceTimer);
            flush();
        }

        if (event.type === 'session_error' || event.type === 'session_exited') {
            clearTyping();
        }
    });
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
            `SELECT s.id, s.agent_id, s.initial_prompt, a.name as agent_name, a.model as agent_model
             FROM sessions s
             LEFT JOIN agents a ON a.id = s.agent_id
             WHERE s.name = ? AND s.source = 'discord'
             ORDER BY s.created_at DESC LIMIT 1`,
        ).get(`Discord thread:${threadId}`) as { id: string; agent_id: string; initial_prompt: string; agent_name: string; agent_model: string } | null;

        if (!row) return null;

        const info: ThreadSessionInfo = {
            sessionId: row.id,
            agentName: row.agent_name || 'Agent',
            agentModel: row.agent_model || 'unknown',
            ownerUserId: '',
            topic: row.initial_prompt || undefined,
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
 * Recover event subscriptions for active Discord sessions after server restart.
 */
export function recoverActiveThreadSubscriptions(
    db: Database,
    processManager: ProcessManager,
    delivery: DeliveryTracker,
    botToken: string,
    threadSessions: Map<string, ThreadSessionInfo>,
    threadCallbacks: Map<string, ThreadCallbackInfo>,
): void {
    try {
        const rows = db.query(
            `SELECT s.id, s.name, a.name as agent_name, a.model as agent_model
             FROM sessions s
             LEFT JOIN agents a ON a.id = s.agent_id
             WHERE s.source = 'discord' AND s.status = 'running'
               AND s.name LIKE 'Discord thread:%'`,
        ).all() as { id: string; name: string; agent_name: string; agent_model: string }[];

        let recovered = 0;
        for (const row of rows) {
            const threadId = row.name.replace('Discord thread:', '');
            if (!threadId || threadCallbacks.has(threadId)) continue;

            if (!threadSessions.has(threadId)) {
                threadSessions.set(threadId, {
                    sessionId: row.id,
                    agentName: row.agent_name || 'Agent',
                    agentModel: row.agent_model || 'unknown',
                    ownerUserId: '',
                });
            }

            subscribeForResponseWithEmbed(
                processManager, delivery, botToken, threadCallbacks,
                row.id, threadId, row.agent_name || 'Agent', row.agent_model || 'unknown',
            );
            recovered++;
        }

        if (recovered > 0) {
            log.info('Recovered Discord thread subscriptions', { count: recovered });
        }
    } catch (err) {
        log.warn('Failed to recover thread subscriptions', { error: err instanceof Error ? err.message : String(err) });
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
                    { label: 'New Session', customId: 'new_session', style: ButtonStyle.SECONDARY, emoji: '➕' },
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

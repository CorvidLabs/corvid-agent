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
import { extractContentText, extractContentImageUrls } from '../process/types';
import { createLogger } from '../lib/logger';
import {
    sendEmbed,
    sendReplyEmbed,
    editEmbed,
    sendEmbedWithButtons,
    sendEmbedWithFiles,
    buildActionRow,
    sendTypingIndicator,
    agentColor,
    hexColorToInt,
    assertSnowflake,
    splitEmbedDescription,
    buildFooterText,
    buildFooterWithStats,
    type DiscordFileAttachment,
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
 * Subscribe for agent responses and send them as rich embeds in a Discord thread.
 * Shows agent name and model in the embed footer.
 */
export function subscribeForResponseWithEmbed(
    processManager: ProcessManager,
    delivery: DeliveryTracker,
    botToken: string,
    db: Database,
    threadCallbacks: Map<string, ThreadCallbackInfo>,
    sessionId: string,
    threadId: string,
    agentName: string,
    agentModel: string,
    projectName?: string,
    displayColor?: string | null,
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
    let receivedAnyContent = false;
    const STATUS_DEBOUNCE_MS = 3000;
    const TYPING_REFRESH_MS = 8000;
    const TYPING_TIMEOUT_MS = 4 * 60 * 1000; // 4 minute safety timeout
    let receivedAnyActivity = false; // tracks any activity (content OR tool use)
    let sentErrorMessage = false; // dedup: prevent repeated error messages for same session

    // Keep typing indicator alive continuously until response completes
    const typingInterval = setInterval(() => {
        // Check if the process is still alive
        if (!processManager.isRunning(sessionId)) {
            clearTyping();
            log.warn('Process died while typing indicator active', { sessionId, threadId });
            if (!receivedAnyContent && !sentErrorMessage) {
                sentErrorMessage = true;
                sendEmbedWithButtons(delivery, botToken, threadId, {
                    description: 'The agent session ended unexpectedly. Send a message to resume.',
                    color: 0xff3355,
                    footer: { text: buildFooterText({ agentName, agentModel, sessionId, projectName, status: 'crashed' }) },
                }, [
                    buildActionRow(
                        { label: 'Resume', customId: 'resume_thread', style: ButtonStyle.SUCCESS, emoji: '🔄' },
                    ),
                ]).catch((err) => {
                    log.warn('Failed to send crash embed', { threadId, error: err instanceof Error ? err.message : String(err) });
                });
            }
            threadCallbacks.delete(threadId);
            return;
        }
        sendTypingIndicator(botToken, threadId).catch((err) => {
            log.debug('Typing indicator failed', { threadId, error: err instanceof Error ? err.message : String(err) });
        });
    }, TYPING_REFRESH_MS);

    // Safety timeout: clear typing if no terminal event arrives
    const typingSafetyTimeout = setTimeout(() => {
        clearInterval(typingInterval);
        log.warn('Typing indicator safety timeout reached', { sessionId, threadId });
        if (!receivedAnyActivity) {
            sendEmbed(delivery, botToken, threadId, {
                description: 'The agent appears to be taking too long. It may still be working \u2014 send a message to check.',
                color: 0xf0b232,
            }).catch((err) => {
                log.warn('Failed to send timeout embed', { threadId, error: err instanceof Error ? err.message : String(err) });
            });
        }
    }, TYPING_TIMEOUT_MS);

    const clearTyping = () => {
        clearInterval(typingInterval);
        clearTimeout(typingSafetyTimeout);
    };

    const color = hexColorToInt(displayColor) ?? agentColor(agentName);

    const flush = async () => {
        if (!buffer) return;
        const text = buffer;
        buffer = '';

        const parts = splitEmbedDescription(text);
        for (const part of parts) {
            await sendEmbed(delivery, botToken, threadId, {
                description: part,
                color,
                footer: { text: buildFooterText({ agentName, agentModel, sessionId, projectName }) },
            });
        }
    };

    /** Download an image URL and send as a Discord file attachment in the thread. */
    const sendThreadImageUrl = async (imageUrl: string) => {
        try {
            const resp = await fetch(imageUrl);
            if (!resp.ok) {
                log.warn('Failed to fetch image for Discord thread', { imageUrl, status: resp.status });
                return;
            }
            const data = new Uint8Array(await resp.arrayBuffer());
            const ct = resp.headers.get('content-type') ?? 'image/png';
            const ext = ct.includes('jpeg') || ct.includes('jpg') ? 'jpg' : ct.includes('gif') ? 'gif' : ct.includes('webp') ? 'webp' : 'png';
            const filename = `image.${ext}`;
            const attachment: DiscordFileAttachment = { name: filename, data, contentType: ct };
            await sendEmbedWithFiles(delivery, botToken, threadId, {
                image: { url: `attachment://${filename}` },
                color,
                footer: { text: buildFooterText({ agentName, agentModel, sessionId, projectName }) },
            }, [attachment]);
        } catch (err) {
            log.warn('Failed to send image to Discord thread', { imageUrl, error: err instanceof Error ? err.message : String(err) });
        }
    };

    const callback: EventCallback = (_sid, event) => {
        if (event.type === 'assistant' && event.message) {
            const msg = event.message as { content?: unknown };
            const contentBlocks = msg.content as string | import('../process/types').ContentBlock[] | undefined;
            const content = extractContentText(contentBlocks);

            if (content) {
                receivedAnyContent = true;
                receivedAnyActivity = true;
                buffer += content;
                if (debounceTimer) clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => flush(), 1500);
            }

            // Send any image content blocks as file attachments
            const imageUrls = extractContentImageUrls(contentBlocks);
            for (const imageUrl of imageUrls) {
                receivedAnyContent = true;
                receivedAnyActivity = true;
                sendThreadImageUrl(imageUrl);
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
            receivedAnyActivity = true;
            const now = Date.now();
            if (now - lastStatusTime >= STATUS_DEBOUNCE_MS) {
                lastStatusTime = now;
                sendEmbed(delivery, botToken, threadId, {
                    description: `⏳ ${event.statusMessage}`,
                    color: 0x95a5a6,
                    footer: { text: buildFooterText({ agentName, agentModel, sessionId, projectName, status: 'working...' }) },
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

        if (event.type === 'context_warning') {
            const warning = event as { level?: string; message?: string; usagePercent?: number };
            if (warning.level === 'critical') {
                sendEmbed(delivery, botToken, threadId, {
                    description: `⚠️ ${warning.message || `Context usage at ${warning.usagePercent}%`}`,
                    color: 0xf0b232, // yellow/warning
                    footer: { text: buildFooterText({ agentName, agentModel, sessionId, projectName, status: 'context warning' }) },
                }).catch((err) => {
                    log.debug('Context warning embed failed', { threadId, error: err instanceof Error ? err.message : String(err) });
                });
            }
        }

        if (event.type === 'result') {
            clearTyping();
            if (debounceTimer) clearTimeout(debounceTimer);
            flush();
            processManager.unsubscribe(sessionId, callback);
            threadCallbacks.delete(threadId);

            // Gather stats and send completion embed (async, fire-and-forget)
            (async () => {
                const fields: Array<{ name: string; value: string; inline?: boolean }> = [];
                let statsTurns = 0;
                let statsFiles = 0;
                let statsCommits = 0;
                let statsTools = 0;
                try {
                    const row = db.query<{
                        total_turns: number;
                        work_dir: string | null;
                        created_at: string;
                    }, [string]>(
                        'SELECT total_turns, work_dir, created_at FROM sessions WHERE id = ?',
                    ).get(sessionId);

                    // Fetch tool call count from session_metrics
                    const metricsRow = db.query<{ tool_call_count: number }, [string]>(
                        'SELECT tool_call_count FROM session_metrics WHERE session_id = ? ORDER BY created_at DESC LIMIT 1',
                    ).get(sessionId);
                    if (metricsRow) {
                        statsTools = metricsRow.tool_call_count;
                    }

                    if (row) {
                        // Duration — normalizeTimestamp appends Z so JS parses SQLite UTC correctly
                        const createdAt = normalizeTimestamp(row.created_at);
                        const startMs = new Date(createdAt).getTime();
                        const durationMs = Date.now() - startMs;
                        fields.push({ name: 'Duration', value: formatDuration(durationMs), inline: true });

                        // Turns
                        statsTurns = row.total_turns;
                        if (row.total_turns > 0) {
                            fields.push({ name: 'Turns', value: String(row.total_turns), inline: true });
                        }

                        // Tool calls
                        if (statsTools > 0) {
                            fields.push({ name: 'Tool Calls', value: String(statsTools), inline: true });
                        }

                        // Worktree branch + git stats
                        if (row.work_dir) {
                            const branchMatch = row.work_dir.match(/\/([^/]+)$/);
                            const branch = branchMatch ? branchMatch[1] : row.work_dir;
                            fields.push({ name: 'Branch', value: `\`${branch}\``, inline: true });

                            // Gather git stats from worktree
                            try {
                                const [filesOutput, commitsOutput] = await Promise.all([
                                    (async () => {
                                        const p = Bun.spawn(['git', 'diff', 'main...HEAD', '--name-only'], { cwd: row.work_dir!, stdout: 'pipe', stderr: 'pipe' });
                                        const out = await new Response(p.stdout).text();
                                        const code = await p.exited;
                                        return code === 0 ? out.trim() : '';
                                    })(),
                                    (async () => {
                                        const p = Bun.spawn(['git', 'rev-list', '--count', 'main...HEAD'], { cwd: row.work_dir!, stdout: 'pipe', stderr: 'pipe' });
                                        const out = await new Response(p.stdout).text();
                                        const code = await p.exited;
                                        return code === 0 ? out.trim() : '';
                                    })(),
                                ]);

                                statsFiles = filesOutput ? filesOutput.split('\n').length : 0;
                                if (statsFiles > 0) {
                                    fields.push({ name: 'Files Changed', value: String(statsFiles), inline: true });
                                }

                                statsCommits = parseInt(commitsOutput, 10) || 0;
                                if (statsCommits > 0) {
                                    fields.push({ name: 'Commits', value: String(statsCommits), inline: true });
                                }
                            } catch (gitErr) {
                                log.debug('Failed to gather git stats for completion embed', {
                                    sessionId,
                                    error: gitErr instanceof Error ? gitErr.message : String(gitErr),
                                });
                            }
                        }
                    }
                } catch (err) {
                    log.debug('Failed to fetch session stats for completion embed', {
                        sessionId,
                        error: err instanceof Error ? err.message : String(err),
                    });
                }

                const footerCtx = { agentName, agentModel, sessionId, projectName, status: 'done' };
                const footerStats = { filesChanged: statsFiles, turns: statsTurns, tools: statsTools, commits: statsCommits };
                await sendEmbedWithButtons(delivery, botToken, threadId, {
                    description: 'Session complete. Send a message to continue the conversation.',
                    color: 0x57f287,
                    ...(fields.length > 0 ? { fields } : {}),
                    footer: { text: buildFooterWithStats(footerCtx, footerStats) },
                }, [
                    buildActionRow(
                        { label: 'Continue', customId: 'resume_thread', style: ButtonStyle.SUCCESS, emoji: '💬' },
                        { label: 'Archive Thread', customId: 'archive_thread', style: ButtonStyle.SECONDARY, emoji: '📦' },
                    ),
                ]);
            })().catch((err) => {
                log.debug('Session complete embed failed', { threadId, error: err instanceof Error ? err.message : String(err) });
            });
        }

        if (event.type === 'session_error') {
            clearTyping();
            if (sentErrorMessage) return; // dedup: only show one error per session lifecycle
            sentErrorMessage = true;

            const errEvent = event as { error?: { message?: string; errorType?: string; recoverable?: boolean } };
            const errorType = errEvent.error?.errorType || 'unknown';

            // Differentiated messages per error type
            let description: string;
            let title: string;
            let color: number;
            switch (errorType) {
                case 'context_exhausted':
                    title = 'Context Limit Reached';
                    description = 'The conversation ran out of context space. The session will restart with fresh context — send a message to continue.';
                    color = 0xf0b232; // yellow/warning
                    break;
                case 'credits_exhausted':
                    title = 'Credits Exhausted';
                    description = 'Session paused — credits have been used up. Add credits to resume.';
                    color = 0xf0b232;
                    break;
                case 'crash':
                    title = 'Session Crashed';
                    description = 'The agent session crashed unexpectedly. Send a message or press Resume to restart.';
                    color = 0xff3355;
                    break;
                case 'spawn_error':
                    title = 'Failed to Start';
                    description = 'The agent session could not be started. This may be a configuration issue.';
                    color = 0xff3355;
                    break;
                default:
                    title = 'Session Error';
                    description = (errEvent.error?.message || 'An unexpected error occurred.').slice(0, 4096);
                    color = 0xff3355;
                    break;
            }

            sendEmbedWithButtons(delivery, botToken, threadId, {
                title,
                description,
                color,
                footer: { text: buildFooterText({ agentName, agentModel, sessionId, projectName, status: errorType }) },
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
            processManager.unsubscribe(sessionId, callback);
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
    onBotMessage?: (botMessageId: string) => void,
    projectName?: string,
    displayColor?: string | null,
): void {
    let buffer = '';
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let receivedAnyContent = false;
    const TYPING_REFRESH_MS = 8000;
    const TYPING_TIMEOUT_MS = 4 * 60 * 1000; // 4 minute safety timeout
    let receivedAnyActivity = false; // tracks any activity (content OR tool use)
    const color = hexColorToInt(displayColor) ?? agentColor(agentName);

    // Keep typing indicator alive continuously until response completes
    const typingInterval = setInterval(() => {
        // Check if the process is still alive
        if (!processManager.isRunning(sessionId)) {
            clearTyping();
            log.warn('Process died while typing indicator active (inline)', { sessionId, channelId });
            if (!receivedAnyContent) {
                sendEmbed(delivery, botToken, channelId, {
                    description: 'The agent session ended unexpectedly. Send a message to start a new session.',
                    color: 0xff3355,
                }).catch((err) => {
                    log.warn('Failed to send crash embed', { channelId, error: err instanceof Error ? err.message : String(err) });
                });
            }
            return;
        }
        sendTypingIndicator(botToken, channelId).catch((err) => {
            log.debug('Typing indicator failed (inline)', { channelId, error: err instanceof Error ? err.message : String(err) });
        });
    }, TYPING_REFRESH_MS);

    // Safety timeout: clear typing if no terminal event arrives
    const typingSafetyTimeout = setTimeout(() => {
        clearInterval(typingInterval);
        log.warn('Typing indicator safety timeout reached (inline)', { sessionId, channelId });
        if (!receivedAnyActivity) {
            sendEmbed(delivery, botToken, channelId, {
                description: 'The agent appears to be taking too long. It may still be working \u2014 send a message to check.',
                color: 0xf0b232,
            }).catch((err) => {
                log.warn('Failed to send timeout embed', { channelId, error: err instanceof Error ? err.message : String(err) });
            });
        }
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
            let sentId: string | null = null;
            const embedPayload = {
                description: parts[i],
                color,
                footer: { text: buildFooterText({ agentName, agentModel, sessionId, projectName }) },
            };
            if (i === 0) {
                sentId = await sendReplyEmbed(delivery, botToken, channelId, replyToMessageId, embedPayload);
                // Fall back to non-reply if the referenced message no longer exists
                if (!sentId) {
                    log.debug('Reply embed failed, falling back to non-reply send', { channelId, replyToMessageId });
                    sentId = await sendEmbed(delivery, botToken, channelId, embedPayload);
                }
            } else {
                sentId = await sendEmbed(delivery, botToken, channelId, embedPayload);
            }
            if (sentId && onBotMessage) {
                onBotMessage(sentId);
            }
        }
    };

    const inlineCallback: EventCallback = (_sid, event) => {
        if (event.type === 'assistant' && event.message) {
            const msg = event.message as { content?: unknown };
            const content = extractContentText(msg.content as string | import('../process/types').ContentBlock[] | undefined);
            if (content) {
                receivedAnyContent = true;
                receivedAnyActivity = true;
                buffer += content;
                if (debounceTimer) clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => flush(), 1500);
            }
        }

        if (event.type === 'tool_status') {
            receivedAnyActivity = true;
        }

        if (event.type === 'result') {
            clearTyping();
            if (debounceTimer) clearTimeout(debounceTimer);
            flush();
            processManager.unsubscribe(sessionId, inlineCallback);
        }

        if (event.type === 'session_error' || event.type === 'session_exited') {
            clearTyping();
            processManager.unsubscribe(sessionId, inlineCallback);
        }
    };

    processManager.subscribe(sessionId, inlineCallback);
}

/**
 * Subscribe for agent response with adaptive UX:
 * - Starts lightweight (typing indicator only, like subscribeForInlineResponse)
 * - If a tool_status event fires (meaning actual work is happening), upgrades
 *   to a progress embed that edits in-place with tool status updates
 * - Quick conversational replies never see a progress embed
 */
export function subscribeForAdaptiveInlineResponse(
    processManager: ProcessManager,
    delivery: DeliveryTracker,
    botToken: string,
    sessionId: string,
    channelId: string,
    replyToMessageId: string,
    agentName: string,
    agentModel: string,
    onBotMessage?: (botMessageId: string) => void,
    projectName?: string,
    displayColor?: string | null,
): void {
    let buffer = '';
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let receivedAnyContent = false;
    let lastStatusTime = 0;
    const STATUS_DEBOUNCE_MS = 3000;
    const TYPING_REFRESH_MS = 8000;
    const TYPING_TIMEOUT_MS = 4 * 60 * 1000;
    let receivedAnyActivity = false;
    const color = hexColorToInt(displayColor) ?? agentColor(agentName);

    // Progress embed state — only created when tool use is detected
    let progressMessageId: string | null = null;
    let progressMode = false;

    // Keep typing indicator alive continuously until response completes
    const typingInterval = setInterval(() => {
        if (!processManager.isRunning(sessionId)) {
            clearTyping();
            log.warn('Process died while typing indicator active (adaptive)', { sessionId, channelId });
            if (!receivedAnyContent) {
                sendEmbed(delivery, botToken, channelId, {
                    description: 'The agent session ended unexpectedly. Send a message to start a new session.',
                    color: 0xff3355,
                }).catch((err) => {
                    log.warn('Failed to send crash embed', { channelId, error: err instanceof Error ? err.message : String(err) });
                });
            }
            return;
        }
        sendTypingIndicator(botToken, channelId).catch((err) => {
            log.debug('Typing indicator failed (adaptive)', { channelId, error: err instanceof Error ? err.message : String(err) });
        });
    }, TYPING_REFRESH_MS);

    const typingSafetyTimeout = setTimeout(() => {
        clearInterval(typingInterval);
        log.warn('Typing indicator safety timeout reached (adaptive)', { sessionId, channelId });
        if (!receivedAnyActivity) {
            sendEmbed(delivery, botToken, channelId, {
                description: 'The agent appears to be taking too long. It may still be working \u2014 send a message to check.',
                color: 0xf0b232,
            }).catch((err) => {
                log.warn('Failed to send timeout embed', { channelId, error: err instanceof Error ? err.message : String(err) });
            });
        }
    }, TYPING_TIMEOUT_MS);

    const clearTyping = () => {
        clearInterval(typingInterval);
        clearTimeout(typingSafetyTimeout);
    };

    const flush = async () => {
        if (!buffer) return;
        const text = buffer;
        buffer = '';

        const parts = splitEmbedDescription(text);
        for (let i = 0; i < parts.length; i++) {
            let sentId: string | null = null;
            const embedPayload = {
                description: parts[i],
                color,
                footer: { text: buildFooterText({ agentName, agentModel, sessionId, projectName }) },
            };
            if (i === 0) {
                sentId = await sendReplyEmbed(delivery, botToken, channelId, replyToMessageId, embedPayload);
                // Fall back to non-reply if the referenced message no longer exists
                if (!sentId) {
                    log.debug('Reply embed failed, falling back to non-reply send', { channelId, replyToMessageId });
                    sentId = await sendEmbed(delivery, botToken, channelId, embedPayload);
                }
            } else {
                sentId = await sendEmbed(delivery, botToken, channelId, embedPayload);
            }
            if (sentId && onBotMessage) {
                onBotMessage(sentId);
            }
        }
    };

    /** Upgrade to progress mode — post the progress embed on first tool use. */
    const upgradeToProgressMode = () => {
        if (progressMode) return;
        progressMode = true;
        sendEmbed(delivery, botToken, channelId, {
            description: 'Working on your request...',
            color: 0x5865f2,
            footer: { text: buildFooterText({ agentName, agentModel, sessionId, projectName, status: 'starting...' }) },
        }).then((msgId) => {
            progressMessageId = msgId;
        }).catch((err) => {
            log.debug('Failed to send progress embed', { channelId, error: err instanceof Error ? err.message : String(err) });
        });
    };

    /** Download an image from a URL and send it as a Discord file attachment. */
    const sendImageUrl = async (imageUrl: string) => {
        try {
            const resp = await fetch(imageUrl);
            if (!resp.ok) {
                log.warn('Failed to fetch image for Discord', { imageUrl, status: resp.status });
                return;
            }
            const data = new Uint8Array(await resp.arrayBuffer());
            const ct = resp.headers.get('content-type') ?? 'image/png';
            const ext = ct.includes('jpeg') || ct.includes('jpg') ? 'jpg' : ct.includes('gif') ? 'gif' : ct.includes('webp') ? 'webp' : 'png';
            const filename = `image.${ext}`;
            const attachment: DiscordFileAttachment = { name: filename, data, contentType: ct };
            await sendEmbedWithFiles(delivery, botToken, channelId, {
                image: { url: `attachment://${filename}` },
                color,
                footer: { text: buildFooterText({ agentName, agentModel, sessionId, projectName }) },
            }, [attachment]);
        } catch (err) {
            log.warn('Failed to send image to Discord', { imageUrl, error: err instanceof Error ? err.message : String(err) });
        }
    };

    const adaptiveCallback: EventCallback = (_sid, event) => {
        if (event.type === 'assistant' && event.message) {
            const msg = event.message as { content?: unknown };
            const contentBlocks = msg.content as string | import('../process/types').ContentBlock[] | undefined;
            const content = extractContentText(contentBlocks);
            if (content) {
                receivedAnyContent = true;
                receivedAnyActivity = true;
                buffer += content;
                if (debounceTimer) clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => flush(), 1500);
            }

            // Send any image content blocks as file attachments
            const imageUrls = extractContentImageUrls(contentBlocks);
            for (const imageUrl of imageUrls) {
                receivedAnyContent = true;
                receivedAnyActivity = true;
                sendImageUrl(imageUrl);
            }
        }

        if (event.type === 'tool_status' && event.statusMessage) {
            receivedAnyActivity = true;
            // Upgrade to progress mode on first tool use
            upgradeToProgressMode();
            const now = Date.now();
            if (now - lastStatusTime >= STATUS_DEBOUNCE_MS && progressMessageId) {
                lastStatusTime = now;
                editEmbed(delivery, botToken, channelId, progressMessageId, {
                    description: `\u23f3 ${event.statusMessage}`,
                    color: 0x5865f2,
                    footer: { text: buildFooterText({ agentName, agentModel, sessionId, projectName, status: 'working...' }) },
                }).catch((err) => {
                    log.debug('Progress embed edit failed', { channelId, error: err instanceof Error ? err.message : String(err) });
                });
            }
        }

        if (event.type === 'result') {
            clearTyping();
            if (debounceTimer) clearTimeout(debounceTimer);
            flush().then(() => {
                // Only mark progress embed as done if we upgraded to progress mode
                if (progressMode && progressMessageId) {
                    editEmbed(delivery, botToken, channelId, progressMessageId, {
                        description: '\u2705 Done',
                        color: 0x57f287,
                        footer: { text: buildFooterText({ agentName, agentModel, sessionId, projectName, status: 'done' }) },
                    }).catch((err) => {
                        log.debug('Final progress embed edit failed', { channelId, error: err instanceof Error ? err.message : String(err) });
                    });
                }
            }).catch((err) => {
                log.debug('Final flush failed', { channelId, error: err instanceof Error ? err.message : String(err) });
            });
            processManager.unsubscribe(sessionId, adaptiveCallback);
        }

        if (event.type === 'session_error') {
            clearTyping();
            if (debounceTimer) clearTimeout(debounceTimer);
            // Flush any buffered content before showing the error
            flush().catch(() => {});

            const errEvent = event as { error?: { message?: string; errorType?: string } };
            const errorType = errEvent.error?.errorType || 'unknown';

            let title: string;
            let description: string;
            let errColor: number;
            switch (errorType) {
                case 'context_exhausted':
                    title = 'Context Limit Reached';
                    description = 'The conversation ran out of context space. Send a message to start a new session.';
                    errColor = 0xf0b232;
                    break;
                case 'credits_exhausted':
                    title = 'Credits Exhausted';
                    description = 'Session paused — credits have been used up. Add credits to resume.';
                    errColor = 0xf0b232;
                    break;
                case 'spawn_error':
                    title = 'Failed to Start';
                    description = 'The agent session could not be started. This may be a configuration issue.';
                    errColor = 0xff3355;
                    break;
                default:
                    title = 'Session Error';
                    description = (errEvent.error?.message || 'An unexpected error occurred.').slice(0, 4096);
                    errColor = 0xff3355;
                    break;
            }

            // If we have a progress embed, update it with the error; otherwise send a new one
            if (progressMode && progressMessageId) {
                editEmbed(delivery, botToken, channelId, progressMessageId, {
                    title,
                    description,
                    color: errColor,
                    footer: { text: buildFooterText({ agentName, agentModel, sessionId, projectName, status: errorType }) },
                }).catch((err) => {
                    log.debug('Error embed edit failed', { channelId, error: err instanceof Error ? err.message : String(err) });
                });
            } else {
                sendEmbed(delivery, botToken, channelId, {
                    title,
                    description,
                    color: errColor,
                    footer: { text: buildFooterText({ agentName, agentModel, sessionId, projectName, status: errorType }) },
                }).catch((err) => {
                    log.debug('Error embed send failed', { channelId, error: err instanceof Error ? err.message : String(err) });
                });
            }

            processManager.unsubscribe(sessionId, adaptiveCallback);
        }

        if (event.type === 'session_exited') {
            clearTyping();
            if (debounceTimer) clearTimeout(debounceTimer);
            flush().catch(() => {});
            processManager.unsubscribe(sessionId, adaptiveCallback);
        }
    };

    processManager.subscribe(sessionId, adaptiveCallback);
}

/**
 * Subscribe for agent response with an edit-in-place progress message.
 * Posts one progress embed, edits it with tool status updates, then posts
 * the final response as a new reply — reducing message spam for @mentions.
 */
export function subscribeForInlineProgressResponse(
    processManager: ProcessManager,
    delivery: DeliveryTracker,
    botToken: string,
    sessionId: string,
    channelId: string,
    replyToMessageId: string,
    agentName: string,
    agentModel: string,
    onBotMessage?: (botMessageId: string) => void,
    projectName?: string,
    displayColor?: string | null,
): void {
    let buffer = '';
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let receivedAnyContent = false;
    let lastStatusTime = 0;
    const STATUS_DEBOUNCE_MS = 3000;
    const TYPING_REFRESH_MS = 8000;
    const TYPING_TIMEOUT_MS = 4 * 60 * 1000; // 4 minute safety timeout
    let receivedAnyActivity = false;
    const color = hexColorToInt(displayColor) ?? agentColor(agentName);
    let progressMessageId: string | null = null;

    // Post the initial progress embed immediately
    sendEmbed(delivery, botToken, channelId, {
        description: 'Working on your request...',
        color: 0x5865f2, // blurple
        footer: { text: buildFooterText({ agentName, agentModel, sessionId, projectName, status: 'starting...' }) },
    }).then((msgId) => {
        progressMessageId = msgId;
    }).catch((err) => {
        log.debug('Failed to send initial progress embed', { channelId, error: err instanceof Error ? err.message : String(err) });
    });

    // Keep typing indicator alive continuously until response completes
    const typingInterval = setInterval(() => {
        if (!processManager.isRunning(sessionId)) {
            clearTyping();
            log.warn('Process died while typing indicator active (inline-progress)', { sessionId, channelId });
            if (!receivedAnyContent) {
                sendEmbed(delivery, botToken, channelId, {
                    description: 'The agent session ended unexpectedly. Send a message to start a new session.',
                    color: 0xff3355,
                }).catch((err) => {
                    log.warn('Failed to send crash embed', { channelId, error: err instanceof Error ? err.message : String(err) });
                });
            }
            return;
        }
        sendTypingIndicator(botToken, channelId).catch((err) => {
            log.debug('Typing indicator failed (inline-progress)', { channelId, error: err instanceof Error ? err.message : String(err) });
        });
    }, TYPING_REFRESH_MS);

    // Safety timeout: clear typing if no terminal event arrives
    const typingSafetyTimeout = setTimeout(() => {
        clearInterval(typingInterval);
        log.warn('Typing indicator safety timeout reached (inline-progress)', { sessionId, channelId });
        if (!receivedAnyActivity) {
            sendEmbed(delivery, botToken, channelId, {
                description: 'The agent appears to be taking too long. It may still be working \u2014 send a message to check.',
                color: 0xf0b232,
            }).catch((err) => {
                log.warn('Failed to send timeout embed', { channelId, error: err instanceof Error ? err.message : String(err) });
            });
        }
    }, TYPING_TIMEOUT_MS);

    const clearTyping = () => {
        clearInterval(typingInterval);
        clearTimeout(typingSafetyTimeout);
    };

    const flush = async () => {
        if (!buffer) return;
        const text = buffer;
        buffer = '';

        const parts = splitEmbedDescription(text);
        for (let i = 0; i < parts.length; i++) {
            let sentId: string | null = null;
            const embedPayload = {
                description: parts[i],
                color,
                footer: { text: buildFooterText({ agentName, agentModel, sessionId, projectName }) },
            };
            if (i === 0) {
                sentId = await sendReplyEmbed(delivery, botToken, channelId, replyToMessageId, embedPayload);
                // Fall back to non-reply if the referenced message no longer exists
                if (!sentId) {
                    log.debug('Reply embed failed, falling back to non-reply send', { channelId, replyToMessageId });
                    sentId = await sendEmbed(delivery, botToken, channelId, embedPayload);
                }
            } else {
                sentId = await sendEmbed(delivery, botToken, channelId, embedPayload);
            }
            if (sentId && onBotMessage) {
                onBotMessage(sentId);
            }
        }
    };

    /** Download an image URL and send as a Discord file attachment. */
    const sendProgressImageUrl = async (imageUrl: string) => {
        try {
            const resp = await fetch(imageUrl);
            if (!resp.ok) {
                log.warn('Failed to fetch image for Discord (progress)', { imageUrl, status: resp.status });
                return;
            }
            const data = new Uint8Array(await resp.arrayBuffer());
            const ct = resp.headers.get('content-type') ?? 'image/png';
            const ext = ct.includes('jpeg') || ct.includes('jpg') ? 'jpg' : ct.includes('gif') ? 'gif' : ct.includes('webp') ? 'webp' : 'png';
            const filename = `image.${ext}`;
            const attachment: DiscordFileAttachment = { name: filename, data, contentType: ct };
            await sendEmbedWithFiles(delivery, botToken, channelId, {
                image: { url: `attachment://${filename}` },
                color,
                footer: { text: buildFooterText({ agentName, agentModel, sessionId, projectName }) },
            }, [attachment]);
        } catch (err) {
            log.warn('Failed to send image to Discord (progress)', { imageUrl, error: err instanceof Error ? err.message : String(err) });
        }
    };

    const progressCallback: EventCallback = (_sid, event) => {
        if (event.type === 'assistant' && event.message) {
            const msg = event.message as { content?: unknown };
            const contentBlocks = msg.content as string | import('../process/types').ContentBlock[] | undefined;
            const content = extractContentText(contentBlocks);
            if (content) {
                receivedAnyContent = true;
                receivedAnyActivity = true;
                buffer += content;
                if (debounceTimer) clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => flush(), 1500);
            }

            // Send any image content blocks as file attachments
            const imageUrls = extractContentImageUrls(contentBlocks);
            for (const imageUrl of imageUrls) {
                receivedAnyContent = true;
                receivedAnyActivity = true;
                sendProgressImageUrl(imageUrl);
            }
        }

        if (event.type === 'tool_status' && event.statusMessage) {
            receivedAnyActivity = true;
            const now = Date.now();
            if (now - lastStatusTime >= STATUS_DEBOUNCE_MS && progressMessageId) {
                lastStatusTime = now;
                editEmbed(delivery, botToken, channelId, progressMessageId, {
                    description: `\u23f3 ${event.statusMessage}`,
                    color: 0x5865f2,
                    footer: { text: buildFooterText({ agentName, agentModel, sessionId, projectName, status: 'working...' }) },
                }).catch((err) => {
                    log.debug('Progress embed edit failed', { channelId, error: err instanceof Error ? err.message : String(err) });
                });
            }
        }

        if (event.type === 'result') {
            clearTyping();
            if (debounceTimer) clearTimeout(debounceTimer);
            flush().then(() => {
                // Mark progress embed as done
                if (progressMessageId) {
                    editEmbed(delivery, botToken, channelId, progressMessageId, {
                        description: '\u2705 Done',
                        color: 0x57f287, // green
                        footer: { text: buildFooterText({ agentName, agentModel, sessionId, projectName, status: 'done' }) },
                    }).catch((err) => {
                        log.debug('Final progress embed edit failed', { channelId, error: err instanceof Error ? err.message : String(err) });
                    });
                }
            }).catch((err) => {
                log.debug('Final flush failed', { channelId, error: err instanceof Error ? err.message : String(err) });
            });
            processManager.unsubscribe(sessionId, progressCallback);
        }

        if (event.type === 'session_error' || event.type === 'session_exited') {
            clearTyping();
            processManager.unsubscribe(sessionId, progressCallback);
        }
    };

    processManager.subscribe(sessionId, progressCallback);
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
            `SELECT s.id, s.name, a.name as agent_name, a.model as agent_model, a.display_color, p.name as project_name
             FROM sessions s
             LEFT JOIN agents a ON a.id = s.agent_id
             LEFT JOIN projects p ON p.id = s.project_id
             WHERE s.source = 'discord' AND s.status = 'running'
               AND s.name LIKE 'Discord thread:%'`,
        ).all() as { id: string; name: string; agent_name: string; agent_model: string; display_color: string | null; project_name: string | null }[];

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
                    projectName: row.project_name || undefined,
                    displayColor: row.display_color ?? undefined,
                });
            }

            subscribeForResponseWithEmbed(
                processManager, delivery, botToken, db, threadCallbacks,
                row.id, threadId, row.agent_name || 'Agent', row.agent_model || 'unknown',
                row.project_name || undefined,
                row.display_color,
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

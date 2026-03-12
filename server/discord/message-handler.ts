/**
 * Discord message routing and handling.
 *
 * Dispatches incoming Discord messages to the appropriate handler:
 * thread routing, work intake, or mention replies.
 */

import type { Database } from 'bun:sqlite';
import type { SessionSource } from '../../shared/types';
import type { ProcessManager } from '../process/manager';
import type { WorkTaskService } from '../work/service';
import type { DiscordBridgeConfig, DiscordMessageData } from './types';
import type { DeliveryTracker } from '../lib/delivery-tracker';
import { ButtonStyle } from './types';
import { listAgents } from '../db/agents';
import { createSession, getSession } from '../db/sessions';
import { listProjects } from '../db/projects';
import { scanForInjection } from '../lib/prompt-injection';
import { recordAudit } from '../db/audit';
import { updateDiscordConfig } from '../db/discord-config';
import { createLogger } from '../lib/logger';
import {
    sendEmbed,
    sendMessageWithEmbed,
    sendEmbedWithButtons,
    sendDiscordMessage,
    sendTypingIndicator,
    buildActionRow,
} from './embeds';
import { resolvePermissionLevel, checkRateLimit, isMonitoredChannel } from './permissions';
import type { ThreadSessionInfo, ThreadCallbackInfo } from './thread-manager';
import {
    tryRecoverThread,
    subscribeForResponseWithEmbed,
    subscribeForInlineResponse,
    resolveDefaultAgent,
} from './thread-manager';

const log = createLogger('DiscordMessageHandler');

/** Replace Discord mention IDs with @username before stripping unresolved mentions.
 *  Mentions matching botUserId are stripped entirely (they're just trigger mentions). */
function resolveMentions(text: string, mentions?: Array<{ id: string; username: string }>, botUserId?: string | null): string {
    let resolved = text;
    for (const mention of mentions ?? []) {
        if (mention.id === botUserId) continue; // bot mention stripped below
        resolved = resolved.replace(new RegExp(`<@!?${mention.id}>`, 'g'), `@${mention.username}`);
    }
    // Strip bot mention and any remaining unresolved mention IDs
    return resolved.replace(/<@!?\d+>/g, '').trim();
}

/** Context needed by the message handler to access bridge state. */
export interface MessageHandlerContext {
    db: Database;
    config: DiscordBridgeConfig;
    processManager: ProcessManager;
    workTaskService: WorkTaskService | null;
    delivery: DeliveryTracker;
    botUserId: string | null;
    mutedUsers: Set<string>;
    interactedUsers: Set<string>;
    userMessageTimestamps: Map<string, number[]>;
    rateLimitWindowMs: number;
    rateLimitMaxMessages: number;
    threadSessions: Map<string, ThreadSessionInfo>;
    threadCallbacks: Map<string, ThreadCallbackInfo>;
    threadLastActivity: Map<string, number>;
}

export async function handleMessage(ctx: MessageHandlerContext, data: DiscordMessageData): Promise<void> {
    // Ignore bot messages
    if (data.author.bot) return;

    const text = data.content;
    if (!text) return;

    const userId = data.author.id;
    const channelId = data.channel_id;

    // Check if this message is in a thread we're tracking or a monitored channel
    const isMonitored = isMonitoredChannel(ctx.config, channelId);
    let isOurThread = ctx.threadSessions.has(channelId);
    // Try to recover thread from DB if not in memory (e.g. after server restart)
    if (!isOurThread && !isMonitored) {
        isOurThread = tryRecoverThread(ctx.db, ctx.threadSessions, channelId) !== null;
    }
    if (!isMonitored && !isOurThread) return;

    // Resolve permission level
    const permLevel = resolvePermissionLevel(ctx.config, ctx.mutedUsers, userId, data.member?.roles);
    if (permLevel <= 0) {
        log.warn('Blocked Discord user', { userId, username: data.author.username, permLevel });
        await sendDiscordMessage(ctx.delivery, ctx.config.botToken, channelId, 'You do not have permission to interact with this bot.');
        return;
    }

    // Per-user rate limiting with tiered limits
    if (!checkRateLimit(ctx.config, ctx.userMessageTimestamps, userId, ctx.rateLimitWindowMs, ctx.rateLimitMaxMessages, permLevel)) {
        await sendDiscordMessage(ctx.delivery, ctx.config.botToken, channelId, 'Slow down! Please wait before sending more messages.');
        return;
    }

    // Prompt injection scan
    const injectionResult = scanForInjection(text);
    if (injectionResult.blocked) {
        log.warn('Blocked message: prompt injection detected', {
            userId,
            username: data.author.username,
            confidence: injectionResult.confidence,
            patterns: injectionResult.matches.map((m) => m.pattern),
            contentPreview: text.slice(0, 100),
        });
        recordAudit(
            ctx.db,
            'injection_blocked',
            userId,
            'discord_message',
            null,
            JSON.stringify({
                channel: 'discord',
                confidence: injectionResult.confidence,
                patterns: injectionResult.matches.map((m) => m.pattern),
                contentPreview: text.slice(0, 200),
            }),
        );
        await sendDiscordMessage(ctx.delivery, ctx.config.botToken, channelId, 'Message blocked: content policy violation.');
        return;
    }

    // If this message is in a thread we're tracking, route to that thread's session
    if (isOurThread) {
        sendFirstInteractionTip(ctx, userId, channelId);
        sendTypingIndicator(ctx.config.botToken, channelId).catch((err) => log.debug('Typing indicator failed', { error: err instanceof Error ? err.message : String(err) }));
        await routeToThread(ctx, channelId, userId, text);
        return;
    }

    // Passive channel mode: only respond to @mentions in the main channel.
    // Check direct user mentions AND role mentions (users often tag the bot role).
    const isBotUserMentioned = ctx.botUserId
        ? data.mentions?.some(m => m.id === ctx.botUserId) ?? false
        : false;
    // Bot's managed role has a different snowflake than botUserId, so we check
    // if ANY role was mentioned. This is intentional — if someone tags a role
    // in a monitored channel, they likely want the bot to respond.
    const hasRoleMention = (data.mention_roles?.length ?? 0) > 0;
    const isBotMentioned = isBotUserMentioned || hasRoleMention;

    if (!isBotMentioned) {
        log.debug('Message in monitored channel without bot mention', {
            channelId, userId, isBotUserMentioned, hasRoleMention,
            textPreview: text.slice(0, 50),
        });
        return;
    }

    sendFirstInteractionTip(ctx, userId, channelId);
    sendTypingIndicator(ctx.config.botToken, channelId).catch((err) => log.debug('Typing indicator failed', { error: err instanceof Error ? err.message : String(err) }));

    const mode = ctx.config.mode ?? 'chat';
    if (mode === 'work_intake') {
        await handleWorkIntake(ctx, channelId, data.id, userId, text, data.mentions);
    } else {
        await handleMentionReply(ctx, channelId, userId, data.id, text, data.mentions);
    }
}

function sendFirstInteractionTip(ctx: MessageHandlerContext, userId: string, channelId: string): void {
    if (ctx.interactedUsers.has(userId)) return;
    ctx.interactedUsers.add(userId);
    // Persist to DB so the tip survives restarts
    try {
        updateDiscordConfig(ctx.db, 'interacted_users', [...ctx.interactedUsers].join(','));
    } catch (err) {
        log.warn('Failed to persist interacted users', {
            error: err instanceof Error ? err.message : String(err),
        });
    }
    sendEmbed(ctx.delivery, ctx.config.botToken, channelId, {
        description: [
            `Hey <@${userId}>! Looks like your first time here.`,
            '',
            'Use `/quickstart` for a guided walkthrough, or `/help` to see all commands.',
            'You can also @mention me for a quick reply!',
        ].join('\n'),
        color: 0x57f287,
        footer: { text: 'This tip only appears once' },
    }).catch((err) => log.debug('First-interaction tip failed', { error: err instanceof Error ? err.message : String(err) }));
}

async function handleWorkIntake(
    ctx: MessageHandlerContext,
    channelId: string,
    messageId: string,
    userId: string,
    text: string,
    mentions?: Array<{ id: string; username: string }>,
): Promise<void> {
    if (!ctx.workTaskService) {
        await sendDiscordMessage(ctx.delivery, ctx.config.botToken, channelId, 'Work intake mode requires WorkTaskService. Check server configuration.');
        return;
    }

    const description = resolveMentions(text, mentions, ctx.botUserId);
    if (!description) {
        await sendDiscordMessage(ctx.delivery, ctx.config.botToken, channelId, 'Please provide a task description.');
        return;
    }

    const agents = listAgents(ctx.db);
    const agent = ctx.config.defaultAgentId
        ? agents.find(a => a.id === ctx.config.defaultAgentId) ?? agents[0]
        : agents[0];
    if (!agent) {
        await sendDiscordMessage(ctx.delivery, ctx.config.botToken, channelId, 'No agents configured. Create an agent first.');
        return;
    }

    try {
        const task = await ctx.workTaskService.create({
            agentId: agent.id,
            description,
            source: 'discord',
            sourceId: messageId,
            requesterInfo: { discordUserId: userId, channelId, messageId },
        });

        log.info('Work task created from Discord', { taskId: task.id, userId });

        await sendEmbed(ctx.delivery, ctx.config.botToken, channelId, {
            title: 'Task Queued',
            description: `**${task.id}**\n\n${description.slice(0, 200)}${description.length > 200 ? '...' : ''}`,
            color: 0x5865f2,
            footer: { text: `Status: ${task.status}` },
        });

        ctx.workTaskService.onComplete(task.id, (completedTask) => {
            sendTaskResult(ctx, channelId, completedTask).catch(err => {
                log.error('Failed to send task result to Discord', {
                    taskId: completedTask.id,
                    error: err instanceof Error ? err.message : String(err),
                });
            });
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('Failed to create work task from Discord', { error: message, userId });

        await sendEmbed(ctx.delivery, ctx.config.botToken, channelId, {
            title: 'Task Failed',
            description: message.slice(0, 500),
            color: 0xed4245,
        });
    }
}

export async function sendTaskResult(
    ctx: MessageHandlerContext,
    channelId: string,
    task: import('../../shared/types/work-tasks').WorkTask,
    mentionUserId?: string,
): Promise<void> {
    const mention = mentionUserId ? `<@${mentionUserId}> ` : '';

    if (task.status === 'completed') {
        const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

        if (task.prUrl) {
            fields.push({ name: 'Pull Request', value: task.prUrl, inline: false });
        }
        if (task.summary) {
            fields.push({ name: 'Summary', value: task.summary.slice(0, 1024), inline: false });
        }
        if (task.branchName) {
            fields.push({ name: 'Branch', value: `\`${task.branchName}\``, inline: true });
        }
        fields.push({ name: 'Iterations', value: String(task.iterationCount), inline: true });

        await sendMessageWithEmbed(ctx.delivery, ctx.config.botToken, channelId, mention ? `${mention}Your work task is done!` : undefined, {
            title: 'Task Completed',
            description: task.description.slice(0, 300),
            color: 0x57f287,
            fields,
            footer: { text: `Task: ${task.id}` },
        });
    } else if (task.status === 'failed') {
        await sendMessageWithEmbed(ctx.delivery, ctx.config.botToken, channelId, mention ? `${mention}Your work task encountered an issue.` : undefined, {
            title: 'Task Failed',
            description: task.description.slice(0, 300),
            color: 0xed4245,
            fields: [
                ...(task.error
                    ? [{ name: 'Error', value: task.error.slice(0, 1024), inline: false }]
                    : []),
                { name: 'Iterations', value: String(task.iterationCount), inline: true },
            ],
            footer: { text: `Task: ${task.id}` },
        });
    }
}

async function handleMentionReply(ctx: MessageHandlerContext, channelId: string, _userId: string, messageId: string, text: string, mentions?: Array<{ id: string; username: string }>): Promise<void> {
    const agent = resolveDefaultAgent(ctx.db, ctx.config);
    if (!agent) {
        await sendDiscordMessage(ctx.delivery, ctx.config.botToken, channelId, 'No agents configured. Create an agent first.');
        return;
    }

    const projects = listProjects(ctx.db);
    const project = agent.defaultProjectId
        ? projects.find(p => p.id === agent.defaultProjectId) ?? projects[0]
        : projects[0];

    if (!project) {
        await sendDiscordMessage(ctx.delivery, ctx.config.botToken, channelId, 'No projects configured.');
        return;
    }

    const cleanText = resolveMentions(text, mentions, ctx.botUserId);
    if (!cleanText) return;

    const session = createSession(ctx.db, {
        projectId: project.id,
        agentId: agent.id,
        name: `Discord mention:${messageId}`,
        initialPrompt: cleanText,
        source: 'discord' as SessionSource,
    });

    ctx.processManager.startProcess(session, cleanText);

    subscribeForInlineResponse(
        ctx.processManager, ctx.delivery, ctx.config.botToken,
        session.id, channelId, messageId, agent.name, agent.model || 'unknown',
    );
}

async function routeToThread(ctx: MessageHandlerContext, threadId: string, _userId: string, text: string): Promise<void> {
    ctx.threadLastActivity.set(threadId, Date.now());

    let threadInfo = ctx.threadSessions.get(threadId);

    if (!threadInfo) {
        threadInfo = tryRecoverThread(ctx.db, ctx.threadSessions, threadId) ?? undefined;
        if (!threadInfo) return;
    }

    const { sessionId, agentName, agentModel } = threadInfo;

    const session = getSession(ctx.db, sessionId);
    if (!session) {
        ctx.threadSessions.delete(threadId);
        await sendEmbedWithButtons(ctx.delivery, ctx.config.botToken, threadId, {
            description: 'This conversation has ended.',
            color: 0x95a5a6,
        }, [
            buildActionRow(
                { label: 'New Session', customId: 'new_session', style: ButtonStyle.PRIMARY, emoji: '➕' },
            ),
        ]);
        return;
    }

    const sent = ctx.processManager.sendMessage(sessionId, text);
    if (!sent) {
        ctx.processManager.resumeProcess(session, text);
        subscribeForResponseWithEmbed(
            ctx.processManager, ctx.delivery, ctx.config.botToken,
            ctx.threadCallbacks, sessionId, threadId, agentName, agentModel,
        );
        return;
    }

    subscribeForResponseWithEmbed(
        ctx.processManager, ctx.delivery, ctx.config.botToken,
        ctx.threadCallbacks, sessionId, threadId, agentName, agentModel,
    );
}

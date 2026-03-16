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
import { createWorktree, generateChatBranchName } from '../lib/worktree';
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

/** Maximum number of bot message→session mappings to keep for mention-reply context. */
const MAX_MENTION_SESSIONS = 500;

/** Evict oldest entries from mentionSessions when it exceeds the cap. */
function trackMentionSession(map: Map<string, MentionSessionInfo>, botMessageId: string, info: MentionSessionInfo): void {
    if (map.size >= MAX_MENTION_SESSIONS) {
        // Delete the oldest entry (first key in insertion order)
        const firstKey = map.keys().next().value;
        if (firstKey) map.delete(firstKey);
    }
    map.set(botMessageId, info);
}

/** Prefix a message with Discord author context so the agent knows who is speaking. */
function withAuthorContext(text: string, authorUsername?: string): string {
    if (!authorUsername) return text;
    return `[From Discord user: ${authorUsername}]\n${text}`;
}

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

/** Info for tracking mention-reply sessions in channels (not threads). */
export interface MentionSessionInfo {
    sessionId: string;
    agentName: string;
    agentModel: string;
}

/** Context needed by the message handler to access bridge state. */
export interface MessageHandlerContext {
    db: Database;
    config: DiscordBridgeConfig;
    processManager: ProcessManager;
    workTaskService: WorkTaskService | null;
    delivery: DeliveryTracker;
    botUserId: string | null;
    botRoleId: string | null;
    mutedUsers: Set<string>;
    interactedUsers: Set<string>;
    userMessageTimestamps: Map<string, number[]>;
    rateLimitWindowMs: number;
    rateLimitMaxMessages: number;
    threadSessions: Map<string, ThreadSessionInfo>;
    threadCallbacks: Map<string, ThreadCallbackInfo>;
    threadLastActivity: Map<string, number>;
    /** Maps bot reply message IDs → session info for mention-reply context. */
    mentionSessions: Map<string, MentionSessionInfo>;
}

/** Cooldown for permission-denial replies: only notify a user once per window. */
const PERM_DENY_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes
const permDenyCooldowns = new Map<string, number>();

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

    // For monitored channels (not threads), check if the bot was mentioned
    // BEFORE doing permission checks. Messages without a mention are silently
    // ignored — we should not spam permission denials for casual chat.
    const isBotUserMentioned = ctx.botUserId
        ? data.mentions?.some(m => m.id === ctx.botUserId) ?? false
        : false;
    const isBotRoleMentioned = ctx.botRoleId
        ? data.mention_roles?.includes(ctx.botRoleId) ?? false
        : false;
    const isBotMentioned = isBotUserMentioned || isBotRoleMentioned;

    // Check if this is a reply to a bot message (for mention-reply context)
    const isReplyToBot = isMonitored && !isOurThread
        && data.referenced_message?.author?.id === ctx.botUserId
        && data.message_reference?.message_id != null;

    if (isMonitored && !isOurThread && !isBotMentioned && !isReplyToBot) {
        log.debug('Message in monitored channel without bot mention', {
            channelId, userId, isBotUserMentioned, isBotRoleMentioned,
            textPreview: text.slice(0, 50),
        });
        return;
    }

    // Resolve permission level (only reached when bot is actually addressed)
    const permLevel = resolvePermissionLevel(ctx.config, ctx.mutedUsers, userId, data.member?.roles);
    if (permLevel <= 0) {
        log.warn('Blocked Discord user', { userId, username: data.author.username, permLevel });
        // Only send the denial once per cooldown window to avoid spamming
        const now = Date.now();
        const lastDenied = permDenyCooldowns.get(userId);
        if (!lastDenied || now - lastDenied >= PERM_DENY_COOLDOWN_MS) {
            permDenyCooldowns.set(userId, now);
            await sendDiscordMessage(ctx.delivery, ctx.config.botToken, channelId, 'You do not have permission to interact with this bot.');
        }
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
        await routeToThread(ctx, channelId, userId, text, data.author.username);
        return;
    }

    sendFirstInteractionTip(ctx, userId, channelId);
    sendTypingIndicator(ctx.config.botToken, channelId).catch((err) => log.debug('Typing indicator failed', { error: err instanceof Error ? err.message : String(err) }));

    // If replying to a bot message, try to resume the existing session
    if (isReplyToBot && data.message_reference?.message_id) {
        const existingSession = ctx.mentionSessions.get(data.message_reference.message_id);
        if (existingSession) {
            await handleMentionReplyResume(ctx, channelId, userId, data.id, text, existingSession, data.mentions, data.author.username);
            return;
        }
        // If we can't find the session (e.g. after restart), fall through to create new
    }

    const mode = ctx.config.mode ?? 'chat';
    if (mode === 'work_intake') {
        await handleWorkIntake(ctx, channelId, data.id, userId, text, data.mentions);
    } else {
        await handleMentionReply(ctx, channelId, userId, data.id, text, data.mentions, data.author.username);
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

async function handleMentionReply(ctx: MessageHandlerContext, channelId: string, _userId: string, messageId: string, text: string, mentions?: Array<{ id: string; username: string }>, authorUsername?: string): Promise<void> {
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

    // Create an isolated git worktree so this chat session doesn't pollute
    // the main working tree (prevents branch collisions across sessions).
    let workDir: string | undefined;
    if (project.workingDir) {
        const sessionId = crypto.randomUUID();
        const branchName = generateChatBranchName(agent.name, sessionId);
        const result = await createWorktree({
            projectWorkingDir: project.workingDir,
            branchName,
            worktreeId: `chat-${sessionId.slice(0, 12)}`,
        });
        if (result.success) {
            workDir = result.worktreeDir;
        }
        // If worktree creation fails, fall through to using the main working dir.
        // This is non-fatal — the session still works, just without isolation.
    }

    const session = createSession(ctx.db, {
        projectId: project.id,
        agentId: agent.id,
        name: `Discord mention:${messageId}`,
        initialPrompt: cleanText,
        source: 'discord' as SessionSource,
        workDir,
    });

    ctx.processManager.startProcess(session, withAuthorContext(cleanText, authorUsername));

    const agentName = agent.name;
    const agentModel = agent.model || 'unknown';
    subscribeForInlineResponse(
        ctx.processManager, ctx.delivery, ctx.config.botToken,
        session.id, channelId, messageId, agentName, agentModel,
        (botMessageId) => {
            trackMentionSession(ctx.mentionSessions, botMessageId, { sessionId: session.id, agentName, agentModel });
        },
    );
}

async function handleMentionReplyResume(
    ctx: MessageHandlerContext,
    channelId: string,
    _userId: string,
    messageId: string,
    text: string,
    sessionInfo: MentionSessionInfo,
    mentions?: Array<{ id: string; username: string }>,
    authorUsername?: string,
): Promise<void> {
    const cleanText = resolveMentions(text, mentions, ctx.botUserId);
    if (!cleanText) return;

    const { sessionId, agentName, agentModel } = sessionInfo;
    const session = getSession(ctx.db, sessionId);

    if (!session) {
        log.info('Mention-reply session not found, creating new session', { sessionId });
        await handleMentionReply(ctx, channelId, _userId, messageId, text, mentions, authorUsername);
        return;
    }

    // Try to send message to existing process, or resume if it's stopped
    const contextualText = withAuthorContext(cleanText, authorUsername);
    const sent = ctx.processManager.sendMessage(sessionId, contextualText);
    if (!sent) {
        ctx.processManager.resumeProcess(session, contextualText);
    }

    subscribeForInlineResponse(
        ctx.processManager, ctx.delivery, ctx.config.botToken,
        sessionId, channelId, messageId, agentName, agentModel,
        (botMessageId) => {
            trackMentionSession(ctx.mentionSessions, botMessageId, { sessionId, agentName, agentModel });
        },
    );
}

async function routeToThread(ctx: MessageHandlerContext, threadId: string, _userId: string, text: string, authorUsername?: string): Promise<void> {
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
                { label: 'Archive Thread', customId: 'archive_thread', style: ButtonStyle.SECONDARY, emoji: '📦' },
            ),
        ]);
        return;
    }

    const contextualText = withAuthorContext(text, authorUsername);
    const sent = ctx.processManager.sendMessage(sessionId, contextualText);
    if (!sent) {
        ctx.processManager.resumeProcess(session, contextualText);
        subscribeForResponseWithEmbed(
            ctx.processManager, ctx.delivery, ctx.config.botToken,
            ctx.db, ctx.threadCallbacks, sessionId, threadId, agentName, agentModel,
        );
        return;
    }

    subscribeForResponseWithEmbed(
        ctx.processManager, ctx.delivery, ctx.config.botToken,
        ctx.db, ctx.threadCallbacks, sessionId, threadId, agentName, agentModel,
    );
}

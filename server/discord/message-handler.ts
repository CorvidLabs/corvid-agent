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
import type { DiscordBridgeConfig, DiscordMessageData, DiscordAttachment } from './types';
import type { DeliveryTracker } from '../lib/delivery-tracker';
import { ButtonStyle, PermissionLevel } from './types';
import { appendAttachmentUrls, buildMultimodalContent } from './image-attachments';
import { listAgents } from '../db/agents';
import { createSession, getSession } from '../db/sessions';
import { listProjects } from '../db/projects';
import { scanForInjection } from '../lib/prompt-injection';
import { resolveAndCreateWorktree } from '../lib/worktree';
import { recordAudit } from '../db/audit';
import { buildOllamaComplexityWarning } from '../lib/ollama-complexity-warning';
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
    subscribeForAdaptiveInlineResponse,
    resolveDefaultAgent,
} from './thread-manager';
import { resolveDiscordContact } from './contact-linker';
import { saveMentionSession, getMentionSession } from '../db/discord-mention-sessions';

const log = createLogger('DiscordMessageHandler');

/** Maximum number of bot message→session mappings to keep for mention-reply context. */
const MAX_MENTION_SESSIONS = 500;

/** Evict oldest entries from mentionSessions when it exceeds the cap, and persist to DB. */
function trackMentionSession(db: Database, map: Map<string, MentionSessionInfo>, botMessageId: string, info: MentionSessionInfo): void {
    if (map.size >= MAX_MENTION_SESSIONS) {
        // Delete the oldest entry (first key in insertion order)
        const firstKey = map.keys().next().value;
        if (firstKey) map.delete(firstKey);
    }
    map.set(botMessageId, info);
    try {
        saveMentionSession(db, botMessageId, info);
    } catch (err) {
        log.warn('Failed to persist mention session', {
            botMessageId,
            error: err instanceof Error ? err.message : String(err),
        });
    }
}

/** Prefix a message with Discord author context so the agent knows who is speaking. */
export function withAuthorContext(text: string, authorId?: string, authorUsername?: string, channelId?: string): string {
    if (!authorId && !authorUsername) return text;
    const channelSuffix = channelId ? ` in channel ${channelId}` : '';
    if (authorId && authorUsername) return `[From Discord user: ${authorUsername} (Discord ID: ${authorId})${channelSuffix}]\n${text}`;
    if (authorId) return `[From Discord user ID: ${authorId}${channelSuffix}]\n${text}`;
    return `[From Discord user: ${authorUsername}${channelSuffix}]\n${text}`;
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
    projectName?: string;
    displayColor?: string | null;
    channelId?: string;
    /** When true, this session uses pure conversation mode (no tools). */
    conversationOnly?: boolean;
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
    /** Recently processed Discord message IDs — prevents duplicate handling. */
    processedMessageIds: Set<string>;
}

/** Cooldown for permission-denial replies: only notify a user once per window. */
const PERM_DENY_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes
const permDenyCooldowns = new Map<string, number>();


export async function handleMessage(ctx: MessageHandlerContext, data: DiscordMessageData): Promise<void> {
    // Ignore bot messages
    if (data.author.bot) return;

    // Deduplicate: skip if we've already processed this Discord message ID.
    // Guards against dual delivery from overlapping gateway connections
    // (e.g., during deploys or gateway resumes).
    if (ctx.processedMessageIds.has(data.id)) {
        log.debug('Skipping duplicate MESSAGE_CREATE', { messageId: data.id, channelId: data.channel_id });
        return;
    }
    ctx.processedMessageIds.add(data.id);
    if (ctx.processedMessageIds.size > 1000) {
        const first = ctx.processedMessageIds.values().next().value;
        if (first) ctx.processedMessageIds.delete(first);
    }

    // Auto-link Discord user to contact identity (best-effort, non-blocking)
    try {
        resolveDiscordContact(ctx.db, data.author.id, data.author.username);
    } catch (err) {
        log.warn('Failed to resolve Discord contact', {
            authorId: data.author.id,
            error: err instanceof Error ? err.message : String(err),
        });
    }

    const text = data.content ?? '';
    const hasAttachments = (data.attachments?.length ?? 0) > 0;
    if (!text && !hasAttachments) return;

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
        recordAudit(
            ctx.db,
            'discord_permission_denied',
            userId,
            'discord_message',
            null,
            JSON.stringify({ channel: 'discord', channelId, reason: 'blocked', username: data.author.username }),
        );
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
        log.warn('Rate limit hit', { userId, username: data.author.username, permLevel, channelId });
        recordAudit(
            ctx.db,
            'discord_rate_limited',
            userId,
            'discord_message',
            null,
            JSON.stringify({ channel: 'discord', channelId, permLevel, username: data.author.username }),
        );
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
        await routeToThread(ctx, channelId, userId, text, permLevel, data.author.id, data.author.username, data.attachments);
        return;
    }

    sendFirstInteractionTip(ctx, userId, channelId);
    sendTypingIndicator(ctx.config.botToken, channelId).catch((err) => log.debug('Typing indicator failed', { error: err instanceof Error ? err.message : String(err) }));

    // If replying to a bot message, try to resume the existing session
    if (isReplyToBot && data.message_reference?.message_id) {
        const refId = data.message_reference.message_id;
        let existingSession = ctx.mentionSessions.get(refId);
        // Fall back to DB lookup (e.g. after server restart)
        if (!existingSession) {
            const dbSession = getMentionSession(ctx.db, refId);
            if (dbSession) {
                existingSession = dbSession;
                // Re-populate in-memory map for future lookups
                ctx.mentionSessions.set(refId, dbSession);
            }
        }
        if (existingSession) {
            await handleMentionReplyResume(ctx, channelId, userId, data.id, text, existingSession, data.mentions, data.author.id, data.author.username, data.attachments);
            return;
        }
        // If we can't find the session in memory or DB, fall through to create new
    }

    // In public mode, BASIC-tier users who @mention the bot should use /message
    // instead of starting a full tool-enabled session. Give friendly guidance.
    if (ctx.config.publicMode && permLevel === PermissionLevel.BASIC && isBotMentioned) {
        log.info('BASIC user @mentioned bot in public channel — redirecting to /message', { userId, username: data.author.username });
        await sendDiscordMessage(
            ctx.delivery,
            ctx.config.botToken,
            channelId,
            `Hey <@${userId}>! Use \`/message\` to chat with me — it's the best way to get a quick reply. 👋`,
        );
        return;
    }

    const mode = ctx.config.mode ?? 'chat';
    if (mode === 'work_intake') {
        await handleWorkIntake(ctx, channelId, data.id, userId, text, data.mentions);
    } else {
        await handleMentionReply(ctx, channelId, userId, data.id, text, data.mentions, data.author.id, data.author.username, data.attachments);
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

async function handleMentionReply(ctx: MessageHandlerContext, channelId: string, _userId: string, messageId: string, text: string, mentions?: Array<{ id: string; username: string }>, authorId?: string, authorUsername?: string, attachments?: DiscordAttachment[]): Promise<void> {
    // Dedup: check if a session already exists for this Discord message ID.
    // The in-memory dedup in handleMessage() covers most cases, but can miss
    // duplicates during gateway reconnects or server restarts.
    const existingSession = ctx.db.query<{ id: string }, [string]>(
        `SELECT id FROM sessions WHERE name = ? AND source = 'discord' LIMIT 1`,
    ).get(`Discord mention:${messageId}`);
    if (existingSession) {
        log.info('Skipping duplicate mention session', { messageId, existingSessionId: existingSession.id });
        return;
    }

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
    const hasAttachments = (attachments?.length ?? 0) > 0;
    if (!cleanText && !hasAttachments) return;

    // Create an isolated git worktree so this chat session doesn't pollute
    // the main working tree (prevents branch collisions across sessions).
    // Uses resolveAndCreateWorktree to handle clone_on_demand projects
    // (clones the repo first if it doesn't exist locally).
    let workDir: string | undefined;
    if (project.workingDir || project.gitUrl) {
        const result = await resolveAndCreateWorktree(project, agent.name, crypto.randomUUID());
        if (result.success) {
            workDir = result.workDir;
        } else {
            // Worktree isolation is mandatory — running without it risks
            // cross-session contamination of the shared working directory.
            await sendDiscordMessage(ctx.delivery, ctx.config.botToken, channelId,
                `Failed to create isolated worktree for this session: ${result.error ?? 'unknown error'}. Please try again.`);
            return;
        }
    }

    const session = createSession(ctx.db, {
        projectId: project.id,
        agentId: agent.id,
        name: `Discord mention:${messageId}`,
        initialPrompt: cleanText,
        source: 'discord' as SessionSource,
        workDir,
    });

    // Advisory: warn in-channel when Ollama is used for a complex task.
    const complexityWarning = buildOllamaComplexityWarning(cleanText, agent.model, agent.provider);
    if (complexityWarning) {
        await sendDiscordMessage(ctx.delivery, ctx.config.botToken, channelId,
            `⚠️ ${complexityWarning}`);
    }

    // Start the process with the text prompt (include attachment URLs so the agent
    // sees image links even though startProcess only accepts strings).
    const textWithUrls = appendAttachmentUrls(withAuthorContext(cleanText, authorId, authorUsername, channelId), attachments);
    ctx.processManager.startProcess(session, textWithUrls);

    const agentName = agent.name;
    const agentModel = agent.model || 'unknown';
    const agentDisplayColor = agent.displayColor;
    const projectNameForFooter = project.name;
    subscribeForAdaptiveInlineResponse(
        ctx.processManager, ctx.delivery, ctx.config.botToken,
        session.id, channelId, messageId, agentName, agentModel,
        (botMessageId) => {
            trackMentionSession(ctx.db, ctx.mentionSessions, botMessageId, { sessionId: session.id, agentName, agentModel, projectName: projectNameForFooter, displayColor: agentDisplayColor, channelId });
        },
        projectNameForFooter, agentDisplayColor,
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
    authorId?: string,
    authorUsername?: string,
    attachments?: DiscordAttachment[],
): Promise<void> {
    const cleanText = resolveMentions(text, mentions, ctx.botUserId);
    const hasAttachments = (attachments?.length ?? 0) > 0;
    if (!cleanText && !hasAttachments) return;

    const { sessionId, agentName, agentModel, projectName, displayColor, conversationOnly } = sessionInfo;
    const session = getSession(ctx.db, sessionId);

    if (!session) {
        log.info('Mention-reply session not found, creating new session', { sessionId });
        await handleMentionReply(ctx, channelId, _userId, messageId, text, mentions, authorId, authorUsername, attachments);
        return;
    }

    // Build multimodal content if images are attached
    const contextualContent = buildMultimodalContent(withAuthorContext(cleanText, authorId, authorUsername, channelId), attachments);
    log.info('Mention-reply resume: sending content to session', {
        sessionId,
        hasAttachments: (attachments?.length ?? 0) > 0,
        attachmentCount: attachments?.length ?? 0,
        contentType: typeof contextualContent === 'string' ? 'string' : 'multimodal',
        blockCount: Array.isArray(contextualContent) ? contextualContent.length : 0,
        contentPreview: typeof contextualContent === 'string' ? contextualContent.slice(0, 200) : JSON.stringify(contextualContent).slice(0, 300),
    });
    const sent = ctx.processManager.sendMessage(sessionId, contextualContent);
    if (!sent) {
        // resumeProcess only accepts strings — include attachment URLs so images aren't lost
        const resumeText = typeof contextualContent === 'string' ? contextualContent : appendAttachmentUrls(withAuthorContext(cleanText, authorId, authorUsername, channelId), attachments);
        ctx.processManager.resumeProcess(session, resumeText);
    }

    subscribeForAdaptiveInlineResponse(
        ctx.processManager, ctx.delivery, ctx.config.botToken,
        sessionId, channelId, messageId, agentName, agentModel,
        (botMessageId) => {
            trackMentionSession(ctx.db, ctx.mentionSessions, botMessageId, { sessionId, agentName, agentModel, projectName, displayColor, channelId, conversationOnly });
        },
        projectName, displayColor,
    );
}

/**
 * Create a new session in a thread whose previous session expired or was deleted.
 * Reuses the original agent when possible, falls back to the default agent.
 * Returns true if the session was successfully created and the message dispatched.
 */
async function resumeExpiredThreadSession(
    ctx: MessageHandlerContext,
    threadId: string,
    previousInfo: { agentName: string; agentModel: string; ownerUserId: string; topic?: string; projectName?: string; creatorPermLevel?: number },
    text: string,
    authorId?: string,
    authorUsername?: string,
    attachments?: DiscordAttachment[],
): Promise<boolean> {
    const agents = listAgents(ctx.db);
    const agent = agents.find(a => a.name === previousInfo.agentName)
        ?? resolveDefaultAgent(ctx.db, ctx.config);
    if (!agent) return false;

    const projects = listProjects(ctx.db);
    const project = agent.defaultProjectId
        ? projects.find(p => p.id === agent.defaultProjectId) ?? projects[0]
        : projects[0];
    if (!project) return false;

    // Create an isolated worktree for the new session
    let workDir: string | undefined;
    if (project.workingDir || project.gitUrl) {
        const result = await resolveAndCreateWorktree(project, agent.name, crypto.randomUUID());
        if (result.success) {
            workDir = result.workDir;
        }
    }

    const newSession = createSession(ctx.db, {
        projectId: project.id,
        agentId: agent.id,
        name: `Discord thread:${threadId}`,
        initialPrompt: text,
        source: 'discord' as SessionSource,
        workDir,
    });

    ctx.threadSessions.set(threadId, {
        sessionId: newSession.id,
        agentName: agent.name,
        agentModel: agent.model || 'unknown',
        ownerUserId: previousInfo.ownerUserId,
        topic: previousInfo.topic,
        projectName: project.name,
        displayColor: agent.displayColor,
        creatorPermLevel: previousInfo.creatorPermLevel,
    });
    ctx.threadLastActivity.set(threadId, Date.now());

    // Start the process with the user's message (include attachment URLs in text so
    // the agent sees them even though startProcess only accepts strings).
    const textWithUrls = appendAttachmentUrls(withAuthorContext(text, authorId, authorUsername, threadId), attachments);
    ctx.processManager.startProcess(newSession, textWithUrls);

    subscribeForResponseWithEmbed(
        ctx.processManager, ctx.delivery, ctx.config.botToken,
        ctx.db, ctx.threadCallbacks, newSession.id, threadId, agent.name, agent.model || 'unknown',
        project.name, agent.displayColor,
    );

    // Brief non-blocking notification
    sendEmbed(ctx.delivery, ctx.config.botToken, threadId, {
        description: `Session resumed with **${agent.name}**.`,
        color: 0x57f287,
    }).catch((err) => log.debug('Failed to send resume embed', { error: err instanceof Error ? err.message : String(err) }));

    log.info('Resumed expired thread session', { threadId, newSessionId: newSession.id, agentName: agent.name });

    return true;
}

async function routeToThread(ctx: MessageHandlerContext, threadId: string, _userId: string, text: string, userPermLevel: number, authorId?: string, authorUsername?: string, attachments?: DiscordAttachment[]): Promise<void> {
    ctx.threadLastActivity.set(threadId, Date.now());

    let threadInfo = ctx.threadSessions.get(threadId);

    if (!threadInfo) {
        threadInfo = tryRecoverThread(ctx.db, ctx.threadSessions, threadId) ?? undefined;
        if (!threadInfo) return;
    }

    // Thread permission isolation: BASIC users cannot interact with threads
    // created by STANDARD/ADMIN users, which may have tool access enabled.
    if (
        userPermLevel === PermissionLevel.BASIC &&
        threadInfo.creatorPermLevel !== undefined &&
        threadInfo.creatorPermLevel >= PermissionLevel.STANDARD
    ) {
        log.warn('BASIC user blocked from STANDARD/ADMIN thread', {
            userId: _userId,
            threadId,
            userPermLevel,
            creatorPermLevel: threadInfo.creatorPermLevel,
        });
        recordAudit(
            ctx.db,
            'discord_permission_denied',
            _userId,
            'discord_thread',
            threadId,
            JSON.stringify({ reason: 'tier_isolation', userPermLevel, creatorPermLevel: threadInfo.creatorPermLevel }),
        );
        await sendDiscordMessage(
            ctx.delivery,
            ctx.config.botToken,
            threadId,
            `Hey <@${_userId}>! This thread requires a higher access level. Use \`/message\` to chat with me instead. 👋`,
        );
        return;
    }

    const { sessionId, agentName, agentModel, projectName, displayColor } = threadInfo;

    const session = getSession(ctx.db, sessionId);
    if (!session) {
        ctx.threadSessions.delete(threadId);
        // Automatically resume: create a new session in the same thread
        const resumed = await resumeExpiredThreadSession(ctx, threadId, threadInfo, text, authorId, authorUsername, attachments);
        if (!resumed) {
            await sendEmbedWithButtons(ctx.delivery, ctx.config.botToken, threadId, {
                description: 'This session has expired and can no longer be resumed. Start a new `/session` to continue working.',
                color: 0x95a5a6,
            }, [
                buildActionRow(
                    { label: 'Archive Thread', customId: 'archive_thread', style: ButtonStyle.SECONDARY, emoji: '📦' },
                ),
            ]);
        }
        return;
    }

    // Build multimodal content if images are attached
    const contextualContent = buildMultimodalContent(withAuthorContext(text, authorId, authorUsername, threadId), attachments);
    const sent = ctx.processManager.sendMessage(sessionId, contextualContent);
    if (!sent) {
        // resumeProcess only accepts strings — include attachment URLs in text so images aren't lost
        const resumeText = typeof contextualContent === 'string' ? contextualContent : appendAttachmentUrls(withAuthorContext(text, authorId, authorUsername, threadId), attachments);
        ctx.processManager.resumeProcess(session, resumeText);
        subscribeForResponseWithEmbed(
            ctx.processManager, ctx.delivery, ctx.config.botToken,
            ctx.db, ctx.threadCallbacks, sessionId, threadId, agentName, agentModel,
            projectName, displayColor,
        );
        return;
    }

    subscribeForResponseWithEmbed(
        ctx.processManager, ctx.delivery, ctx.config.botToken,
        ctx.db, ctx.threadCallbacks, sessionId, threadId, agentName, agentModel,
        projectName, displayColor,
    );
}

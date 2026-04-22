/**
 * Discord message routing.
 *
 * Dispatches incoming Discord messages to the appropriate handler:
 * thread routing, work intake, or mention replies.
 */

import type { Database } from 'bun:sqlite';
import type { SessionSource } from '../../shared/types';
import { listAgents } from '../db/agents';
import { recordAudit } from '../db/audit';
import { getChannelProjectId, setChannelProjectId } from '../db/discord-channel-project';
import { updateDiscordConfig } from '../db/discord-config';
import {
  getChannelMessageHistory,
  getLatestMentionSessionByChannel,
  getMentionSession,
  saveMentionSession,
  updateMentionSessionActivity,
} from '../db/discord-mention-sessions';
import {
  deleteThreadSession,
  getThreadSessionSummary,
  saveThreadSession,
  updateThreadSessionActivity,
} from '../db/discord-thread-sessions';
import { recordObservation } from '../db/observations';
import { listProjects } from '../db/projects';
import { createSession, getPreviousThreadSessionSummary, getSession, getSessionMessages } from '../db/sessions';
import type { DeliveryTracker } from '../lib/delivery-tracker';
import { createLogger } from '../lib/logger';
import { buildOllamaComplexityWarning } from '../lib/ollama-complexity-warning';
import { scanForInjection } from '../lib/prompt-injection';
import { resolveAndCreateWorktree } from '../lib/worktree';
import type { ProcessManager } from '../process/manager';
import type { WorkTaskService } from '../work/service';
import { resolveDiscordContact } from './contact-linker';
import {
  addReaction,
  buildActionRow,
  sendDiscordMessage,
  sendEmbed,
  sendEmbedWithButtons,
  sendTypingIndicator,
} from './embeds';
import { appendAttachmentUrls, buildMultimodalContent } from './image-attachments';
import { checkRateLimit, isMonitoredChannel, resolvePermissionLevel } from './permissions';
import type { ThreadCallbackInfo, ThreadSessionInfo } from './thread-manager';
import {
  resolveDefaultAgent,
  subscribeForAdaptiveInlineResponse,
  subscribeForResponseWithEmbed,
  tryRecoverThread,
} from './thread-manager';
import type { DiscordAttachment, DiscordBridgeConfig, DiscordMessageData } from './types';
import { ButtonStyle, PermissionLevel } from './types';
import { handleWorkIntake } from './work-dispatch';

const log = createLogger('DiscordMessageHandler');

/** Maximum number of bot message→session mappings to keep for mention-reply context. */
const MAX_MENTION_SESSIONS = 500;

/** Cooldown for permission-denial replies: only notify a user once per window. */
const PERM_DENY_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes
const permDenyCooldowns = new Map<string, number>();

/** Evict oldest entries from mentionSessions when it exceeds the cap, and persist to DB. */
function trackMentionSession(
  db: Database,
  map: Map<string, MentionSessionInfo>,
  botMessageId: string,
  info: MentionSessionInfo,
): void {
  if (map.size >= MAX_MENTION_SESSIONS) {
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
export function withAuthorContext(
  text: string,
  authorId?: string,
  authorUsername?: string,
  channelId?: string,
): string {
  if (!authorId && !authorUsername) return text;
  const channelSuffix = channelId ? ` in channel ${channelId}` : '';
  if (authorId && authorUsername)
    return `[From Discord user: ${authorUsername} (Discord ID: ${authorId})${channelSuffix}]\n${text}`;
  if (authorId) return `[From Discord user ID: ${authorId}${channelSuffix}]\n${text}`;
  return `[From Discord user: ${authorUsername}${channelSuffix}]\n${text}`;
}

/** Strip previously injected `<conversation_history>` blocks to prevent recursive nesting. */
export function stripConversationHistory(content: string): string {
  return content.replace(/<conversation_history>[\s\S]*?<\/conversation_history>\s*/g, '').trim();
}

/** Replace Discord mention IDs with @username before stripping unresolved mentions.
 *  Mentions matching botUserId are stripped entirely (they're just trigger mentions). */
function resolveMentions(
  text: string,
  mentions?: Array<{ id: string; username: string }>,
  botUserId?: string | null,
): string {
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
  displayIcon?: string | null;
  avatarUrl?: string | null;
  channelId?: string;
  /** When true, this session uses pure conversation mode (no tools). */
  conversationOnly?: boolean;
  /** Minimum permission level required to continue this session via reply. */
  minResponderPermLevel?: number;
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

export async function handleMessage(ctx: MessageHandlerContext, data: DiscordMessageData): Promise<void> {
  // Ignore bot messages
  if (data.author.bot) return;

  // Deduplicate: skip if we've already processed this Discord message ID.
  // Layer 1: in-memory set (fast, covers normal operation)
  if (ctx.processedMessageIds.has(data.id)) {
    log.debug('Skipping duplicate MESSAGE_CREATE (in-memory)', { messageId: data.id, channelId: data.channel_id });
    return;
  }
  // Layer 2: DB-persisted dedup (survives server restarts / gateway reconnects)
  const dbDup = ctx.db.query('SELECT 1 FROM discord_processed_messages WHERE message_id = ?').get(data.id);
  if (dbDup) {
    log.debug('Skipping duplicate MESSAGE_CREATE (DB)', { messageId: data.id, channelId: data.channel_id });
    ctx.processedMessageIds.add(data.id);
    return;
  }
  ctx.processedMessageIds.add(data.id);
  try {
    ctx.db
      .query('INSERT OR IGNORE INTO discord_processed_messages (message_id, channel_id) VALUES (?, ?)')
      .run(data.id, data.channel_id);
  } catch {
    /* best-effort — in-memory set still guards within this process lifetime */
  }
  if (ctx.processedMessageIds.size > 1000) {
    const first = ctx.processedMessageIds.values().next().value;
    if (first) ctx.processedMessageIds.delete(first);
  }
  // Prune old DB entries (keep last 24h) — fire-and-forget, once per ~1000 messages
  if (ctx.processedMessageIds.size === 1000) {
    try {
      ctx.db.query("DELETE FROM discord_processed_messages WHERE created_at < datetime('now', '-1 day')").run();
    } catch {
      /* best-effort */
    }
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
  const isBotUserMentioned = ctx.botUserId ? (data.mentions?.some((m) => m.id === ctx.botUserId) ?? false) : false;
  const isBotRoleMentioned = ctx.botRoleId ? (data.mention_roles?.includes(ctx.botRoleId) ?? false) : false;
  const isBotMentioned = isBotUserMentioned || isBotRoleMentioned;

  // Check if this is a reply to a bot message (for mention-reply context)
  const isReplyToBot =
    isMonitored &&
    !isOurThread &&
    data.referenced_message?.author?.id === ctx.botUserId &&
    data.message_reference?.message_id != null;

  if (isMonitored && !isOurThread && !isBotMentioned && !isReplyToBot) {
    log.debug('Message in monitored channel without bot mention', {
      channelId,
      userId,
      isBotUserMentioned,
      isBotRoleMentioned,
      textPreview: text.slice(0, 50),
    });
    return;
  }

  // Resolve permission level (only reached when bot is actually addressed)
  const permLevel = resolvePermissionLevel(ctx.config, ctx.mutedUsers, userId, data.member?.roles, channelId);
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
      await sendDiscordMessage(
        ctx.delivery,
        ctx.config.botToken,
        channelId,
        'You do not have permission to interact with this bot.',
      );
    }
    return;
  }

  // Per-user rate limiting with tiered limits
  if (
    !checkRateLimit(
      ctx.config,
      ctx.userMessageTimestamps,
      userId,
      ctx.rateLimitWindowMs,
      ctx.rateLimitMaxMessages,
      permLevel,
    )
  ) {
    log.warn('Rate limit hit', { userId, username: data.author.username, permLevel, channelId });
    recordAudit(
      ctx.db,
      'discord_rate_limited',
      userId,
      'discord_message',
      null,
      JSON.stringify({ channel: 'discord', channelId, permLevel, username: data.author.username }),
    );
    await sendDiscordMessage(
      ctx.delivery,
      ctx.config.botToken,
      channelId,
      'Slow down! Please wait before sending more messages.',
    );
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
    await sendDiscordMessage(
      ctx.delivery,
      ctx.config.botToken,
      channelId,
      'Message blocked: content policy violation.',
    );
    return;
  }

  // If this message is in a thread we're tracking, route to that thread's session
  if (isOurThread) {
    sendFirstInteractionTip(ctx, userId, channelId);
    // React with 👀 to acknowledge receipt — gives instant visual feedback
    addReaction(ctx.config.botToken, channelId, data.id, '👀').catch(() => {});
    sendTypingIndicator(ctx.config.botToken, channelId).catch((err) =>
      log.debug('Typing indicator failed', { error: err instanceof Error ? err.message : String(err) }),
    );
    await routeToThread(
      ctx,
      channelId,
      userId,
      text,
      permLevel,
      data.author.id,
      data.author.username,
      data.attachments,
    );
    return;
  }

  sendFirstInteractionTip(ctx, userId, channelId);
  // React with 👀 to acknowledge the mention
  addReaction(ctx.config.botToken, channelId, data.id, '👀').catch(() => {});
  sendTypingIndicator(ctx.config.botToken, channelId).catch((err) =>
    log.debug('Typing indicator failed', { error: err instanceof Error ? err.message : String(err) }),
  );

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
      updateMentionSessionActivity(ctx.db, refId);
      await handleMentionReplyResume(
        ctx,
        channelId,
        userId,
        data.id,
        text,
        existingSession,
        permLevel,
        data.mentions,
        data.author.id,
        data.author.username,
        data.attachments,
      );
      return;
    }
    // If we can't find the session by bot message ID, fall through to channel fallback below
  }

  // Channel-based fallback: if a user sends a message in a channel with a recent
  // mention session (within 60 min), resume that session even without a reply reference.
  // This handles the common case where users type follow-ups without using Discord's reply.
  if (!isReplyToBot || !data.message_reference?.message_id) {
    const channelSession = getLatestMentionSessionByChannel(ctx.db, channelId);
    if (channelSession) {
      log.info('Channel-based mention session fallback', {
        channelId,
        sessionId: channelSession.sessionId,
        userId,
      });
      await handleMentionReplyResume(
        ctx,
        channelId,
        userId,
        data.id,
        text,
        channelSession,
        permLevel,
        data.mentions,
        data.author.id,
        data.author.username,
        data.attachments,
      );
      return;
    }
  }

  // In public mode, BASIC-tier users who @mention the bot should use /message
  // instead of starting a full tool-enabled session. Give friendly guidance.
  if (ctx.config.publicMode && permLevel === PermissionLevel.BASIC && isBotMentioned) {
    log.info('BASIC user @mentioned bot in public channel — redirecting to /message', {
      userId,
      username: data.author.username,
    });
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
    await handleMentionReply(
      ctx,
      channelId,
      userId,
      data.id,
      text,
      data.mentions,
      data.author.id,
      data.author.username,
      data.attachments,
    );
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
  }).catch((err) =>
    log.debug('First-interaction tip failed', { error: err instanceof Error ? err.message : String(err) }),
  );
}

async function handleMentionReply(
  ctx: MessageHandlerContext,
  channelId: string,
  _userId: string,
  messageId: string,
  text: string,
  mentions?: Array<{ id: string; username: string }>,
  authorId?: string,
  authorUsername?: string,
  attachments?: DiscordAttachment[],
): Promise<void> {
  // Dedup: check if a session already exists for this Discord message ID.
  // The in-memory dedup in handleMessage() covers most cases, but can miss
  // duplicates during gateway reconnects or server restarts.
  const existingSession = ctx.db
    .query<{ id: string }, [string]>(`SELECT id FROM sessions WHERE name = ? AND source = 'discord' LIMIT 1`)
    .get(`Discord mention:${messageId}`);
  if (existingSession) {
    log.info('Skipping duplicate mention session', { messageId, existingSessionId: existingSession.id });
    return;
  }

  const agent = resolveDefaultAgent(ctx.db, ctx.config);
  if (!agent) {
    await sendDiscordMessage(
      ctx.delivery,
      ctx.config.botToken,
      channelId,
      'No agents configured. Create an agent first.',
    );
    return;
  }

  const projects = listProjects(ctx.db);

  // Prefer the project most recently used in this channel (affinity), then fall
  // back to the agent's default project, then the first available project.
  const channelProjectId = getChannelProjectId(ctx.db, channelId);
  const project =
    (channelProjectId ? projects.find((p) => p.id === channelProjectId) : undefined) ??
    (agent.defaultProjectId ? projects.find((p) => p.id === agent.defaultProjectId) : undefined) ??
    projects[0];

  if (!project) {
    await sendDiscordMessage(ctx.delivery, ctx.config.botToken, channelId, 'No projects configured.');
    return;
  }

  // Record channel-project affinity so future @mentions in this channel
  // default to the same project without the user needing to specify it.
  setChannelProjectId(ctx.db, channelId, project.id);

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
      await sendDiscordMessage(
        ctx.delivery,
        ctx.config.botToken,
        channelId,
        `Failed to create isolated worktree for this session: ${result.error ?? 'unknown error'}. Please try again.`,
      );
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

  const agentName = agent.name;
  const agentModel = agent.model || 'unknown';
  const agentDisplayColor = agent.displayColor;
  const agentDisplayIcon = agent.displayIcon;
  const agentAvatarUrl = agent.avatarUrl;
  const projectNameForFooter = project.name;

  // Track the mention session immediately so channel-based context queries
  // work even if the bot hasn't replied yet (or crashes before replying).
  // Uses the user's message ID as a synthetic key; bot reply IDs are added
  // later via the onBotMessage callback.
  try {
    trackMentionSession(ctx.db, ctx.mentionSessions, `mention:${messageId}`, {
      sessionId: session.id,
      agentName,
      agentModel,
      projectName: projectNameForFooter,
      displayColor: agentDisplayColor,
      displayIcon: agentDisplayIcon,
      avatarUrl: agentAvatarUrl,
      channelId,
    });
  } catch (err) {
    log.warn('trackMentionSession failed, continuing message dispatch', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Record channel-project affinity so future @mentions in this channel
  // default to the same project without the user needing to specify it.
  setChannelProjectId(ctx.db, channelId, project.id);

  // Advisory: warn in-channel when Ollama is used for a complex task.
  const complexityWarning = buildOllamaComplexityWarning(cleanText, agent.model, agent.provider);
  if (complexityWarning) {
    await sendDiscordMessage(ctx.delivery, ctx.config.botToken, channelId, `⚠️ ${complexityWarning}`);
  }

  // Build conversation context from channel history (aggregated across recent sessions)
  const previousContext = buildChannelContext(ctx.db, channelId);

  // Start the process with the text prompt (include attachment URLs so the agent
  // sees image links even though startProcess only accepts strings).
  const textWithUrls = appendAttachmentUrls(
    withAuthorContext(cleanText, authorId, authorUsername, channelId),
    attachments,
  );
  const promptWithContext = previousContext ? `${previousContext}\n\n${textWithUrls}` : textWithUrls;
  ctx.processManager.startProcess(session, promptWithContext);

  // Record inbound Discord message as a short-term observation for context retention
  recordObservation(ctx.db, {
    agentId: agent.id,
    source: 'discord',
    sourceId: session.id,
    content: `[discord] ${authorUsername} in #${channelId}: ${cleanText.slice(0, 200)}`,
    suggestedKey: `discord:${session.id}`,
    relevanceScore: 1.5,
  });

  subscribeForAdaptiveInlineResponse(
    ctx.processManager,
    ctx.delivery,
    ctx.config.botToken,
    session.id,
    channelId,
    messageId,
    agentName,
    agentModel,
    (botMessageId) => {
      trackMentionSession(ctx.db, ctx.mentionSessions, botMessageId, {
        sessionId: session.id,
        agentName,
        agentModel,
        projectName: projectNameForFooter,
        displayColor: agentDisplayColor,
        displayIcon: agentDisplayIcon,
        avatarUrl: agentAvatarUrl,
        channelId,
      });
    },
    projectNameForFooter,
    agentDisplayColor,
    agentDisplayIcon,
    agentAvatarUrl,
  );
}

async function handleMentionReplyResume(
  ctx: MessageHandlerContext,
  channelId: string,
  _userId: string,
  messageId: string,
  text: string,
  sessionInfo: MentionSessionInfo,
  userPermLevel: number,
  mentions?: Array<{ id: string; username: string }>,
  authorId?: string,
  authorUsername?: string,
  attachments?: DiscordAttachment[],
): Promise<void> {
  const cleanText = resolveMentions(text, mentions, ctx.botUserId);
  const hasAttachments = (attachments?.length ?? 0) > 0;
  if (!cleanText && !hasAttachments) return;

  const { sessionId, agentName, agentModel, projectName, displayColor, displayIcon, avatarUrl, conversationOnly } =
    sessionInfo;
  const minResponderPermLevel = sessionInfo.minResponderPermLevel ?? PermissionLevel.BASIC;
  if (userPermLevel < minResponderPermLevel) {
    log.warn('Blocked reply to protected Discord session', {
      sessionId,
      channelId,
      userId: _userId,
      userPermLevel,
      minResponderPermLevel,
    });
    await sendDiscordMessage(
      ctx.delivery,
      ctx.config.botToken,
      channelId,
      `Hey <@${_userId}>! This conversation requires higher access. Use \`/message\` to start your own session. 👋`,
    );
    return;
  }
  const session = getSession(ctx.db, sessionId);

  if (!session) {
    log.info('Mention-reply session not found, creating new session with context', { sessionId });
    await handleMentionReply(ctx, channelId, _userId, messageId, text, mentions, authorId, authorUsername, attachments);
    return;
  }

  // Build multimodal content if images are attached
  const contextualContent = await buildMultimodalContent(
    withAuthorContext(cleanText, authorId, authorUsername, channelId),
    attachments,
  );
  log.info('Mention-reply resume: sending content to session', {
    sessionId,
    hasAttachments: (attachments?.length ?? 0) > 0,
    attachmentCount: attachments?.length ?? 0,
    contentType: typeof contextualContent === 'string' ? 'string' : 'multimodal',
    blockCount: Array.isArray(contextualContent) ? contextualContent.length : 0,
    contentPreview:
      typeof contextualContent === 'string'
        ? contextualContent.slice(0, 200)
        : JSON.stringify(contextualContent).slice(0, 300),
  });
  const sent = ctx.processManager.sendMessage(sessionId, contextualContent);
  if (!sent) {
    // resumeProcess only accepts strings — include attachment URLs so images aren't lost
    const resumeText =
      typeof contextualContent === 'string'
        ? contextualContent
        : appendAttachmentUrls(withAuthorContext(cleanText, authorId, authorUsername, channelId), attachments);
    ctx.processManager.resumeProcess(session, resumeText);

    // If resumeProcess failed (e.g. death loop reset, spawn error), fall back to a new session
    if (!ctx.processManager.isRunning(sessionId)) {
      log.warn('Mention resumeProcess did not start — creating new mention session with context', {
        sessionId,
        channelId,
      });
      await handleMentionReply(
        ctx,
        channelId,
        _userId,
        messageId,
        text,
        mentions,
        authorId,
        authorUsername,
        attachments,
      );
      return;
    }
  }

  subscribeForAdaptiveInlineResponse(
    ctx.processManager,
    ctx.delivery,
    ctx.config.botToken,
    sessionId,
    channelId,
    messageId,
    agentName,
    agentModel,
    (botMessageId) => {
      trackMentionSession(ctx.db, ctx.mentionSessions, botMessageId, {
        sessionId,
        agentName,
        agentModel,
        projectName,
        displayColor,
        displayIcon,
        avatarUrl,
        channelId,
        conversationOnly,
      });
    },
    projectName,
    displayColor,
    displayIcon,
    avatarUrl,
  );
}

/** Strip any existing <conversation_history> blocks to prevent recursive nesting. */
function stripContextTags(text: string): string {
  return text.replace(/<conversation_history>[\s\S]*?<\/conversation_history>\n?/g, '').trim();
}

/**
 * Build conversation context aggregated across all recent sessions in a channel.
 * Unlike the old single-session approach, this pulls messages from the last 24 hours
 * across all sessions tied to this channel, giving seamless continuity.
 */
function buildChannelContext(db: Database, channelId: string): string {
  const messages = getChannelMessageHistory(db, channelId, 40, 24);
  if (messages.length === 0) return '';

  const historyLines = messages
    .map((m) => {
      const role = m.role === 'user' ? 'User' : 'Assistant';
      const stripped = stripConversationHistory(m.content);
      const text = stripped.length > 2000 ? `${stripped.slice(0, 2000)}...` : stripped;
      if (!text) return null;
      return `[${role}]: ${text}`;
    })
    .filter((line): line is string => line !== null);
  if (historyLines.length === 0) return '';
  return [
    '<conversation_history>',
    'The following is the conversation history from this channel. Use it for context when responding to the new message.',
    '',
    ...historyLines,
    '</conversation_history>',
  ].join('\n');
}

/**
 * Build structured conversation context from a previous thread session.
 * Tries three sources in order: actual messages (richest), thread summary, session summary.
 * Call BEFORE deleting the thread session or session record.
 */
const MAX_THREAD_CONTEXT_CHARS = 8000;

function buildPreviousThreadContext(db: Database, threadId: string, previousSessionId: string): string {
  // 1. Try to load actual messages from the previous session (richest context)
  const messages = getSessionMessages(db, previousSessionId);
  const conversational = messages.filter((m) => m.role === 'user' || m.role === 'assistant').slice(-20);

  if (conversational.length > 0) {
    const historyLines = conversational
      .map((m) => {
        const role = m.role === 'user' ? 'User' : 'Assistant';
        const stripped = stripConversationHistory(m.content);
        const text = stripped.length > 2000 ? `${stripped.slice(0, 2000)}...` : stripped;
        return `[${role}]: ${text}`;
      })
      .filter((line) => !line.endsWith(': '));
    let body = historyLines.join('\n');
    if (body.length > MAX_THREAD_CONTEXT_CHARS) {
      body = body.slice(-MAX_THREAD_CONTEXT_CHARS);
    }
    return [
      '<conversation_history>',
      'The following is the conversation history from this session. Use it for context when responding to the new message.',
      '',
      body,
      '</conversation_history>',
    ].join('\n');
  }

  // 2. Fall back to durable thread session summary (survives session deletion)
  const threadSummary = getThreadSessionSummary(db, threadId);
  if (threadSummary) {
    return `<conversation_history>\nThe following is a summary of the previous session in this thread. Use it for context when responding to the new message.\n\n[Context Summary]\n${threadSummary}\n</conversation_history>`;
  }

  // 3. Fall back to session-level conversation summary
  const sessionSummary = getPreviousThreadSessionSummary(db, threadId);
  if (sessionSummary) {
    return `<conversation_history>\nThe following is a summary of the previous session in this thread. Use it for context when responding to the new message.\n\n[Context Summary]\n${sessionSummary}\n</conversation_history>`;
  }

  return '';
}

/**
 * Create a new session in a thread whose previous session expired or was deleted.
 * Reuses the original agent when possible, falls back to the default agent.
 * Returns true if the session was successfully created and the message dispatched.
 */
async function resumeExpiredThreadSession(
  ctx: MessageHandlerContext,
  threadId: string,
  previousInfo: {
    agentName: string;
    agentModel: string;
    ownerUserId: string;
    topic?: string;
    projectName?: string;
    creatorPermLevel?: number;
  },
  text: string,
  authorId?: string,
  authorUsername?: string,
  attachments?: DiscordAttachment[],
  previousContext?: string,
): Promise<boolean> {
  const agents = listAgents(ctx.db);
  const agent = agents.find((a) => a.name === previousInfo.agentName) ?? resolveDefaultAgent(ctx.db, ctx.config);
  if (!agent) return false;

  const projects = listProjects(ctx.db);
  if (!projects.length) return false;

  let project =
    previousInfo.projectName !== undefined && previousInfo.projectName !== ''
      ? projects.find((p) => p.name.toLowerCase() === previousInfo.projectName!.toLowerCase())
      : undefined;
  if (!project) {
    if (previousInfo.projectName) {
      log.warn('Thread resume: stored projectName not found, using agent default', {
        threadId,
        previousProjectName: previousInfo.projectName,
      });
    }
    project = agent.defaultProjectId
      ? (projects.find((p) => p.id === agent.defaultProjectId) ?? projects[0])
      : projects[0];
  }
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

  const threadInfo = {
    sessionId: newSession.id,
    agentName: agent.name,
    agentModel: agent.model || 'unknown',
    ownerUserId: previousInfo.ownerUserId,
    topic: previousInfo.topic,
    projectName: project.name,
    displayColor: agent.displayColor,
    displayIcon: agent.displayIcon,
    avatarUrl: agent.avatarUrl,
    creatorPermLevel: previousInfo.creatorPermLevel,
  };
  ctx.threadSessions.set(threadId, threadInfo);
  ctx.threadLastActivity.set(threadId, Date.now());
  saveThreadSession(ctx.db, threadId, threadInfo);

  // Carry over context from the previous session in this thread.
  // Uses pre-captured context (actual messages or durable summary) passed from the caller.
  const contextPrefix = previousContext ? `${previousContext}\n\n` : '';

  // Start the process with the user's message (include attachment URLs in text so
  // the agent sees them even though startProcess only accepts strings).
  const textWithUrls = appendAttachmentUrls(withAuthorContext(text, authorId, authorUsername, threadId), attachments);
  ctx.processManager.startProcess(newSession, contextPrefix + textWithUrls);

  subscribeForResponseWithEmbed(
    ctx.processManager,
    ctx.delivery,
    ctx.config.botToken,
    ctx.db,
    ctx.threadCallbacks,
    newSession.id,
    threadId,
    agent.name,
    agent.model || 'unknown',
    project.name,
    agent.displayColor,
    agent.displayIcon,
    agent.avatarUrl,
  );

  // Brief non-blocking notification
  const resumeDesc = previousContext
    ? `Session resumed with **${agent.name}** (previous context carried over).`
    : `Session resumed with **${agent.name}**.`;
  sendEmbed(ctx.delivery, ctx.config.botToken, threadId, {
    description: resumeDesc,
    color: 0x57f287,
  }).catch((err) =>
    log.debug('Failed to send resume embed', { error: err instanceof Error ? err.message : String(err) }),
  );

  log.info('Resumed expired thread session', { threadId, newSessionId: newSession.id, agentName: agent.name });

  return true;
}

async function routeToThread(
  ctx: MessageHandlerContext,
  threadId: string,
  _userId: string,
  text: string,
  userPermLevel: number,
  authorId?: string,
  authorUsername?: string,
  attachments?: DiscordAttachment[],
): Promise<void> {
  ctx.threadLastActivity.set(threadId, Date.now());
  updateThreadSessionActivity(ctx.db, threadId);

  let threadInfo = ctx.threadSessions.get(threadId);

  if (!threadInfo) {
    threadInfo = tryRecoverThread(ctx.db, ctx.threadSessions, threadId) ?? undefined;
    if (!threadInfo) return;
    // Persist legacy-recovered session to dedicated table
    saveThreadSession(ctx.db, threadId, threadInfo);
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

  const { sessionId, agentName, agentModel, projectName, displayColor, displayIcon, avatarUrl } = threadInfo;

  const session = getSession(ctx.db, sessionId);
  if (!session) {
    // Capture context BEFORE deleting — thread summary survives session deletion
    const previousContext = buildPreviousThreadContext(ctx.db, threadId, sessionId);
    ctx.threadSessions.delete(threadId);
    deleteThreadSession(ctx.db, threadId);
    // Automatically resume: create a new session in the same thread
    const resumed = await resumeExpiredThreadSession(
      ctx,
      threadId,
      threadInfo,
      text,
      authorId,
      authorUsername,
      attachments,
      previousContext,
    );
    if (!resumed) {
      await sendEmbedWithButtons(
        ctx.delivery,
        ctx.config.botToken,
        threadId,
        {
          description:
            'This session has expired and can no longer be resumed. Start a new `/session` to continue working.',
          color: 0x95a5a6,
        },
        [
          buildActionRow({
            label: 'Archive Thread',
            customId: 'archive_thread',
            style: ButtonStyle.SECONDARY,
            emoji: '📦',
          }),
        ],
      );
    }
    return;
  }

  // Build multimodal content if images are attached
  const contextualContent = await buildMultimodalContent(
    withAuthorContext(text, authorId, authorUsername, threadId),
    attachments,
  );
  const sent = ctx.processManager.sendMessage(sessionId, contextualContent);
  if (!sent) {
    // resumeProcess only accepts strings — include attachment URLs in text so images aren't lost
    const resumeText =
      typeof contextualContent === 'string'
        ? contextualContent
        : appendAttachmentUrls(withAuthorContext(text, authorId, authorUsername, threadId), attachments);
    // Inject previous conversation context so the resumed process has history
    const threadContext = buildPreviousThreadContext(ctx.db, threadId, sessionId);
    const resumeWithContext = threadContext ? `${threadContext}\n\n${resumeText}` : resumeText;
    ctx.processManager.resumeProcess(session, resumeWithContext);
    // Only subscribe if the process actually started — resumeProcess may fail
    // (e.g., worktree cleaned up, spawn error) and returns void, so check the map.
    // Without this guard, the zombie check fires 8s later on a never-started process,
    // sending a false "session ended unexpectedly" crash embed.
    if (!ctx.processManager.isRunning(sessionId)) {
      log.warn('resumeProcess did not start — creating fresh session in thread', { sessionId, threadId });
      // Capture context BEFORE deleting
      const previousContext = buildPreviousThreadContext(ctx.db, threadId, sessionId);
      // Clear stale mapping and create a brand new session, same as expired sessions
      ctx.threadSessions.delete(threadId);
      deleteThreadSession(ctx.db, threadId);
      const resumed = await resumeExpiredThreadSession(
        ctx,
        threadId,
        threadInfo,
        text,
        authorId,
        authorUsername,
        attachments,
        previousContext,
      );
      if (!resumed) {
        await sendEmbed(ctx.delivery, ctx.config.botToken, threadId, {
          description: 'This session could not be resumed. Start a new `/session` to continue.',
          color: 0xff3355,
        });
      }
      return;
    }
    subscribeForResponseWithEmbed(
      ctx.processManager,
      ctx.delivery,
      ctx.config.botToken,
      ctx.db,
      ctx.threadCallbacks,
      sessionId,
      threadId,
      agentName,
      agentModel,
      projectName,
      displayColor,
      displayIcon,
      avatarUrl,
    );
    return;
  }

  subscribeForResponseWithEmbed(
    ctx.processManager,
    ctx.delivery,
    ctx.config.botToken,
    ctx.db,
    ctx.threadCallbacks,
    sessionId,
    threadId,
    agentName,
    agentModel,
    projectName,
    displayColor,
    displayIcon,
    avatarUrl,
  );
}

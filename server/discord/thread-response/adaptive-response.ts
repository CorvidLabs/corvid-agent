import type { DeliveryTracker } from '../../lib/delivery-tracker';
import { createLogger } from '../../lib/logger';
import type { EventCallback } from '../../process/interfaces';
import type { ProcessManager } from '../../process/manager';
import { extractContentImageUrls, extractContentText } from '../../process/types';
import {
  agentColor,
  type ContextUsage,
  CorvidEmbed,
  collapseCodeBlocks,
  type DiscordFileAttachment,
  type EmbedAgentIdentity,
  editEmbed,
  type FooterContext,
  hexColorToInt,
  sendEmbed,
  sendEmbedWithButtons,
  sendEmbedWithFiles,
  sendReplyEmbed,
  sendTypingIndicator,
} from '../embeds';
import { visibleEmbedParts } from './utils';

const log = createLogger('DiscordThreadManager');

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
  displayIcon?: string | null,
  avatarUrl?: string | null,
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
  const footerCtx: FooterContext = { agentName, agentModel, sessionId, projectName, sessionType: 'mention' };
  const authorIdentity: EmbedAgentIdentity = { agentName, displayIcon, avatarUrl };

  // Progress embed state — only created when tool use is detected
  let progressMessageId: string | null = null;
  let progressMode = false;
  let latestContextUsage: ContextUsage | undefined;

  // Keep typing indicator alive continuously until response completes
  const typingInterval = setInterval(() => {
    if (!processManager.isRunning(sessionId)) {
      clearTyping();
      log.warn('Process died while typing indicator active (adaptive)', { sessionId, channelId });
      if (!receivedAnyContent) {
        const { embed: crashEmbed } = new CorvidEmbed()
          .setDescription('The agent session ended unexpectedly. Send a message to start a new session.')
          .setColor(0xff3355)
          .build();
        sendEmbed(delivery, botToken, channelId, crashEmbed).catch((err) => {
          log.warn('Failed to send crash embed', {
            channelId,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
      return;
    }
    sendTypingIndicator(botToken, channelId).catch((err) => {
      log.debug('Typing indicator failed (adaptive)', {
        channelId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }, TYPING_REFRESH_MS);

  const typingSafetyTimeout = setTimeout(() => {
    clearInterval(typingInterval);
    log.warn('Typing indicator safety timeout reached (adaptive)', { sessionId, channelId });
    if (!receivedAnyActivity) {
      const { embed: timeoutEmbed } = new CorvidEmbed()
        .setDescription('The agent appears to be taking too long. It may still be working — send a message to check.')
        .setColor(0xf0b232)
        .build();
      sendEmbed(delivery, botToken, channelId, timeoutEmbed).catch((err) => {
        log.warn('Failed to send timeout embed', {
          channelId,
          error: err instanceof Error ? err.message : String(err),
        });
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

    const parts = visibleEmbedParts(text);
    for (let i = 0; i < parts.length; i++) {
      let sentId: string | null = null;
      const contentBuilder = new CorvidEmbed()
        .setDescription(parts[i])
        .setColor(color)
        .setAgent(authorIdentity)
        .setModel(agentModel)
        .setSession(sessionId);
      if (footerCtx.sessionType) contentBuilder.setSessionType(footerCtx.sessionType);
      if (projectName) contentBuilder.setProject(projectName);
      if (latestContextUsage) contentBuilder.withContextUsage(latestContextUsage);
      const { embed: embedPayload } = contentBuilder.build();
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
    const progressBuilder = CorvidEmbed.progress(footerCtx, authorIdentity);
    if (latestContextUsage) progressBuilder.withContextUsage(latestContextUsage);
    const { embed: progressEmbed } = progressBuilder.build();
    sendEmbed(delivery, botToken, channelId, progressEmbed)
      .then((msgId) => {
        progressMessageId = msgId;
      })
      .catch((err) => {
        log.debug('Failed to send progress embed', {
          channelId,
          error: err instanceof Error ? err.message : String(err),
        });
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
      const ext =
        ct.includes('jpeg') || ct.includes('jpg')
          ? 'jpg'
          : ct.includes('gif')
            ? 'gif'
            : ct.includes('webp')
              ? 'webp'
              : 'png';
      const filename = `image.${ext}`;
      const attachment: DiscordFileAttachment = { name: filename, data, contentType: ct };
      const imgBuilder = new CorvidEmbed()
        .setImage(`attachment://${filename}`)
        .setColor(color)
        .setAgent(authorIdentity)
        .setModel(agentModel)
        .setSession(sessionId);
      if (footerCtx.sessionType) imgBuilder.setSessionType(footerCtx.sessionType);
      if (projectName) imgBuilder.setProject(projectName);
      if (latestContextUsage) imgBuilder.withContextUsage(latestContextUsage);
      const { embed: imgEmbed } = imgBuilder.build();
      await sendEmbedWithFiles(delivery, botToken, channelId, imgEmbed, [attachment]);
    } catch (err) {
      log.warn('Failed to send image to Discord', {
        imageUrl,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const adaptiveCallback: EventCallback = (_sid, event) => {
    if (event.type === 'assistant' && event.message) {
      const msg = event.message as { content?: unknown };
      const contentBlocks = msg.content as string | import('../../process/types').ContentBlock[] | undefined;
      const content = collapseCodeBlocks(extractContentText(contentBlocks)).trim();
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
      const statusText = event.statusMessage.trim();
      if (statusText) {
        receivedAnyActivity = true;
        // Upgrade to progress mode on first tool use
        upgradeToProgressMode();
        const now = Date.now();
        if (now - lastStatusTime >= STATUS_DEBOUNCE_MS && progressMessageId) {
          lastStatusTime = now;
          const toolStatusBuilder = CorvidEmbed.toolStatus(statusText, footerCtx, authorIdentity);
          if (latestContextUsage) toolStatusBuilder.withContextUsage(latestContextUsage);
          const { embed: toolStatusEmbed } = toolStatusBuilder.build();
          editEmbed(delivery, botToken, channelId, progressMessageId, toolStatusEmbed).catch((err) => {
            log.debug('Progress embed edit failed', {
              channelId,
              error: err instanceof Error ? err.message : String(err),
            });
          });
        }
      }
    }

    if (event.type === 'context_usage') {
      const usage = event as { estimatedTokens?: number; contextWindow?: number; usagePercent?: number };
      if (usage.estimatedTokens != null && usage.contextWindow != null && usage.usagePercent != null) {
        latestContextUsage = {
          estimatedTokens: usage.estimatedTokens,
          contextWindow: usage.contextWindow,
          usagePercent: usage.usagePercent,
        };
      }
    }

    if (event.type === 'result') {
      clearTyping();
      if (debounceTimer) clearTimeout(debounceTimer);
      flush()
        .then(() => {
          // Only mark progress embed as done if we upgraded to progress mode
          if (progressMode && progressMessageId) {
            const doneBuilder = CorvidEmbed.done(footerCtx, authorIdentity);
            if (latestContextUsage) doneBuilder.withContextUsage(latestContextUsage);
            const { embed: doneEmbed } = doneBuilder.build();
            editEmbed(delivery, botToken, channelId, progressMessageId, doneEmbed).catch((err) => {
              log.debug('Final progress embed edit failed', {
                channelId,
                error: err instanceof Error ? err.message : String(err),
              });
            });
          }

          // Offer "Continue in Thread" button so the user can move the conversation
          // out of the channel and into a dedicated thread (reduces channel spam).
          const expiresAtUnix = Math.floor(Date.now() / 1000) + 5 * 60;
          const continueBuilder = new CorvidEmbed()
            .setDescription(
              `Reply to continue here, or start a thread for a longer conversation. Expires <t:${expiresAtUnix}:R>.`,
            )
            .setColor(0x95a5a6)
            .setAgent(authorIdentity)
            .setModel(agentModel)
            .setSession(sessionId)
            .withButtons(['continue_thread'])
            .withButtonOverride('continue_thread', `continue_thread:${sessionId}`);
          if (footerCtx.sessionType) continueBuilder.setSessionType(footerCtx.sessionType);
          if (projectName) continueBuilder.setProject(projectName);
          if (latestContextUsage) continueBuilder.withContextUsage(latestContextUsage);
          const { embed: continueEmbed, components } = continueBuilder.build();
          sendEmbedWithButtons(delivery, botToken, channelId, continueEmbed, components!).catch((err) => {
            log.debug('Continue-in-thread embed failed', {
              channelId,
              error: err instanceof Error ? err.message : String(err),
            });
          });
        })
        .catch((err) => {
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

      // If we have a progress embed, update it with the error; otherwise send a new one
      const errBuilder = CorvidEmbed.error(errorType, footerCtx, authorIdentity, errEvent.error?.message);
      if (latestContextUsage) errBuilder.withContextUsage(latestContextUsage);

      if (progressMode && progressMessageId) {
        const { embed: errEmbed } = errBuilder.build();
        editEmbed(delivery, botToken, channelId, progressMessageId, errEmbed).catch((err) => {
          log.debug('Error embed edit failed', { channelId, error: err instanceof Error ? err.message : String(err) });
        });
      } else {
        const { embed: errEmbed } = errBuilder.build();
        sendEmbed(delivery, botToken, channelId, errEmbed).catch((err) => {
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

import type { DeliveryTracker } from '../../lib/delivery-tracker';
import { createLogger } from '../../lib/logger';
import type { EventCallback } from '../../process/interfaces';
import type { ProcessManager } from '../../process/manager';
import { extractContentText } from '../../process/types';
import {
  agentColor,
  type ContextUsage,
  CorvidEmbed,
  collapseCodeBlocks,
  type EmbedAgentIdentity,
  type FooterContext,
  hexColorToInt,
  sendEmbed,
  sendReplyEmbed,
  sendTypingIndicator,
} from '../embeds';
import { visibleEmbedParts } from './utils';

const log = createLogger('DiscordThreadManager');

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
  displayIcon?: string | null,
  avatarUrl?: string | null,
): void {
  let buffer = '';
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let receivedAnyContent = false;
  const TYPING_REFRESH_MS = 8000;
  const TYPING_TIMEOUT_MS = 4 * 60 * 1000; // 4 minute safety timeout
  const ACK_DELAY_MS = 5000;
  let receivedAnyActivity = false; // tracks any activity (content OR tool use)
  let latestContextUsage: ContextUsage | undefined;
  const color = hexColorToInt(displayColor) ?? agentColor(agentName);
  const footerCtx: FooterContext = { agentName, agentModel, sessionId, projectName };
  const authorIdentity: EmbedAgentIdentity = { agentName, displayIcon, avatarUrl };

  // Acknowledgment: if no content arrives within ACK_DELAY_MS, send a brief status
  const ackTimer = setTimeout(() => {
    if (!receivedAnyContent) {
      const ackBuilder = CorvidEmbed.progress(footerCtx, authorIdentity);
      if (latestContextUsage) ackBuilder.withContextUsage(latestContextUsage);
      const { embed: ackEmbed } = ackBuilder.build();
      sendEmbed(delivery, botToken, channelId, ackEmbed).catch((err) => {
        log.debug('Ack embed failed (inline)', { channelId, error: err instanceof Error ? err.message : String(err) });
      });
    }
  }, ACK_DELAY_MS);

  // Keep typing indicator alive continuously until response completes
  const typingInterval = setInterval(() => {
    // Check if the process is still alive
    if (!processManager.isRunning(sessionId)) {
      clearTyping();
      log.warn('Process died while typing indicator active (inline)', { sessionId, channelId });
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
      log.debug('Typing indicator failed (inline)', {
        channelId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }, TYPING_REFRESH_MS);

  // Safety timeout: clear typing if no terminal event arrives
  const typingSafetyTimeout = setTimeout(() => {
    clearInterval(typingInterval);
    log.warn('Typing indicator safety timeout reached (inline)', { sessionId, channelId });
    if (!receivedAnyActivity) {
      const timeoutBuilder = CorvidEmbed.timeout(footerCtx, authorIdentity);
      if (latestContextUsage) timeoutBuilder.withContextUsage(latestContextUsage);
      const { embed: timeoutEmbed } = timeoutBuilder.build();
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
    clearTimeout(ackTimer);
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

  const inlineCallback: EventCallback = (_sid, event) => {
    if (event.type === 'assistant' && event.message) {
      const msg = event.message as { content?: unknown };
      const content = collapseCodeBlocks(
        extractContentText(msg.content as string | import('../../process/types').ContentBlock[] | undefined),
      ).trim();
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
      flush();
      processManager.unsubscribe(sessionId, inlineCallback);
    }

    if (event.type === 'session_error' || event.type === 'session_exited') {
      clearTyping();
      if (debounceTimer) clearTimeout(debounceTimer);
      flush();
      processManager.unsubscribe(sessionId, inlineCallback);
    }
  };

  processManager.subscribe(sessionId, inlineCallback);
}

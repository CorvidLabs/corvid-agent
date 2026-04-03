import type { ProcessManager } from '../../process/manager';
import type { EventCallback } from '../../process/interfaces';
import type { DeliveryTracker } from '../../lib/delivery-tracker';
import { extractContentText, extractContentImageUrls } from '../../process/types';
import { createLogger } from '../../lib/logger';
import {
  sendEmbed,
  sendReplyEmbed,
  editEmbed,
  sendEmbedWithFiles,
  sendTypingIndicator,
  agentColor,
  hexColorToInt,
  collapseCodeBlocks,
  buildFooterText,
  buildAgentAuthor,
  type DiscordFileAttachment,
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
  const author = buildAgentAuthor({ agentName, displayIcon, avatarUrl });

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
      sendEmbed(delivery, botToken, channelId, {
        description: 'The agent appears to be taking too long. It may still be working \u2014 send a message to check.',
        color: 0xf0b232,
      }).catch((err) => {
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
      const embedPayload = {
        description: parts[i],
        color,
        author,
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
      author,
      footer: { text: buildFooterText({ agentName, agentModel, sessionId, projectName, status: 'starting...' }) },
    })
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
      await sendEmbedWithFiles(
        delivery,
        botToken,
        channelId,
        {
          image: { url: `attachment://${filename}` },
          color,
          author,
          footer: { text: buildFooterText({ agentName, agentModel, sessionId, projectName }) },
        },
        [attachment],
      );
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
          editEmbed(delivery, botToken, channelId, progressMessageId, {
            description: `\u23f3 ${statusText}`,
            color: 0x5865f2,
            author,
            footer: { text: buildFooterText({ agentName, agentModel, sessionId, projectName, status: 'working...' }) },
          }).catch((err) => {
            log.debug('Progress embed edit failed', {
              channelId,
              error: err instanceof Error ? err.message : String(err),
            });
          });
        }
      }
    }

    if (event.type === 'result') {
      clearTyping();
      if (debounceTimer) clearTimeout(debounceTimer);
      flush()
        .then(() => {
          // Only mark progress embed as done if we upgraded to progress mode
          if (progressMode && progressMessageId) {
            editEmbed(delivery, botToken, channelId, progressMessageId, {
              description: '\u2705 Done',
              color: 0x57f287,
              author,
              footer: { text: buildFooterText({ agentName, agentModel, sessionId, projectName, status: 'done' }) },
            }).catch((err) => {
              log.debug('Final progress embed edit failed', {
                channelId,
                error: err instanceof Error ? err.message : String(err),
              });
            });
          }
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
          author,
          footer: { text: buildFooterText({ agentName, agentModel, sessionId, projectName, status: errorType }) },
        }).catch((err) => {
          log.debug('Error embed edit failed', { channelId, error: err instanceof Error ? err.message : String(err) });
        });
      } else {
        sendEmbed(delivery, botToken, channelId, {
          title,
          description,
          color: errColor,
          author,
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

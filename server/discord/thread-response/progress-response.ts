import type { DeliveryTracker } from '../../lib/delivery-tracker';
import { createLogger } from '../../lib/logger';
import type { EventCallback } from '../../process/interfaces';
import type { ProcessManager } from '../../process/manager';
import { extractContentImageUrls, extractContentText } from '../../process/types';
import {
  agentColor,
  buildAgentAuthor,
  buildFooterText,
  type ContextUsage,
  collapseCodeBlocks,
  type DiscordFileAttachment,
  editEmbed,
  hexColorToInt,
  sendEmbed,
  sendEmbedWithFiles,
  sendReplyEmbed,
  sendTypingIndicator,
} from '../embeds';
import { visibleEmbedParts } from './utils';

const log = createLogger('DiscordThreadManager');

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
  displayIcon?: string | null,
  avatarUrl?: string | null,
): void {
  let buffer = '';
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let receivedAnyContent = false;
  let lastStatusTime = 0;
  const STATUS_DEBOUNCE_MS = 3000;
  const TYPING_REFRESH_MS = 8000;
  const TYPING_TIMEOUT_MS = 4 * 60 * 1000; // 4 minute safety timeout
  let receivedAnyActivity = false;
  let latestContextUsage: ContextUsage | undefined;
  let lastProgressDescription = 'Working on your request...';
  const color = hexColorToInt(displayColor) ?? agentColor(agentName);
  const author = buildAgentAuthor({ agentName, displayIcon, avatarUrl });
  let progressMessageId: string | null = null;

  // Post the initial progress embed immediately
  sendEmbed(delivery, botToken, channelId, {
    description: 'Working on your request...',
    color: 0x5865f2, // blurple
    author,
    footer: {
      text: buildFooterText(
        { agentName, agentModel, sessionId, projectName, status: 'starting...' },
        latestContextUsage,
      ),
    },
  })
    .then((msgId) => {
      progressMessageId = msgId;
    })
    .catch((err) => {
      log.debug('Failed to send initial progress embed', {
        channelId,
        error: err instanceof Error ? err.message : String(err),
      });
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
          log.warn('Failed to send crash embed', {
            channelId,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
      return;
    }
    sendTypingIndicator(botToken, channelId).catch((err) => {
      log.debug('Typing indicator failed (inline-progress)', {
        channelId,
        error: err instanceof Error ? err.message : String(err),
      });
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
        footer: { text: buildFooterText({ agentName, agentModel, sessionId, projectName }, latestContextUsage) },
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
          footer: { text: buildFooterText({ agentName, agentModel, sessionId, projectName }, latestContextUsage) },
        },
        [attachment],
      );
    } catch (err) {
      log.warn('Failed to send image to Discord (progress)', {
        imageUrl,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const progressCallback: EventCallback = (_sid, event) => {
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
        sendProgressImageUrl(imageUrl);
      }
    }

    if (event.type === 'tool_status' && event.statusMessage) {
      const statusText = event.statusMessage.trim();
      if (statusText) {
        receivedAnyActivity = true;
        lastProgressDescription = `\u23f3 ${statusText}`;
        const now = Date.now();
        if (now - lastStatusTime >= STATUS_DEBOUNCE_MS && progressMessageId) {
          lastStatusTime = now;
          editEmbed(delivery, botToken, channelId, progressMessageId, {
            description: lastProgressDescription,
            color: 0x5865f2,
            author,
            footer: {
              text: buildFooterText(
                { agentName, agentModel, sessionId, projectName, status: 'working...' },
                latestContextUsage,
              ),
            },
          }).catch((err) => {
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
        const now = Date.now();
        if (now - lastStatusTime >= STATUS_DEBOUNCE_MS && progressMessageId) {
          lastStatusTime = now;
          editEmbed(delivery, botToken, channelId, progressMessageId, {
            description: lastProgressDescription,
            color: 0x5865f2,
            author,
            footer: {
              text: buildFooterText(
                { agentName, agentModel, sessionId, projectName, status: 'working...' },
                latestContextUsage,
              ),
            },
          }).catch((err) => {
            log.debug('Context usage embed edit failed', {
              channelId,
              error: err instanceof Error ? err.message : String(err),
            });
          });
        }
      }
    }

    if (event.type === 'context_warning') {
      const warning = event as { level?: string; message?: string; usagePercent?: number };
      if (warning.level === 'critical') {
        sendEmbed(delivery, botToken, channelId, {
          description: `\u26a0\ufe0f ${warning.message || `Context usage at ${warning.usagePercent}%`}`,
          color: 0xf0b232,
          author,
          footer: {
            text: buildFooterText(
              { agentName, agentModel, sessionId, projectName, status: 'context warning' },
              latestContextUsage,
            ),
          },
        }).catch((err) => {
          log.debug('Context warning embed failed', {
            channelId,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    }

    if (event.type === 'result') {
      clearTyping();
      if (debounceTimer) clearTimeout(debounceTimer);
      flush()
        .then(() => {
          // Mark progress embed as done
          if (progressMessageId) {
            editEmbed(delivery, botToken, channelId, progressMessageId, {
              description: '\u2705 Done',
              color: 0x57f287, // green
              author,
              footer: {
                text: buildFooterText(
                  { agentName, agentModel, sessionId, projectName, status: 'done' },
                  latestContextUsage,
                ),
              },
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
      processManager.unsubscribe(sessionId, progressCallback);
    }

    if (event.type === 'session_error' || event.type === 'session_exited') {
      clearTyping();
      processManager.unsubscribe(sessionId, progressCallback);
    }
  };

  processManager.subscribe(sessionId, progressCallback);
}

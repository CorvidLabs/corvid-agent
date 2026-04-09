import type { Database } from 'bun:sqlite';
import type { DeliveryTracker } from '../../lib/delivery-tracker';
import { createLogger } from '../../lib/logger';
import type { EventCallback } from '../../process/interfaces';
import type { ProcessManager } from '../../process/manager';
import { extractContentImageUrls, extractContentText } from '../../process/types';
import {
  agentColor,
  buildActionRow,
  buildAgentAuthor,
  buildFooterText,
  buildFooterWithStats,
  collapseCodeBlocks,
  type DiscordFileAttachment,
  hexColorToInt,
  sendEmbed,
  sendEmbedWithButtons,
  sendEmbedWithFiles,
  sendTypingIndicator,
} from '../embeds';
import type { ThreadCallbackInfo } from '../thread-session-map';
import { formatDuration, normalizeTimestamp } from '../thread-session-map';
import { ButtonStyle } from '../types';
import { sessionErrorEmbed, visibleEmbedParts } from './utils';

const log = createLogger('DiscordThreadManager');

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
  displayIcon?: string | null,
  avatarUrl?: string | null,
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
  const ACK_DELAY_MS = 5000; // send acknowledgment if no content within 5s
  const PROGRESS_INTERVAL_MS = 60_000; // periodic progress every 60s
  let receivedAnyActivity = false; // tracks any activity (content OR tool use)
  let sentErrorMessage = false; // dedup: prevent repeated error messages for same session
  const startTime = Date.now();

  const color = hexColorToInt(displayColor) ?? agentColor(agentName);
  const author = buildAgentAuthor({ agentName, displayIcon, avatarUrl });

  // Acknowledgment: if no content arrives within ACK_DELAY_MS, send a brief status embed
  const ackTimer = setTimeout(() => {
    if (!receivedAnyContent && !sentErrorMessage) {
      sendEmbed(delivery, botToken, threadId, {
        description: 'Received — working on it...',
        color: 0x95a5a6,
        author,
        footer: { text: buildFooterText({ agentName, agentModel, sessionId, projectName, status: 'thinking' }) },
      }).catch((err) => {
        log.debug('Ack embed failed', { threadId, error: err instanceof Error ? err.message : String(err) });
      });
    }
  }, ACK_DELAY_MS);

  // Periodic progress for long-running operations
  const progressInterval = setInterval(() => {
    if (receivedAnyContent || sentErrorMessage) return;
    if (!processManager.isRunning(sessionId)) {
      clearInterval(progressInterval);
      return;
    }
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    sendEmbed(delivery, botToken, threadId, {
      description: `Still working (${elapsed}s elapsed)...`,
      color: 0x95a5a6,
      author,
      footer: { text: buildFooterText({ agentName, agentModel, sessionId, projectName, status: 'working...' }) },
    }).catch((err) => {
      log.debug('Progress embed failed', { threadId, error: err instanceof Error ? err.message : String(err) });
    });
  }, PROGRESS_INTERVAL_MS);

  // Keep typing indicator alive continuously until response completes
  const typingInterval = setInterval(() => {
    // Check if the process is still alive
    if (!processManager.isRunning(sessionId)) {
      clearTyping();
      log.warn('Process died while typing indicator active', { sessionId, threadId });
      if (!receivedAnyContent && !sentErrorMessage) {
        sentErrorMessage = true;
        sendEmbedWithButtons(
          delivery,
          botToken,
          threadId,
          {
            description: 'The agent session ended unexpectedly. Send a message to resume.',
            color: 0xff3355,
            author,
            footer: { text: buildFooterText({ agentName, agentModel, sessionId, projectName, status: 'crashed' }) },
          },
          [buildActionRow({ label: 'Resume', customId: 'resume_thread', style: ButtonStyle.SUCCESS, emoji: '🔄' })],
        ).catch((err) => {
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
    clearTyping();
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
    clearTimeout(ackTimer);
    clearInterval(progressInterval);
  };

  const flush = async () => {
    if (!buffer) return;
    const text = buffer;
    buffer = '';

    const parts = visibleEmbedParts(text);
    for (const part of parts) {
      await sendEmbed(delivery, botToken, threadId, {
        description: part,
        color,
        author,
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
        threadId,
        {
          image: { url: `attachment://${filename}` },
          color,
          author,
          footer: { text: buildFooterText({ agentName, agentModel, sessionId, projectName }) },
        },
        [attachment],
      );
    } catch (err) {
      log.warn('Failed to send image to Discord thread', {
        imageUrl,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const callback: EventCallback = (_sid, event) => {
    if (event.type === 'assistant' && event.message) {
      const msg = event.message as { content?: unknown };
      const contentBlocks = msg.content as string | import('../../process/types').ContentBlock[] | undefined;
      const content = collapseCodeBlocks(extractContentText(contentBlocks)).trim();

      if (content) {
        if (!receivedAnyContent) {
          // Cancel ack + progress now that real content is arriving
          clearTimeout(ackTimer);
          clearInterval(progressInterval);
        }
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
      const statusText = event.statusMessage.trim();
      if (statusText) {
        receivedAnyActivity = true;
        const now = Date.now();
        if (now - lastStatusTime >= STATUS_DEBOUNCE_MS) {
          lastStatusTime = now;
          sendEmbed(delivery, botToken, threadId, {
            description: `⏳ ${statusText}`,
            color: 0x95a5a6,
            author,
            footer: { text: buildFooterText({ agentName, agentModel, sessionId, projectName, status: 'working...' }) },
          }).catch((err) => {
            log.debug('Tool status embed failed', {
              threadId,
              error: err instanceof Error ? err.message : String(err),
            });
          });
        }
        if (now - lastTypingTime >= TYPING_REFRESH_MS) {
          lastTypingTime = now;
          sendTypingIndicator(botToken, threadId).catch((err) => {
            log.debug('Typing indicator failed', { threadId, error: err instanceof Error ? err.message : String(err) });
          });
        }
      }
    }

    if (event.type === 'context_warning') {
      const warning = event as { level?: string; message?: string; usagePercent?: number };
      if (warning.level === 'critical') {
        sendEmbed(delivery, botToken, threadId, {
          description: `⚠️ ${warning.message || `Context usage at ${warning.usagePercent}%`}`,
          color: 0xf0b232, // yellow/warning
          author,
          footer: {
            text: buildFooterText({ agentName, agentModel, sessionId, projectName, status: 'context warning' }),
          },
        }).catch((err) => {
          log.debug('Context warning embed failed', {
            threadId,
            error: err instanceof Error ? err.message : String(err),
          });
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
          const row = db
            .query<
              {
                total_turns: number;
                work_dir: string | null;
                created_at: string;
              },
              [string]
            >('SELECT total_turns, work_dir, created_at FROM sessions WHERE id = ?')
            .get(sessionId);

          // Fetch tool call count from session_metrics
          const metricsRow = db
            .query<{ tool_call_count: number }, [string]>(
              'SELECT tool_call_count FROM session_metrics WHERE session_id = ? ORDER BY created_at DESC LIMIT 1',
            )
            .get(sessionId);
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
                    const p = Bun.spawn(['git', 'diff', 'main...HEAD', '--name-only'], {
                      cwd: row.work_dir!,
                      stdout: 'pipe',
                      stderr: 'pipe',
                    });
                    const out = await new Response(p.stdout).text();
                    const code = await p.exited;
                    return code === 0 ? out.trim() : '';
                  })(),
                  (async () => {
                    const p = Bun.spawn(['git', 'rev-list', '--count', 'main...HEAD'], {
                      cwd: row.work_dir!,
                      stdout: 'pipe',
                      stderr: 'pipe',
                    });
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
        await sendEmbedWithButtons(
          delivery,
          botToken,
          threadId,
          {
            description: 'Session complete. Send a message to continue the conversation.',
            color: 0x57f287,
            author,
            ...(fields.length > 0 ? { fields } : {}),
            footer: { text: buildFooterWithStats(footerCtx, footerStats) },
          },
          [
            buildActionRow(
              { label: 'Continue', customId: 'resume_thread', style: ButtonStyle.SUCCESS, emoji: '💬' },
              { label: 'Archive Thread', customId: 'archive_thread', style: ButtonStyle.SECONDARY, emoji: '📦' },
            ),
          ],
        );
      })().catch((err) => {
        log.debug('Session complete embed failed', {
          threadId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    if (event.type === 'session_error') {
      clearTyping();
      if (sentErrorMessage) return; // dedup: only show one error per session lifecycle
      sentErrorMessage = true;

      const errEvent = event as { error?: { message?: string; errorType?: string; recoverable?: boolean } };
      const errorType = errEvent.error?.errorType || 'unknown';

      // Differentiated messages per error type
      const { title, description, color } = sessionErrorEmbed(errorType, errEvent.error?.message);

      sendEmbedWithButtons(
        delivery,
        botToken,
        threadId,
        {
          title,
          description,
          color,
          author,
          footer: { text: buildFooterText({ agentName, agentModel, sessionId, projectName, status: errorType }) },
        },
        [buildActionRow({ label: 'Resume', customId: 'resume_thread', style: ButtonStyle.SUCCESS, emoji: '🔄' })],
      ).catch((err) => {
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

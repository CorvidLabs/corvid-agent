import type { Database } from 'bun:sqlite';
import { getSessionActiveDurationMs, getSessionCumulativeTurns, getSessionTurns } from '../../db/sessions';
import type { DeliveryTracker } from '../../lib/delivery-tracker';
import { createLogger } from '../../lib/logger';
import type { EventCallback } from '../../process/interfaces';
import type { ProcessManager } from '../../process/manager';
import { extractContentImageUrls, extractContentText } from '../../process/types';
import {
  agentColor,
  type ContextUsage,
  collapseCodeBlocks,
  CorvidEmbed,
  type DiscordFileAttachment,
  type EmbedAgentIdentity,
  type FooterContext,
  editEmbed,
  hexColorToInt,
  sendEmbed,
  sendEmbedWithButtons,
  sendEmbedWithFiles,
  sendTypingIndicator,
} from '../embeds';
import type { ThreadCallbackInfo } from '../thread-session-map';
import { formatDuration, normalizeTimestamp } from '../thread-session-map';
import { visibleEmbedParts } from './utils';

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
  let latestContextUsage: ContextUsage | undefined;

  const color = hexColorToInt(displayColor) ?? agentColor(agentName);
  const footerCtx: FooterContext = { agentName, agentModel, sessionId, projectName };
  const authorIdentity: EmbedAgentIdentity = { agentName, displayIcon, avatarUrl };

  // Single progress message — created on first activity, edited in place for updates.
  // Eliminates message spam: instead of N status embeds, one embed is updated.
  let progressMessageId: string | null = null;

  const getTurnInfo = () => ({
    active: getSessionTurns(db, sessionId),
    cumulative: getSessionCumulativeTurns(db, sessionId),
  });

  /** Post or upgrade the progress message. First call sends it, subsequent calls edit it. */
  const updateProgressEmbed = async (builder: CorvidEmbed) => {
    const t = getTurnInfo();
    if (latestContextUsage) builder.withContextUsage(latestContextUsage);
    builder.withTurns(t.active, t.cumulative);
    const { embed } = builder.build();
    if (progressMessageId) {
      await editEmbed(delivery, botToken, threadId, progressMessageId, embed);
    } else {
      progressMessageId = await sendEmbed(delivery, botToken, threadId, embed);
    }
  };

  // Acknowledgment: if no content arrives within ACK_DELAY_MS, send a progress embed
  const ackTimer = setTimeout(() => {
    if (!receivedAnyContent && !sentErrorMessage) {
      updateProgressEmbed(CorvidEmbed.progress(footerCtx, authorIdentity)).catch((err) => {
        log.debug('Ack embed failed', { threadId, error: err instanceof Error ? err.message : String(err) });
      });
    }
  }, ACK_DELAY_MS);

  // Periodic progress for long-running operations — edits the same message
  const progressInterval = setInterval(() => {
    if (receivedAnyContent || sentErrorMessage) return;
    if (!processManager.isRunning(sessionId)) {
      clearInterval(progressInterval);
      return;
    }
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    updateProgressEmbed(CorvidEmbed.toolStatus(`Still working (${elapsed}s elapsed)...`, footerCtx, authorIdentity)).catch((err) => {
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
        // If we have an existing progress message, update it to show the crash.
        // Otherwise send a new embed.
        if (progressMessageId) {
          // Build the crash embed without buttons for editing in-place
          const crashNoButtonBuilder = new CorvidEmbed()
            .setDescription('The agent session ended unexpectedly. Send a message to resume.')
            .setColor(0xff3355)
            .setAgent(authorIdentity)
            .setStatus('crashed')
            .setModel(agentModel)
            .setSession(sessionId);
          if (projectName) crashNoButtonBuilder.setProject(projectName);
          if (latestContextUsage) crashNoButtonBuilder.withContextUsage(latestContextUsage);
          const ct = getTurnInfo();
          crashNoButtonBuilder.withTurns(ct.active, ct.cumulative);
          const { embed: crashEmbed } = crashNoButtonBuilder.build();
          editEmbed(delivery, botToken, threadId, progressMessageId, crashEmbed).catch((err) => {
            log.warn('Failed to update progress embed with crash', {
              threadId,
              error: err instanceof Error ? err.message : String(err),
            });
          });
        } else {
          const ct2 = getTurnInfo();
          const crashBuilder = CorvidEmbed.crash(footerCtx, authorIdentity);
          if (latestContextUsage) crashBuilder.withContextUsage(latestContextUsage);
          crashBuilder.withTurns(ct2.active, ct2.cumulative);
          const { embed: crashEmbed, components } = crashBuilder.build();
          sendEmbedWithButtons(delivery, botToken, threadId, crashEmbed, components!).catch((err) => {
            log.warn('Failed to send crash embed', {
              threadId,
              error: err instanceof Error ? err.message : String(err),
            });
          });
        }
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
      const { embed } = CorvidEmbed.timeout(footerCtx, authorIdentity).build();
      sendEmbed(delivery, botToken, threadId, embed).catch((err) => {
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

    const t = getTurnInfo();
    const parts = visibleEmbedParts(text);
    for (const part of parts) {
      const contentBuilder = new CorvidEmbed()
        .setDescription(part)
        .setColor(color)
        .setAgent(authorIdentity)
        .setModel(agentModel)
        .setSession(sessionId)
        .withTurns(t.active, t.cumulative);
      if (latestContextUsage) contentBuilder.withContextUsage(latestContextUsage);
      if (projectName) contentBuilder.setProject(projectName);
      const { embed: contentEmbed } = contentBuilder.build();
      await sendEmbed(delivery, botToken, threadId, contentEmbed);
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
      const imgT = getTurnInfo();
      const imgBuilder = new CorvidEmbed()
        .setImage(`attachment://${filename}`)
        .setColor(color)
        .setAgent(authorIdentity)
        .setModel(agentModel)
        .setSession(sessionId)
        .withTurns(imgT.active, imgT.cumulative);
      if (latestContextUsage) imgBuilder.withContextUsage(latestContextUsage);
      if (projectName) imgBuilder.setProject(projectName);
      const { embed: imgEmbed } = imgBuilder.build();
      await sendEmbedWithFiles(delivery, botToken, threadId, imgEmbed, [attachment]);
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
          // Edit the progress message in place instead of posting a new embed
          updateProgressEmbed(CorvidEmbed.toolStatus(statusText, footerCtx, authorIdentity)).catch((err) => {
            log.debug('Tool status embed edit failed', {
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

    if (event.type === 'context_warning') {
      const warning = event as { level?: string; message?: string; usagePercent?: number };
      if (warning.level === 'critical') {
        const wt = getTurnInfo();
        const warnBuilder = new CorvidEmbed()
          .setDescription(`⚠️ ${warning.message || `Context usage at ${warning.usagePercent}%`}`)
          .setColor(0xf0b232)
          .setAgent(authorIdentity)
          .setModel(agentModel)
          .setSession(sessionId)
          .setStatus('context warning')
          .withTurns(wt.active, wt.cumulative);
        if (latestContextUsage) warnBuilder.withContextUsage(latestContextUsage);
        if (projectName) warnBuilder.setProject(projectName);
        const { embed: warnEmbed } = warnBuilder.build();
        sendEmbed(delivery, botToken, threadId, warnEmbed).catch((err) => {
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

      const kaRow = db
        .query<{ keep_alive: number }, [string]>('SELECT keep_alive FROM sessions WHERE id = ?')
        .get(sessionId);
      const isKeepAlive = kaRow?.keep_alive === 1;

      if (isKeepAlive) {
        // Keep-alive turn complete: show warm status with TTL, stay subscribed for future turns
        if (progressMessageId) {
          const ttlMs = parseInt(process.env.KEEP_ALIVE_TTL_MS ?? String(15 * 60 * 1000), 10);
          const expiresAt = Math.floor((Date.now() + ttlMs) / 1000);
          const dt = getTurnInfo();
          const warmBuilder = CorvidEmbed.warm(footerCtx, authorIdentity, expiresAt);
          if (latestContextUsage) warmBuilder.withContextUsage(latestContextUsage);
          warmBuilder.withTurns(dt.active, dt.cumulative);
          const { embed: warmEmbed } = warmBuilder.build();
          editEmbed(delivery, botToken, threadId, progressMessageId, warmEmbed).catch((err) => {
            log.debug('Progress warm edit failed', {
              threadId,
              error: err instanceof Error ? err.message : String(err),
            });
          });
        }
        buffer = '';
        receivedAnyContent = false;
        receivedAnyActivity = false;
        sentErrorMessage = false;
        progressMessageId = null;
        return;
      }

      processManager.unsubscribe(sessionId, callback);
      threadCallbacks.delete(threadId);

      // Mark the progress message as done (if it exists) before sending the completion embed
      if (progressMessageId) {
        const dt = getTurnInfo();
        const doneBuilder = CorvidEmbed.done(footerCtx, authorIdentity);
        if (latestContextUsage) doneBuilder.withContextUsage(latestContextUsage);
        doneBuilder.withTurns(dt.active, dt.cumulative);
        const { embed: doneEmbed } = doneBuilder.build();
        editEmbed(delivery, botToken, threadId, progressMessageId, doneEmbed).catch((err) => {
          log.debug('Progress done edit failed', { threadId, error: err instanceof Error ? err.message : String(err) });
        });
      }

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
                cumulative_turns: number | null;
                work_dir: string | null;
                created_at: string;
              },
              [string]
            >('SELECT total_turns, cumulative_turns, work_dir, created_at FROM sessions WHERE id = ?')
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
            // Active duration — accumulated process runtime, falls back to wall clock for legacy sessions
            const activeDuration = getSessionActiveDurationMs(db, sessionId);
            const createdAt = normalizeTimestamp(row.created_at);
            const startMs = new Date(createdAt).getTime();
            const durationMs = activeDuration > 0 ? activeDuration : Date.now() - startMs;
            fields.push({ name: 'Duration', value: formatDuration(durationMs), inline: true });

            // Turns
            statsTurns = row.total_turns;
            const cumTurns = row.cumulative_turns ?? row.total_turns;
            if (row.total_turns > 0) {
              const turnsDisplay =
                cumTurns > row.total_turns ? `${row.total_turns} (${cumTurns} total)` : String(row.total_turns);
              fields.push({ name: 'Turns', value: turnsDisplay, inline: true });
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

        const completionCtx: FooterContext = { agentName, agentModel, sessionId, projectName, status: 'done' };
        const footerStats = { filesChanged: statsFiles, turns: statsTurns, tools: statsTools, commits: statsCommits };
        const statsCumulative = getSessionCumulativeTurns(db, sessionId);

        const completionBuilder = CorvidEmbed.completion(completionCtx, authorIdentity)
          .setFields(fields)
          .withStats(footerStats, statsCumulative);
        if (latestContextUsage) completionBuilder.withContextUsage(latestContextUsage);
        const { embed: completionEmbed, components } = completionBuilder.build();

        await sendEmbedWithButtons(delivery, botToken, threadId, completionEmbed, components!);
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

      // If we have a progress message, update it to show the error; otherwise send new
      const et = getTurnInfo();
      const errBuilder = CorvidEmbed.error(errorType, footerCtx, authorIdentity, errEvent.error?.message);
      if (latestContextUsage) errBuilder.withContextUsage(latestContextUsage);
      errBuilder.withTurns(et.active, et.cumulative);

      if (progressMessageId) {
        const { embed: errEmbed } = errBuilder.build();
        editEmbed(delivery, botToken, threadId, progressMessageId, errEmbed).catch((err) => {
          log.debug('Session error embed edit failed', {
            threadId,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      } else {
        errBuilder.withButtons(['resume']);
        const { embed: errEmbed, components } = errBuilder.build();
        sendEmbedWithButtons(delivery, botToken, threadId, errEmbed, components!).catch((err) => {
          log.debug('Session error embed failed', {
            threadId,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    }

    if (event.type === 'session_exited') {
      clearTyping();
      if (debounceTimer) clearTimeout(debounceTimer);
      flush();

      // For keep-alive sessions, show completion embed here (it was deferred at result time)
      const exitKaRow = db
        .query<{ keep_alive: number }, [string]>('SELECT keep_alive FROM sessions WHERE id = ?')
        .get(sessionId);
      if (exitKaRow?.keep_alive === 1) {
        const activeDuration = getSessionActiveDurationMs(db, sessionId);
        const dt = getTurnInfo();
        const fields: Array<{ name: string; value: string; inline?: boolean }> = [];
        if (activeDuration > 0) {
          fields.push({ name: 'Active Time', value: formatDuration(activeDuration), inline: true });
        }
        const cumTurns = getSessionCumulativeTurns(db, sessionId);
        if (cumTurns > 0) {
          fields.push({ name: 'Turns', value: String(cumTurns), inline: true });
        }

        const exitCtx: FooterContext = { agentName, agentModel, sessionId, projectName, status: 'done' };
        const exitBuilder = CorvidEmbed.completion(exitCtx, authorIdentity)
          .setFields(fields)
          .withTurns(dt.active, dt.cumulative);
        if (latestContextUsage) exitBuilder.withContextUsage(latestContextUsage);
        const { embed: exitEmbed, components } = exitBuilder.build();
        sendEmbedWithButtons(delivery, botToken, threadId, exitEmbed, components!).catch((err) => {
          log.debug('Keep-alive completion embed failed', {
            threadId,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }

      processManager.unsubscribe(sessionId, callback);
      threadCallbacks.delete(threadId);
    }
  };

  processManager.subscribe(sessionId, callback);
  threadCallbacks.set(threadId, { sessionId, callback });
}

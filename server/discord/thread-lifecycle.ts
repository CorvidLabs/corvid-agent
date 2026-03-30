/**
 * Discord thread lifecycle management.
 *
 * Handles thread creation, archival, and stale thread cleanup via the Discord REST API.
 */

import type { DeliveryTracker } from '../lib/delivery-tracker';
import { createLogger } from '../lib/logger';
import type { ProcessManager } from '../process/manager';
import { assertSnowflake, buildActionRow, sendEmbedWithButtons } from './embeds';
import type { ThreadCallbackInfo, ThreadSessionInfo } from './thread-session-map';
import { ButtonStyle } from './types';

const log = createLogger('DiscordThreadLifecycle');

/**
 * Archive a single Discord thread via the REST API.
 */
export async function archiveThread(botToken: string, threadId: string): Promise<void> {
  assertSnowflake(threadId, 'thread ID');
  const response = await fetch(`https://discord.com/api/v10/channels/${threadId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bot ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ archived: true }),
  });

  if (!response.ok) {
    const error = await response.text();
    log.warn('Failed to archive thread', { threadId, status: response.status, error: error.slice(0, 200) });
  }
}

/**
 * Create a standalone Discord thread (not attached to a message).
 * Used by /session command. Returns the thread channel ID, or null on failure.
 */
export async function createStandaloneThread(
  botToken: string,
  channelId: string,
  name: string,
): Promise<string | null> {
  assertSnowflake(channelId, 'channel ID');
  const safeChannelId = encodeURIComponent(channelId);
  const response = await fetch(`https://discord.com/api/v10/channels/${safeChannelId}/threads`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: name.slice(0, 100),
      type: 11, // GUILD_PUBLIC_THREAD
      auto_archive_duration: 1440, // 24 hours
    }),
  });

  if (response.ok) {
    const thread = (await response.json()) as { id: string };
    log.info('Discord standalone thread created', { threadId: thread.id, name: name.slice(0, 60) });
    return thread.id;
  }

  const error = await response.text();
  log.error('Failed to create Discord thread', { status: response.status, error: error.slice(0, 200) });
  return null;
}

/**
 * Archive threads that have been inactive for staleThresholdMs.
 */
export async function archiveStaleThreads(
  processManager: ProcessManager,
  delivery: DeliveryTracker,
  botToken: string,
  threadLastActivity: Map<string, number>,
  threadSessions: Map<string, ThreadSessionInfo>,
  threadCallbacks: Map<string, ThreadCallbackInfo>,
  staleThresholdMs: number,
): Promise<void> {
  const now = Date.now();
  const staleThreads: string[] = [];

  for (const [threadId, lastActive] of threadLastActivity) {
    if (now - lastActive >= staleThresholdMs) {
      staleThreads.push(threadId);
    }
  }

  for (const threadId of staleThreads) {
    try {
      await sendEmbedWithButtons(
        delivery,
        botToken,
        threadId,
        {
          description: 'This conversation has been idle. Archiving thread.',
          color: 0x95a5a6,
        },
        [buildActionRow({ label: 'Resume', customId: 'resume_thread', style: ButtonStyle.SUCCESS, emoji: '🔄' })],
      );

      await archiveThread(botToken, threadId);
      threadLastActivity.delete(threadId);
      threadSessions.delete(threadId);
      const cb = threadCallbacks.get(threadId);
      if (cb) {
        processManager.unsubscribe(cb.sessionId, cb.callback);
        threadCallbacks.delete(threadId);
      }
      log.info('Auto-archived stale thread', { threadId });
    } catch (err) {
      log.warn('Failed to archive stale thread', {
        threadId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

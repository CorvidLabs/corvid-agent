/**
 * Discord thread lifecycle management.
 *
 * Handles thread creation, archival, and stale thread cleanup via the Discord REST API.
 */

import type { Database } from 'bun:sqlite';
import { deleteThreadSession } from '../db/discord-thread-sessions';
import { createLogger } from '../lib/logger';
import type { ProcessManager } from '../process/manager';
import { assertSnowflake, buildActionRow } from './embeds';
import { getRestClient } from './rest-client';
import type { ThreadCallbackInfo, ThreadSessionInfo } from './thread-session-map';
import { ButtonStyle } from './types';

const log = createLogger('DiscordThreadLifecycle');

/**
 * Archive a single Discord thread via the REST API.
 */
export async function archiveThread(threadId: string): Promise<void> {
  assertSnowflake(threadId, 'thread ID');
  try {
    await getRestClient().modifyChannel(threadId, { archived: true });
  } catch (err) {
    log.warn('Failed to archive thread', { threadId, error: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * Create a standalone Discord thread (not attached to a message).
 * Used by /session command. Returns the thread channel ID, or null on failure.
 */
export async function createStandaloneThread(channelId: string, name: string): Promise<string | null> {
  assertSnowflake(channelId, 'channel ID');
  try {
    const thread = await getRestClient().createThread(channelId, {
      name: name.slice(0, 100),
      type: 11, // GUILD_PUBLIC_THREAD
      auto_archive_duration: 1440, // 24 hours
    });
    log.info('Discord standalone thread created', { threadId: thread.id, name: name.slice(0, 60) });
    return thread.id;
  } catch (err) {
    log.error('Failed to create Discord thread', {
      channelId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Archive threads that have been inactive for staleThresholdMs.
 */
export async function archiveStaleThreads(
  processManager: ProcessManager,
  threadLastActivity: Map<string, number>,
  threadSessions: Map<string, ThreadSessionInfo>,
  threadCallbacks: Map<string, ThreadCallbackInfo>,
  staleThresholdMs: number,
  db?: Database,
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
      await getRestClient().sendMessage(threadId, {
        embeds: [
          {
            description: 'This conversation has been idle. Archiving thread.',
            color: 0x95a5a6,
          },
        ],
        components: [
          buildActionRow({ label: 'Resume', customId: 'resume_thread', style: ButtonStyle.SUCCESS, emoji: '🔄' }),
        ],
      });

      await archiveThread(threadId);
      threadLastActivity.delete(threadId);
      threadSessions.delete(threadId);
      if (db) deleteThreadSession(db, threadId);
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

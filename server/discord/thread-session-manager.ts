/**
 * ThreadSessionManager — owns all thread/session/mention state for DiscordBridge.
 *
 * Centralises the five Maps/Sets that were previously scattered across
 * DiscordBridge fields, and adds TTL-based cleanup for mention sessions.
 */

import type { MentionSessionInfo } from './message-handler';
import type { ThreadCallbackInfo, ThreadSessionInfo } from './thread-session-map';

export type { ThreadCallbackInfo, ThreadSessionInfo };

const MENTION_TTL_MS = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const PROCESSED_IDS_CAP = 1000;

export class ThreadSessionManager {
  /** Thread↔session mapping (threadId → session info). */
  readonly threadSessions: Map<string, ThreadSessionInfo> = new Map();

  /** Active subscription callbacks per thread — used to unsubscribe before re-subscribing. */
  readonly threadCallbacks: Map<string, ThreadCallbackInfo> = new Map();

  /** Last activity timestamp per thread — used for stale detection. */
  readonly threadLastActivity: Map<string, number> = new Map();

  /** Maps bot reply message IDs → session info for mention-reply context in channels. */
  readonly mentionSessions: Map<string, MentionSessionInfo> = new Map();

  /** Recently processed Discord message IDs — prevents duplicate handling across overlapping gateway connections. Capped at 1000 entries. */
  readonly processedMessageIds: Set<string> = new Set();

  /** Track creation timestamps for mention sessions (for TTL cleanup). */
  private readonly mentionSessionTimestamps: Map<string, number> = new Map();

  /**
   * Start a periodic cleanup interval that removes expired mention sessions
   * (older than 30 min) and caps processedMessageIds at 1000 entries.
   *
   * @returns A cleanup function that stops the interval timer.
   */
  startTtlCleanup(): () => void {
    const timer = setInterval(() => {
      this.runCleanup();
    }, CLEANUP_INTERVAL_MS);

    return () => clearInterval(timer);
  }

  /**
   * Track a mention session with its creation timestamp.
   */
  trackMentionSession(botMessageId: string, info: MentionSessionInfo, createdAt?: number): void {
    this.mentionSessions.set(botMessageId, info);
    this.mentionSessionTimestamps.set(botMessageId, createdAt ?? Date.now());
  }

  /**
   * Remove a mention session and its timestamp.
   */
  cleanupMentionSession(botMessageId: string): void {
    this.mentionSessions.delete(botMessageId);
    this.mentionSessionTimestamps.delete(botMessageId);
  }

  private runCleanup(): void {
    const now = Date.now();

    // Expire mention sessions older than 30 minutes
    for (const [id, ts] of this.mentionSessionTimestamps) {
      if (now - ts > MENTION_TTL_MS) {
        this.mentionSessions.delete(id);
        this.mentionSessionTimestamps.delete(id);
      }
    }

    // Cap processedMessageIds at 1000 — drop oldest entries (Set preserves insertion order)
    if (this.processedMessageIds.size > PROCESSED_IDS_CAP) {
      const excess = this.processedMessageIds.size - PROCESSED_IDS_CAP;
      let removed = 0;
      for (const id of this.processedMessageIds) {
        if (removed >= excess) break;
        this.processedMessageIds.delete(id);
        removed++;
      }
    }
  }
}

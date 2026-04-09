/**
 * ThreadSessionManager — owns all thread/session/mention state for DiscordBridge.
 *
 * Centralises the five Maps/Sets that were previously scattered across
 * DiscordBridge fields, and adds:
 *   - TTL-based cleanup for mention sessions
 *   - Thread subscription lifecycle (subscribe/recover)
 *   - Auto-detection of sessions that resume without an active subscription
 */

import type { Database } from 'bun:sqlite';
import { getAgent } from '../db/agents';
import { getSession } from '../db/sessions';
import type { DeliveryTracker } from '../lib/delivery-tracker';
import type { ProcessManager } from '../process/manager';
import type { MentionSessionInfo } from './message-handler';
import {
  recoverActiveMentionSessions,
  recoverActiveThreadSessions,
  recoverActiveThreadSubscriptions,
  subscribeForResponseWithEmbed,
} from './thread-manager';
import type { ThreadCallbackInfo, ThreadSessionInfo } from './thread-session-map';

export type { ThreadCallbackInfo, ThreadSessionInfo };

const MENTION_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
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

  private readonly db: Database;
  private readonly processManager: ProcessManager;
  private readonly delivery: DeliveryTracker;
  private readonly botToken: string;

  constructor(db: Database, processManager: ProcessManager, delivery: DeliveryTracker, botToken: string) {
    this.db = db;
    this.processManager = processManager;
    this.delivery = delivery;
    this.botToken = botToken;
  }

  /**
   * Start a periodic cleanup interval that removes expired mention sessions
   * (older than 6 hours) and caps processedMessageIds at 1000 entries.
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

  /**
   * Subscribe a thread to receive streaming agent responses.
   * Unsubscribes any existing subscription for this thread first.
   */
  subscribeThread(
    sessionId: string,
    threadId: string,
    agentName: string,
    agentModel: string,
    projectName?: string,
    displayColor?: string | null,
    displayIcon?: string | null,
    avatarUrl?: string | null,
  ): void {
    subscribeForResponseWithEmbed(
      this.processManager,
      this.delivery,
      this.botToken,
      this.db,
      this.threadCallbacks,
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

  /**
   * Bulk-recover all active thread sessions, subscriptions, and mention sessions
   * from the database. Call this on gateway ready after server restart.
   */
  recoverSessions(): void {
    recoverActiveThreadSessions(this.db, this.threadSessions, this.threadLastActivity);
    recoverActiveThreadSubscriptions(
      this.db,
      this.processManager,
      this.delivery,
      this.botToken,
      this.threadSessions,
      this.threadCallbacks,
    );
    recoverActiveMentionSessions(this.db, this.mentionSessions, (botMessageId, info, createdAt) =>
      this.trackMentionSession(botMessageId, info, createdAt),
    );
  }

  /**
   * Auto-subscribe a session's Discord thread if no subscription exists yet.
   * Called for each process manager event to catch sessions that resume without
   * an active thread callback (e.g. after server restart mid-session).
   *
   * @returns true if a new subscription was created.
   */
  autoSubscribeSession(sessionId: string): boolean {
    // Already subscribed — nothing to do
    for (const [, cb] of this.threadCallbacks) {
      if (cb.sessionId === sessionId) return false;
    }

    const session = getSession(this.db, sessionId);
    if (!session || session.source !== 'discord' || !session.name?.startsWith('Discord thread:')) {
      return false;
    }

    const threadId = session.name.replace('Discord thread:', '');
    if (!threadId || this.threadCallbacks.has(threadId)) return false;

    const agent = session.agentId ? getAgent(this.db, session.agentId) : null;
    const agentName = agent?.name || 'Agent';
    const agentModel = agent?.model || 'unknown';

    let projectName: string | undefined;
    if (session.projectId) {
      const projectRow = this.db
        .query<{ name: string }, [string]>('SELECT name FROM projects WHERE id = ?')
        .get(session.projectId);
      projectName = projectRow?.name;
    }

    const displayColor = agent?.displayColor;
    const displayIcon = agent?.displayIcon;
    const avatarUrl = agent?.avatarUrl;

    const threadInfo: ThreadSessionInfo = {
      sessionId,
      agentName,
      agentModel,
      ownerUserId: '',
      projectName,
      displayColor,
      displayIcon,
      avatarUrl,
    };

    this.threadSessions.set(threadId, threadInfo);
    try {
      const { saveThreadSession } =
        require('../db/discord-thread-sessions') as typeof import('../db/discord-thread-sessions');
      saveThreadSession(this.db, threadId, threadInfo);
    } catch {
      /* non-critical */
    }

    this.subscribeThread(sessionId, threadId, agentName, agentModel, projectName, displayColor, displayIcon, avatarUrl);
    return true;
  }

  private runCleanup(): void {
    const now = Date.now();

    // Expire mention sessions older than 6 hours
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

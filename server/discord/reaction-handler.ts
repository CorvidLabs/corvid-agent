/**
 * Discord reaction handler — maps emoji reactions on bot messages
 * to reputation feedback submissions.
 *
 * Supported emojis:
 *   👍 → positive feedback
 *   👎 → negative feedback
 *
 * Rate limited to 5 reactions per user per minute.
 */

import type { Database } from 'bun:sqlite';
import { createLogger } from '../lib/logger';
import type { ReputationScorer } from '../reputation/scorer';
import type { MentionSessionInfo } from './message-handler';
import type { ThreadSessionInfo } from './thread-manager';
import type { DiscordReactionData } from './types';

const log = createLogger('DiscordReactionHandler');

/** Maps emoji names to sentiment values. */
const FEEDBACK_EMOJIS: Record<string, 'positive' | 'negative'> = {
  '\u{1F44D}': 'positive', // 👍
  '\u{1F44E}': 'negative', // 👎
};

/** Per-user rate limiting: userId → timestamps of recent reactions. */
const reactionRateLimit = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 5; // max 5 feedback reactions per minute

/** Context needed by the reaction handler. */
export interface ReactionHandlerContext {
  db: Database;
  botUserId: string | null;
  scorer: ReputationScorer | null;
  /** Maps bot reply message IDs → session info for mention-reply context. */
  mentionSessions: Map<string, MentionSessionInfo>;
  /** Maps thread channel IDs → thread session info. */
  threadSessions: Map<string, ThreadSessionInfo>;
}

/**
 * Handle an incoming MESSAGE_REACTION_ADD event.
 *
 * Looks up the session associated with the reacted-to message,
 * then submits feedback to the response_feedback table and records
 * a reputation event.
 */
export function handleReaction(ctx: ReactionHandlerContext, data: DiscordReactionData): void {
  // Ignore reactions from the bot itself
  if (data.user_id === ctx.botUserId) return;

  // Check if the emoji is one we care about
  const sentiment = FEEDBACK_EMOJIS[data.emoji.name];
  if (!sentiment) return;

  // Rate limit check
  if (!checkReactionRateLimit(data.user_id)) {
    log.debug('Reaction rate limited', { userId: data.user_id });
    return;
  }

  // Look up session for this message
  const sessionInfo = resolveSession(ctx, data);
  if (!sessionInfo) {
    log.debug('No session found for reacted message', {
      messageId: data.message_id,
      channelId: data.channel_id,
    });
    return;
  }

  // Require a reputation scorer to record feedback
  if (!ctx.scorer) {
    log.debug('Reputation scorer not available, skipping reaction feedback');
    return;
  }

  const { sessionId, agentId } = sessionInfo;

  // Insert feedback into response_feedback table
  const feedbackId = crypto.randomUUID();
  try {
    ctx.db
      .query(`
            INSERT INTO response_feedback (id, agent_id, session_id, source, sentiment, submitted_by)
            VALUES (?, ?, ?, 'discord', ?, ?)
        `)
      .run(feedbackId, agentId, sessionId, sentiment, `discord:${data.user_id}`);
  } catch (err) {
    log.error('Failed to insert reaction feedback', {
      error: err instanceof Error ? err.message : String(err),
      messageId: data.message_id,
    });
    return;
  }

  // Record reputation event
  const scoreImpact = sentiment === 'positive' ? 2 : -2;
  ctx.scorer.recordEvent({
    agentId,
    eventType: 'feedback_received',
    scoreImpact,
    metadata: { feedbackId, sentiment, source: 'discord_reaction' },
  });

  log.info('Reaction feedback recorded', {
    feedbackId,
    agentId,
    sessionId,
    sentiment,
    userId: data.user_id,
    messageId: data.message_id,
  });
}

/** Resolve the session and agent ID for a reacted-to message. */
function resolveSession(
  ctx: ReactionHandlerContext,
  data: DiscordReactionData,
): { sessionId: string; agentId: string } | null {
  // Check mention sessions (bot reply messages in channels)
  const mentionInfo = ctx.mentionSessions.get(data.message_id);
  if (mentionInfo) {
    // Mention sessions don't store agentId directly — look up from session
    const session = ctx.db.query('SELECT agent_id FROM sessions WHERE id = ?').get(mentionInfo.sessionId) as {
      agent_id: string;
    } | null;
    if (session) {
      return { sessionId: mentionInfo.sessionId, agentId: session.agent_id };
    }
  }

  // Check thread sessions (the reaction is in a thread we're tracking)
  const threadInfo = ctx.threadSessions.get(data.channel_id);
  if (threadInfo) {
    const session = ctx.db.query('SELECT agent_id FROM sessions WHERE id = ?').get(threadInfo.sessionId) as {
      agent_id: string;
    } | null;
    if (session) {
      return { sessionId: threadInfo.sessionId, agentId: session.agent_id };
    }
  }

  return null;
}

/** Check per-user reaction rate limit. Returns true if allowed. */
function checkReactionRateLimit(userId: string): boolean {
  const now = Date.now();
  let timestamps = reactionRateLimit.get(userId);

  if (!timestamps) {
    timestamps = [];
    reactionRateLimit.set(userId, timestamps);
  }

  // Remove expired timestamps
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  while (timestamps.length > 0 && timestamps[0] < cutoff) {
    timestamps.shift();
  }

  if (timestamps.length >= RATE_LIMIT_MAX) {
    return false;
  }

  timestamps.push(now);
  return true;
}

// Exported for testing
export {
  checkReactionRateLimit,
  FEEDBACK_EMOJIS,
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MS,
  reactionRateLimit,
  resolveSession,
};

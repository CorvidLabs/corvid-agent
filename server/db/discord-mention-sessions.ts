import type { Database } from 'bun:sqlite';
import type { MentionSessionInfo } from '../discord/message-handler';

interface MentionSessionRow {
  bot_message_id: string;
  session_id: string;
  agent_name: string;
  agent_model: string;
  project_name: string | null;
  channel_id: string | null;
  conversation_only: number | null;
  created_at: string;
}

/**
 * Persist a mention-reply session mapping to the database.
 */
export function saveMentionSession(db: Database, botMessageId: string, info: MentionSessionInfo): void {
  db.query(
    `INSERT OR REPLACE INTO discord_mention_sessions (bot_message_id, session_id, agent_name, agent_model, project_name, channel_id, conversation_only)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    botMessageId,
    info.sessionId,
    info.agentName,
    info.agentModel,
    info.projectName ?? null,
    info.channelId ?? null,
    info.conversationOnly ? 1 : 0,
  );
}

/**
 * Look up a mention-reply session by bot message ID.
 * Returns null if not found.
 */
export function getMentionSession(db: Database, botMessageId: string): MentionSessionInfo | null {
  const row = db
    .query(
      `SELECT m.*, a.display_color, a.display_icon, a.avatar_url
         FROM discord_mention_sessions m
         LEFT JOIN sessions s ON s.id = m.session_id
         LEFT JOIN agents a ON a.id = s.agent_id
         WHERE m.bot_message_id = ?`,
    )
    .get(botMessageId) as
    | (MentionSessionRow & { display_color: string | null; display_icon: string | null; avatar_url: string | null })
    | null;

  if (!row) return null;

  return {
    sessionId: row.session_id,
    agentName: row.agent_name,
    agentModel: row.agent_model,
    projectName: row.project_name || undefined,
    displayColor: row.display_color ?? undefined,
    displayIcon: row.display_icon ?? undefined,
    avatarUrl: row.avatar_url ?? undefined,
    channelId: row.channel_id || undefined,
    conversationOnly: row.conversation_only === 1,
  };
}

/**
 * Delete all mention session mappings for a given session ID.
 */
export function deleteMentionSessionsBySessionId(db: Database, sessionId: string): void {
  db.query('DELETE FROM discord_mention_sessions WHERE session_id = ?').run(sessionId);
}

/**
 * Load recent mention sessions from the database (e.g. for recovery after restart).
 * @param maxAgeHours Maximum age in hours (default: 24)
 */
export function getRecentMentionSessions(
  db: Database,
  maxAgeHours: number = 24,
): Array<{ botMessageId: string; info: MentionSessionInfo; createdAt: string }> {
  const rows = db
    .query(
      `SELECT m.*, a.display_color, a.display_icon, a.avatar_url
         FROM discord_mention_sessions m
         LEFT JOIN sessions s ON s.id = m.session_id
         LEFT JOIN agents a ON a.id = s.agent_id
         WHERE m.created_at > datetime('now', '-' || ? || ' hours')
         ORDER BY m.created_at DESC`,
    )
    .all(maxAgeHours) as Array<
    MentionSessionRow & { display_color: string | null; display_icon: string | null; avatar_url: string | null }
  >;

  return rows.map((row) => ({
    botMessageId: row.bot_message_id,
    info: {
      sessionId: row.session_id,
      agentName: row.agent_name,
      agentModel: row.agent_model,
      projectName: row.project_name || undefined,
      displayColor: row.display_color ?? undefined,
      displayIcon: row.display_icon ?? undefined,
      avatarUrl: row.avatar_url ?? undefined,
      channelId: row.channel_id || undefined,
      conversationOnly: row.conversation_only === 1,
    },
    createdAt: row.created_at,
  }));
}

/**
 * Look up the most recent mention session in a given channel.
 * Used as a fallback when the user sends a message without using Discord's reply feature.
 * Only returns sessions active within the specified time window.
 * @param maxAgeMinutes Maximum age in minutes (default: 60)
 */
export function getLatestMentionSessionByChannel(
  db: Database,
  channelId: string,
  maxAgeMinutes: number = 60,
): MentionSessionInfo | null {
  const row = db
    .query(
      `SELECT m.*, a.display_color, a.display_icon, a.avatar_url
         FROM discord_mention_sessions m
         LEFT JOIN sessions s ON s.id = m.session_id
         LEFT JOIN agents a ON a.id = s.agent_id
         WHERE m.channel_id = ?
           AND COALESCE(m.last_activity_at, m.created_at) > datetime('now', '-' || ? || ' minutes')
         ORDER BY COALESCE(m.last_activity_at, m.created_at) DESC
         LIMIT 1`,
    )
    .get(channelId, maxAgeMinutes) as
    | (MentionSessionRow & { display_color: string | null; display_icon: string | null; avatar_url: string | null })
    | null;

  if (!row) return null;

  return {
    sessionId: row.session_id,
    agentName: row.agent_name,
    agentModel: row.agent_model,
    projectName: row.project_name || undefined,
    displayColor: row.display_color ?? undefined,
    displayIcon: row.display_icon ?? undefined,
    avatarUrl: row.avatar_url ?? undefined,
    channelId: row.channel_id || undefined,
    conversationOnly: row.conversation_only === 1,
  };
}

/**
 * Get the most recent session ID for a channel, regardless of mention session TTL.
 * Used for context carryover when creating a new session after the resume window expires.
 * Looks back up to 24 hours.
 */
export function getLatestSessionIdByChannel(db: Database, channelId: string): string | null {
  const row = db
    .query(
      `SELECT session_id FROM discord_mention_sessions
       WHERE channel_id = ?
         AND COALESCE(last_activity_at, created_at) > datetime('now', '-24 hours')
       ORDER BY COALESCE(last_activity_at, created_at) DESC
       LIMIT 1`,
    )
    .get(channelId) as { session_id: string } | null;

  return row?.session_id ?? null;
}

/**
 * Update the last_activity_at timestamp for a mention session.
 */
export function updateMentionSessionActivity(db: Database, botMessageId: string): void {
  db.query(`UPDATE discord_mention_sessions SET last_activity_at = datetime('now') WHERE bot_message_id = ?`).run(
    botMessageId,
  );
}

/**
 * Get aggregated message history across all recent sessions in a channel.
 * Returns messages from the most recent sessions (up to maxMessages), ordered chronologically.
 * Used for channel-scoped context when creating a new session.
 */
export function getChannelMessageHistory(
  db: Database,
  channelId: string,
  maxMessages: number = 40,
  maxAgeHours: number = 24,
): Array<{ role: string; content: string; sessionId: string; timestamp: string }> {
  const rows = db
    .query(
      `SELECT sm.role, sm.content, sm.session_id, sm.timestamp
       FROM session_messages sm
       INNER JOIN discord_mention_sessions dms ON dms.session_id = sm.session_id
       WHERE dms.channel_id = ?
         AND dms.created_at > datetime('now', '-' || ? || ' hours')
         AND sm.role IN ('user', 'assistant')
       ORDER BY sm.timestamp DESC
       LIMIT ?`,
    )
    .all(channelId, maxAgeHours, maxMessages) as Array<{
    role: string;
    content: string;
    session_id: string;
    timestamp: string;
  }>;

  return rows
    .reverse()
    .map((r) => ({ role: r.role, content: r.content, sessionId: r.session_id, timestamp: r.timestamp }));
}

/**
 * Remove mention session entries older than the specified age.
 * @param maxAgeDays Maximum age in days (default: 7)
 */
export function pruneOldMentionSessions(db: Database, maxAgeDays: number = 7): number {
  const result = db
    .query(`DELETE FROM discord_mention_sessions WHERE created_at < datetime('now', '-' || ? || ' days')`)
    .run(maxAgeDays);
  return result.changes;
}

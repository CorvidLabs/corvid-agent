import type { Database } from 'bun:sqlite';
import type { MentionSessionInfo } from '../discord/message-handler';

interface MentionSessionRow {
    bot_message_id: string;
    session_id: string;
    agent_name: string;
    agent_model: string;
    created_at: string;
}

/**
 * Persist a mention-reply session mapping to the database.
 */
export function saveMentionSession(
    db: Database,
    botMessageId: string,
    info: MentionSessionInfo,
): void {
    db.query(
        `INSERT OR REPLACE INTO discord_mention_sessions (bot_message_id, session_id, agent_name, agent_model)
         VALUES (?, ?, ?, ?)`,
    ).run(botMessageId, info.sessionId, info.agentName, info.agentModel);
}

/**
 * Look up a mention-reply session by bot message ID.
 * Returns null if not found.
 */
export function getMentionSession(
    db: Database,
    botMessageId: string,
): MentionSessionInfo | null {
    const row = db.query(
        'SELECT * FROM discord_mention_sessions WHERE bot_message_id = ?',
    ).get(botMessageId) as MentionSessionRow | null;

    if (!row) return null;

    return {
        sessionId: row.session_id,
        agentName: row.agent_name,
        agentModel: row.agent_model,
    };
}

/**
 * Delete all mention session mappings for a given session ID.
 */
export function deleteMentionSessionsBySessionId(
    db: Database,
    sessionId: string,
): void {
    db.query('DELETE FROM discord_mention_sessions WHERE session_id = ?').run(sessionId);
}

/**
 * Remove mention session entries older than the specified age.
 * @param maxAgeDays Maximum age in days (default: 7)
 */
export function pruneOldMentionSessions(
    db: Database,
    maxAgeDays: number = 7,
): number {
    const result = db.query(
        `DELETE FROM discord_mention_sessions WHERE created_at < datetime('now', '-' || ? || ' days')`,
    ).run(maxAgeDays);
    return result.changes;
}

import type { Database } from 'bun:sqlite';
import type { ThreadSessionInfo } from '../discord/thread-session-map';

interface ThreadSessionRow {
    thread_id: string;
    session_id: string;
    agent_name: string;
    agent_model: string;
    owner_user_id: string;
    topic: string | null;
    project_name: string | null;
    display_color: string | null;
    display_icon: string | null;
    avatar_url: string | null;
    creator_perm_level: number | null;
    buddy_agent_id: string | null;
    buddy_agent_name: string | null;
    buddy_max_rounds: number | null;
    last_activity_at: string;
    created_at: string;
}

/**
 * Persist a thread session mapping to the database.
 */
export function saveThreadSession(
    db: Database,
    threadId: string,
    info: ThreadSessionInfo,
): void {
    db.query(
        `INSERT OR REPLACE INTO discord_thread_sessions
         (thread_id, session_id, agent_name, agent_model, owner_user_id, topic, project_name,
          display_color, display_icon, avatar_url, creator_perm_level,
          buddy_agent_id, buddy_agent_name, buddy_max_rounds, last_activity_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    ).run(
        threadId,
        info.sessionId,
        info.agentName,
        info.agentModel,
        info.ownerUserId || '',
        info.topic ?? null,
        info.projectName ?? null,
        info.displayColor ?? null,
        info.displayIcon ?? null,
        info.avatarUrl ?? null,
        info.creatorPermLevel ?? null,
        info.buddyConfig?.buddyAgentId ?? null,
        info.buddyConfig?.buddyAgentName ?? null,
        info.buddyConfig?.maxRounds ?? null,
    );
}

/**
 * Look up a thread session by Discord thread ID.
 */
export function getThreadSession(
    db: Database,
    threadId: string,
): ThreadSessionInfo | null {
    const row = db.query(
        `SELECT * FROM discord_thread_sessions WHERE thread_id = ?`,
    ).get(threadId) as ThreadSessionRow | null;

    if (!row) return null;
    return rowToInfo(row);
}

/**
 * Update the last_activity_at timestamp for a thread session.
 */
export function updateThreadSessionActivity(
    db: Database,
    threadId: string,
): void {
    db.query(
        `UPDATE discord_thread_sessions SET last_activity_at = datetime('now') WHERE thread_id = ?`,
    ).run(threadId);
}

/**
 * Bulk-load recent thread sessions for startup recovery.
 * @param maxAgeHours Maximum age in hours (default: 48)
 */
export function getRecentThreadSessions(
    db: Database,
    maxAgeHours: number = 48,
): { threadId: string; info: ThreadSessionInfo; lastActivityAt: number }[] {
    const rows = db.query(
        `SELECT * FROM discord_thread_sessions
         WHERE last_activity_at > datetime('now', '-' || ? || ' hours')
         ORDER BY last_activity_at DESC`,
    ).all(maxAgeHours) as ThreadSessionRow[];

    return rows.map((row) => ({
        threadId: row.thread_id,
        info: rowToInfo(row),
        lastActivityAt: new Date(row.last_activity_at.endsWith('Z') ? row.last_activity_at : row.last_activity_at + 'Z').getTime(),
    }));
}

/**
 * Delete a thread session (e.g. on archival).
 */
export function deleteThreadSession(
    db: Database,
    threadId: string,
): void {
    db.query('DELETE FROM discord_thread_sessions WHERE thread_id = ?').run(threadId);
}

/**
 * Remove thread session entries older than the specified age.
 * @param maxAgeDays Maximum age in days (default: 14)
 */
export function pruneOldThreadSessions(
    db: Database,
    maxAgeDays: number = 14,
): number {
    const result = db.query(
        `DELETE FROM discord_thread_sessions WHERE last_activity_at < datetime('now', '-' || ? || ' days')`,
    ).run(maxAgeDays);
    return result.changes;
}

function rowToInfo(row: ThreadSessionRow): ThreadSessionInfo {
    const info: ThreadSessionInfo = {
        sessionId: row.session_id,
        agentName: row.agent_name,
        agentModel: row.agent_model,
        ownerUserId: row.owner_user_id,
        topic: row.topic || undefined,
        projectName: row.project_name || undefined,
        displayColor: row.display_color ?? undefined,
        displayIcon: row.display_icon ?? undefined,
        avatarUrl: row.avatar_url ?? undefined,
        creatorPermLevel: row.creator_perm_level ?? undefined,
    };
    if (row.buddy_agent_id && row.buddy_agent_name) {
        info.buddyConfig = {
            buddyAgentId: row.buddy_agent_id,
            buddyAgentName: row.buddy_agent_name,
            maxRounds: row.buddy_max_rounds ?? undefined,
        };
    }
    return info;
}

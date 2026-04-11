/**
 * Channel-project affinity — tracks which project was last used in each
 * Discord channel so that @mentions default to the channel's established
 * context instead of the agent's global default.
 */
import type { Database } from 'bun:sqlite';

/**
 * Returns the project ID most recently used in `channelId`, or null if
 * no affinity has been recorded yet.
 */
export function getChannelProjectId(db: Database, channelId: string): string | null {
  const row = db
    .query<{ project_id: string }, [string]>(`SELECT project_id FROM discord_channel_project WHERE channel_id = ?`)
    .get(channelId);
  return row?.project_id ?? null;
}

/**
 * Upserts the channel-project affinity for `channelId`.
 * Called whenever a session is created with an explicit project, so future
 * @mentions in the same channel inherit that context.
 */
export function setChannelProjectId(db: Database, channelId: string, projectId: string): void {
  db.prepare(
    `INSERT INTO discord_channel_project (channel_id, project_id, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(channel_id) DO UPDATE SET project_id = excluded.project_id, updated_at = excluded.updated_at`,
  ).run(channelId, projectId);
}

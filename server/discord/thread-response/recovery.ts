import type { Database } from 'bun:sqlite';
import type { DeliveryTracker } from '../../lib/delivery-tracker';
import { createLogger } from '../../lib/logger';
import type { ProcessManager } from '../../process/manager';
import type { ThreadCallbackInfo, ThreadSessionInfo } from '../thread-session-map';
import type { DiscordBridgeConfig } from '../types';
import { subscribeForResponseWithEmbed } from './embed-response';

const log = createLogger('DiscordThreadManager');

/**
 * Recover event subscriptions for active Discord sessions after server restart.
 */
export function recoverActiveThreadSubscriptions(
  db: Database,
  processManager: ProcessManager,
  delivery: DeliveryTracker,
  botToken: string,
  threadSessions: Map<string, ThreadSessionInfo>,
  threadCallbacks: Map<string, ThreadCallbackInfo>,
): void {
  try {
    const rows = db
      .query(
        `SELECT s.id, s.name, a.name as agent_name, a.model as agent_model, a.display_color, a.display_icon, a.avatar_url, p.name as project_name
             FROM sessions s
             LEFT JOIN agents a ON a.id = s.agent_id
             LEFT JOIN projects p ON p.id = s.project_id
             WHERE s.source = 'discord' AND s.status = 'running'
               AND s.name LIKE 'Discord thread:%'`,
      )
      .all() as {
      id: string;
      name: string;
      agent_name: string;
      agent_model: string;
      display_color: string | null;
      display_icon: string | null;
      avatar_url: string | null;
      project_name: string | null;
    }[];

    let recovered = 0;
    for (const row of rows) {
      const threadId = row.name.replace('Discord thread:', '');
      if (!threadId || threadCallbacks.has(threadId)) continue;

      if (!threadSessions.has(threadId)) {
        const info = {
          sessionId: row.id,
          agentName: row.agent_name || 'Agent',
          agentModel: row.agent_model || 'unknown',
          ownerUserId: '',
          projectName: row.project_name || undefined,
          displayColor: row.display_color ?? undefined,
          displayIcon: row.display_icon ?? undefined,
          avatarUrl: row.avatar_url ?? undefined,
        };
        threadSessions.set(threadId, info);
        // Persist to dedicated table for future fast recovery
        const { saveThreadSession } =
          require('../../db/discord-thread-sessions') as typeof import('../../db/discord-thread-sessions');
        saveThreadSession(db, threadId, info);
      }

      subscribeForResponseWithEmbed(
        processManager,
        delivery,
        botToken,
        db,
        threadCallbacks,
        row.id,
        threadId,
        row.agent_name || 'Agent',
        row.agent_model || 'unknown',
        row.project_name || undefined,
        row.display_color,
        row.display_icon,
        row.avatar_url,
      );
      recovered++;
    }

    if (recovered > 0) {
      log.info('Recovered Discord thread subscriptions', { count: recovered });
    }
  } catch (err) {
    log.warn('Failed to recover thread subscriptions', { error: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * Recover mention sessions from the database after server restart.
 * Populates the in-memory mentionSessions map with recent entries so that
 * reply-based session resumption works immediately without a DB lookup per message.
 */
export function recoverActiveMentionSessions(
  db: Database,
  mentionSessions: Map<string, import('../message-handler').MentionSessionInfo>,
  trackFn?: (botMessageId: string, info: import('../message-handler').MentionSessionInfo, createdAt?: number) => void,
): void {
  try {
    const { getRecentMentionSessions } =
      require('../../db/discord-mention-sessions') as typeof import('../../db/discord-mention-sessions');
    const recent = getRecentMentionSessions(db, 24);

    let recovered = 0;
    for (const entry of recent) {
      if (mentionSessions.has(entry.botMessageId)) continue;
      const createdAtMs = new Date(`${entry.createdAt}Z`).getTime();
      if (trackFn) {
        trackFn(entry.botMessageId, entry.info, createdAtMs);
      } else {
        mentionSessions.set(entry.botMessageId, entry.info);
      }
      recovered++;
    }

    if (recovered > 0) {
      log.info('Recovered Discord mention sessions', { count: recovered });
    }
  } catch (err) {
    log.warn('Failed to recover mention sessions', { error: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * Bulk-recover thread sessions from the discord_thread_sessions table on startup.
 * Populates the in-memory threadSessions and threadLastActivity maps so threads
 * are immediately available without lazy recovery.
 */
export function recoverActiveThreadSessions(
  db: Database,
  threadSessions: Map<string, ThreadSessionInfo>,
  threadLastActivity: Map<string, number>,
): number {
  try {
    const { getRecentThreadSessions } =
      require('../../db/discord-thread-sessions') as typeof import('../../db/discord-thread-sessions');
    const rows = getRecentThreadSessions(db, 48);

    let recovered = 0;
    for (const { threadId, info, lastActivityAt } of rows) {
      if (!threadSessions.has(threadId)) {
        threadSessions.set(threadId, info);
        threadLastActivity.set(threadId, lastActivityAt);
        recovered++;
      }
    }

    if (recovered > 0) {
      log.info('Recovered thread sessions from DB', { count: recovered });
    }
    return recovered;
  } catch (err) {
    log.warn('Failed to recover thread sessions', { error: err instanceof Error ? err.message : String(err) });
    return 0;
  }
}

/**
 * Resolve the default agent.
 * Priority: config default > first agent.
 */
export function resolveDefaultAgent(
  db: Database,
  config: DiscordBridgeConfig,
): import('../../../shared/types').Agent | null {
  const { listAgents } = require('../../db/agents') as typeof import('../../db/agents');
  const agents = listAgents(db);
  if (agents.length === 0) return null;

  if (config.defaultAgentId) {
    const defaultAgent = agents.find((a) => a.id === config.defaultAgentId);
    if (defaultAgent) return defaultAgent;
  }

  return agents[0];
}

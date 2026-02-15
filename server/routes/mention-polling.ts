/**
 * Mention polling routes — CRUD for GitHub mention polling configurations.
 *
 * Endpoints:
 *   GET  /api/mention-polling             — List all polling configs
 *   POST /api/mention-polling             — Create a new polling config
 *   GET  /api/mention-polling/stats       — Get polling service stats
 *   GET  /api/mention-polling/:id         — Get a polling config
 *   PUT  /api/mention-polling/:id         — Update a polling config
 *   DELETE /api/mention-polling/:id       — Delete a polling config
 */

import type { Database } from 'bun:sqlite';
import type { MentionPollingService } from '../polling/service';
import {
    listMentionPollingConfigs,
    getMentionPollingConfig,
    createMentionPollingConfig,
    updateMentionPollingConfig,
    deleteMentionPollingConfig,
} from '../db/mention-polling';
import { parseBodyOrThrow, CreateMentionPollingSchema, UpdateMentionPollingSchema } from '../lib/validation';
import { json, handleRouteError } from '../lib/response';
import { createLogger } from '../lib/logger';

const log = createLogger('PollingRoutes');

/**
 * Handle CRUD routes for mention polling configurations.
 */
export function handleMentionPollingRoutes(
    req: Request,
    url: URL,
    db: Database,
    pollingService: MentionPollingService | null,
): Response | Promise<Response> | null {
    // ── List all polling configs ────────────────────────────────────────────
    if (url.pathname === '/api/mention-polling' && req.method === 'GET') {
        const agentId = url.searchParams.get('agentId') ?? undefined;
        const configs = listMentionPollingConfigs(db, agentId);
        return json({ configs });
    }

    // ── Create polling config ──────────────────────────────────────────────
    if (url.pathname === '/api/mention-polling' && req.method === 'POST') {
        return (async () => {
            try {
                const data = await parseBodyOrThrow(req, CreateMentionPollingSchema);
                const config = createMentionPollingConfig(db, data);
                log.info('Mention polling config created', { id: config.id, repo: config.repo });
                return json(config, 201);
            } catch (err) {
                return handleRouteError(err);
            }
        })();
    }

    // ── Polling stats ──────────────────────────────────────────────────────
    if (url.pathname === '/api/mention-polling/stats' && req.method === 'GET') {
        const stats = pollingService?.getStats() ?? { isRunning: false, activeConfigs: 0, totalConfigs: 0, totalTriggers: 0 };
        return json(stats);
    }

    // ── Single config routes ───────────────────────────────────────────────
    const configMatch = url.pathname.match(/^\/api\/mention-polling\/([^/]+)$/);
    if (configMatch) {
        const id = configMatch[1];

        // Don't match 'stats' as an ID
        if (id === 'stats') return null;

        if (req.method === 'GET') {
            const config = getMentionPollingConfig(db, id);
            if (!config) return json({ error: 'Polling config not found' }, 404);
            return json(config);
        }

        if (req.method === 'PUT') {
            return (async () => {
                try {
                    const data = await parseBodyOrThrow(req, UpdateMentionPollingSchema);
                    const updated = updateMentionPollingConfig(db, id, data);
                    if (!updated) return json({ error: 'Polling config not found' }, 404);
                    return json(updated);
                } catch (err) {
                    return handleRouteError(err);
                }
            })();
        }

        if (req.method === 'DELETE') {
            const deleted = deleteMentionPollingConfig(db, id);
            if (!deleted) return json({ error: 'Polling config not found' }, 404);
            return json({ ok: true });
        }
    }

    return null;
}

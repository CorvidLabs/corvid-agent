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
import { listPollingActivity } from '../db/sessions';
import { parseBodyOrThrow, CreateMentionPollingSchema, UpdateMentionPollingSchema } from '../lib/validation';
import { json, handleRouteError } from '../lib/response';
import { createLogger } from '../lib/logger';

const log = createLogger('PollingRoutes');

interface PromptMeta {
    repo: string | null;
    number: number | null;
    title: string | null;
    sender: string | null;
    url: string | null;
    isPR: boolean;
    triggerType: 'mention' | 'assignment' | 'review' | null;
}

/**
 * Extract structured trigger info from a session's initialPrompt.
 * The prompt uses `**Key:** value` markdown lines set by the polling service.
 */
function parsePromptMeta(prompt: string): PromptMeta {
    const meta: PromptMeta = { repo: null, number: null, title: null, sender: null, url: null, isPR: false, triggerType: null };

    const repoMatch = prompt.match(/\*\*Repository:\*\*\s*(.+)/);
    if (repoMatch) meta.repo = repoMatch[1].trim();

    // PR: #42 "title" or Issue: #8 "title"
    const prMatch = prompt.match(/\*\*PR:\*\*\s*#(\d+)\s*"([^"]*)"/);
    const issueMatch = prompt.match(/\*\*Issue:\*\*\s*#(\d+)\s*"([^"]*)"/);
    if (prMatch) {
        meta.number = parseInt(prMatch[1], 10);
        meta.title = prMatch[2];
        meta.isPR = true;
    } else if (issueMatch) {
        meta.number = parseInt(issueMatch[1], 10);
        meta.title = issueMatch[2];
    }

    // Sender: Comment by / Review by / Assigned...by / Opened by
    const senderMatch = prompt.match(/\*\*(?:Comment|Review|Assigned|Opened)\s+by:\*\*\s*@(\S+)/);
    if (senderMatch) meta.sender = senderMatch[1];

    const urlMatch = prompt.match(/\*\*URL:\*\*\s*(https?:\/\/\S+)/);
    if (urlMatch) meta.url = urlMatch[1];

    // Trigger type from header line
    const header = prompt.match(/##\s+GitHub\s+\S+\s+.*?—\s+(.+?)(?:\s+via\s+polling)?$/m);
    if (header) {
        const label = header[1].toLowerCase();
        if (label.includes('assign')) meta.triggerType = 'assignment';
        else if (label.includes('review')) meta.triggerType = 'review';
        else meta.triggerType = 'mention';
    }

    return meta;
}

/**
 * Fallback: parse number/title from the session name pattern `Poll: repo #42: Title`.
 */
function metaFromName(name: string): Partial<PromptMeta> {
    const m = name.match(/#(\d+):\s*(.*)/);
    return m ? { number: parseInt(m[1], 10), title: m[2] } : {};
}

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

    // ── Polling activity ──────────────────────────────────────────────────
    const activityMatch = url.pathname.match(/^\/api\/mention-polling\/([^/]+)\/activity$/);
    if (activityMatch && req.method === 'GET') {
        const id = activityMatch[1];
        const config = getMentionPollingConfig(db, id);
        if (!config) return json({ error: 'Polling config not found' }, 404);

        const sessions = listPollingActivity(db, config.repo);
        return json({
            sessions: sessions.map(s => {
                const meta = s.initialPrompt ? parsePromptMeta(s.initialPrompt) : null;
                const fallback = metaFromName(s.name);
                return {
                    id: s.id,
                    name: s.name,
                    status: s.status,
                    repo: meta?.repo ?? null,
                    number: meta?.number ?? fallback.number ?? null,
                    title: meta?.title ?? fallback.title ?? null,
                    sender: meta?.sender ?? null,
                    url: meta?.url ?? null,
                    isPR: meta?.isPR ?? false,
                    triggerType: meta?.triggerType ?? null,
                    createdAt: s.createdAt,
                    updatedAt: s.updatedAt,
                };
            }),
        });
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

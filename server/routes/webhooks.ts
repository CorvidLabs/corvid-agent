/**
 * Webhook routes — GitHub webhook receiver + CRUD for webhook registrations.
 *
 * Endpoints:
 *   POST /webhooks/github          — Receive GitHub webhook events (no auth — validated by signature)
 *   GET  /api/webhooks             — List all webhook registrations
 *   POST /api/webhooks             — Create a new webhook registration
 *   GET  /api/webhooks/:id         — Get a webhook registration
 *   PUT  /api/webhooks/:id         — Update a webhook registration
 *   DELETE /api/webhooks/:id       — Delete a webhook registration
 *   GET  /api/webhooks/:id/deliveries — List deliveries for a registration
 *   GET  /api/webhooks/deliveries  — List all recent deliveries
 */

import type { Database } from 'bun:sqlite';
import type { WebhookService, GitHubWebhookPayload } from '../webhooks/service';
import {
    listWebhookRegistrations,
    getWebhookRegistration,
    createWebhookRegistration,
    updateWebhookRegistration,
    deleteWebhookRegistration,
    listDeliveries,
} from '../db/webhooks';
import { DedupService } from '../lib/dedup';
import { recordAudit } from '../db/audit';
import { getClientIp } from '../middleware/rate-limit';
import { parseBodyOrThrow, CreateWebhookRegistrationSchema, UpdateWebhookRegistrationSchema } from '../lib/validation';
import { json, handleRouteError, safeNumParam } from '../lib/response';
import { createLogger } from '../lib/logger';

const log = createLogger('WebhookRoutes');

// ── Per-repo sliding-window rate limiter ─────────────────────────────────

const WEBHOOK_RATE_WINDOW_MS = 60_000; // 60 seconds
const WEBHOOK_RATE_MAX = 100; // max 100 requests per window per repo

interface RateEntry {
    timestamps: number[];
}

const repoRateMap = new Map<string, RateEntry>();

function isRepoRateLimited(repoFullName: string): boolean {
    const now = Date.now();
    const cutoff = now - WEBHOOK_RATE_WINDOW_MS;

    let entry = repoRateMap.get(repoFullName);
    if (!entry) {
        entry = { timestamps: [] };
        repoRateMap.set(repoFullName, entry);
    }

    // Purge old timestamps
    entry.timestamps = entry.timestamps.filter(t => t > cutoff);

    if (entry.timestamps.length >= WEBHOOK_RATE_MAX) {
        return true;
    }

    entry.timestamps.push(now);
    return false;
}

/** Exported for testing. */
export function _resetRepoRateMap(): void {
    repoRateMap.clear();
}

/**
 * Handle the incoming GitHub webhook POST.
 * This endpoint does NOT require API key auth — it validates via HMAC signature.
 */
export async function handleGitHubWebhook(
    req: Request,
    webhookService: WebhookService,
): Promise<Response> {
    // Read the raw body for signature validation
    const rawBody = await req.text();

    // Validate signature
    const signature = req.headers.get('X-Hub-Signature-256');
    const isValid = await webhookService.validateSignature(rawBody, signature);
    if (!isValid) {
        log.warn('Webhook signature validation failed');
        return json({ error: 'Invalid signature' }, 401);
    }

    // Idempotency: deduplicate by X-GitHub-Delivery header
    const deliveryId = req.headers.get('X-GitHub-Delivery');
    if (deliveryId) {
        const dedup = DedupService.global();
        if (dedup.isDuplicate('webhook-delivery', deliveryId)) {
            log.debug('Duplicate webhook delivery', { deliveryId });
            return json({ ok: true, deduplicated: true });
        }
    }

    // Per-repo rate limiting (applied after sig validation to prevent unauthenticated abuse)
    let parsedForRateLimit: { repository?: { full_name?: string } } | undefined;
    try {
        parsedForRateLimit = JSON.parse(rawBody) as typeof parsedForRateLimit;
    } catch { /* will be caught again below */ }
    const repoName = parsedForRateLimit?.repository?.full_name;
    if (repoName && isRepoRateLimited(repoName)) {
        log.warn('Webhook rate limit exceeded', { repo: repoName });
        return json({ error: 'Rate limit exceeded for this repository' }, 429);
    }

    // Parse the event type
    const event = req.headers.get('X-GitHub-Event');
    if (!event) {
        return json({ error: 'Missing X-GitHub-Event header' }, 400);
    }

    // Handle ping event (GitHub sends this when a webhook is first set up)
    if (event === 'ping') {
        log.info('Received GitHub webhook ping');
        return json({ ok: true, message: 'pong' });
    }

    // Only process events we care about
    const supportedEvents = ['issue_comment', 'issues', 'pull_request_review_comment'];
    if (!supportedEvents.includes(event)) {
        log.debug('Ignoring unsupported webhook event', { event });
        return json({ ok: true, message: `Event ${event} not handled` });
    }

    // Parse payload
    let payload: GitHubWebhookPayload;
    try {
        payload = JSON.parse(rawBody) as GitHubWebhookPayload;
    } catch {
        return json({ error: 'Invalid JSON payload' }, 400);
    }

    // Only process certain actions
    const relevantActions = ['created', 'opened', 'edited'];
    if (!relevantActions.includes(payload.action)) {
        return json({ ok: true, message: `Action ${payload.action} not handled` });
    }

    // Process the event
    const result = await webhookService.processEvent(event, payload);

    log.info('Webhook processed', {
        event,
        action: payload.action,
        repo: payload.repository.full_name,
        processed: result.processed,
        skipped: result.skipped,
    });

    return json({
        ok: true,
        processed: result.processed,
        skipped: result.skipped,
        details: result.details,
    });
}

/**
 * Handle CRUD routes for webhook registrations.
 */
export function handleWebhookRoutes(
    req: Request,
    url: URL,
    db: Database,
    webhookService: WebhookService | null,
): Response | Promise<Response> | null {
    // ── GitHub webhook receiver ─────────────────────────────────────────────
    if (url.pathname === '/webhooks/github' && req.method === 'POST') {
        if (!webhookService) {
            return json({ error: 'Webhook service not available' }, 503);
        }
        return handleGitHubWebhook(req, webhookService);
    }

    // ── List all registrations ──────────────────────────────────────────────
    if (url.pathname === '/api/webhooks' && req.method === 'GET') {
        const agentId = url.searchParams.get('agentId') ?? undefined;
        const registrations = listWebhookRegistrations(db, agentId);
        return json({ registrations });
    }

    // ── Create registration ─────────────────────────────────────────────────
    if (url.pathname === '/api/webhooks' && req.method === 'POST') {
        return (async () => {
            try {
                const data = await parseBodyOrThrow(req, CreateWebhookRegistrationSchema);
                const registration = createWebhookRegistration(db, data);
                const ip = getClientIp(req);
                recordAudit(db, 'webhook_register', ip, 'webhook', registration.id, `repo=${registration.repo}`, null, ip);
                log.info('Webhook registration created', { id: registration.id, repo: registration.repo });
                return json(registration, 201);
            } catch (err) {
                return handleRouteError(err);
            }
        })();
    }

    // ── List all recent deliveries ──────────────────────────────────────────
    if (url.pathname === '/api/webhooks/deliveries' && req.method === 'GET') {
        const limit = safeNumParam(url.searchParams.get('limit'), 50);
        const deliveries = listDeliveries(db, undefined, limit);
        return json({ deliveries });
    }

    // ── Single registration routes ──────────────────────────────────────────
    const registrationMatch = url.pathname.match(/^\/api\/webhooks\/([^/]+)$/);
    if (registrationMatch) {
        const id = registrationMatch[1];

        // Don't match 'deliveries' as an ID
        if (id === 'deliveries') return null;

        if (req.method === 'GET') {
            const registration = getWebhookRegistration(db, id);
            if (!registration) return json({ error: 'Webhook registration not found' }, 404);
            return json(registration);
        }

        if (req.method === 'PUT') {
            return (async () => {
                try {
                    const data = await parseBodyOrThrow(req, UpdateWebhookRegistrationSchema);
                    const updated = updateWebhookRegistration(db, id, data);
                    if (!updated) return json({ error: 'Webhook registration not found' }, 404);
                    return json(updated);
                } catch (err) {
                    return handleRouteError(err);
                }
            })();
        }

        if (req.method === 'DELETE') {
            const deleted = deleteWebhookRegistration(db, id);
            if (!deleted) return json({ error: 'Webhook registration not found' }, 404);
            const ip = getClientIp(req);
            recordAudit(db, 'webhook_delete', ip, 'webhook', id, null, null, ip);
            return json({ ok: true });
        }
    }

    // ── Deliveries for a registration ───────────────────────────────────────
    const deliveriesMatch = url.pathname.match(/^\/api\/webhooks\/([^/]+)\/deliveries$/);
    if (deliveriesMatch && req.method === 'GET') {
        const registrationId = deliveriesMatch[1];
        const limit = safeNumParam(url.searchParams.get('limit'), 50);
        const deliveries = listDeliveries(db, registrationId, limit);
        return json({ deliveries });
    }

    return null;
}

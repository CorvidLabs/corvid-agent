/**
 * Billing routes — Subscription management, usage tracking, invoices.
 */
import type { Database } from 'bun:sqlite';
import type { BillingService } from '../billing/service';
import type { UsageMeter } from '../billing/meter';
import { verifyWebhookSignature } from '../billing/stripe';
import { json, badRequest, notFound, handleRouteError, safeNumParam } from '../lib/response';
import { parseBodyOrThrow, ValidationError, CreateSubscriptionSchema } from '../lib/validation';
import { createLogger } from '../lib/logger';

const log = createLogger('BillingRoutes');

export function handleBillingRoutes(
    req: Request,
    url: URL,
    _db: Database,
    billing?: BillingService | null,
    meter?: UsageMeter | null,
): Response | Promise<Response> | null {
    if (!billing) {
        if (!url.pathname.startsWith('/api/billing')) return null;
        return json({ error: 'Billing not available' }, 503);
    }

    const path = url.pathname;
    const method = req.method;

    // ─── Subscription ────────────────────────────────────────────────────────

    const subMatch = path.match(/^\/api\/billing\/subscription\/([^/]+)$/);
    if (subMatch && method === 'GET') {
        const sub = billing.getSubscription(subMatch[1]);
        return sub ? json(sub) : notFound('No subscription found');
    }

    if (path === '/api/billing/subscription' && method === 'POST') {
        return handleCreateSubscription(req, billing);
    }

    const cancelMatch = path.match(/^\/api\/billing\/subscription\/([^/]+)\/cancel$/);
    if (cancelMatch && method === 'POST') {
        billing.cancelSubscription(cancelMatch[1]);
        return json({ ok: true });
    }

    // ─── Usage ───────────────────────────────────────────────────────────────

    const usageMatch = path.match(/^\/api\/billing\/usage\/([^/]+)$/);
    if (usageMatch && method === 'GET') {
        const tenantId = usageMatch[1];
        const current = billing.getCurrentUsage(tenantId);
        const history = billing.getUsageHistory(tenantId);
        const summary = meter?.getUsageSummary(tenantId);
        return json({ current, history, summary });
    }

    // ─── Invoices ────────────────────────────────────────────────────────────

    const invoicesMatch = path.match(/^\/api\/billing\/invoices\/([^/]+)$/);
    if (invoicesMatch && method === 'GET') {
        return json(billing.getInvoicesForTenant(invoicesMatch[1]));
    }

    // ─── Cost Calculator ─────────────────────────────────────────────────────

    if (path === '/api/billing/calculate' && method === 'GET') {
        const credits = safeNumParam(url.searchParams.get('credits'), 0);
        if (credits < 0) return badRequest('Invalid credits value');
        return json({ credits, costCents: billing.calculateCost(credits) });
    }

    // ─── Stripe Webhook ──────────────────────────────────────────────────────

    if (path === '/webhooks/stripe' && method === 'POST') {
        return handleStripeWebhook(req, billing);
    }

    return null;
}

async function handleCreateSubscription(
    req: Request,
    billing: BillingService,
): Promise<Response> {
    try {
        const body = await parseBodyOrThrow(req, CreateSubscriptionSchema);

        const sub = billing.createSubscription(
            body.tenantId,
            body.stripeSubscriptionId,
            body.plan,
            body.periodStart,
            body.periodEnd,
        );

        return json(sub, 201);
    } catch (err) {
        if (err instanceof ValidationError) return badRequest(err.message);
        return handleRouteError(err);
    }
}

async function handleStripeWebhook(
    req: Request,
    billing: BillingService,
): Promise<Response> {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
        return json({ error: 'Stripe webhook not configured' }, 503);
    }

    try {
        const payload = await req.text();
        const signature = req.headers.get('stripe-signature');
        if (!signature) {
            return badRequest('Missing stripe-signature header');
        }

        const event = await verifyWebhookSignature(payload, signature, webhookSecret);

        switch (event.type) {
            case 'invoice.paid': {
                const invoice = event.data.object as { id: string };
                billing.markInvoicePaid(invoice.id);
                log.info('Invoice paid', { invoiceId: invoice.id });
                break;
            }
            case 'customer.subscription.updated': {
                const sub = event.data.object as { id: string; status: string };
                log.info('Subscription updated', { subscriptionId: sub.id, status: sub.status });
                break;
            }
            case 'customer.subscription.deleted': {
                log.info('Subscription deleted', { event: event.type });
                break;
            }
            default:
                log.debug('Unhandled Stripe event', { type: event.type });
        }

        return json({ received: true });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn('Stripe webhook error', { error: message });
        return badRequest(message);
    }
}

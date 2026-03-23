import type { RouteEntry } from './types';
import { CreateSubscriptionSchema } from '../../lib/validation';

const SUBSCRIPTION_EXAMPLE = {
    id: 'sub_s1u2b3s4',
    tenantId: 'tenant_t1e2n3a4',
    plan: 'pro',
    status: 'active',
    creditsIncluded: 10000,
    creditsUsed: 3200,
    currentPeriodStart: '2026-03-01T00:00:00.000Z',
    currentPeriodEnd: '2026-04-01T00:00:00.000Z',
    createdAt: '2026-03-01T09:00:00.000Z',
};

export const billingRoutes: RouteEntry[] = [
    {
        method: 'GET', path: '/api/billing/subscription/{tenantId}',
        summary: 'Get subscription',
        tags: ['Billing'], auth: 'required',
        responses: {
            200: { description: 'Subscription object', example: SUBSCRIPTION_EXAMPLE },
        },
    },
    {
        method: 'POST', path: '/api/billing/subscription',
        summary: 'Create subscription',
        tags: ['Billing'], auth: 'required',
        requestBody: CreateSubscriptionSchema,
        requestExample: { tenantId: 'tenant_t1e2n3a4', plan: 'pro', paymentMethodId: 'pm_1ABC2DEF3GHI' },
        responses: {
            201: { description: 'Created subscription', example: SUBSCRIPTION_EXAMPLE },
        },
    },
    {
        method: 'POST', path: '/api/billing/subscription/{tenantId}/cancel',
        summary: 'Cancel subscription',
        tags: ['Billing'], auth: 'required',
        responses: {
            200: { description: 'Cancellation result', example: { success: true, status: 'cancelled', effectiveAt: '2026-04-01T00:00:00.000Z' } },
        },
    },
    {
        method: 'GET', path: '/api/billing/usage/{tenantId}',
        summary: 'Get usage for tenant',
        tags: ['Billing'], auth: 'required',
        responses: {
            200: {
                description: 'Usage breakdown',
                example: {
                    tenantId: 'tenant_t1e2n3a4',
                    period: { start: '2026-03-01T00:00:00.000Z', end: '2026-04-01T00:00:00.000Z' },
                    creditsUsed: 3200,
                    sessionTurns: 320,
                    algoSpent: 8.0,
                },
            },
        },
    },
    {
        method: 'GET', path: '/api/billing/invoices/{tenantId}',
        summary: 'Get invoices for tenant',
        tags: ['Billing'], auth: 'required',
        responses: {
            200: {
                description: 'Invoice list',
                example: {
                    invoices: [
                        { id: 'inv_001', amount: 2900, currency: 'usd', status: 'paid', paidAt: '2026-03-02T00:00:00.000Z' },
                    ],
                    total: 1,
                },
            },
        },
    },
    {
        method: 'GET', path: '/api/billing/calculate',
        summary: 'Calculate cost from credits',
        tags: ['Billing'], auth: 'required',
        responses: {
            200: {
                description: 'Cost calculation',
                example: { credits: 1000, usdCents: 290, usdFormatted: '$2.90' },
            },
        },
    },
    {
        method: 'POST', path: '/webhooks/stripe',
        summary: 'Stripe webhook',
        description: 'Validated by Stripe signature. No API key auth.',
        tags: ['Billing'], auth: 'none',
        responses: {
            200: { description: 'Webhook acknowledged', example: { received: true } },
        },
    },
];

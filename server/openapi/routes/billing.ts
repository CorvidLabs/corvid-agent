import type { RouteEntry } from './types';
import { CreateSubscriptionSchema } from '../../lib/validation';

export const billingRoutes: RouteEntry[] = [
    { method: 'GET', path: '/api/billing/subscription/{tenantId}', summary: 'Get subscription', tags: ['Billing'], auth: 'required' },
    { method: 'POST', path: '/api/billing/subscription', summary: 'Create subscription', tags: ['Billing'], auth: 'required', requestBody: CreateSubscriptionSchema, responses: { 201: { description: 'Created subscription' } } },
    { method: 'POST', path: '/api/billing/subscription/{tenantId}/cancel', summary: 'Cancel subscription', tags: ['Billing'], auth: 'required' },
    { method: 'GET', path: '/api/billing/usage/{tenantId}', summary: 'Get usage for tenant', tags: ['Billing'], auth: 'required' },
    { method: 'GET', path: '/api/billing/invoices/{tenantId}', summary: 'Get invoices for tenant', tags: ['Billing'], auth: 'required' },
    { method: 'GET', path: '/api/billing/calculate', summary: 'Calculate cost from credits', tags: ['Billing'], auth: 'required' },
    { method: 'POST', path: '/webhooks/stripe', summary: 'Stripe webhook', description: 'Validated by Stripe signature. No API key auth.', tags: ['Billing'], auth: 'none' },
];

import type { RouteEntry } from './types';
import { CreateWebhookRegistrationSchema, UpdateWebhookRegistrationSchema } from '../../lib/validation';

const WEBHOOK_REG_EXAMPLE = {
    id: 'wh_w1e2b3h4',
    agentId: 'agent_a1b2c3d4',
    repo: 'CorvidLabs/corvid-agent',
    secret: 'whsec_abc123...',
    events: ['push', 'pull_request'],
    enabled: true,
    triggerCount: 14,
    createdAt: '2026-03-22T09:00:00.000Z',
};

const DELIVERY_EXAMPLE = {
    id: 'del_d1e2l3i4',
    webhookId: 'wh_w1e2b3h4',
    event: 'pull_request',
    status: 'delivered',
    sessionId: 'sess_s1t2u3v4',
    deliveredAt: '2026-03-22T10:05:00.000Z',
};

export const webhookRoutes: RouteEntry[] = [
    {
        method: 'POST', path: '/webhooks/github',
        summary: 'GitHub webhook receiver',
        description: 'Validated by HMAC signature (X-Hub-Signature-256). No API key auth.',
        tags: ['Webhooks'], auth: 'none',
        responses: {
            200: { description: 'Webhook acknowledged', example: { received: true } },
        },
    },
    {
        method: 'GET', path: '/api/webhooks',
        summary: 'List webhook registrations',
        description: 'Optionally filter by agentId query parameter.',
        tags: ['Webhooks'], auth: 'required',
        responses: {
            200: { description: 'Webhook registrations', example: { webhooks: [WEBHOOK_REG_EXAMPLE], total: 1 } },
        },
    },
    {
        method: 'POST', path: '/api/webhooks',
        summary: 'Create webhook registration',
        tags: ['Webhooks'], auth: 'required',
        requestBody: CreateWebhookRegistrationSchema,
        requestExample: {
            agentId: 'agent_a1b2c3d4',
            repo: 'CorvidLabs/corvid-agent',
            events: ['push', 'pull_request'],
        },
        responses: {
            201: { description: 'Created registration', example: WEBHOOK_REG_EXAMPLE },
        },
    },
    {
        method: 'GET', path: '/api/webhooks/{id}',
        summary: 'Get webhook registration by ID',
        tags: ['Webhooks'], auth: 'required',
        responses: {
            200: { description: 'Webhook registration', example: WEBHOOK_REG_EXAMPLE },
        },
    },
    {
        method: 'PUT', path: '/api/webhooks/{id}',
        summary: 'Update webhook registration',
        tags: ['Webhooks'], auth: 'required',
        requestBody: UpdateWebhookRegistrationSchema,
        requestExample: { enabled: false },
        responses: {
            200: { description: 'Updated registration', example: { ...WEBHOOK_REG_EXAMPLE, enabled: false } },
        },
    },
    {
        method: 'DELETE', path: '/api/webhooks/{id}',
        summary: 'Delete webhook registration',
        tags: ['Webhooks'], auth: 'required',
        responses: {
            200: { description: 'Deletion confirmation', example: { success: true } },
        },
    },
    {
        method: 'GET', path: '/api/webhooks/deliveries',
        summary: 'List all recent webhook deliveries',
        tags: ['Webhooks'], auth: 'required',
        responses: {
            200: { description: 'Recent deliveries', example: { deliveries: [DELIVERY_EXAMPLE], total: 1 } },
        },
    },
    {
        method: 'GET', path: '/api/webhooks/{id}/deliveries',
        summary: 'List deliveries for registration',
        tags: ['Webhooks'], auth: 'required',
        responses: {
            200: { description: 'Deliveries for this webhook', example: { deliveries: [DELIVERY_EXAMPLE], total: 1 } },
        },
    },
];

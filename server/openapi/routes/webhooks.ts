import type { RouteEntry } from './types';
import { CreateWebhookRegistrationSchema, UpdateWebhookRegistrationSchema } from '../../lib/validation';

export const webhookRoutes: RouteEntry[] = [
    { method: 'POST', path: '/webhooks/github', summary: 'GitHub webhook receiver', description: 'Validated by HMAC signature (X-Hub-Signature-256). No API key auth.', tags: ['Webhooks'], auth: 'none' },
    { method: 'GET', path: '/api/webhooks', summary: 'List webhook registrations', description: 'Optionally filter by agentId query parameter.', tags: ['Webhooks'], auth: 'required' },
    { method: 'POST', path: '/api/webhooks', summary: 'Create webhook registration', tags: ['Webhooks'], auth: 'required', requestBody: CreateWebhookRegistrationSchema, responses: { 201: { description: 'Created registration' } } },
    { method: 'GET', path: '/api/webhooks/{id}', summary: 'Get webhook registration by ID', tags: ['Webhooks'], auth: 'required' },
    { method: 'PUT', path: '/api/webhooks/{id}', summary: 'Update webhook registration', tags: ['Webhooks'], auth: 'required', requestBody: UpdateWebhookRegistrationSchema },
    { method: 'DELETE', path: '/api/webhooks/{id}', summary: 'Delete webhook registration', tags: ['Webhooks'], auth: 'required' },
    { method: 'GET', path: '/api/webhooks/deliveries', summary: 'List all recent webhook deliveries', tags: ['Webhooks'], auth: 'required' },
    { method: 'GET', path: '/api/webhooks/{id}/deliveries', summary: 'List deliveries for registration', tags: ['Webhooks'], auth: 'required' },
];

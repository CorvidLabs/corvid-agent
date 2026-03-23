import type { RouteEntry } from './types';

export const integrationRoutes: RouteEntry[] = [
    {
        method: 'POST', path: '/slack/events',
        summary: 'Slack Events API webhook',
        description: 'Validated by Slack signing secret. No API key auth.',
        tags: ['Integrations'], auth: 'none',
        responses: {
            200: { description: 'Slack event acknowledged', example: { challenge: 'abc123' } },
        },
    },
    {
        method: 'POST', path: '/api/slack/events',
        summary: 'Slack Events API endpoint',
        description: 'Alternative Slack webhook endpoint. Validated by signing secret.',
        tags: ['Integrations'], auth: 'none',
        responses: {
            200: { description: 'Slack event acknowledged', example: { challenge: 'abc123' } },
        },
    },
];

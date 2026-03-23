import type { RouteEntry } from './types';
import { CreateMentionPollingSchema, UpdateMentionPollingSchema } from '../../lib/validation';

const POLLING_CONFIG_EXAMPLE = {
    id: 'poll_p1o2l3l4',
    agentId: 'agent_a1b2c3d4',
    repo: 'CorvidLabs/corvid-agent',
    pollIntervalMinutes: 5,
    enabled: true,
    lastPollAt: '2026-03-22T09:55:00.000Z',
    triggerCount: 7,
    createdAt: '2026-03-22T09:00:00.000Z',
};

export const mentionPollingRoutes: RouteEntry[] = [
    {
        method: 'GET', path: '/api/mention-polling',
        summary: 'List polling configs',
        description: 'Optionally filter by agentId query parameter.',
        tags: ['Mention Polling'], auth: 'required',
        responses: {
            200: { description: 'Polling configs', example: { configs: [POLLING_CONFIG_EXAMPLE], total: 1 } },
        },
    },
    {
        method: 'POST', path: '/api/mention-polling',
        summary: 'Create polling config',
        tags: ['Mention Polling'], auth: 'required',
        requestBody: CreateMentionPollingSchema,
        requestExample: {
            agentId: 'agent_a1b2c3d4',
            repo: 'CorvidLabs/corvid-agent',
            pollIntervalMinutes: 5,
        },
        responses: {
            201: { description: 'Created polling config', example: POLLING_CONFIG_EXAMPLE },
        },
    },
    {
        method: 'GET', path: '/api/mention-polling/stats',
        summary: 'Get polling service stats',
        tags: ['Mention Polling'], auth: 'required',
        responses: {
            200: {
                description: 'Polling service stats',
                example: {
                    running: true,
                    activeConfigs: 2,
                    totalTriggersToday: 14,
                    lastPollAt: '2026-03-22T09:55:00.000Z',
                },
            },
        },
    },
    {
        method: 'GET', path: '/api/mention-polling/{id}',
        summary: 'Get polling config by ID',
        tags: ['Mention Polling'], auth: 'required',
        responses: {
            200: { description: 'Polling config object', example: POLLING_CONFIG_EXAMPLE },
        },
    },
    {
        method: 'PUT', path: '/api/mention-polling/{id}',
        summary: 'Update polling config',
        tags: ['Mention Polling'], auth: 'required',
        requestBody: UpdateMentionPollingSchema,
        requestExample: { pollIntervalMinutes: 10, enabled: false },
        responses: {
            200: { description: 'Updated polling config', example: { ...POLLING_CONFIG_EXAMPLE, pollIntervalMinutes: 10, enabled: false } },
        },
    },
    {
        method: 'DELETE', path: '/api/mention-polling/{id}',
        summary: 'Delete polling config',
        tags: ['Mention Polling'], auth: 'required',
        responses: {
            200: { description: 'Deletion confirmation', example: { success: true } },
        },
    },
    {
        method: 'GET', path: '/api/mention-polling/{id}/activity',
        summary: 'Get polling activity and triggered sessions',
        tags: ['Mention Polling'], auth: 'required',
        responses: {
            200: {
                description: 'Activity log',
                example: {
                    activity: [
                        {
                            ts: '2026-03-22T09:50:00.000Z',
                            mentionUrl: 'https://github.com/CorvidLabs/corvid-agent/issues/42#issuecomment-123',
                            sessionId: 'sess_s1t2u3v4',
                            triggered: true,
                        },
                    ],
                    total: 1,
                },
            },
        },
    },
];

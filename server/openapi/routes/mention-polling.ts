import type { RouteEntry } from './types';
import { CreateMentionPollingSchema, UpdateMentionPollingSchema } from '../../lib/validation';

export const mentionPollingRoutes: RouteEntry[] = [
    { method: 'GET', path: '/api/mention-polling', summary: 'List polling configs', description: 'Optionally filter by agentId query parameter.', tags: ['Mention Polling'], auth: 'required' },
    { method: 'POST', path: '/api/mention-polling', summary: 'Create polling config', tags: ['Mention Polling'], auth: 'required', requestBody: CreateMentionPollingSchema, responses: { 201: { description: 'Created polling config' } } },
    { method: 'GET', path: '/api/mention-polling/stats', summary: 'Get polling service stats', tags: ['Mention Polling'], auth: 'required' },
    { method: 'GET', path: '/api/mention-polling/{id}', summary: 'Get polling config by ID', tags: ['Mention Polling'], auth: 'required' },
    { method: 'PUT', path: '/api/mention-polling/{id}', summary: 'Update polling config', tags: ['Mention Polling'], auth: 'required', requestBody: UpdateMentionPollingSchema },
    { method: 'DELETE', path: '/api/mention-polling/{id}', summary: 'Delete polling config', tags: ['Mention Polling'], auth: 'required' },
    { method: 'GET', path: '/api/mention-polling/{id}/activity', summary: 'Get polling activity and triggered sessions', tags: ['Mention Polling'], auth: 'required' },
];

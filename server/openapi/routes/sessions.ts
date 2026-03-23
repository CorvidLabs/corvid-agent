import type { RouteEntry } from './types';
import { CreateSessionSchema, UpdateSessionSchema, ResumeSessionSchema } from '../../lib/validation';

const SESSION_EXAMPLE = {
    id: 'sess_s1t2u3v4',
    agentId: 'agent_a1b2c3d4',
    projectId: 'proj_xyz789',
    status: 'idle',
    prompt: 'Review the latest changes in the main branch.',
    createdAt: '2026-03-22T10:00:00.000Z',
    updatedAt: '2026-03-22T10:05:00.000Z',
};

export const sessionRoutes: RouteEntry[] = [
    {
        method: 'GET', path: '/api/sessions',
        summary: 'List sessions',
        description: 'Optionally filter by projectId query parameter.',
        tags: ['Sessions'], auth: 'required',
        responses: {
            200: {
                description: 'List of sessions',
                example: { sessions: [SESSION_EXAMPLE], total: 1 },
            },
        },
    },
    {
        method: 'POST', path: '/api/sessions',
        summary: 'Create session',
        description: 'Creates and optionally starts a session with an initial prompt.',
        tags: ['Sessions'], auth: 'required',
        requestBody: CreateSessionSchema,
        requestExample: {
            agentId: 'agent_a1b2c3d4',
            projectId: 'proj_xyz789',
            prompt: 'Review the latest changes in the main branch.',
        },
        responses: {
            201: { description: 'Created session', example: SESSION_EXAMPLE },
        },
    },
    {
        method: 'GET', path: '/api/sessions/{id}',
        summary: 'Get session by ID',
        tags: ['Sessions'], auth: 'required',
        responses: {
            200: { description: 'Session object', example: SESSION_EXAMPLE },
        },
    },
    {
        method: 'PUT', path: '/api/sessions/{id}',
        summary: 'Update session',
        tags: ['Sessions'], auth: 'required',
        requestBody: UpdateSessionSchema,
        requestExample: { status: 'paused' },
        responses: {
            200: { description: 'Updated session', example: { ...SESSION_EXAMPLE, status: 'paused' } },
        },
    },
    {
        method: 'DELETE', path: '/api/sessions/{id}',
        summary: 'Delete and stop session',
        tags: ['Sessions'], auth: 'required',
        responses: {
            200: { description: 'Deletion confirmation', example: { success: true } },
        },
    },
    {
        method: 'GET', path: '/api/sessions/{id}/messages',
        summary: 'Get session messages',
        tags: ['Sessions'], auth: 'required',
        responses: {
            200: {
                description: 'Session message history',
                example: {
                    messages: [
                        { role: 'user', content: 'Review the latest changes.', ts: '2026-03-22T10:00:00.000Z' },
                        { role: 'assistant', content: 'I will start the review now.', ts: '2026-03-22T10:00:01.000Z' },
                    ],
                },
            },
        },
    },
    {
        method: 'POST', path: '/api/sessions/{id}/stop',
        summary: 'Stop running session',
        tags: ['Sessions'], auth: 'required',
        responses: {
            200: { description: 'Stop result', example: { success: true, status: 'stopped' } },
        },
    },
    {
        method: 'POST', path: '/api/sessions/{id}/resume',
        summary: 'Resume paused session',
        tags: ['Sessions'], auth: 'required',
        requestBody: ResumeSessionSchema,
        requestExample: { prompt: 'Continue from where you left off.' },
        responses: {
            200: { description: 'Resume result', example: { success: true, status: 'running' } },
        },
    },
];

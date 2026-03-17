import type { RouteEntry } from './types';
import { CreateSessionSchema, UpdateSessionSchema, ResumeSessionSchema } from '../../lib/validation';

export const sessionRoutes: RouteEntry[] = [
    { method: 'GET', path: '/api/sessions', summary: 'List sessions', description: 'Optionally filter by projectId query parameter.', tags: ['Sessions'], auth: 'required' },
    { method: 'POST', path: '/api/sessions', summary: 'Create session', description: 'Creates and optionally starts a session with an initial prompt.', tags: ['Sessions'], auth: 'required', requestBody: CreateSessionSchema, responses: { 201: { description: 'Created session' } } },
    { method: 'GET', path: '/api/sessions/{id}', summary: 'Get session by ID', tags: ['Sessions'], auth: 'required' },
    { method: 'PUT', path: '/api/sessions/{id}', summary: 'Update session', tags: ['Sessions'], auth: 'required', requestBody: UpdateSessionSchema },
    { method: 'DELETE', path: '/api/sessions/{id}', summary: 'Delete and stop session', tags: ['Sessions'], auth: 'required' },
    { method: 'GET', path: '/api/sessions/{id}/messages', summary: 'Get session messages', tags: ['Sessions'], auth: 'required' },
    { method: 'POST', path: '/api/sessions/{id}/stop', summary: 'Stop running session', tags: ['Sessions'], auth: 'required' },
    { method: 'POST', path: '/api/sessions/{id}/resume', summary: 'Resume paused session', tags: ['Sessions'], auth: 'required', requestBody: ResumeSessionSchema },
];

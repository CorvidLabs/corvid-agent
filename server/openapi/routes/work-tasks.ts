import type { RouteEntry } from './types';
import { CreateWorkTaskSchema } from '../../lib/validation';

export const workTaskRoutes: RouteEntry[] = [
    { method: 'GET', path: '/api/work-tasks', summary: 'List work tasks', description: 'Optionally filter by agentId query parameter.', tags: ['Work Tasks'], auth: 'required' },
    { method: 'POST', path: '/api/work-tasks', summary: 'Create work task', tags: ['Work Tasks'], auth: 'required', requestBody: CreateWorkTaskSchema, responses: { 201: { description: 'Created work task' } } },
    { method: 'GET', path: '/api/work-tasks/{id}', summary: 'Get work task by ID', tags: ['Work Tasks'], auth: 'required' },
    { method: 'POST', path: '/api/work-tasks/{id}/cancel', summary: 'Cancel running work task', tags: ['Work Tasks'], auth: 'required' },
    { method: 'POST', path: '/api/work-tasks/{id}/retry', summary: 'Retry a failed work task', tags: ['Work Tasks'], auth: 'required' },
];

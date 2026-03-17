import type { RouteEntry } from './types';
import { CreateCouncilSchema, UpdateCouncilSchema, LaunchCouncilSchema } from '../../lib/validation';

export const councilRoutes: RouteEntry[] = [
    { method: 'GET', path: '/api/councils', summary: 'List councils', tags: ['Councils'], auth: 'required' },
    { method: 'POST', path: '/api/councils', summary: 'Create council', tags: ['Councils'], auth: 'required', requestBody: CreateCouncilSchema, responses: { 201: { description: 'Created council' } } },
    { method: 'GET', path: '/api/councils/{id}', summary: 'Get council by ID', tags: ['Councils'], auth: 'required' },
    { method: 'PUT', path: '/api/councils/{id}', summary: 'Update council', tags: ['Councils'], auth: 'required', requestBody: UpdateCouncilSchema },
    { method: 'DELETE', path: '/api/councils/{id}', summary: 'Delete council', tags: ['Councils'], auth: 'required' },
    { method: 'POST', path: '/api/councils/{id}/launch', summary: 'Launch council discussion', tags: ['Councils'], auth: 'required', requestBody: LaunchCouncilSchema },
    { method: 'GET', path: '/api/councils/{id}/launches', summary: 'List launches for council', tags: ['Councils'], auth: 'required' },
    { method: 'GET', path: '/api/council-launches', summary: 'List all council launches', description: 'Optionally filter by councilId query parameter.', tags: ['Councils'], auth: 'required' },
    { method: 'GET', path: '/api/council-launches/{id}', summary: 'Get council launch by ID', tags: ['Councils'], auth: 'required' },
    { method: 'GET', path: '/api/council-launches/{id}/logs', summary: 'Get launch logs', tags: ['Councils'], auth: 'required' },
    { method: 'GET', path: '/api/council-launches/{id}/discussion-messages', summary: 'Get council discussion messages', tags: ['Councils'], auth: 'required' },
    { method: 'POST', path: '/api/council-launches/{id}/abort', summary: 'Abort council launch', tags: ['Councils'], auth: 'required' },
    { method: 'POST', path: '/api/council-launches/{id}/review', summary: 'Trigger review stage', tags: ['Councils'], auth: 'required' },
    { method: 'POST', path: '/api/council-launches/{id}/synthesize', summary: 'Trigger synthesis stage', tags: ['Councils'], auth: 'required' },
    { method: 'POST', path: '/api/council-launches/{id}/chat', summary: 'Continue chat on completed council', tags: ['Councils'], auth: 'required' },
];

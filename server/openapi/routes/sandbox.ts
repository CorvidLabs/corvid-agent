import type { RouteEntry } from './types';

export const sandboxRoutes: RouteEntry[] = [
    { method: 'GET', path: '/api/sandbox/stats', summary: 'Sandbox pool stats', tags: ['Sandbox'], auth: 'required' },
    { method: 'GET', path: '/api/sandbox/policies', summary: 'List all sandbox policies', tags: ['Sandbox'], auth: 'required' },
    { method: 'GET', path: '/api/sandbox/policies/{agentId}', summary: 'Get sandbox policy for agent', tags: ['Sandbox'], auth: 'required' },
    { method: 'PUT', path: '/api/sandbox/policies/{agentId}', summary: 'Set sandbox policy for agent', tags: ['Sandbox'], auth: 'required' },
    { method: 'DELETE', path: '/api/sandbox/policies/{agentId}', summary: 'Remove sandbox policy for agent', tags: ['Sandbox'], auth: 'required' },
    { method: 'POST', path: '/api/sandbox/assign', summary: 'Assign container to session', tags: ['Sandbox'], auth: 'required' },
    { method: 'POST', path: '/api/sandbox/release/{sessionId}', summary: 'Release sandbox container', tags: ['Sandbox'], auth: 'required' },
];

import type { RouteEntry } from './types';

export const authRoutes: RouteEntry[] = [
    { method: 'POST', path: '/api/auth/device', summary: 'Initiate device authorization flow', tags: ['Auth'], auth: 'none' },
    { method: 'POST', path: '/api/auth/device/token', summary: 'Poll for access token', tags: ['Auth'], auth: 'none' },
    { method: 'POST', path: '/api/auth/device/authorize', summary: 'Authorize device from web UI', tags: ['Auth'], auth: 'none' },
    { method: 'GET', path: '/api/auth/verify', summary: 'Device verification page', tags: ['Auth'], auth: 'none' },
    { method: 'POST', path: '/a2a/tasks/send', summary: 'Create and start A2A task', tags: ['A2A'], auth: 'none' },
    { method: 'GET', path: '/a2a/tasks/{id}', summary: 'Poll A2A task status', tags: ['A2A'], auth: 'none' },
];

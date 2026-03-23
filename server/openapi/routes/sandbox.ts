import type { RouteEntry } from './types';

export const sandboxRoutes: RouteEntry[] = [
    {
        method: 'GET', path: '/api/sandbox/stats',
        summary: 'Sandbox pool stats',
        tags: ['Sandbox'], auth: 'required',
        responses: {
            200: {
                description: 'Sandbox pool statistics',
                example: {
                    poolSize: 5,
                    available: 3,
                    inUse: 2,
                    image: 'corvid-sandbox:latest',
                },
            },
        },
    },
    {
        method: 'GET', path: '/api/sandbox/policies',
        summary: 'List all sandbox policies',
        tags: ['Sandbox'], auth: 'required',
        responses: {
            200: {
                description: 'All sandbox policies',
                example: {
                    policies: [
                        { agentId: 'agent_a1b2c3d4', enabled: true, memoryMb: 512, cpuShares: 512 },
                    ],
                },
            },
        },
    },
    {
        method: 'GET', path: '/api/sandbox/policies/{agentId}',
        summary: 'Get sandbox policy for agent',
        tags: ['Sandbox'], auth: 'required',
        responses: {
            200: {
                description: 'Agent sandbox policy',
                example: { agentId: 'agent_a1b2c3d4', enabled: true, memoryMb: 512, cpuShares: 512 },
            },
        },
    },
    {
        method: 'PUT', path: '/api/sandbox/policies/{agentId}',
        summary: 'Set sandbox policy for agent',
        tags: ['Sandbox'], auth: 'required',
        requestExample: { enabled: true, memoryMb: 1024, cpuShares: 1024 },
        responses: {
            200: {
                description: 'Updated sandbox policy',
                example: { agentId: 'agent_a1b2c3d4', enabled: true, memoryMb: 1024, cpuShares: 1024 },
            },
        },
    },
    {
        method: 'DELETE', path: '/api/sandbox/policies/{agentId}',
        summary: 'Remove sandbox policy for agent',
        tags: ['Sandbox'], auth: 'required',
        responses: {
            200: { description: 'Removal confirmation', example: { success: true } },
        },
    },
    {
        method: 'POST', path: '/api/sandbox/assign',
        summary: 'Assign container to session',
        tags: ['Sandbox'], auth: 'required',
        requestExample: { sessionId: 'sess_s1t2u3v4', agentId: 'agent_a1b2c3d4' },
        responses: {
            200: {
                description: 'Assigned container info',
                example: { containerId: 'container_c1a2b3', sessionId: 'sess_s1t2u3v4', status: 'assigned' },
            },
        },
    },
    {
        method: 'POST', path: '/api/sandbox/release/{sessionId}',
        summary: 'Release sandbox container',
        tags: ['Sandbox'], auth: 'required',
        responses: {
            200: { description: 'Release confirmation', example: { success: true, containerId: 'container_c1a2b3' } },
        },
    },
];

import type { RouteEntry } from './types';
import { CreateWorkTaskSchema } from '../../lib/validation';

const WORK_TASK_EXAMPLE = {
    id: 'task_t1u2v3w4',
    agentId: 'agent_a1b2c3d4',
    projectId: 'proj_xyz789',
    issueUrl: 'https://github.com/CorvidLabs/corvid-agent/issues/42',
    status: 'queued',
    branch: 'agent/corvidagent/fix-issue-42',
    createdAt: '2026-03-22T10:00:00.000Z',
    updatedAt: '2026-03-22T10:00:00.000Z',
};

export const workTaskRoutes: RouteEntry[] = [
    {
        method: 'GET', path: '/api/work-tasks',
        summary: 'List work tasks',
        description: 'Optionally filter by agentId query parameter.',
        tags: ['Work Tasks'], auth: 'required',
        responses: {
            200: {
                description: 'List of work tasks',
                example: { tasks: [WORK_TASK_EXAMPLE], total: 1 },
            },
        },
    },
    {
        method: 'POST', path: '/api/work-tasks',
        summary: 'Create work task',
        tags: ['Work Tasks'], auth: 'required',
        requestBody: CreateWorkTaskSchema,
        requestExample: {
            agentId: 'agent_a1b2c3d4',
            projectId: 'proj_xyz789',
            issueUrl: 'https://github.com/CorvidLabs/corvid-agent/issues/42',
        },
        responses: {
            201: { description: 'Created work task', example: WORK_TASK_EXAMPLE },
        },
    },
    {
        method: 'GET', path: '/api/work-tasks/{id}',
        summary: 'Get work task by ID',
        tags: ['Work Tasks'], auth: 'required',
        responses: {
            200: { description: 'Work task object', example: WORK_TASK_EXAMPLE },
        },
    },
    {
        method: 'POST', path: '/api/work-tasks/{id}/cancel',
        summary: 'Cancel running work task',
        tags: ['Work Tasks'], auth: 'required',
        responses: {
            200: { description: 'Cancellation result', example: { success: true, status: 'cancelled' } },
        },
    },
    {
        method: 'POST', path: '/api/work-tasks/{id}/retry',
        summary: 'Retry a failed work task',
        tags: ['Work Tasks'], auth: 'required',
        responses: {
            200: { description: 'Retry result', example: { success: true, status: 'queued' } },
        },
    },
];

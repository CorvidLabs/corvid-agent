import type { RouteEntry } from './types';
import { CreateScheduleSchema, UpdateScheduleSchema, ScheduleApprovalSchema } from '../../lib/validation';

export const scheduleRoutes: RouteEntry[] = [
    { method: 'GET', path: '/api/schedules', summary: 'List schedules', description: 'Optionally filter by agentId query parameter.', tags: ['Schedules'], auth: 'required' },
    { method: 'POST', path: '/api/schedules', summary: 'Create schedule', tags: ['Schedules'], auth: 'required', requestBody: CreateScheduleSchema, responses: { 201: { description: 'Created schedule' } } },
    { method: 'GET', path: '/api/schedules/{id}', summary: 'Get schedule by ID', tags: ['Schedules'], auth: 'required' },
    { method: 'PUT', path: '/api/schedules/{id}', summary: 'Update schedule', tags: ['Schedules'], auth: 'required', requestBody: UpdateScheduleSchema },
    { method: 'DELETE', path: '/api/schedules/{id}', summary: 'Delete schedule', tags: ['Schedules'], auth: 'required' },
    { method: 'GET', path: '/api/schedules/{id}/executions', summary: 'List executions for schedule', tags: ['Schedules'], auth: 'required' },
    { method: 'POST', path: '/api/schedules/{id}/trigger', summary: 'Trigger schedule immediately', tags: ['Schedules'], auth: 'required' },
    { method: 'GET', path: '/api/schedule-executions', summary: 'List all schedule executions', tags: ['Schedules'], auth: 'required' },
    { method: 'GET', path: '/api/schedule-executions/{id}', summary: 'Get schedule execution by ID', tags: ['Schedules'], auth: 'required' },
    { method: 'POST', path: '/api/schedule-executions/{id}/resolve', summary: 'Approve or deny schedule execution', tags: ['Schedules'], auth: 'required', requestBody: ScheduleApprovalSchema },
    { method: 'GET', path: '/api/scheduler/health', summary: 'Scheduler health and stats', tags: ['Schedules'], auth: 'required' },
    { method: 'GET', path: '/api/github/status', summary: 'GitHub configuration status', tags: ['Schedules'], auth: 'required' },
];

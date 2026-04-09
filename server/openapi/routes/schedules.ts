import { CreateScheduleSchema, ScheduleApprovalSchema, UpdateScheduleSchema } from '../../lib/validation';
import type { RouteEntry } from './types';

const SCHEDULE_EXAMPLE = {
  id: 'sched_s1c2h3e4',
  agentId: 'agent_a1b2c3d4',
  name: 'Daily PR Review',
  cron: '0 9 * * 1-5',
  prompt: 'Review open PRs and post a summary.',
  enabled: true,
  nextRunAt: '2026-03-23T09:00:00.000Z',
  createdAt: '2026-03-22T09:00:00.000Z',
};

const EXECUTION_EXAMPLE = {
  id: 'exec_e1x2e3c4',
  scheduleId: 'sched_s1c2h3e4',
  status: 'completed',
  sessionId: 'sess_s1t2u3v4',
  startedAt: '2026-03-22T09:00:05.000Z',
  finishedAt: '2026-03-22T09:05:00.000Z',
};

export const scheduleRoutes: RouteEntry[] = [
  {
    method: 'GET',
    path: '/api/schedules',
    summary: 'List schedules',
    description: 'Optionally filter by agentId query parameter.',
    tags: ['Schedules'],
    auth: 'required',
    responses: {
      200: { description: 'List of schedules', example: { schedules: [SCHEDULE_EXAMPLE], total: 1 } },
    },
  },
  {
    method: 'POST',
    path: '/api/schedules',
    summary: 'Create schedule',
    tags: ['Schedules'],
    auth: 'required',
    requestBody: CreateScheduleSchema,
    requestExample: {
      agentId: 'agent_a1b2c3d4',
      name: 'Daily PR Review',
      cron: '0 9 * * 1-5',
      prompt: 'Review open PRs and post a summary.',
    },
    responses: {
      201: { description: 'Created schedule', example: SCHEDULE_EXAMPLE },
    },
  },
  {
    method: 'GET',
    path: '/api/schedules/{id}',
    summary: 'Get schedule by ID',
    tags: ['Schedules'],
    auth: 'required',
    responses: {
      200: { description: 'Schedule object', example: SCHEDULE_EXAMPLE },
    },
  },
  {
    method: 'PUT',
    path: '/api/schedules/{id}',
    summary: 'Update schedule',
    tags: ['Schedules'],
    auth: 'required',
    requestBody: UpdateScheduleSchema,
    requestExample: { enabled: false },
    responses: {
      200: { description: 'Updated schedule', example: { ...SCHEDULE_EXAMPLE, enabled: false } },
    },
  },
  {
    method: 'DELETE',
    path: '/api/schedules/{id}',
    summary: 'Delete schedule',
    tags: ['Schedules'],
    auth: 'required',
    responses: {
      200: { description: 'Deletion confirmation', example: { success: true } },
    },
  },
  {
    method: 'GET',
    path: '/api/schedules/{id}/executions',
    summary: 'List executions for schedule',
    tags: ['Schedules'],
    auth: 'required',
    responses: {
      200: { description: 'Schedule executions', example: { executions: [EXECUTION_EXAMPLE], total: 1 } },
    },
  },
  {
    method: 'POST',
    path: '/api/schedules/{id}/trigger',
    summary: 'Trigger schedule immediately',
    tags: ['Schedules'],
    auth: 'required',
    responses: {
      200: { description: 'Trigger result', example: { success: true, executionId: 'exec_e1x2e3c4' } },
    },
  },
  {
    method: 'GET',
    path: '/api/schedule-executions',
    summary: 'List all schedule executions',
    tags: ['Schedules'],
    auth: 'required',
    responses: {
      200: { description: 'All executions', example: { executions: [EXECUTION_EXAMPLE], total: 1 } },
    },
  },
  {
    method: 'GET',
    path: '/api/schedule-executions/{id}',
    summary: 'Get schedule execution by ID',
    tags: ['Schedules'],
    auth: 'required',
    responses: {
      200: { description: 'Execution object', example: EXECUTION_EXAMPLE },
    },
  },
  {
    method: 'POST',
    path: '/api/schedule-executions/{id}/resolve',
    summary: 'Approve or deny schedule execution',
    tags: ['Schedules'],
    auth: 'required',
    requestBody: ScheduleApprovalSchema,
    requestExample: { approved: true, reason: 'Approved for immediate execution.' },
    responses: {
      200: { description: 'Resolution result', example: { success: true, status: 'approved' } },
    },
  },
  {
    method: 'GET',
    path: '/api/scheduler/health',
    summary: 'Scheduler health and stats',
    tags: ['Schedules'],
    auth: 'required',
    responses: {
      200: {
        description: 'Scheduler health info',
        example: {
          running: true,
          activeSchedules: 3,
          pendingExecutions: 1,
          lastTickAt: '2026-03-22T10:00:00.000Z',
        },
      },
    },
  },
  {
    method: 'GET',
    path: '/api/github/status',
    summary: 'GitHub configuration status',
    tags: ['Schedules'],
    auth: 'required',
    responses: {
      200: {
        description: 'GitHub connection status',
        example: {
          configured: true,
          user: 'corvid-agent',
          rateLimit: { remaining: 4820, resetAt: '2026-03-22T11:00:00.000Z' },
        },
      },
    },
  },
];

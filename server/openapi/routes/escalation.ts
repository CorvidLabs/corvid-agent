import { EscalationResolveSchema } from '../../lib/validation';
import type { RouteEntry } from './types';

const ESCALATION_EXAMPLE = {
  id: 'esc_e1s2c3a4',
  agentId: 'agent_a1b2c3d4',
  sessionId: 'sess_s1t2u3v4',
  permission: 'run_bash_command',
  context: 'Agent wants to run: rm -rf /tmp/build',
  status: 'pending',
  createdAt: '2026-03-22T10:00:00.000Z',
  expiresAt: '2026-03-22T10:05:00.000Z',
};

export const escalationRoutes: RouteEntry[] = [
  {
    method: 'GET',
    path: '/api/escalation-queue',
    summary: 'List pending escalation requests',
    tags: ['Escalation'],
    auth: 'required',
    responses: {
      200: {
        description: 'Pending escalation requests',
        example: { requests: [ESCALATION_EXAMPLE], total: 1 },
      },
    },
  },
  {
    method: 'POST',
    path: '/api/escalation-queue/{id}/resolve',
    summary: 'Approve or deny escalation',
    tags: ['Escalation'],
    auth: 'required',
    requestBody: EscalationResolveSchema,
    requestExample: { approved: true, reason: 'Approved — safe to clean the build directory.' },
    responses: {
      200: {
        description: 'Resolution result',
        example: { success: true, status: 'approved', escalationId: 'esc_e1s2c3a4' },
      },
    },
  },
];

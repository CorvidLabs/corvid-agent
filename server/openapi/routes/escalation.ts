import type { RouteEntry } from './types';
import { EscalationResolveSchema } from '../../lib/validation';

export const escalationRoutes: RouteEntry[] = [
    { method: 'GET', path: '/api/escalation-queue', summary: 'List pending escalation requests', tags: ['Escalation'], auth: 'required' },
    { method: 'POST', path: '/api/escalation-queue/{id}/resolve', summary: 'Approve or deny escalation', tags: ['Escalation'], auth: 'required', requestBody: EscalationResolveSchema },
];

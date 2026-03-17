import type { RouteEntry } from './types';
import { RecordReputationEventSchema } from '../../lib/validation';

export const reputationRoutes: RouteEntry[] = [
    { method: 'GET', path: '/api/reputation/scores', summary: 'Get all reputation scores', tags: ['Reputation'], auth: 'required' },
    { method: 'POST', path: '/api/reputation/scores', summary: 'Force-recompute all reputation scores', tags: ['Reputation'], auth: 'required' },
    { method: 'GET', path: '/api/reputation/scores/{agentId}', summary: 'Get reputation score for agent', tags: ['Reputation'], auth: 'required' },
    { method: 'POST', path: '/api/reputation/scores/{agentId}', summary: 'Force recompute score for agent', tags: ['Reputation'], auth: 'required' },
    { method: 'GET', path: '/api/reputation/explain/{agentId}', summary: 'Get detailed score explanation with per-component reasoning', tags: ['Reputation'], auth: 'required' },
    { method: 'POST', path: '/api/reputation/events', summary: 'Record reputation event', tags: ['Reputation'], auth: 'required', requestBody: RecordReputationEventSchema },
    { method: 'GET', path: '/api/reputation/events/{agentId}', summary: 'Get reputation events for agent', tags: ['Reputation'], auth: 'required' },
    { method: 'GET', path: '/api/reputation/attestation/{agentId}', summary: 'Get attestation for agent', tags: ['Reputation'], auth: 'required' },
    { method: 'POST', path: '/api/reputation/attestation/{agentId}', summary: 'Create attestation for agent', tags: ['Reputation'], auth: 'required' },
    { method: 'GET', path: '/api/reputation/stats/{agentId}', summary: 'Get aggregated reputation stats for agent', tags: ['Reputation'], auth: 'none' },
];

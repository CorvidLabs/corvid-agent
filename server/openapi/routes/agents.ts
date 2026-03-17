import type { RouteEntry } from './types';
import { CreateAgentSchema, UpdateAgentSchema, FundAgentSchema, InvokeAgentSchema, UpsertPersonaSchema, AssignSkillBundleSchema } from '../../lib/validation';

export const agentRoutes: RouteEntry[] = [
    { method: 'GET', path: '/api/agents', summary: 'List agents', tags: ['Agents'], auth: 'required' },
    { method: 'POST', path: '/api/agents', summary: 'Create agent', tags: ['Agents'], auth: 'required', requestBody: CreateAgentSchema, responses: { 201: { description: 'Created agent' } } },
    { method: 'GET', path: '/api/agents/{id}', summary: 'Get agent by ID', tags: ['Agents'], auth: 'required' },
    { method: 'PUT', path: '/api/agents/{id}', summary: 'Update agent', tags: ['Agents'], auth: 'required', requestBody: UpdateAgentSchema },
    { method: 'DELETE', path: '/api/agents/{id}', summary: 'Delete agent', tags: ['Agents'], auth: 'required' },
    { method: 'GET', path: '/api/agents/{id}/balance', summary: 'Get agent wallet balance', tags: ['Agents', 'AlgoChat'], auth: 'required' },
    { method: 'POST', path: '/api/agents/{id}/fund', summary: 'Fund agent wallet', tags: ['Agents', 'AlgoChat'], auth: 'required', requestBody: FundAgentSchema },
    { method: 'POST', path: '/api/agents/{id}/invoke', summary: 'Invoke agent on-chain', tags: ['Agents', 'AlgoChat'], auth: 'required', requestBody: InvokeAgentSchema },
    { method: 'GET', path: '/api/agents/{id}/messages', summary: 'Get agent messages', tags: ['Agents'], auth: 'required' },
    { method: 'GET', path: '/api/agents/{id}/agent-card', summary: 'Get A2A agent card for agent', tags: ['Agents', 'A2A'], auth: 'required' },
    { method: 'GET', path: '/api/agents/{id}/persona', summary: 'Get agent persona', tags: ['Agents', 'Personas'], auth: 'required' },
    { method: 'PUT', path: '/api/agents/{id}/persona', summary: 'Set or update agent persona', tags: ['Agents', 'Personas'], auth: 'required', requestBody: UpsertPersonaSchema },
    { method: 'DELETE', path: '/api/agents/{id}/persona', summary: 'Delete agent persona', tags: ['Agents', 'Personas'], auth: 'required' },
    { method: 'GET', path: '/api/agents/{id}/skills', summary: 'Get skill bundles assigned to agent', tags: ['Agents', 'Skill Bundles'], auth: 'required' },
    { method: 'POST', path: '/api/agents/{id}/skills', summary: 'Assign skill bundle to agent', tags: ['Agents', 'Skill Bundles'], auth: 'required', requestBody: AssignSkillBundleSchema },
    { method: 'DELETE', path: '/api/agents/{id}/skills/{bundleId}', summary: 'Remove skill bundle from agent', tags: ['Agents', 'Skill Bundles'], auth: 'required' },
];

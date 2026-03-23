import type { RouteEntry } from './types';
import { CreateAgentSchema, UpdateAgentSchema, FundAgentSchema, InvokeAgentSchema, CreatePersonaSchema, UpdatePersonaSchema, AssignPersonaSchema, AssignSkillBundleSchema } from '../../lib/validation';

const AGENT_EXAMPLE = {
    id: 'agent_a1b2c3d4',
    name: 'DevAgent',
    model: 'claude-sonnet-4-6',
    status: 'idle',
    projectId: 'proj_xyz789',
    createdAt: '2026-03-22T10:00:00.000Z',
    updatedAt: '2026-03-22T10:00:00.000Z',
};

const PERSONA_EXAMPLE = {
    id: 'persona_p1q2r3',
    name: 'Senior Engineer',
    description: 'A senior software engineer with deep expertise in distributed systems.',
    systemPrompt: 'You are a senior software engineer...',
    createdAt: '2026-03-22T10:00:00.000Z',
};

export const agentRoutes: RouteEntry[] = [
    {
        method: 'GET', path: '/api/agents',
        summary: 'List agents',
        tags: ['Agents'], auth: 'required',
        responses: {
            200: {
                description: 'List of agents',
                example: { agents: [AGENT_EXAMPLE], total: 1 },
            },
        },
    },
    {
        method: 'POST', path: '/api/agents',
        summary: 'Create agent',
        tags: ['Agents'], auth: 'required',
        requestBody: CreateAgentSchema,
        requestExample: { name: 'DevAgent', model: 'claude-sonnet-4-6', projectId: 'proj_xyz789' },
        responses: {
            201: { description: 'Created agent', example: AGENT_EXAMPLE },
        },
    },
    {
        method: 'GET', path: '/api/agents/{id}',
        summary: 'Get agent by ID',
        tags: ['Agents'], auth: 'required',
        responses: {
            200: { description: 'Agent object', example: AGENT_EXAMPLE },
        },
    },
    {
        method: 'PUT', path: '/api/agents/{id}',
        summary: 'Update agent',
        tags: ['Agents'], auth: 'required',
        requestBody: UpdateAgentSchema,
        requestExample: { name: 'DevAgent-v2', model: 'claude-opus-4-6' },
        responses: {
            200: { description: 'Updated agent', example: { ...AGENT_EXAMPLE, name: 'DevAgent-v2', model: 'claude-opus-4-6' } },
        },
    },
    {
        method: 'DELETE', path: '/api/agents/{id}',
        summary: 'Delete agent',
        tags: ['Agents'], auth: 'required',
        responses: {
            200: { description: 'Deletion confirmation', example: { success: true } },
        },
    },
    {
        method: 'GET', path: '/api/agents/{id}/balance',
        summary: 'Get agent wallet balance',
        tags: ['Agents', 'AlgoChat'], auth: 'required',
        responses: {
            200: {
                description: 'Wallet balance in microAlgos',
                example: {
                    address: 'ALGO7XK2ABCDEF1234567890ABCDEF1234567890ABCDEF12345678',
                    balance: 5000000,
                    balanceAlgo: 5.0,
                },
            },
        },
    },
    {
        method: 'POST', path: '/api/agents/{id}/fund',
        summary: 'Fund agent wallet',
        tags: ['Agents', 'AlgoChat'], auth: 'required',
        requestBody: FundAgentSchema,
        requestExample: { amount: 1000000 },
        responses: {
            200: {
                description: 'Funding result',
                example: { txId: 'TXID1234567890ABCDEF', newBalance: 6000000 },
            },
        },
    },
    {
        method: 'POST', path: '/api/agents/{id}/invoke',
        summary: 'Invoke agent on-chain',
        tags: ['Agents', 'AlgoChat'], auth: 'required',
        requestBody: InvokeAgentSchema,
        requestExample: { message: 'Review the latest PR and summarize findings.', sessionId: 'sess_abc123' },
        responses: {
            200: {
                description: 'Invocation result',
                example: { txId: 'TXID_ONCHAIN_XYZ', sessionId: 'sess_abc123', status: 'queued' },
            },
        },
    },
    {
        method: 'GET', path: '/api/agents/{id}/messages',
        summary: 'Get agent messages',
        tags: ['Agents'], auth: 'required',
        responses: {
            200: {
                description: 'Agent message list',
                example: {
                    messages: [{ id: 'msg_001', role: 'user', content: 'Hello, start the task.', createdAt: '2026-03-22T10:01:00.000Z' }],
                    total: 1,
                },
            },
        },
    },
    {
        method: 'GET', path: '/api/agents/{id}/agent-card',
        summary: 'Get A2A agent card for agent',
        tags: ['Agents', 'A2A'], auth: 'required',
        responses: {
            200: {
                description: 'A2A agent card',
                example: {
                    name: 'DevAgent',
                    description: 'A general-purpose coding agent.',
                    url: 'http://localhost:3000/a2a',
                    version: '1.0.0',
                    capabilities: { streaming: false, pushNotifications: false },
                },
            },
        },
    },
    {
        method: 'GET', path: '/api/personas',
        summary: 'List all personas',
        tags: ['Personas'], auth: 'required',
        responses: {
            200: { description: 'List of personas', example: { personas: [PERSONA_EXAMPLE], total: 1 } },
        },
    },
    {
        method: 'POST', path: '/api/personas',
        summary: 'Create a persona',
        tags: ['Personas'], auth: 'required',
        requestBody: CreatePersonaSchema,
        requestExample: { name: 'Senior Engineer', description: 'A senior software engineer.', systemPrompt: 'You are a senior software engineer...' },
        responses: {
            201: { description: 'Created persona', example: PERSONA_EXAMPLE },
        },
    },
    {
        method: 'GET', path: '/api/personas/{id}',
        summary: 'Get persona by ID',
        tags: ['Personas'], auth: 'required',
        responses: {
            200: { description: 'Persona object', example: PERSONA_EXAMPLE },
        },
    },
    {
        method: 'PUT', path: '/api/personas/{id}',
        summary: 'Update persona',
        tags: ['Personas'], auth: 'required',
        requestBody: UpdatePersonaSchema,
        requestExample: { name: 'Lead Engineer', systemPrompt: 'You are a lead software engineer...' },
        responses: {
            200: { description: 'Updated persona', example: { ...PERSONA_EXAMPLE, name: 'Lead Engineer' } },
        },
    },
    {
        method: 'DELETE', path: '/api/personas/{id}',
        summary: 'Delete persona',
        tags: ['Personas'], auth: 'required',
        responses: {
            200: { description: 'Deletion confirmation', example: { success: true } },
        },
    },
    {
        method: 'GET', path: '/api/agents/{id}/personas',
        summary: 'List personas assigned to agent',
        tags: ['Agents', 'Personas'], auth: 'required',
        responses: {
            200: { description: 'Assigned personas', example: { personas: [PERSONA_EXAMPLE] } },
        },
    },
    {
        method: 'POST', path: '/api/agents/{id}/personas',
        summary: 'Assign persona to agent',
        tags: ['Agents', 'Personas'], auth: 'required',
        requestBody: AssignPersonaSchema,
        requestExample: { personaId: 'persona_p1q2r3' },
        responses: {
            201: { description: 'Persona assigned', example: { success: true, personaId: 'persona_p1q2r3' } },
        },
    },
    {
        method: 'DELETE', path: '/api/agents/{id}/personas/{personaId}',
        summary: 'Unassign persona from agent',
        tags: ['Agents', 'Personas'], auth: 'required',
        responses: {
            200: { description: 'Unassign confirmation', example: { success: true } },
        },
    },
    {
        method: 'GET', path: '/api/agents/{id}/persona',
        summary: 'Get first agent persona (legacy)',
        tags: ['Agents', 'Personas'], auth: 'required',
        responses: {
            200: { description: 'First assigned persona', example: PERSONA_EXAMPLE },
        },
    },
    {
        method: 'GET', path: '/api/agents/{id}/skills',
        summary: 'Get skill bundles assigned to agent',
        tags: ['Agents', 'Skill Bundles'], auth: 'required',
        responses: {
            200: {
                description: 'Assigned skill bundles',
                example: { bundles: [{ id: 'bundle_001', name: 'GitHub Tools', toolCount: 5 }] },
            },
        },
    },
    {
        method: 'POST', path: '/api/agents/{id}/skills',
        summary: 'Assign skill bundle to agent',
        tags: ['Agents', 'Skill Bundles'], auth: 'required',
        requestBody: AssignSkillBundleSchema,
        requestExample: { bundleId: 'bundle_001' },
        responses: {
            200: { description: 'Skill bundle assigned', example: { success: true } },
        },
    },
    {
        method: 'DELETE', path: '/api/agents/{id}/skills/{bundleId}',
        summary: 'Remove skill bundle from agent',
        tags: ['Agents', 'Skill Bundles'], auth: 'required',
        responses: {
            200: { description: 'Removal confirmation', example: { success: true } },
        },
    },
];

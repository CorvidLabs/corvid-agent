import { CreateCouncilSchema, LaunchCouncilSchema, UpdateCouncilSchema } from '../../lib/validation';
import type { RouteEntry } from './types';

const COUNCIL_EXAMPLE = {
  id: 'council_c1d2e3f4',
  name: 'Code Review Council',
  description: 'Multi-agent PR review council.',
  chairmanAgentId: 'agent_a1b2c3d4',
  memberAgentIds: ['agent_b2c3d4e5', 'agent_c3d4e5f6'],
  createdAt: '2026-03-22T09:00:00.000Z',
};

const LAUNCH_EXAMPLE = {
  id: 'launch_l1m2n3o4',
  councilId: 'council_c1d2e3f4',
  stage: 'discussion',
  topic: 'Should we migrate to a monorepo?',
  createdAt: '2026-03-22T10:00:00.000Z',
};

export const councilRoutes: RouteEntry[] = [
  {
    method: 'GET',
    path: '/api/councils',
    summary: 'List councils',
    tags: ['Councils'],
    auth: 'required',
    responses: {
      200: { description: 'List of councils', example: { councils: [COUNCIL_EXAMPLE], total: 1 } },
    },
  },
  {
    method: 'POST',
    path: '/api/councils',
    summary: 'Create council',
    tags: ['Councils'],
    auth: 'required',
    requestBody: CreateCouncilSchema,
    requestExample: {
      name: 'Code Review Council',
      description: 'Multi-agent PR review council.',
      chairmanAgentId: 'agent_a1b2c3d4',
      memberAgentIds: ['agent_b2c3d4e5', 'agent_c3d4e5f6'],
    },
    responses: {
      201: { description: 'Created council', example: COUNCIL_EXAMPLE },
    },
  },
  {
    method: 'GET',
    path: '/api/councils/{id}',
    summary: 'Get council by ID',
    tags: ['Councils'],
    auth: 'required',
    responses: {
      200: { description: 'Council object', example: COUNCIL_EXAMPLE },
    },
  },
  {
    method: 'PUT',
    path: '/api/councils/{id}',
    summary: 'Update council',
    tags: ['Councils'],
    auth: 'required',
    requestBody: UpdateCouncilSchema,
    requestExample: { description: 'Updated council description.' },
    responses: {
      200: {
        description: 'Updated council',
        example: { ...COUNCIL_EXAMPLE, description: 'Updated council description.' },
      },
    },
  },
  {
    method: 'DELETE',
    path: '/api/councils/{id}',
    summary: 'Delete council',
    tags: ['Councils'],
    auth: 'required',
    responses: {
      200: { description: 'Deletion confirmation', example: { success: true } },
    },
  },
  {
    method: 'POST',
    path: '/api/councils/{id}/launch',
    summary: 'Launch council discussion',
    tags: ['Councils'],
    auth: 'required',
    requestBody: LaunchCouncilSchema,
    requestExample: { topic: 'Should we migrate to a monorepo?' },
    responses: {
      200: { description: 'Launch result', example: LAUNCH_EXAMPLE },
    },
  },
  {
    method: 'GET',
    path: '/api/councils/{id}/launches',
    summary: 'List launches for council',
    tags: ['Councils'],
    auth: 'required',
    responses: {
      200: { description: 'Council launches', example: { launches: [LAUNCH_EXAMPLE], total: 1 } },
    },
  },
  {
    method: 'GET',
    path: '/api/council-launches',
    summary: 'List all council launches',
    description: 'Optionally filter by councilId query parameter.',
    tags: ['Councils'],
    auth: 'required',
    responses: {
      200: { description: 'All council launches', example: { launches: [LAUNCH_EXAMPLE], total: 1 } },
    },
  },
  {
    method: 'GET',
    path: '/api/council-launches/{id}',
    summary: 'Get council launch by ID',
    tags: ['Councils'],
    auth: 'required',
    responses: {
      200: { description: 'Council launch object', example: LAUNCH_EXAMPLE },
    },
  },
  {
    method: 'GET',
    path: '/api/council-launches/{id}/logs',
    summary: 'Get launch logs',
    tags: ['Councils'],
    auth: 'required',
    responses: {
      200: {
        description: 'Launch logs',
        example: {
          logs: [{ ts: '2026-03-22T10:01:00.000Z', level: 'info', message: 'Discussion started.' }],
        },
      },
    },
  },
  {
    method: 'GET',
    path: '/api/council-launches/{id}/discussion-messages',
    summary: 'Get council discussion messages',
    tags: ['Councils'],
    auth: 'required',
    responses: {
      200: {
        description: 'Discussion messages',
        example: {
          messages: [
            { agentId: 'agent_a1b2c3d4', role: 'chairman', content: 'Let us begin the discussion.', round: 1 },
            { agentId: 'agent_b2c3d4e5', role: 'member', content: 'I support the monorepo approach.', round: 1 },
          ],
        },
      },
    },
  },
  {
    method: 'POST',
    path: '/api/council-launches/{id}/abort',
    summary: 'Abort council launch',
    tags: ['Councils'],
    auth: 'required',
    responses: {
      200: { description: 'Abort result', example: { success: true, stage: 'aborted' } },
    },
  },
  {
    method: 'POST',
    path: '/api/council-launches/{id}/review',
    summary: 'Trigger review stage',
    tags: ['Councils'],
    auth: 'required',
    responses: {
      200: { description: 'Review triggered', example: { success: true, stage: 'review' } },
    },
  },
  {
    method: 'POST',
    path: '/api/council-launches/{id}/synthesize',
    summary: 'Trigger synthesis stage',
    tags: ['Councils'],
    auth: 'required',
    responses: {
      200: { description: 'Synthesis triggered', example: { success: true, stage: 'synthesis' } },
    },
  },
  {
    method: 'POST',
    path: '/api/council-launches/{id}/chat',
    summary: 'Continue chat on completed council',
    tags: ['Councils'],
    auth: 'required',
    requestExample: { message: 'Can you summarize the key points?' },
    responses: {
      200: {
        description: 'Chat response',
        example: { message: 'The council reached consensus on...', sessionId: 'sess_s1t2u3v4' },
      },
    },
  },
];

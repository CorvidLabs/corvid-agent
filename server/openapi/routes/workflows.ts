import {
  CreateWorkflowSchema,
  TriggerWorkflowSchema,
  UpdateWorkflowSchema,
  WorkflowRunActionSchema,
} from '../../lib/validation';
import type { RouteEntry } from './types';

const WORKFLOW_EXAMPLE = {
  id: 'wf_w1f2l3w4',
  agentId: 'agent_a1b2c3d4',
  name: 'PR Triage Pipeline',
  description: 'Auto-triage new PRs: label, review, and comment.',
  nodes: [
    { id: 'n1', type: 'session', label: 'Label PR', agentId: 'agent_a1b2c3d4' },
    { id: 'n2', type: 'session', label: 'Review PR', agentId: 'agent_b2c3d4e5', dependsOn: ['n1'] },
  ],
  createdAt: '2026-03-22T09:00:00.000Z',
};

const WORKFLOW_RUN_EXAMPLE = {
  id: 'run_r1u2n3r4',
  workflowId: 'wf_w1f2l3w4',
  status: 'running',
  startedAt: '2026-03-22T10:00:00.000Z',
  context: { prUrl: 'https://github.com/CorvidLabs/corvid-agent/pull/100' },
};

export const workflowRoutes: RouteEntry[] = [
  {
    method: 'GET',
    path: '/api/workflows',
    summary: 'List workflows',
    description: 'Optionally filter by agentId query parameter.',
    tags: ['Workflows'],
    auth: 'required',
    responses: {
      200: { description: 'List of workflows', example: { workflows: [WORKFLOW_EXAMPLE], total: 1 } },
    },
  },
  {
    method: 'POST',
    path: '/api/workflows',
    summary: 'Create workflow',
    tags: ['Workflows'],
    auth: 'required',
    requestBody: CreateWorkflowSchema,
    requestExample: {
      agentId: 'agent_a1b2c3d4',
      name: 'PR Triage Pipeline',
      description: 'Auto-triage new PRs.',
      nodes: [
        { id: 'n1', type: 'session', label: 'Label PR', agentId: 'agent_a1b2c3d4' },
        { id: 'n2', type: 'session', label: 'Review PR', agentId: 'agent_b2c3d4e5', dependsOn: ['n1'] },
      ],
    },
    responses: {
      201: { description: 'Created workflow', example: WORKFLOW_EXAMPLE },
    },
  },
  {
    method: 'GET',
    path: '/api/workflows/{id}',
    summary: 'Get workflow by ID',
    tags: ['Workflows'],
    auth: 'required',
    responses: {
      200: { description: 'Workflow object', example: WORKFLOW_EXAMPLE },
    },
  },
  {
    method: 'PUT',
    path: '/api/workflows/{id}',
    summary: 'Update workflow',
    tags: ['Workflows'],
    auth: 'required',
    requestBody: UpdateWorkflowSchema,
    requestExample: { name: 'PR Triage Pipeline v2' },
    responses: {
      200: { description: 'Updated workflow', example: { ...WORKFLOW_EXAMPLE, name: 'PR Triage Pipeline v2' } },
    },
  },
  {
    method: 'DELETE',
    path: '/api/workflows/{id}',
    summary: 'Delete workflow',
    tags: ['Workflows'],
    auth: 'required',
    responses: {
      200: { description: 'Deletion confirmation', example: { success: true } },
    },
  },
  {
    method: 'POST',
    path: '/api/workflows/{id}/trigger',
    summary: 'Trigger workflow execution',
    tags: ['Workflows'],
    auth: 'required',
    requestBody: TriggerWorkflowSchema,
    requestExample: { context: { prUrl: 'https://github.com/CorvidLabs/corvid-agent/pull/100' } },
    responses: {
      200: { description: 'Workflow run created', example: WORKFLOW_RUN_EXAMPLE },
    },
  },
  {
    method: 'GET',
    path: '/api/workflows/{id}/runs',
    summary: 'List runs for workflow',
    tags: ['Workflows'],
    auth: 'required',
    responses: {
      200: { description: 'Workflow runs', example: { runs: [WORKFLOW_RUN_EXAMPLE], total: 1 } },
    },
  },
  {
    method: 'GET',
    path: '/api/workflow-runs',
    summary: 'List all workflow runs',
    tags: ['Workflows'],
    auth: 'required',
    responses: {
      200: { description: 'All workflow runs', example: { runs: [WORKFLOW_RUN_EXAMPLE], total: 1 } },
    },
  },
  {
    method: 'GET',
    path: '/api/workflow-runs/{id}',
    summary: 'Get workflow run by ID',
    tags: ['Workflows'],
    auth: 'required',
    responses: {
      200: { description: 'Workflow run object', example: WORKFLOW_RUN_EXAMPLE },
    },
  },
  {
    method: 'POST',
    path: '/api/workflow-runs/{id}/action',
    summary: 'Pause, resume, or cancel workflow run',
    tags: ['Workflows'],
    auth: 'required',
    requestBody: WorkflowRunActionSchema,
    requestExample: { action: 'cancel' },
    responses: {
      200: { description: 'Action result', example: { success: true, status: 'cancelled' } },
    },
  },
  {
    method: 'GET',
    path: '/api/workflow-runs/{id}/nodes',
    summary: 'Get node runs for a workflow run',
    tags: ['Workflows'],
    auth: 'required',
    responses: {
      200: {
        description: 'Node run statuses',
        example: {
          nodes: [
            { nodeId: 'n1', status: 'completed', sessionId: 'sess_001', finishedAt: '2026-03-22T10:02:00.000Z' },
            { nodeId: 'n2', status: 'running', sessionId: 'sess_002' },
          ],
        },
      },
    },
  },
  {
    method: 'GET',
    path: '/api/workflows/health',
    summary: 'Workflow service health',
    tags: ['Workflows'],
    auth: 'required',
    responses: {
      200: {
        description: 'Workflow service health',
        example: { running: true, activeRuns: 1, pendingNodes: 1 },
      },
    },
  },
];

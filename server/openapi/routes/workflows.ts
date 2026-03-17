import type { RouteEntry } from './types';
import { CreateWorkflowSchema, UpdateWorkflowSchema, TriggerWorkflowSchema, WorkflowRunActionSchema } from '../../lib/validation';

export const workflowRoutes: RouteEntry[] = [
    { method: 'GET', path: '/api/workflows', summary: 'List workflows', description: 'Optionally filter by agentId query parameter.', tags: ['Workflows'], auth: 'required' },
    { method: 'POST', path: '/api/workflows', summary: 'Create workflow', tags: ['Workflows'], auth: 'required', requestBody: CreateWorkflowSchema, responses: { 201: { description: 'Created workflow' } } },
    { method: 'GET', path: '/api/workflows/{id}', summary: 'Get workflow by ID', tags: ['Workflows'], auth: 'required' },
    { method: 'PUT', path: '/api/workflows/{id}', summary: 'Update workflow', tags: ['Workflows'], auth: 'required', requestBody: UpdateWorkflowSchema },
    { method: 'DELETE', path: '/api/workflows/{id}', summary: 'Delete workflow', tags: ['Workflows'], auth: 'required' },
    { method: 'POST', path: '/api/workflows/{id}/trigger', summary: 'Trigger workflow execution', tags: ['Workflows'], auth: 'required', requestBody: TriggerWorkflowSchema },
    { method: 'GET', path: '/api/workflows/{id}/runs', summary: 'List runs for workflow', tags: ['Workflows'], auth: 'required' },
    { method: 'GET', path: '/api/workflow-runs', summary: 'List all workflow runs', tags: ['Workflows'], auth: 'required' },
    { method: 'GET', path: '/api/workflow-runs/{id}', summary: 'Get workflow run by ID', tags: ['Workflows'], auth: 'required' },
    { method: 'POST', path: '/api/workflow-runs/{id}/action', summary: 'Pause, resume, or cancel workflow run', tags: ['Workflows'], auth: 'required', requestBody: WorkflowRunActionSchema },
    { method: 'GET', path: '/api/workflow-runs/{id}/nodes', summary: 'Get node runs for a workflow run', tags: ['Workflows'], auth: 'required' },
    { method: 'GET', path: '/api/workflows/health', summary: 'Workflow service health', tags: ['Workflows'], auth: 'required' },
];

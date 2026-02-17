import type { z } from 'zod';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RouteDefinition {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    path: string;
    summary: string;
    description?: string;
    tags: string[];
    auth: boolean;
    requestSchema?: z.ZodType;
    responseDescription?: string;
    pathParams?: Array<{ name: string; description: string }>;
    queryParams?: Array<{ name: string; description: string; type: 'string' | 'number'; required?: boolean }>;
}

// ─── Route Definitions ──────────────────────────────────────────────────────

export function buildRouteRegistry(): RouteDefinition[] {
    // Import schemas lazily to avoid circular deps in doc-only context
    const v = require('../lib/validation');

    return [
        // ─── Health ─────────────────────────────────────────────────────
        {
            method: 'GET', path: '/api/health', summary: 'Health check',
            description: 'Returns server health status, uptime, and active session counts. Always public (no auth required).',
            tags: ['System'], auth: false,
            responseDescription: '{ status, uptime, sessions: { active, total }, algochat? }',
        },

        // ─── Projects ───────────────────────────────────────────────────
        {
            method: 'GET', path: '/api/projects', summary: 'List projects',
            tags: ['Projects'], auth: false,
        },
        {
            method: 'POST', path: '/api/projects', summary: 'Create project',
            tags: ['Projects'], auth: false, requestSchema: v.CreateProjectSchema,
        },
        {
            method: 'GET', path: '/api/projects/{id}', summary: 'Get project by ID',
            tags: ['Projects'], auth: false,
            pathParams: [{ name: 'id', description: 'Project ID' }],
        },
        {
            method: 'PUT', path: '/api/projects/{id}', summary: 'Update project',
            tags: ['Projects'], auth: false, requestSchema: v.UpdateProjectSchema,
            pathParams: [{ name: 'id', description: 'Project ID' }],
        },
        {
            method: 'DELETE', path: '/api/projects/{id}', summary: 'Delete project',
            tags: ['Projects'], auth: false,
            pathParams: [{ name: 'id', description: 'Project ID' }],
        },

        // ─── Agents ────────────────────────────────────────────────────
        {
            method: 'GET', path: '/api/agents', summary: 'List agents',
            tags: ['Agents'], auth: false,
        },
        {
            method: 'POST', path: '/api/agents', summary: 'Create agent',
            tags: ['Agents'], auth: false, requestSchema: v.CreateAgentSchema,
        },
        {
            method: 'GET', path: '/api/agents/{id}', summary: 'Get agent by ID',
            tags: ['Agents'], auth: false,
            pathParams: [{ name: 'id', description: 'Agent ID' }],
        },
        {
            method: 'PUT', path: '/api/agents/{id}', summary: 'Update agent',
            tags: ['Agents'], auth: false, requestSchema: v.UpdateAgentSchema,
            pathParams: [{ name: 'id', description: 'Agent ID' }],
        },
        {
            method: 'DELETE', path: '/api/agents/{id}', summary: 'Delete agent',
            tags: ['Agents'], auth: false,
            pathParams: [{ name: 'id', description: 'Agent ID' }],
        },
        {
            method: 'GET', path: '/api/agents/{id}/balance', summary: 'Get agent Algorand balance',
            tags: ['Agents'], auth: false,
            pathParams: [{ name: 'id', description: 'Agent ID' }],
        },
        {
            method: 'POST', path: '/api/agents/{id}/fund', summary: 'Fund agent wallet',
            tags: ['Agents'], auth: false, requestSchema: v.FundAgentSchema,
            pathParams: [{ name: 'id', description: 'Agent ID' }],
        },
        {
            method: 'POST', path: '/api/agents/{id}/invoke', summary: 'Invoke agent-to-agent message',
            tags: ['Agents'], auth: false, requestSchema: v.InvokeAgentSchema,
            pathParams: [{ name: 'id', description: 'Sender Agent ID' }],
        },
        {
            method: 'GET', path: '/api/agents/{id}/messages', summary: 'List agent messages',
            tags: ['Agents'], auth: false,
            pathParams: [{ name: 'id', description: 'Agent ID' }],
        },

        // ─── Sessions ──────────────────────────────────────────────────
        {
            method: 'GET', path: '/api/sessions', summary: 'List sessions',
            tags: ['Sessions'], auth: false,
            queryParams: [{ name: 'projectId', description: 'Filter by project', type: 'string' }],
        },
        {
            method: 'POST', path: '/api/sessions', summary: 'Create and start a session',
            tags: ['Sessions'], auth: false, requestSchema: v.CreateSessionSchema,
        },
        {
            method: 'GET', path: '/api/sessions/{id}', summary: 'Get session by ID',
            tags: ['Sessions'], auth: false,
            pathParams: [{ name: 'id', description: 'Session ID' }],
        },
        {
            method: 'PUT', path: '/api/sessions/{id}', summary: 'Update session',
            tags: ['Sessions'], auth: false, requestSchema: v.UpdateSessionSchema,
            pathParams: [{ name: 'id', description: 'Session ID' }],
        },
        {
            method: 'DELETE', path: '/api/sessions/{id}', summary: 'Delete session',
            tags: ['Sessions'], auth: false,
            pathParams: [{ name: 'id', description: 'Session ID' }],
        },
        {
            method: 'GET', path: '/api/sessions/{id}/messages', summary: 'Get session messages',
            tags: ['Sessions'], auth: false,
            pathParams: [{ name: 'id', description: 'Session ID' }],
        },
        {
            method: 'POST', path: '/api/sessions/{id}/stop', summary: 'Stop a running session',
            tags: ['Sessions'], auth: false,
            pathParams: [{ name: 'id', description: 'Session ID' }],
        },
        {
            method: 'POST', path: '/api/sessions/{id}/resume', summary: 'Resume a paused session',
            tags: ['Sessions'], auth: false,
            pathParams: [{ name: 'id', description: 'Session ID' }],
        },
        {
            method: 'POST', path: '/api/sessions/{id}/send', summary: 'Send message to active session',
            tags: ['Sessions'], auth: false,
            pathParams: [{ name: 'id', description: 'Session ID' }],
        },

        // ─── Councils ──────────────────────────────────────────────────
        {
            method: 'GET', path: '/api/councils', summary: 'List councils',
            tags: ['Councils'], auth: false,
        },
        {
            method: 'POST', path: '/api/councils', summary: 'Create council',
            tags: ['Councils'], auth: false, requestSchema: v.CreateCouncilSchema,
        },
        {
            method: 'GET', path: '/api/councils/{id}', summary: 'Get council by ID',
            tags: ['Councils'], auth: false,
            pathParams: [{ name: 'id', description: 'Council ID' }],
        },
        {
            method: 'PUT', path: '/api/councils/{id}', summary: 'Update council',
            tags: ['Councils'], auth: false, requestSchema: v.UpdateCouncilSchema,
            pathParams: [{ name: 'id', description: 'Council ID' }],
        },
        {
            method: 'DELETE', path: '/api/councils/{id}', summary: 'Delete council',
            tags: ['Councils'], auth: false,
            pathParams: [{ name: 'id', description: 'Council ID' }],
        },
        {
            method: 'POST', path: '/api/councils/{id}/launch', summary: 'Launch council deliberation',
            tags: ['Councils'], auth: false, requestSchema: v.LaunchCouncilSchema,
            pathParams: [{ name: 'id', description: 'Council ID' }],
        },

        // ─── Work Tasks ────────────────────────────────────────────────
        {
            method: 'GET', path: '/api/work-tasks', summary: 'List work tasks',
            tags: ['Work Tasks'], auth: false,
        },
        {
            method: 'POST', path: '/api/work-tasks', summary: 'Create work task',
            tags: ['Work Tasks'], auth: false, requestSchema: v.CreateWorkTaskSchema,
        },
        {
            method: 'GET', path: '/api/work-tasks/{id}', summary: 'Get work task by ID',
            tags: ['Work Tasks'], auth: false,
            pathParams: [{ name: 'id', description: 'Work Task ID' }],
        },

        // ─── Schedules ─────────────────────────────────────────────────
        {
            method: 'GET', path: '/api/schedules', summary: 'List schedules',
            tags: ['Schedules'], auth: false,
        },
        {
            method: 'POST', path: '/api/schedules', summary: 'Create schedule',
            tags: ['Schedules'], auth: false, requestSchema: v.CreateScheduleSchema,
        },
        {
            method: 'GET', path: '/api/schedules/{id}', summary: 'Get schedule by ID',
            tags: ['Schedules'], auth: false,
            pathParams: [{ name: 'id', description: 'Schedule ID' }],
        },
        {
            method: 'PUT', path: '/api/schedules/{id}', summary: 'Update schedule',
            tags: ['Schedules'], auth: false, requestSchema: v.UpdateScheduleSchema,
            pathParams: [{ name: 'id', description: 'Schedule ID' }],
        },
        {
            method: 'DELETE', path: '/api/schedules/{id}', summary: 'Delete schedule',
            tags: ['Schedules'], auth: false,
            pathParams: [{ name: 'id', description: 'Schedule ID' }],
        },

        // ─── Workflows ─────────────────────────────────────────────────
        {
            method: 'GET', path: '/api/workflows', summary: 'List workflows',
            tags: ['Workflows'], auth: false,
        },
        {
            method: 'POST', path: '/api/workflows', summary: 'Create workflow',
            tags: ['Workflows'], auth: false, requestSchema: v.CreateWorkflowSchema,
        },
        {
            method: 'GET', path: '/api/workflows/{id}', summary: 'Get workflow by ID',
            tags: ['Workflows'], auth: false,
            pathParams: [{ name: 'id', description: 'Workflow ID' }],
        },
        {
            method: 'PUT', path: '/api/workflows/{id}', summary: 'Update workflow',
            tags: ['Workflows'], auth: false, requestSchema: v.UpdateWorkflowSchema,
            pathParams: [{ name: 'id', description: 'Workflow ID' }],
        },
        {
            method: 'DELETE', path: '/api/workflows/{id}', summary: 'Delete workflow',
            tags: ['Workflows'], auth: false,
            pathParams: [{ name: 'id', description: 'Workflow ID' }],
        },
        {
            method: 'POST', path: '/api/workflows/{id}/trigger', summary: 'Trigger workflow execution',
            tags: ['Workflows'], auth: false, requestSchema: v.TriggerWorkflowSchema,
            pathParams: [{ name: 'id', description: 'Workflow ID' }],
        },

        // ─── Escalation / Operational Mode ──────────────────────────────
        {
            method: 'GET', path: '/api/escalation-queue', summary: 'List pending approval requests',
            tags: ['Escalation'], auth: false,
        },
        {
            method: 'POST', path: '/api/escalation-queue/{id}/resolve', summary: 'Resolve an approval request',
            tags: ['Escalation'], auth: false, requestSchema: v.EscalationResolveSchema,
            pathParams: [{ name: 'id', description: 'Queue entry ID' }],
        },
        {
            method: 'GET', path: '/api/operational-mode', summary: 'Get current operational mode',
            tags: ['System'], auth: false,
        },
        {
            method: 'POST', path: '/api/operational-mode', summary: 'Set operational mode',
            tags: ['System'], auth: false, requestSchema: v.OperationalModeSchema,
        },

        // ─── AlgoChat ──────────────────────────────────────────────────
        {
            method: 'GET', path: '/api/algochat/status', summary: 'Get AlgoChat connection status',
            tags: ['AlgoChat'], auth: false,
        },
        {
            method: 'POST', path: '/api/algochat/network', summary: 'Switch AlgoChat network',
            tags: ['AlgoChat'], auth: false, requestSchema: v.SwitchNetworkSchema,
        },

        // ─── Feed / Analytics ───────────────────────────────────────────
        {
            method: 'GET', path: '/api/feed/history', summary: 'Get activity feed history',
            tags: ['Feed'], auth: false,
            queryParams: [
                { name: 'limit', description: 'Max results', type: 'number' },
                { name: 'offset', description: 'Offset', type: 'number' },
                { name: 'search', description: 'Search text', type: 'string' },
                { name: 'agentId', description: 'Filter by agent', type: 'string' },
            ],
        },

        // ─── Backup ────────────────────────────────────────────────────
        {
            method: 'POST', path: '/api/backup', summary: 'Create database backup',
            tags: ['System'], auth: false,
        },

        // ─── Browse Dirs ────────────────────────────────────────────────
        {
            method: 'GET', path: '/api/browse-dirs', summary: 'Browse filesystem directories',
            description: 'Requires authentication. Returns directory listings for project setup.',
            tags: ['System'], auth: true,
            queryParams: [
                { name: 'path', description: 'Directory path to browse', type: 'string', required: true },
            ],
        },

        // ─── Self-Test ─────────────────────────────────────────────────
        {
            method: 'POST', path: '/api/selftest/run', summary: 'Run self-tests',
            tags: ['System'], auth: false, requestSchema: v.SelfTestSchema,
        },

        // ─── A2A Agent Card ─────────────────────────────────────────────
        {
            method: 'GET', path: '/.well-known/agent-card.json', summary: 'A2A Agent Card discovery',
            description: 'Returns the A2A agent card for interoperability. Always public.',
            tags: ['A2A'], auth: false,
        },
    ];
}

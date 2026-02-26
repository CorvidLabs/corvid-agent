/**
 * Declarative route metadata registry for OpenAPI spec generation.
 *
 * Each route is described with its method, path (OpenAPI-style), tags, summary,
 * and references to existing Zod request/response schemas. The 29 route handler
 * files stay untouched — metadata lives here.
 */

import { z } from 'zod';
import {
    CreateProjectSchema, UpdateProjectSchema,
    CreateAgentSchema, UpdateAgentSchema, FundAgentSchema, InvokeAgentSchema,
    CreateSessionSchema, UpdateSessionSchema, ResumeSessionSchema,
    CreateCouncilSchema, UpdateCouncilSchema, LaunchCouncilSchema,
    CreateWorkTaskSchema,
    McpSendMessageSchema, McpSaveMemorySchema, McpRecallMemorySchema,
    AddAllowlistSchema, UpdateAllowlistSchema,
    CreateScheduleSchema, UpdateScheduleSchema, ScheduleApprovalSchema,
    CreateWebhookRegistrationSchema, UpdateWebhookRegistrationSchema,
    CreateMentionPollingSchema, UpdateMentionPollingSchema,
    CreateWorkflowSchema, UpdateWorkflowSchema, TriggerWorkflowSchema, WorkflowRunActionSchema,
    CreateListingSchema, UpdateListingSchema, CreateReviewSchema, RegisterFederationInstanceSchema,
    RecordReputationEventSchema,
    CreateSubscriptionSchema,
    UpsertPersonaSchema,
    CreateSkillBundleSchema, UpdateSkillBundleSchema, AssignSkillBundleSchema,
    CreateMcpServerConfigSchema, UpdateMcpServerConfigSchema,
    EscalationResolveSchema, OperationalModeSchema, SelfTestSchema, SwitchNetworkSchema,
    OllamaPullModelSchema, OllamaDeleteModelSchema,
} from '../lib/validation';

// ─── Types ──────────────────────────────────────────────────────────────────

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export interface RouteEntry {
    method: HttpMethod;
    path: string;               // OpenAPI-style path with {param} syntax
    summary: string;
    description?: string;
    tags: string[];
    requestBody?: z.ZodType;    // Zod schema for request body
    auth: 'required' | 'admin' | 'none';
    responses?: Record<number, { description: string }>;
}

// ─── Registry ───────────────────────────────────────────────────────────────

export const routes: RouteEntry[] = [
    // ── Health & System ─────────────────────────────────────────────────────
    {
        method: 'GET', path: '/api/health',
        summary: 'Health check',
        description: 'Returns server uptime, active sessions, and service status.',
        tags: ['System'],
        auth: 'none',
        responses: { 200: { description: 'Health status' } },
    },
    {
        method: 'GET', path: '/metrics',
        summary: 'Prometheus metrics',
        description: 'Returns metrics in Prometheus text exposition format.',
        tags: ['System'],
        auth: 'admin',
        responses: { 200: { description: 'Prometheus metrics (text/plain)' } },
    },
    {
        method: 'GET', path: '/api/audit-log',
        summary: 'Query audit log',
        tags: ['System'],
        auth: 'admin',
    },
    {
        method: 'GET', path: '/.well-known/agent-card.json',
        summary: 'A2A agent card',
        description: 'Public A2A Protocol agent card for service discovery.',
        tags: ['A2A'],
        auth: 'none',
    },

    // ── LLM Providers ───────────────────────────────────────────────────────
    {
        method: 'GET', path: '/api/providers',
        summary: 'List LLM providers',
        tags: ['Providers'],
        auth: 'none',
    },
    {
        method: 'GET', path: '/api/providers/{provider}/models',
        summary: 'List models for a provider',
        tags: ['Providers'],
        auth: 'none',
    },

    // ── Ollama ──────────────────────────────────────────────────────────────
    {
        method: 'GET', path: '/api/ollama/status',
        summary: 'Ollama server status',
        tags: ['Ollama'],
        auth: 'none',
    },
    {
        method: 'GET', path: '/api/ollama/models',
        summary: 'List Ollama models',
        tags: ['Ollama'],
        auth: 'none',
    },
    {
        method: 'GET', path: '/api/ollama/models/running',
        summary: 'List running Ollama models',
        tags: ['Ollama'],
        auth: 'none',
    },
    {
        method: 'POST', path: '/api/ollama/models/pull',
        summary: 'Pull an Ollama model',
        tags: ['Ollama'],
        auth: 'none',
        requestBody: OllamaPullModelSchema,
    },
    {
        method: 'DELETE', path: '/api/ollama/models',
        summary: 'Delete an Ollama model',
        tags: ['Ollama'],
        auth: 'none',
        requestBody: OllamaDeleteModelSchema,
    },
    {
        method: 'GET', path: '/api/ollama/models/pull/status',
        summary: 'Get active pull statuses',
        tags: ['Ollama'],
        auth: 'none',
    },
    {
        method: 'GET', path: '/api/ollama/library',
        summary: 'Search Ollama model library',
        tags: ['Ollama'],
        auth: 'none',
    },

    // ── Projects ────────────────────────────────────────────────────────────
    {
        method: 'GET', path: '/api/projects',
        summary: 'List projects',
        tags: ['Projects'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/projects',
        summary: 'Create project',
        tags: ['Projects'],
        auth: 'required',
        requestBody: CreateProjectSchema,
        responses: { 201: { description: 'Created project' } },
    },
    {
        method: 'GET', path: '/api/projects/{id}',
        summary: 'Get project by ID',
        tags: ['Projects'],
        auth: 'required',
    },
    {
        method: 'PUT', path: '/api/projects/{id}',
        summary: 'Update project',
        tags: ['Projects'],
        auth: 'required',
        requestBody: UpdateProjectSchema,
    },
    {
        method: 'DELETE', path: '/api/projects/{id}',
        summary: 'Delete project',
        tags: ['Projects'],
        auth: 'required',
    },
    {
        method: 'GET', path: '/api/browse-dirs',
        summary: 'Browse filesystem directories',
        tags: ['Projects'],
        auth: 'required',
    },
    {
        method: 'GET', path: '/api/projects/{id}/skills',
        summary: 'Get skill bundles assigned to project',
        tags: ['Projects', 'Skill Bundles'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/projects/{id}/skills',
        summary: 'Assign skill bundle to project',
        tags: ['Projects', 'Skill Bundles'],
        auth: 'required',
        requestBody: AssignSkillBundleSchema,
    },
    {
        method: 'DELETE', path: '/api/projects/{id}/skills/{bundleId}',
        summary: 'Remove skill bundle from project',
        tags: ['Projects', 'Skill Bundles'],
        auth: 'required',
    },

    // ── Agents ──────────────────────────────────────────────────────────────
    {
        method: 'GET', path: '/api/agents',
        summary: 'List agents',
        tags: ['Agents'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/agents',
        summary: 'Create agent',
        tags: ['Agents'],
        auth: 'required',
        requestBody: CreateAgentSchema,
        responses: { 201: { description: 'Created agent' } },
    },
    {
        method: 'GET', path: '/api/agents/{id}',
        summary: 'Get agent by ID',
        tags: ['Agents'],
        auth: 'required',
    },
    {
        method: 'PUT', path: '/api/agents/{id}',
        summary: 'Update agent',
        tags: ['Agents'],
        auth: 'required',
        requestBody: UpdateAgentSchema,
    },
    {
        method: 'DELETE', path: '/api/agents/{id}',
        summary: 'Delete agent',
        tags: ['Agents'],
        auth: 'required',
    },
    {
        method: 'GET', path: '/api/agents/{id}/balance',
        summary: 'Get agent wallet balance',
        tags: ['Agents', 'AlgoChat'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/agents/{id}/fund',
        summary: 'Fund agent wallet',
        tags: ['Agents', 'AlgoChat'],
        auth: 'required',
        requestBody: FundAgentSchema,
    },
    {
        method: 'POST', path: '/api/agents/{id}/invoke',
        summary: 'Invoke agent on-chain',
        tags: ['Agents', 'AlgoChat'],
        auth: 'required',
        requestBody: InvokeAgentSchema,
    },
    {
        method: 'GET', path: '/api/agents/{id}/messages',
        summary: 'Get agent messages',
        tags: ['Agents'],
        auth: 'required',
    },
    {
        method: 'GET', path: '/api/agents/{id}/agent-card',
        summary: 'Get A2A agent card for agent',
        tags: ['Agents', 'A2A'],
        auth: 'required',
    },
    {
        method: 'GET', path: '/api/agents/{id}/persona',
        summary: 'Get agent persona',
        tags: ['Agents', 'Personas'],
        auth: 'required',
    },
    {
        method: 'PUT', path: '/api/agents/{id}/persona',
        summary: 'Set or update agent persona',
        tags: ['Agents', 'Personas'],
        auth: 'required',
        requestBody: UpsertPersonaSchema,
    },
    {
        method: 'DELETE', path: '/api/agents/{id}/persona',
        summary: 'Delete agent persona',
        tags: ['Agents', 'Personas'],
        auth: 'required',
    },
    {
        method: 'GET', path: '/api/agents/{id}/skills',
        summary: 'Get skill bundles assigned to agent',
        tags: ['Agents', 'Skill Bundles'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/agents/{id}/skills',
        summary: 'Assign skill bundle to agent',
        tags: ['Agents', 'Skill Bundles'],
        auth: 'required',
        requestBody: AssignSkillBundleSchema,
    },
    {
        method: 'DELETE', path: '/api/agents/{id}/skills/{bundleId}',
        summary: 'Remove skill bundle from agent',
        tags: ['Agents', 'Skill Bundles'],
        auth: 'required',
    },

    // ── Sessions ────────────────────────────────────────────────────────────
    {
        method: 'GET', path: '/api/sessions',
        summary: 'List sessions',
        description: 'Optionally filter by projectId query parameter.',
        tags: ['Sessions'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/sessions',
        summary: 'Create session',
        description: 'Creates and optionally starts a session with an initial prompt.',
        tags: ['Sessions'],
        auth: 'required',
        requestBody: CreateSessionSchema,
        responses: { 201: { description: 'Created session' } },
    },
    {
        method: 'GET', path: '/api/sessions/{id}',
        summary: 'Get session by ID',
        tags: ['Sessions'],
        auth: 'required',
    },
    {
        method: 'PUT', path: '/api/sessions/{id}',
        summary: 'Update session',
        tags: ['Sessions'],
        auth: 'required',
        requestBody: UpdateSessionSchema,
    },
    {
        method: 'DELETE', path: '/api/sessions/{id}',
        summary: 'Delete and stop session',
        tags: ['Sessions'],
        auth: 'required',
    },
    {
        method: 'GET', path: '/api/sessions/{id}/messages',
        summary: 'Get session messages',
        tags: ['Sessions'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/sessions/{id}/stop',
        summary: 'Stop running session',
        tags: ['Sessions'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/sessions/{id}/resume',
        summary: 'Resume paused session',
        tags: ['Sessions'],
        auth: 'required',
        requestBody: ResumeSessionSchema,
    },

    // ── Councils ────────────────────────────────────────────────────────────
    {
        method: 'GET', path: '/api/councils',
        summary: 'List councils',
        tags: ['Councils'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/councils',
        summary: 'Create council',
        tags: ['Councils'],
        auth: 'required',
        requestBody: CreateCouncilSchema,
        responses: { 201: { description: 'Created council' } },
    },
    {
        method: 'GET', path: '/api/councils/{id}',
        summary: 'Get council by ID',
        tags: ['Councils'],
        auth: 'required',
    },
    {
        method: 'PUT', path: '/api/councils/{id}',
        summary: 'Update council',
        tags: ['Councils'],
        auth: 'required',
        requestBody: UpdateCouncilSchema,
    },
    {
        method: 'DELETE', path: '/api/councils/{id}',
        summary: 'Delete council',
        tags: ['Councils'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/councils/{id}/launch',
        summary: 'Launch council discussion',
        tags: ['Councils'],
        auth: 'required',
        requestBody: LaunchCouncilSchema,
    },
    {
        method: 'GET', path: '/api/councils/{id}/launches',
        summary: 'List launches for council',
        tags: ['Councils'],
        auth: 'required',
    },
    {
        method: 'GET', path: '/api/council-launches',
        summary: 'List all council launches',
        description: 'Optionally filter by councilId query parameter.',
        tags: ['Councils'],
        auth: 'required',
    },
    {
        method: 'GET', path: '/api/council-launches/{id}',
        summary: 'Get council launch by ID',
        tags: ['Councils'],
        auth: 'required',
    },
    {
        method: 'GET', path: '/api/council-launches/{id}/logs',
        summary: 'Get launch logs',
        tags: ['Councils'],
        auth: 'required',
    },
    {
        method: 'GET', path: '/api/council-launches/{id}/discussion-messages',
        summary: 'Get council discussion messages',
        tags: ['Councils'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/council-launches/{id}/abort',
        summary: 'Abort council launch',
        tags: ['Councils'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/council-launches/{id}/review',
        summary: 'Trigger review stage',
        tags: ['Councils'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/council-launches/{id}/synthesize',
        summary: 'Trigger synthesis stage',
        tags: ['Councils'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/council-launches/{id}/chat',
        summary: 'Continue chat on completed council',
        tags: ['Councils'],
        auth: 'required',
    },

    // ── Work Tasks ──────────────────────────────────────────────────────────
    {
        method: 'GET', path: '/api/work-tasks',
        summary: 'List work tasks',
        description: 'Optionally filter by agentId query parameter.',
        tags: ['Work Tasks'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/work-tasks',
        summary: 'Create work task',
        tags: ['Work Tasks'],
        auth: 'required',
        requestBody: CreateWorkTaskSchema,
        responses: { 201: { description: 'Created work task' } },
    },
    {
        method: 'GET', path: '/api/work-tasks/{id}',
        summary: 'Get work task by ID',
        tags: ['Work Tasks'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/work-tasks/{id}/cancel',
        summary: 'Cancel running work task',
        tags: ['Work Tasks'],
        auth: 'required',
    },

    // ── MCP API ─────────────────────────────────────────────────────────────
    {
        method: 'POST', path: '/api/mcp/send-message',
        summary: 'Send message between agents',
        tags: ['MCP'],
        auth: 'required',
        requestBody: McpSendMessageSchema,
    },
    {
        method: 'POST', path: '/api/mcp/save-memory',
        summary: 'Save agent memory',
        tags: ['MCP'],
        auth: 'required',
        requestBody: McpSaveMemorySchema,
    },
    {
        method: 'POST', path: '/api/mcp/recall-memory',
        summary: 'Recall agent memory',
        tags: ['MCP'],
        auth: 'required',
        requestBody: McpRecallMemorySchema,
    },
    {
        method: 'GET', path: '/api/mcp/list-agents',
        summary: 'List agents available for messaging',
        tags: ['MCP'],
        auth: 'required',
    },

    // ── Allowlist ───────────────────────────────────────────────────────────
    {
        method: 'GET', path: '/api/allowlist',
        summary: 'List allowlisted addresses',
        tags: ['Allowlist'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/allowlist',
        summary: 'Add address to allowlist',
        tags: ['Allowlist'],
        auth: 'required',
        requestBody: AddAllowlistSchema,
        responses: { 201: { description: 'Added to allowlist' } },
    },
    {
        method: 'PUT', path: '/api/allowlist/{address}',
        summary: 'Update allowlist entry label',
        tags: ['Allowlist'],
        auth: 'required',
        requestBody: UpdateAllowlistSchema,
    },
    {
        method: 'DELETE', path: '/api/allowlist/{address}',
        summary: 'Remove from allowlist',
        tags: ['Allowlist'],
        auth: 'required',
    },

    // ── Analytics ───────────────────────────────────────────────────────────
    {
        method: 'GET', path: '/api/analytics/overview',
        summary: 'Analytics overview',
        tags: ['Analytics'],
        auth: 'required',
    },
    {
        method: 'GET', path: '/api/analytics/spending',
        summary: 'Daily spending over time',
        tags: ['Analytics'],
        auth: 'required',
    },
    {
        method: 'GET', path: '/api/analytics/sessions',
        summary: 'Session analytics by agent/source/status',
        tags: ['Analytics'],
        auth: 'required',
    },

    // ── System Logs ─────────────────────────────────────────────────────────
    {
        method: 'GET', path: '/api/system-logs',
        summary: 'Aggregated system logs',
        description: 'Filter by type, level, search, with pagination.',
        tags: ['System'],
        auth: 'required',
    },
    {
        method: 'GET', path: '/api/system-logs/credit-transactions',
        summary: 'Credit ledger transactions',
        tags: ['System'],
        auth: 'required',
    },

    // ── Settings ────────────────────────────────────────────────────────────
    {
        method: 'GET', path: '/api/settings',
        summary: 'Get all settings',
        tags: ['Settings'],
        auth: 'required',
    },
    {
        method: 'PUT', path: '/api/settings/credits',
        summary: 'Update credit configuration',
        tags: ['Settings'],
        auth: 'required',
    },

    // ── Schedules ───────────────────────────────────────────────────────────
    {
        method: 'GET', path: '/api/schedules',
        summary: 'List schedules',
        description: 'Optionally filter by agentId query parameter.',
        tags: ['Schedules'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/schedules',
        summary: 'Create schedule',
        tags: ['Schedules'],
        auth: 'required',
        requestBody: CreateScheduleSchema,
        responses: { 201: { description: 'Created schedule' } },
    },
    {
        method: 'GET', path: '/api/schedules/{id}',
        summary: 'Get schedule by ID',
        tags: ['Schedules'],
        auth: 'required',
    },
    {
        method: 'PUT', path: '/api/schedules/{id}',
        summary: 'Update schedule',
        tags: ['Schedules'],
        auth: 'required',
        requestBody: UpdateScheduleSchema,
    },
    {
        method: 'DELETE', path: '/api/schedules/{id}',
        summary: 'Delete schedule',
        tags: ['Schedules'],
        auth: 'required',
    },
    {
        method: 'GET', path: '/api/schedules/{id}/executions',
        summary: 'List executions for schedule',
        tags: ['Schedules'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/schedules/{id}/trigger',
        summary: 'Trigger schedule immediately',
        tags: ['Schedules'],
        auth: 'required',
    },
    {
        method: 'GET', path: '/api/schedule-executions',
        summary: 'List all schedule executions',
        tags: ['Schedules'],
        auth: 'required',
    },
    {
        method: 'GET', path: '/api/schedule-executions/{id}',
        summary: 'Get schedule execution by ID',
        tags: ['Schedules'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/schedule-executions/{id}/resolve',
        summary: 'Approve or deny schedule execution',
        tags: ['Schedules'],
        auth: 'required',
        requestBody: ScheduleApprovalSchema,
    },
    {
        method: 'GET', path: '/api/scheduler/health',
        summary: 'Scheduler health and stats',
        tags: ['Schedules'],
        auth: 'required',
    },
    {
        method: 'GET', path: '/api/github/status',
        summary: 'GitHub configuration status',
        tags: ['Schedules'],
        auth: 'required',
    },

    // ── Webhooks ────────────────────────────────────────────────────────────
    {
        method: 'POST', path: '/webhooks/github',
        summary: 'GitHub webhook receiver',
        description: 'Validated by HMAC signature (X-Hub-Signature-256). No API key auth.',
        tags: ['Webhooks'],
        auth: 'none',
    },
    {
        method: 'GET', path: '/api/webhooks',
        summary: 'List webhook registrations',
        description: 'Optionally filter by agentId query parameter.',
        tags: ['Webhooks'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/webhooks',
        summary: 'Create webhook registration',
        tags: ['Webhooks'],
        auth: 'required',
        requestBody: CreateWebhookRegistrationSchema,
        responses: { 201: { description: 'Created registration' } },
    },
    {
        method: 'GET', path: '/api/webhooks/{id}',
        summary: 'Get webhook registration by ID',
        tags: ['Webhooks'],
        auth: 'required',
    },
    {
        method: 'PUT', path: '/api/webhooks/{id}',
        summary: 'Update webhook registration',
        tags: ['Webhooks'],
        auth: 'required',
        requestBody: UpdateWebhookRegistrationSchema,
    },
    {
        method: 'DELETE', path: '/api/webhooks/{id}',
        summary: 'Delete webhook registration',
        tags: ['Webhooks'],
        auth: 'required',
    },
    {
        method: 'GET', path: '/api/webhooks/deliveries',
        summary: 'List all recent webhook deliveries',
        tags: ['Webhooks'],
        auth: 'required',
    },
    {
        method: 'GET', path: '/api/webhooks/{id}/deliveries',
        summary: 'List deliveries for registration',
        tags: ['Webhooks'],
        auth: 'required',
    },

    // ── Mention Polling ─────────────────────────────────────────────────────
    {
        method: 'GET', path: '/api/mention-polling',
        summary: 'List polling configs',
        description: 'Optionally filter by agentId query parameter.',
        tags: ['Mention Polling'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/mention-polling',
        summary: 'Create polling config',
        tags: ['Mention Polling'],
        auth: 'required',
        requestBody: CreateMentionPollingSchema,
        responses: { 201: { description: 'Created polling config' } },
    },
    {
        method: 'GET', path: '/api/mention-polling/stats',
        summary: 'Get polling service stats',
        tags: ['Mention Polling'],
        auth: 'required',
    },
    {
        method: 'GET', path: '/api/mention-polling/{id}',
        summary: 'Get polling config by ID',
        tags: ['Mention Polling'],
        auth: 'required',
    },
    {
        method: 'PUT', path: '/api/mention-polling/{id}',
        summary: 'Update polling config',
        tags: ['Mention Polling'],
        auth: 'required',
        requestBody: UpdateMentionPollingSchema,
    },
    {
        method: 'DELETE', path: '/api/mention-polling/{id}',
        summary: 'Delete polling config',
        tags: ['Mention Polling'],
        auth: 'required',
    },
    {
        method: 'GET', path: '/api/mention-polling/{id}/activity',
        summary: 'Get polling activity and triggered sessions',
        tags: ['Mention Polling'],
        auth: 'required',
    },

    // ── Workflows ───────────────────────────────────────────────────────────
    {
        method: 'GET', path: '/api/workflows',
        summary: 'List workflows',
        description: 'Optionally filter by agentId query parameter.',
        tags: ['Workflows'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/workflows',
        summary: 'Create workflow',
        tags: ['Workflows'],
        auth: 'required',
        requestBody: CreateWorkflowSchema,
        responses: { 201: { description: 'Created workflow' } },
    },
    {
        method: 'GET', path: '/api/workflows/{id}',
        summary: 'Get workflow by ID',
        tags: ['Workflows'],
        auth: 'required',
    },
    {
        method: 'PUT', path: '/api/workflows/{id}',
        summary: 'Update workflow',
        tags: ['Workflows'],
        auth: 'required',
        requestBody: UpdateWorkflowSchema,
    },
    {
        method: 'DELETE', path: '/api/workflows/{id}',
        summary: 'Delete workflow',
        tags: ['Workflows'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/workflows/{id}/trigger',
        summary: 'Trigger workflow execution',
        tags: ['Workflows'],
        auth: 'required',
        requestBody: TriggerWorkflowSchema,
    },
    {
        method: 'GET', path: '/api/workflows/{id}/runs',
        summary: 'List runs for workflow',
        tags: ['Workflows'],
        auth: 'required',
    },
    {
        method: 'GET', path: '/api/workflow-runs',
        summary: 'List all workflow runs',
        tags: ['Workflows'],
        auth: 'required',
    },
    {
        method: 'GET', path: '/api/workflow-runs/{id}',
        summary: 'Get workflow run by ID',
        tags: ['Workflows'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/workflow-runs/{id}/action',
        summary: 'Pause, resume, or cancel workflow run',
        tags: ['Workflows'],
        auth: 'required',
        requestBody: WorkflowRunActionSchema,
    },
    {
        method: 'GET', path: '/api/workflow-runs/{id}/nodes',
        summary: 'Get node runs for a workflow run',
        tags: ['Workflows'],
        auth: 'required',
    },
    {
        method: 'GET', path: '/api/workflows/health',
        summary: 'Workflow service health',
        tags: ['Workflows'],
        auth: 'required',
    },

    // ── Sandbox ─────────────────────────────────────────────────────────────
    {
        method: 'GET', path: '/api/sandbox/stats',
        summary: 'Sandbox pool stats',
        tags: ['Sandbox'],
        auth: 'required',
    },
    {
        method: 'GET', path: '/api/sandbox/policies',
        summary: 'List all sandbox policies',
        tags: ['Sandbox'],
        auth: 'required',
    },
    {
        method: 'GET', path: '/api/sandbox/policies/{agentId}',
        summary: 'Get sandbox policy for agent',
        tags: ['Sandbox'],
        auth: 'required',
    },
    {
        method: 'PUT', path: '/api/sandbox/policies/{agentId}',
        summary: 'Set sandbox policy for agent',
        tags: ['Sandbox'],
        auth: 'required',
    },
    {
        method: 'DELETE', path: '/api/sandbox/policies/{agentId}',
        summary: 'Remove sandbox policy for agent',
        tags: ['Sandbox'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/sandbox/assign',
        summary: 'Assign container to session',
        tags: ['Sandbox'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/sandbox/release/{sessionId}',
        summary: 'Release sandbox container',
        tags: ['Sandbox'],
        auth: 'required',
    },

    // ── Marketplace ─────────────────────────────────────────────────────────
    {
        method: 'GET', path: '/api/marketplace/search',
        summary: 'Search marketplace listings',
        description: 'Filter by query, category, pricing, rating, tags.',
        tags: ['Marketplace'],
        auth: 'required',
    },
    {
        method: 'GET', path: '/api/marketplace/listings',
        summary: 'List marketplace listings',
        description: 'Optionally filter by agentId query parameter.',
        tags: ['Marketplace'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/marketplace/listings',
        summary: 'Create marketplace listing',
        tags: ['Marketplace'],
        auth: 'required',
        requestBody: CreateListingSchema,
        responses: { 201: { description: 'Created listing' } },
    },
    {
        method: 'GET', path: '/api/marketplace/listings/{id}',
        summary: 'Get listing by ID',
        tags: ['Marketplace'],
        auth: 'required',
    },
    {
        method: 'PUT', path: '/api/marketplace/listings/{id}',
        summary: 'Update listing',
        tags: ['Marketplace'],
        auth: 'required',
        requestBody: UpdateListingSchema,
    },
    {
        method: 'DELETE', path: '/api/marketplace/listings/{id}',
        summary: 'Delete listing',
        tags: ['Marketplace'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/marketplace/listings/{id}/use',
        summary: 'Record listing use',
        tags: ['Marketplace'],
        auth: 'required',
    },
    {
        method: 'GET', path: '/api/marketplace/listings/{id}/reviews',
        summary: 'Get reviews for listing',
        tags: ['Marketplace'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/marketplace/listings/{id}/reviews',
        summary: 'Create review for listing',
        tags: ['Marketplace'],
        auth: 'required',
        requestBody: CreateReviewSchema,
        responses: { 201: { description: 'Created review' } },
    },
    {
        method: 'DELETE', path: '/api/marketplace/reviews/{id}',
        summary: 'Delete review',
        tags: ['Marketplace'],
        auth: 'required',
    },
    {
        method: 'GET', path: '/api/marketplace/federation/instances',
        summary: 'List federation instances',
        tags: ['Marketplace'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/marketplace/federation/instances',
        summary: 'Register federation instance',
        tags: ['Marketplace'],
        auth: 'required',
        requestBody: RegisterFederationInstanceSchema,
        responses: { 201: { description: 'Registered instance' } },
    },
    {
        method: 'DELETE', path: '/api/marketplace/federation/instances/{url}',
        summary: 'Remove federation instance',
        tags: ['Marketplace'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/marketplace/federation/sync',
        summary: 'Sync all federation instances',
        tags: ['Marketplace'],
        auth: 'required',
    },
    {
        method: 'GET', path: '/api/marketplace/federated',
        summary: 'Get federated listings',
        tags: ['Marketplace'],
        auth: 'required',
    },

    // ── Reputation ──────────────────────────────────────────────────────────
    {
        method: 'GET', path: '/api/reputation/scores',
        summary: 'Get all reputation scores',
        tags: ['Reputation'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/reputation/scores',
        summary: 'Force-recompute all reputation scores',
        tags: ['Reputation'],
        auth: 'required',
    },
    {
        method: 'GET', path: '/api/reputation/scores/{agentId}',
        summary: 'Get reputation score for agent',
        tags: ['Reputation'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/reputation/scores/{agentId}',
        summary: 'Force recompute score for agent',
        tags: ['Reputation'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/reputation/events',
        summary: 'Record reputation event',
        tags: ['Reputation'],
        auth: 'required',
        requestBody: RecordReputationEventSchema,
    },
    {
        method: 'GET', path: '/api/reputation/events/{agentId}',
        summary: 'Get reputation events for agent',
        tags: ['Reputation'],
        auth: 'required',
    },
    {
        method: 'GET', path: '/api/reputation/attestation/{agentId}',
        summary: 'Get attestation for agent',
        tags: ['Reputation'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/reputation/attestation/{agentId}',
        summary: 'Create attestation for agent',
        tags: ['Reputation'],
        auth: 'required',
    },

    // ── Billing ─────────────────────────────────────────────────────────────
    {
        method: 'GET', path: '/api/billing/subscription/{tenantId}',
        summary: 'Get subscription',
        tags: ['Billing'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/billing/subscription',
        summary: 'Create subscription',
        tags: ['Billing'],
        auth: 'required',
        requestBody: CreateSubscriptionSchema,
        responses: { 201: { description: 'Created subscription' } },
    },
    {
        method: 'POST', path: '/api/billing/subscription/{tenantId}/cancel',
        summary: 'Cancel subscription',
        tags: ['Billing'],
        auth: 'required',
    },
    {
        method: 'GET', path: '/api/billing/usage/{tenantId}',
        summary: 'Get usage for tenant',
        tags: ['Billing'],
        auth: 'required',
    },
    {
        method: 'GET', path: '/api/billing/invoices/{tenantId}',
        summary: 'Get invoices for tenant',
        tags: ['Billing'],
        auth: 'required',
    },
    {
        method: 'GET', path: '/api/billing/calculate',
        summary: 'Calculate cost from credits',
        tags: ['Billing'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/webhooks/stripe',
        summary: 'Stripe webhook',
        description: 'Validated by Stripe signature. No API key auth.',
        tags: ['Billing'],
        auth: 'none',
    },

    // ── Auth Flow ───────────────────────────────────────────────────────────
    {
        method: 'POST', path: '/api/auth/device',
        summary: 'Initiate device authorization flow',
        tags: ['Auth'],
        auth: 'none',
    },
    {
        method: 'POST', path: '/api/auth/device/token',
        summary: 'Poll for access token',
        tags: ['Auth'],
        auth: 'none',
    },
    {
        method: 'POST', path: '/api/auth/device/authorize',
        summary: 'Authorize device from web UI',
        tags: ['Auth'],
        auth: 'none',
    },
    {
        method: 'GET', path: '/api/auth/verify',
        summary: 'Device verification page',
        tags: ['Auth'],
        auth: 'none',
    },

    // ── A2A Protocol ────────────────────────────────────────────────────────
    {
        method: 'POST', path: '/a2a/tasks/send',
        summary: 'Create and start A2A task',
        tags: ['A2A'],
        auth: 'none',
    },
    {
        method: 'GET', path: '/a2a/tasks/{id}',
        summary: 'Poll A2A task status',
        tags: ['A2A'],
        auth: 'none',
    },

    // ── Plugins ─────────────────────────────────────────────────────────────
    {
        method: 'GET', path: '/api/plugins',
        summary: 'List plugins',
        tags: ['Plugins'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/plugins/load',
        summary: 'Load a plugin',
        tags: ['Plugins'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/plugins/{name}/unload',
        summary: 'Unload plugin',
        tags: ['Plugins'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/plugins/{name}/grant',
        summary: 'Grant capability to plugin',
        tags: ['Plugins'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/plugins/{name}/revoke',
        summary: 'Revoke capability from plugin',
        tags: ['Plugins'],
        auth: 'required',
    },

    // ── Skill Bundles ───────────────────────────────────────────────────────
    {
        method: 'GET', path: '/api/skill-bundles',
        summary: 'List skill bundles',
        tags: ['Skill Bundles'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/skill-bundles',
        summary: 'Create skill bundle',
        tags: ['Skill Bundles'],
        auth: 'required',
        requestBody: CreateSkillBundleSchema,
        responses: { 201: { description: 'Created skill bundle' } },
    },
    {
        method: 'GET', path: '/api/skill-bundles/{id}',
        summary: 'Get skill bundle by ID',
        tags: ['Skill Bundles'],
        auth: 'required',
    },
    {
        method: 'PUT', path: '/api/skill-bundles/{id}',
        summary: 'Update skill bundle',
        tags: ['Skill Bundles'],
        auth: 'required',
        requestBody: UpdateSkillBundleSchema,
    },
    {
        method: 'DELETE', path: '/api/skill-bundles/{id}',
        summary: 'Delete skill bundle',
        tags: ['Skill Bundles'],
        auth: 'required',
    },

    // ── MCP Servers ─────────────────────────────────────────────────────────
    {
        method: 'GET', path: '/api/mcp-servers',
        summary: 'List MCP server configs',
        description: 'Optionally filter by agentId query parameter.',
        tags: ['MCP Servers'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/mcp-servers',
        summary: 'Create MCP server config',
        tags: ['MCP Servers'],
        auth: 'required',
        requestBody: CreateMcpServerConfigSchema,
        responses: { 201: { description: 'Created config' } },
    },
    {
        method: 'PUT', path: '/api/mcp-servers/{id}',
        summary: 'Update MCP server config',
        tags: ['MCP Servers'],
        auth: 'required',
        requestBody: UpdateMcpServerConfigSchema,
    },
    {
        method: 'DELETE', path: '/api/mcp-servers/{id}',
        summary: 'Delete MCP server config',
        tags: ['MCP Servers'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/mcp-servers/{id}/test',
        summary: 'Test MCP server connection',
        tags: ['MCP Servers'],
        auth: 'required',
    },

    // ── Exam ────────────────────────────────────────────────────────────────
    {
        method: 'POST', path: '/api/exam/run',
        summary: 'Trigger live model exam',
        tags: ['Exam'],
        auth: 'required',
    },
    {
        method: 'GET', path: '/api/exam/categories',
        summary: 'List exam categories',
        tags: ['Exam'],
        auth: 'required',
    },

    // ── Escalation Queue ────────────────────────────────────────────────────
    {
        method: 'GET', path: '/api/escalation-queue',
        summary: 'List pending escalation requests',
        tags: ['Escalation'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/escalation-queue/{id}/resolve',
        summary: 'Approve or deny escalation',
        tags: ['Escalation'],
        auth: 'required',
        requestBody: EscalationResolveSchema,
    },

    // ── Operational Mode ────────────────────────────────────────────────────
    {
        method: 'GET', path: '/api/operational-mode',
        summary: 'Get operational mode',
        tags: ['System'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/operational-mode',
        summary: 'Set operational mode',
        tags: ['System'],
        auth: 'required',
        requestBody: OperationalModeSchema,
    },

    // ── Feed ────────────────────────────────────────────────────────────────
    {
        method: 'GET', path: '/api/feed/history',
        summary: 'Get recent agent and AlgoChat messages',
        description: 'Filter by search, agentId, threadId, with pagination.',
        tags: ['Feed'],
        auth: 'required',
    },

    // ── AlgoChat ────────────────────────────────────────────────────────────
    {
        method: 'GET', path: '/api/algochat/status',
        summary: 'Get AlgoChat bridge status',
        tags: ['AlgoChat'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/algochat/network',
        summary: 'Switch AlgoChat network',
        tags: ['AlgoChat'],
        auth: 'required',
        requestBody: SwitchNetworkSchema,
    },
    {
        method: 'POST', path: '/api/algochat/conversations',
        summary: 'List AlgoChat conversations',
        tags: ['AlgoChat'],
        auth: 'required',
    },
    {
        method: 'GET', path: '/api/algochat/psk-exchange',
        summary: 'Get PSK exchange URI',
        tags: ['AlgoChat'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/algochat/psk-exchange',
        summary: 'Generate new PSK exchange URI',
        tags: ['AlgoChat'],
        auth: 'required',
    },
    {
        method: 'GET', path: '/api/algochat/psk-contacts',
        summary: 'List PSK contacts',
        tags: ['AlgoChat'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/algochat/psk-contacts',
        summary: 'Create PSK contact',
        tags: ['AlgoChat'],
        auth: 'required',
    },
    {
        method: 'PATCH', path: '/api/algochat/psk-contacts/{id}',
        summary: 'Rename PSK contact',
        tags: ['AlgoChat'],
        auth: 'required',
    },
    {
        method: 'DELETE', path: '/api/algochat/psk-contacts/{id}',
        summary: 'Cancel PSK contact',
        tags: ['AlgoChat'],
        auth: 'required',
    },
    {
        method: 'GET', path: '/api/algochat/psk-contacts/{id}/qr',
        summary: 'Get QR URI for PSK contact',
        tags: ['AlgoChat'],
        auth: 'required',
    },

    // ── Database ────────────────────────────────────────────────────────────
    {
        method: 'POST', path: '/api/backup',
        summary: 'Backup database',
        tags: ['System'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/memories/backfill',
        summary: 'Re-send pending memories on-chain',
        tags: ['System'],
        auth: 'required',
    },

    // ── Self-Test ───────────────────────────────────────────────────────────
    {
        method: 'POST', path: '/api/selftest/run',
        summary: 'Run self-tests',
        tags: ['System'],
        auth: 'required',
        requestBody: SelfTestSchema,
    },

    // ── Wallets ─────────────────────────────────────────────────────────────
    {
        method: 'GET', path: '/api/wallets/summary',
        summary: 'Get summary of all external wallets',
        tags: ['Wallets'],
        auth: 'required',
    },
    {
        method: 'GET', path: '/api/wallets/{address}/messages',
        summary: 'Get messages for a wallet',
        tags: ['Wallets'],
        auth: 'required',
    },

    // ── Slack ───────────────────────────────────────────────────────────────
    {
        method: 'POST', path: '/slack/events',
        summary: 'Slack Events API webhook',
        description: 'Validated by Slack signing secret. No API key auth.',
        tags: ['Integrations'],
        auth: 'none',
    },
    {
        method: 'POST', path: '/api/slack/events',
        summary: 'Slack Events API endpoint',
        description: 'Alternative Slack webhook endpoint. Validated by signing secret.',
        tags: ['Integrations'],
        auth: 'none',
    },
];

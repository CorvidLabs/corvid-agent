import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { CorvidClient, CorvidApiError } from './client.js';

/**
 * Configuration for the corvid-agent MCP server.
 */
export interface CorvidMcpServerConfig {
  /** Base URL of the corvid-agent server */
  baseUrl: string;
  /** Optional API key */
  apiKey?: string;
}

function textResult(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

function errorResult(text: string) {
  return { content: [{ type: 'text' as const, text }], isError: true as const };
}

function handleError(err: unknown): { content: Array<{ type: 'text'; text: string }>; isError: true } {
  if (err instanceof CorvidApiError) {
    return errorResult(`API error (${err.status}): ${err.message}`);
  }
  const message = err instanceof Error ? err.message : String(err);
  return errorResult(`Error: ${message}`);
}

/**
 * Creates an MCP server that proxies corvid-agent REST API endpoints as MCP tools.
 */
export function createCorvidMcpServer(config: CorvidMcpServerConfig): McpServer {
  const client = new CorvidClient({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
  });

  const server = new McpServer(
    {
      name: 'corvid-agent',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // ── List Agents ────────────────────────────────────────────────

  server.tool(
    'corvid_list_agents',
    'List all agents registered on the corvid-agent server. Returns agent IDs, names, models, and status.',
    {},
    async () => {
      try {
        const agents = await client.get('/api/agents');
        return textResult(JSON.stringify(agents, null, 2));
      } catch (err) {
        return handleError(err);
      }
    },
  );

  // ── Get Agent ──────────────────────────────────────────────────

  server.tool(
    'corvid_get_agent',
    'Get details about a specific agent by ID.',
    {
      agent_id: z.string().describe('The agent ID'),
    },
    async ({ agent_id }) => {
      try {
        const agent = await client.get(`/api/agents/${encodeURIComponent(agent_id)}`);
        return textResult(JSON.stringify(agent, null, 2));
      } catch (err) {
        return handleError(err);
      }
    },
  );

  // ── Create Session ─────────────────────────────────────────────

  server.tool(
    'corvid_create_session',
    'Create a new agent session. A session runs a Claude instance with the specified agent configuration and project context.',
    {
      project_id: z.string().describe('The project ID to run the session in'),
      agent_id: z.string().optional().describe('Agent ID to use (uses project default if omitted)'),
      name: z.string().optional().describe('Optional session name'),
      initial_prompt: z.string().optional().describe('Initial prompt to send to the agent'),
    },
    async ({ project_id, agent_id, name, initial_prompt }) => {
      try {
        const body: Record<string, unknown> = { projectId: project_id };
        if (agent_id) body.agentId = agent_id;
        if (name) body.name = name;
        if (initial_prompt) body.initialPrompt = initial_prompt;

        const session = await client.post('/api/sessions', body);
        return textResult(JSON.stringify(session, null, 2));
      } catch (err) {
        return handleError(err);
      }
    },
  );

  // ── List Sessions ──────────────────────────────────────────────

  server.tool(
    'corvid_list_sessions',
    'List all sessions. Optionally filter by status.',
    {
      status: z
        .enum(['running', 'completed', 'error', 'stopped'])
        .optional()
        .describe('Filter by session status'),
      limit: z.number().optional().describe('Maximum number of sessions to return'),
    },
    async ({ status, limit }) => {
      try {
        const params = new URLSearchParams();
        if (status) params.set('status', status);
        if (limit) params.set('limit', String(limit));
        const qs = params.toString();
        const path = qs ? `/api/sessions?${qs}` : '/api/sessions';
        const sessions = await client.get(path);
        return textResult(JSON.stringify(sessions, null, 2));
      } catch (err) {
        return handleError(err);
      }
    },
  );

  // ── Get Session ────────────────────────────────────────────────

  server.tool(
    'corvid_get_session',
    'Get details about a specific session by ID, including its current status and messages.',
    {
      session_id: z.string().describe('The session ID'),
    },
    async ({ session_id }) => {
      try {
        const session = await client.get(`/api/sessions/${encodeURIComponent(session_id)}`);
        return textResult(JSON.stringify(session, null, 2));
      } catch (err) {
        return handleError(err);
      }
    },
  );

  // ── Get Session Messages ───────────────────────────────────────

  server.tool(
    'corvid_get_session_messages',
    'Get the message history for a specific session.',
    {
      session_id: z.string().describe('The session ID'),
    },
    async ({ session_id }) => {
      try {
        const messages = await client.get(
          `/api/sessions/${encodeURIComponent(session_id)}/messages`,
        );
        return textResult(JSON.stringify(messages, null, 2));
      } catch (err) {
        return handleError(err);
      }
    },
  );

  // ── Stop Session ───────────────────────────────────────────────

  server.tool(
    'corvid_stop_session',
    'Stop a running session.',
    {
      session_id: z.string().describe('The session ID to stop'),
    },
    async ({ session_id }) => {
      try {
        const result = await client.post(`/api/sessions/${encodeURIComponent(session_id)}/stop`);
        return textResult(JSON.stringify(result, null, 2));
      } catch (err) {
        return handleError(err);
      }
    },
  );

  // ── Send Message ───────────────────────────────────────────────

  server.tool(
    'corvid_send_message',
    'Send a message to another agent. The target agent will process the message and return a response.',
    {
      to_agent: z.string().describe('Name or ID of the target agent'),
      message: z.string().describe('The message content to send'),
      thread: z.string().optional().describe('Thread ID for continuing an existing conversation'),
    },
    async ({ to_agent, message, thread }) => {
      try {
        const body: Record<string, unknown> = {
          toAgent: to_agent,
          message,
        };
        if (thread) body.thread = thread;

        const result = await client.post('/api/mcp/send-message', body);
        return textResult(JSON.stringify(result, null, 2));
      } catch (err) {
        return handleError(err);
      }
    },
  );

  // ── Create Work Task ───────────────────────────────────────────

  server.tool(
    'corvid_create_work_task',
    'Create a work task that spawns a new agent session on a dedicated branch. The agent will implement the described changes, run validation, and open a PR.',
    {
      description: z.string().describe('Description of the work to be done'),
      project_id: z.string().optional().describe('Project ID (uses default project if omitted)'),
    },
    async ({ description, project_id }) => {
      try {
        const body: Record<string, unknown> = { description };
        if (project_id) body.projectId = project_id;

        const task = await client.post('/api/work-tasks', body);
        return textResult(JSON.stringify(task, null, 2));
      } catch (err) {
        return handleError(err);
      }
    },
  );

  // ── List Work Tasks ────────────────────────────────────────────

  server.tool(
    'corvid_list_work_tasks',
    'List work tasks. Optionally filter by status or project.',
    {
      status: z
        .enum(['pending', 'running', 'completed', 'error', 'cancelled'])
        .optional()
        .describe('Filter by task status'),
      project_id: z.string().optional().describe('Filter by project ID'),
      limit: z.number().optional().describe('Maximum number of tasks to return'),
    },
    async ({ status, project_id, limit }) => {
      try {
        const params = new URLSearchParams();
        if (status) params.set('status', status);
        if (project_id) params.set('projectId', project_id);
        if (limit) params.set('limit', String(limit));
        const qs = params.toString();
        const path = qs ? `/api/work-tasks?${qs}` : '/api/work-tasks';
        const tasks = await client.get(path);
        return textResult(JSON.stringify(tasks, null, 2));
      } catch (err) {
        return handleError(err);
      }
    },
  );

  // ── Get Work Task ──────────────────────────────────────────────

  server.tool(
    'corvid_get_work_task',
    'Get details about a specific work task by ID.',
    {
      task_id: z.string().describe('The work task ID'),
    },
    async ({ task_id }) => {
      try {
        const task = await client.get(`/api/work-tasks/${encodeURIComponent(task_id)}`);
        return textResult(JSON.stringify(task, null, 2));
      } catch (err) {
        return handleError(err);
      }
    },
  );

  // ── List Projects ──────────────────────────────────────────────

  server.tool(
    'corvid_list_projects',
    'List all projects configured on the corvid-agent server.',
    {},
    async () => {
      try {
        const projects = await client.get('/api/projects');
        return textResult(JSON.stringify(projects, null, 2));
      } catch (err) {
        return handleError(err);
      }
    },
  );

  // ── Get Project ────────────────────────────────────────────────

  server.tool(
    'corvid_get_project',
    'Get details about a specific project by ID.',
    {
      project_id: z.string().describe('The project ID'),
    },
    async ({ project_id }) => {
      try {
        const project = await client.get(`/api/projects/${encodeURIComponent(project_id)}`);
        return textResult(JSON.stringify(project, null, 2));
      } catch (err) {
        return handleError(err);
      }
    },
  );

  // ── Server Health ──────────────────────────────────────────────

  server.tool(
    'corvid_health',
    'Check the health status of the corvid-agent server.',
    {},
    async () => {
      try {
        const health = await client.get('/api/health');
        return textResult(JSON.stringify(health, null, 2));
      } catch (err) {
        return handleError(err);
      }
    },
  );

  return server;
}

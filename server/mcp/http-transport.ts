/**
 * HTTP MCP Transport — exposes corvid-agent MCP tools over Streamable HTTP.
 *
 * This allows ANY MCP client (Claude Code, Cursor, Gemini, etc.) to connect
 * to the corvid-agent server by URL — no local stdio process needed.
 *
 * Endpoint: POST/GET/DELETE /mcp
 *
 * Client config example (Claude Code):
 *   { "corvid-agent": { "type": "streamable-http", "url": "http://localhost:3000/mcp" } }
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod/v4';
import { createLogger } from '../lib/logger';

const log = createLogger('McpHttp');

/** Internal fetch helper — calls the local REST API. */
async function callApi(
    baseUrl: string,
    path: string,
    body?: Record<string, unknown>,
): Promise<{ response: string; isError?: boolean }> {
    const url = `${baseUrl}${path}`;
    const res = await fetch(url, body ? {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    } : undefined);

    if (!res.ok) {
        const text = await res.text();
        return { response: `API error (${res.status}): ${text}`, isError: true };
    }

    return await res.json() as { response: string; isError?: boolean };
}

/** Fetch JSON from a GET endpoint. */
async function fetchJson(baseUrl: string, path: string): Promise<unknown> {
    const res = await fetch(`${baseUrl}${path}`);
    if (!res.ok) {
        throw new Error(`API error (${res.status}): ${await res.text()}`);
    }
    return res.json();
}

function textResult(text: string) {
    return { content: [{ type: 'text' as const, text }] };
}

function errorResult(text: string) {
    return { content: [{ type: 'text' as const, text }], isError: true as const };
}

function handleError(err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResult(`Error: ${message}`);
}

function createMcpServer(baseUrl: string, agentId: string): McpServer {
    const server = new McpServer(
        { name: 'corvid-agent', version: '1.0.0' },
        { capabilities: { tools: {} } },
    );

    // ── Health ──────────────────────────────────────────────────────
    server.tool('corvid_health', 'Check the health status of the corvid-agent server.', {}, async () => {
        try {
            const health = await fetchJson(baseUrl, '/api/health');
            return textResult(JSON.stringify(health, null, 2));
        } catch (err) { return handleError(err); }
    });

    // ── Agents ─────────────────────────────────────────────────────
    server.tool('corvid_list_agents', 'List all agents registered on the server.', {}, async () => {
        try {
            const data = await callApi(baseUrl, `/api/mcp/list-agents?agentId=${encodeURIComponent(agentId)}`);
            return { content: [{ type: 'text' as const, text: data.response }], isError: data.isError };
        } catch (err) { return handleError(err); }
    });

    server.tool('corvid_get_agent', 'Get details about a specific agent by ID.', {
        agent_id: z.string().describe('The agent ID'),
    }, async ({ agent_id }) => {
        try {
            const agent = await fetchJson(baseUrl, `/api/agents/${encodeURIComponent(agent_id)}`);
            return textResult(JSON.stringify(agent, null, 2));
        } catch (err) { return handleError(err); }
    });

    // ── Sessions ───────────────────────────────────────────────────
    server.tool('corvid_create_session', 'Create a new agent session.', {
        project_id: z.string().describe('Project ID'),
        agent_id: z.string().optional().describe('Agent ID (uses project default if omitted)'),
        name: z.string().optional().describe('Optional session name'),
        initial_prompt: z.string().optional().describe('Initial prompt for the agent'),
    }, async ({ project_id, agent_id, name, initial_prompt }) => {
        try {
            const body: Record<string, unknown> = { projectId: project_id };
            if (agent_id) body.agentId = agent_id;
            if (name) body.name = name;
            if (initial_prompt) body.initialPrompt = initial_prompt;
            const session = await fetchJson(baseUrl, '/api/sessions');
            return textResult(JSON.stringify(session, null, 2));
        } catch (err) { return handleError(err); }
    });

    server.tool('corvid_list_sessions', 'List all sessions. Optionally filter by status.', {
        status: z.enum(['running', 'completed', 'error', 'stopped']).optional().describe('Filter by status'),
        limit: z.number().optional().describe('Max sessions to return'),
    }, async ({ status, limit }) => {
        try {
            const params = new URLSearchParams();
            if (status) params.set('status', status);
            if (limit) params.set('limit', String(limit));
            const qs = params.toString();
            const sessions = await fetchJson(baseUrl, qs ? `/api/sessions?${qs}` : '/api/sessions');
            return textResult(JSON.stringify(sessions, null, 2));
        } catch (err) { return handleError(err); }
    });

    server.tool('corvid_get_session', 'Get details about a specific session.', {
        session_id: z.string().describe('The session ID'),
    }, async ({ session_id }) => {
        try {
            const session = await fetchJson(baseUrl, `/api/sessions/${encodeURIComponent(session_id)}`);
            return textResult(JSON.stringify(session, null, 2));
        } catch (err) { return handleError(err); }
    });

    server.tool('corvid_stop_session', 'Stop a running session.', {
        session_id: z.string().describe('The session ID to stop'),
    }, async ({ session_id }) => {
        try {
            const res = await fetch(`${baseUrl}/api/sessions/${encodeURIComponent(session_id)}/stop`, { method: 'POST' });
            const result = await res.json();
            return textResult(JSON.stringify(result, null, 2));
        } catch (err) { return handleError(err); }
    });

    // ── Messaging ──────────────────────────────────────────────────
    server.tool('corvid_send_message', 'Send a message to another agent.', {
        to_agent: z.string().describe('Agent name or ID to message'),
        message: z.string().describe('The message to send'),
    }, async ({ to_agent, message }) => {
        try {
            const data = await callApi(baseUrl, '/api/mcp/send-message', {
                agentId, toAgent: to_agent, message,
            });
            return { content: [{ type: 'text' as const, text: data.response }], isError: data.isError };
        } catch (err) { return handleError(err); }
    });

    // ── Memory ─────────────────────────────────────────────────────
    server.tool('corvid_save_memory', 'Save a memory to long-term storage (on-chain) with short-term SQLite cache.', {
        key: z.string().describe('A short descriptive key'),
        content: z.string().describe('The content to remember'),
    }, async ({ key, content }) => {
        try {
            const data = await callApi(baseUrl, '/api/mcp/save-memory', { agentId, key, content });
            return { content: [{ type: 'text' as const, text: data.response }], isError: data.isError };
        } catch (err) { return handleError(err); }
    });

    server.tool('corvid_recall_memory', 'Recall memories. Provide key for exact lookup, query for search, or neither for recent.', {
        key: z.string().optional().describe('Exact key to look up'),
        query: z.string().optional().describe('Search term'),
    }, async ({ key, query }) => {
        try {
            const data = await callApi(baseUrl, '/api/mcp/recall-memory', { agentId, key, query });
            return { content: [{ type: 'text' as const, text: data.response }], isError: data.isError };
        } catch (err) { return handleError(err); }
    });

    server.tool('corvid_read_on_chain_memories', 'Read memories from on-chain storage (Algorand blockchain).', {
        search: z.string().optional().describe('Search term to filter'),
        limit: z.number().optional().describe('Max memories to return (default: 50)'),
    }, async ({ search, limit }) => {
        try {
            const data = await callApi(baseUrl, '/api/mcp/read-on-chain-memories', { agentId, search, limit });
            return { content: [{ type: 'text' as const, text: data.response }], isError: data.isError };
        } catch (err) { return handleError(err); }
    });

    server.tool('corvid_sync_on_chain_memories', 'Sync on-chain memories back to local SQLite cache.', {
        limit: z.number().optional().describe('Max memories to scan (default: 200)'),
    }, async ({ limit }) => {
        try {
            const data = await callApi(baseUrl, '/api/mcp/sync-on-chain-memories', { agentId, limit });
            return { content: [{ type: 'text' as const, text: data.response }], isError: data.isError };
        } catch (err) { return handleError(err); }
    });

    server.tool('corvid_delete_memory', 'Delete a long-term ARC-69 memory. Only works for ASA memories on localnet.', {
        key: z.string().describe('Memory key to delete'),
        mode: z.enum(['soft', 'hard']).optional().describe('Delete mode (default: soft)'),
    }, async ({ key, mode }) => {
        try {
            const data = await callApi(baseUrl, '/api/mcp/delete-memory', { agentId, key, mode });
            return { content: [{ type: 'text' as const, text: data.response }], isError: data.isError };
        } catch (err) { return handleError(err); }
    });

    // ── Observations (memory graduation) ────────────────────────────
    server.tool('corvid_record_observation', 'Record a short-term observation. High-value observations auto-graduate to long-term ARC-69 memory.', {
        content: z.string().describe('The observation content'),
        source: z.enum(['session', 'feedback', 'daily-review', 'health', 'pr-outcome', 'manual']).optional().describe('Source of the observation'),
        source_id: z.string().optional().describe('ID of the source (session ID, PR number, etc.)'),
        suggested_key: z.string().optional().describe('Suggested memory key if this graduates'),
        relevance_score: z.number().optional().describe('Initial relevance score (default: 1.0)'),
    }, async ({ content, source, source_id, suggested_key, relevance_score }) => {
        try {
            const data = await callApi(baseUrl, '/api/mcp/record-observation', {
                agentId, content, source, sourceId: source_id, suggestedKey: suggested_key, relevanceScore: relevance_score,
            });
            return { content: [{ type: 'text' as const, text: data.response }], isError: data.isError };
        } catch (err) { return handleError(err); }
    });

    server.tool('corvid_list_observations', 'List or search memory observations.', {
        status: z.enum(['active', 'graduated', 'expired', 'dismissed']).optional().describe('Filter by status'),
        source: z.enum(['session', 'feedback', 'daily-review', 'health', 'pr-outcome', 'manual']).optional().describe('Filter by source'),
        query: z.string().optional().describe('Search term'),
        limit: z.number().optional().describe('Max results'),
    }, async ({ status, source, query, limit }) => {
        try {
            const data = await callApi(baseUrl, '/api/mcp/list-observations', { agentId, status, source, query, limit });
            return { content: [{ type: 'text' as const, text: data.response }], isError: data.isError };
        } catch (err) { return handleError(err); }
    });

    server.tool('corvid_boost_observation', 'Boost an observation\'s relevance score (makes graduation more likely).', {
        id: z.string().describe('Observation ID'),
        score_boost: z.number().optional().describe('Amount to boost (default: 1.0)'),
    }, async ({ id, score_boost }) => {
        try {
            const data = await callApi(baseUrl, '/api/mcp/boost-observation', { agentId, id, scoreBoost: score_boost });
            return { content: [{ type: 'text' as const, text: data.response }], isError: data.isError };
        } catch (err) { return handleError(err); }
    });

    server.tool('corvid_dismiss_observation', 'Dismiss an observation — marks it as not worth keeping.', {
        id: z.string().describe('Observation ID'),
    }, async ({ id }) => {
        try {
            const data = await callApi(baseUrl, '/api/mcp/dismiss-observation', { agentId, id });
            return { content: [{ type: 'text' as const, text: data.response }], isError: data.isError };
        } catch (err) { return handleError(err); }
    });

    server.tool('corvid_observation_stats', 'Get statistics about memory observations and graduation candidates.', {}, async () => {
        try {
            const data = await callApi(baseUrl, '/api/mcp/observation-stats', { agentId });
            return { content: [{ type: 'text' as const, text: data.response }], isError: data.isError };
        } catch (err) { return handleError(err); }
    });

    // ── Work Tasks ─────────────────────────────────────────────────
    server.tool('corvid_create_work_task', 'Create a work task that spawns a new agent session on a dedicated branch.', {
        description: z.string().describe('Description of the work'),
        project_id: z.string().optional().describe('Project ID (uses default if omitted)'),
    }, async ({ description, project_id }) => {
        try {
            const body: Record<string, unknown> = { description };
            if (project_id) body.projectId = project_id;
            const res = await fetch(`${baseUrl}/api/work-tasks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const task = await res.json();
            return textResult(JSON.stringify(task, null, 2));
        } catch (err) { return handleError(err); }
    });

    server.tool('corvid_list_work_tasks', 'List work tasks.', {
        status: z.enum(['pending', 'running', 'completed', 'error', 'cancelled']).optional().describe('Filter by status'),
        limit: z.number().optional().describe('Max tasks to return'),
    }, async ({ status, limit }) => {
        try {
            const params = new URLSearchParams();
            if (status) params.set('status', status);
            if (limit) params.set('limit', String(limit));
            const qs = params.toString();
            const tasks = await fetchJson(baseUrl, qs ? `/api/work-tasks?${qs}` : '/api/work-tasks');
            return textResult(JSON.stringify(tasks, null, 2));
        } catch (err) { return handleError(err); }
    });

    server.tool('corvid_get_work_task', 'Get details about a specific work task.', {
        task_id: z.string().describe('The work task ID'),
    }, async ({ task_id }) => {
        try {
            const task = await fetchJson(baseUrl, `/api/work-tasks/${encodeURIComponent(task_id)}`);
            return textResult(JSON.stringify(task, null, 2));
        } catch (err) { return handleError(err); }
    });

    // ── Projects ───────────────────────────────────────────────────
    server.tool('corvid_list_projects', 'List all projects configured on the server.', {}, async () => {
        try {
            const projects = await fetchJson(baseUrl, '/api/projects');
            return textResult(JSON.stringify(projects, null, 2));
        } catch (err) { return handleError(err); }
    });

    server.tool('corvid_get_project', 'Get details about a specific project.', {
        project_id: z.string().describe('The project ID'),
    }, async ({ project_id }) => {
        try {
            const project = await fetchJson(baseUrl, `/api/projects/${encodeURIComponent(project_id)}`);
            return textResult(JSON.stringify(project, null, 2));
        } catch (err) { return handleError(err); }
    });

    return server;
}

/** Active transports keyed by session ID. */
const transports = new Map<string, WebStandardStreamableHTTPServerTransport>();

/** Resolve the first agent ID from the database. */
async function resolveAgentId(baseUrl: string): Promise<string> {
    try {
        const agents = await fetchJson(baseUrl, '/api/agents') as Array<{ id: string }>;
        if (agents.length > 0) return agents[0].id;
    } catch { /* fall through */ }
    return 'default';
}

let cachedAgentId: string | null = null;

/**
 * Handle an MCP HTTP request at /mcp.
 *
 * Stateful mode: each client gets a session, multiple sessions supported concurrently.
 */
export async function handleMcpHttpRequest(req: Request, baseUrl: string): Promise<Response> {
    // Resolve agent ID once
    if (!cachedAgentId) {
        cachedAgentId = await resolveAgentId(baseUrl);
        log.info('MCP HTTP transport ready', { agentId: cachedAgentId });
    }

    const sessionId = req.headers.get('mcp-session-id');

    // Existing session — route to its transport
    if (sessionId && transports.has(sessionId)) {
        const transport = transports.get(sessionId)!;
        return transport.handleRequest(req);
    }

    // New session (initialization or stateless)
    if (req.method === 'POST' || req.method === 'GET') {
        const transport = new WebStandardStreamableHTTPServerTransport({
            sessionIdGenerator: () => crypto.randomUUID(),
            onsessioninitialized: (id) => {
                transports.set(id, transport);
                log.info('MCP session initialized', { sessionId: id });
            },
            onsessionclosed: (id) => {
                transports.delete(id);
                log.info('MCP session closed', { sessionId: id });
            },
        });

        const mcpServer = createMcpServer(baseUrl, cachedAgentId);
        await mcpServer.connect(transport);

        return transport.handleRequest(req);
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
    });
}

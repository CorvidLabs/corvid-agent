#!/usr/bin/env bun
/**
 * Standalone MCP stdio server for the CLI (full-auto) path.
 * Reads CORVID_AGENT_ID and CORVID_API_URL from env.
 * Each tool handler calls fetch() against the HTTP API endpoints on the parent server.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod/v4';

const apiUrl = process.env.CORVID_API_URL;

if (!apiUrl) {
    console.error('CORVID_API_URL environment variable is required');
    process.exit(1);
}

/** Resolve agent ID from env or auto-discover from the running server. */
async function resolveAgentId(): Promise<string> {
    const envId = process.env.CORVID_AGENT_ID;
    if (envId) return envId;

    try {
        const res = await fetch(`${apiUrl}/api/agents`);
        if (res.ok) {
            const agents = await res.json() as Array<{ id: string }>;
            if (agents.length > 0) {
                console.error(`Auto-discovered agent ID: ${agents[0].id}`);
                return agents[0].id;
            }
        }
    } catch {
        // Server may not be reachable yet — fall through
    }
    console.error('Could not resolve CORVID_AGENT_ID: set it in env or ensure the server is running');
    process.exit(1);
}

const agentId = await resolveAgentId();

const server = new McpServer({
    name: 'corvid-agent-tools',
    version: '1.0.0',
});

async function callApi(path: string, body?: Record<string, unknown>): Promise<{ response: string; isError?: boolean }> {
    const isGet = !body;
    const url = isGet ? `${apiUrl}${path}` : `${apiUrl}${path}`;

    const res = await fetch(url, isGet ? undefined : {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const text = await res.text();
        return { response: `API error (${res.status}): ${text}`, isError: true };
    }

    return await res.json() as { response: string; isError?: boolean };
}

server.tool(
    'corvid_send_message',
    'Send a message to another agent and wait for their response. ' +
    'Use corvid_list_agents first to discover available agents. ' +
    'The target agent will start a session, process your message, and return a response.',
    {
        to_agent: z.string().describe('Agent name or ID to message'),
        message: z.string().describe('The message to send'),
    },
    async (args) => {
        const data = await callApi('/api/mcp/send-message', {
            agentId,
            toAgent: args.to_agent,
            message: args.message,
        });
        return {
            content: [{ type: 'text' as const, text: data.response }],
            isError: data.isError,
        };
    },
);

server.tool(
    'corvid_save_memory',
    'Save a memory to short-term local storage (SQLite). ' +
    'Use corvid_promote_memory to promote to long-term on-chain storage (ARC-69 ASA). ' +
    'Use this for ANY "remember this" request regardless of channel. Use a descriptive key for easy recall later.',
    {
        key: z.string().describe('A short descriptive key for this memory'),
        content: z.string().describe('The content to remember'),
    },
    async (args) => {
        const data = await callApi('/api/mcp/save-memory', {
            agentId,
            key: args.key,
            content: args.content,
        });
        return {
            content: [{ type: 'text' as const, text: data.response }],
            isError: data.isError,
        };
    },
);

server.tool(
    'corvid_recall_memory',
    'Recall memories from short-term cache (SQLite) with long-term storage status. ' +
    'Results show whether the memory is confirmed on-chain (long-term) or still pending sync. ' +
    'Provide a key for exact lookup, a query for search, or neither to list recent memories.',
    {
        key: z.string().optional().describe('Exact key to look up'),
        query: z.string().optional().describe('Search term to find across keys and content'),
    },
    async (args) => {
        const data = await callApi('/api/mcp/recall-memory', {
            agentId,
            key: args.key,
            query: args.query,
        });
        return {
            content: [{ type: 'text' as const, text: data.response }],
            isError: data.isError,
        };
    },
);

server.tool(
    'corvid_read_on_chain_memories',
    'Read memories directly from on-chain storage (Algorand blockchain). ' +
    'Browse permanent long-term memories. Useful when local cache may be stale or empty.',
    {
        search: z.string().optional().describe('Optional search term to filter by key or content'),
        limit: z.number().optional().describe('Max memories to return (default: 50)'),
    },
    async (args) => {
        const data = await callApi('/api/mcp/read-on-chain-memories', {
            agentId,
            search: args.search,
            limit: args.limit,
        });
        return {
            content: [{ type: 'text' as const, text: data.response }],
            isError: data.isError,
        };
    },
);

server.tool(
    'corvid_sync_on_chain_memories',
    'Sync memories from on-chain storage back to local SQLite cache. Recovers memories after database reset.',
    {
        limit: z.number().optional().describe('Max on-chain memories to scan (default: 200)'),
    },
    async (args) => {
        const data = await callApi('/api/mcp/sync-on-chain-memories', {
            agentId,
            limit: args.limit,
        });
        return {
            content: [{ type: 'text' as const, text: data.response }],
            isError: data.isError,
        };
    },
);

server.tool(
    'corvid_delete_memory',
    'Delete a long-term ARC-69 memory. Only works for ASA memories on localnet. ' +
    'Soft delete (default) archives; hard delete destroys the ASA.',
    {
        key: z.string().describe('Memory key to delete'),
        mode: z.enum(['soft', 'hard']).optional().describe('Delete mode (default: soft)'),
    },
    async (args) => {
        const data = await callApi('/api/mcp/delete-memory', {
            agentId,
            key: args.key,
            mode: args.mode,
        });
        return {
            content: [{ type: 'text' as const, text: data.response }],
            isError: data.isError,
        };
    },
);

server.tool(
    'corvid_promote_memory',
    'Promote a short-term (SQLite) memory to long-term on-chain storage (ARC-69 ASA). ' +
    'Use after corvid_save_memory when you want to make a memory permanent.',
    {
        key: z.string().describe('Memory key to promote to long-term on-chain storage'),
    },
    async (args) => {
        const data = await callApi('/api/mcp/promote-memory', {
            agentId,
            key: args.key,
        });
        return {
            content: [{ type: 'text' as const, text: data.response }],
            isError: data.isError,
        };
    },
);

server.tool(
    'corvid_list_agents',
    'List all available agents you can communicate with. ' +
    'Shows agent names, IDs, and wallet addresses.',
    {},
    async () => {
        const data = await callApi(`/api/mcp/list-agents?agentId=${encodeURIComponent(agentId)}`);
        return {
            content: [{ type: 'text' as const, text: data.response }],
            isError: data.isError,
        };
    },
);

const transport = new StdioServerTransport();
await server.connect(transport);

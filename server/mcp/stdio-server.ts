#!/usr/bin/env bun
/**
 * Standalone MCP stdio server for the CLI (full-auto) path.
 * Reads CORVID_AGENT_ID and CORVID_API_URL from env.
 * Each tool handler calls fetch() against the HTTP API endpoints on the parent server.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod/v4';

const agentId = process.env.CORVID_AGENT_ID;
const apiUrl = process.env.CORVID_API_URL;

if (!agentId || !apiUrl) {
    console.error('CORVID_AGENT_ID and CORVID_API_URL environment variables are required');
    process.exit(1);
}

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
    'Save a private encrypted note to your memory. ' +
    'Memories persist across sessions and are stored on-chain for audit. ' +
    'Use a descriptive key for easy recall later.',
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
    'Recall previously saved memories. ' +
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

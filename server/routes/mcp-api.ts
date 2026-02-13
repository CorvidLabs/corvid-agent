import type { Database } from 'bun:sqlite';
import type { AgentMessenger } from '../algochat/agent-messenger';
import type { AgentDirectory } from '../algochat/agent-directory';
import type { AgentWalletService } from '../algochat/agent-wallet';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpToolContext } from '../mcp/tool-handlers';
import { handleSendMessage, handleSaveMemory, handleRecallMemory, handleListAgents } from '../mcp/tool-handlers';
import { parseBodyOrThrow, McpSendMessageSchema, McpSaveMemorySchema, McpRecallMemorySchema } from '../lib/validation';
import { json, handleRouteError } from '../lib/response';

function extractResultText(result: CallToolResult): string {
    const first = result.content[0];
    if (first && 'text' in first) return first.text;
    return '';
}

interface McpApiDeps {
    db: Database;
    agentMessenger: AgentMessenger;
    agentDirectory: AgentDirectory;
    agentWalletService: AgentWalletService;
    serverMnemonic?: string | null;
    network?: string;
}

function buildContext(deps: McpApiDeps, agentId: string): McpToolContext {
    return {
        agentId,
        db: deps.db,
        agentMessenger: deps.agentMessenger,
        agentDirectory: deps.agentDirectory,
        agentWalletService: deps.agentWalletService,
        serverMnemonic: deps.serverMnemonic,
        network: deps.network,
    };
}

export function handleMcpApiRoutes(
    req: Request,
    url: URL,
    deps: McpApiDeps | null,
): Response | Promise<Response> | null {
    if (!deps) return null;
    if (!url.pathname.startsWith('/api/mcp/')) return null;

    if (url.pathname === '/api/mcp/send-message' && req.method === 'POST') {
        return handleSendMessageRoute(req, deps);
    }

    if (url.pathname === '/api/mcp/save-memory' && req.method === 'POST') {
        return handleSaveMemoryRoute(req, deps);
    }

    if (url.pathname === '/api/mcp/recall-memory' && req.method === 'POST') {
        return handleRecallMemoryRoute(req, deps);
    }

    if (url.pathname === '/api/mcp/list-agents' && req.method === 'GET') {
        return handleListAgentsRoute(url, deps);
    }

    return null;
}

async function handleSendMessageRoute(req: Request, deps: McpApiDeps): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, McpSendMessageSchema);

        const ctx = buildContext(deps, data.agentId);
        const result = await handleSendMessage(ctx, { to_agent: data.toAgent, message: data.message });
        return json({ response: extractResultText(result), isError: result.isError });
    } catch (err) {
        return handleRouteError(err);
    }
}

async function handleSaveMemoryRoute(req: Request, deps: McpApiDeps): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, McpSaveMemorySchema);

        const ctx = buildContext(deps, data.agentId);
        const result = await handleSaveMemory(ctx, { key: data.key, content: data.content });
        return json({ response: extractResultText(result), isError: result.isError });
    } catch (err) {
        return handleRouteError(err);
    }
}

async function handleRecallMemoryRoute(req: Request, deps: McpApiDeps): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, McpRecallMemorySchema);

        const ctx = buildContext(deps, data.agentId);
        const result = await handleRecallMemory(ctx, { key: data.key, query: data.query });
        return json({ response: extractResultText(result), isError: result.isError });
    } catch (err) {
        return handleRouteError(err);
    }
}

async function handleListAgentsRoute(url: URL, deps: McpApiDeps): Promise<Response> {
    try {
        const agentId = url.searchParams.get('agentId');
        if (!agentId) {
            return json({ error: 'Missing required query param: agentId' }, 400);
        }

        const ctx = buildContext(deps, agentId);
        const result = await handleListAgents(ctx);
        return json({ response: extractResultText(result), isError: result.isError });
    } catch (err) {
        return handleRouteError(err);
    }
}

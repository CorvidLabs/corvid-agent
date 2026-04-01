import type { Database } from 'bun:sqlite';
import type { AgentMessenger } from '../algochat/agent-messenger';
import type { AgentDirectory } from '../algochat/agent-directory';
import type { AgentWalletService } from '../algochat/agent-wallet';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpToolContext } from '../mcp/tool-handlers';
import { handleSendMessage, handleSaveMemory, handlePromoteMemory, handleRecallMemory, handleDeleteMemory, handleReadOnChainMemories, handleSyncOnChainMemories, handleListAgents, handleRecordObservation, handleListObservations, handleBoostObservation, handleDismissObservation, handleObservationStats } from '../mcp/tool-handlers';
import { parseBodyOrThrow, McpSendMessageSchema, McpSaveMemorySchema, McpPromoteMemorySchema, McpRecallMemorySchema, McpDeleteMemorySchema, McpReadOnChainMemoriesSchema, McpSyncOnChainMemoriesSchema, McpRecordObservationSchema, McpListObservationsSchema, McpBoostObservationSchema, McpDismissObservationSchema, McpObservationStatsSchema } from '../lib/validation';
import { checkInjection } from '../lib/injection-guard';
import { json, handleRouteError } from '../lib/response';

function extractResultText(result: CallToolResult): string {
    const first = result.content[0];
    if (first && 'text' in first) return first.text;
    return '';
}

export interface McpApiDeps {
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

    if (url.pathname === '/api/mcp/read-on-chain-memories' && req.method === 'POST') {
        return handleReadOnChainMemoriesRoute(req, deps);
    }

    if (url.pathname === '/api/mcp/sync-on-chain-memories' && req.method === 'POST') {
        return handleSyncOnChainMemoriesRoute(req, deps);
    }

    if (url.pathname === '/api/mcp/delete-memory' && req.method === 'POST') {
        return handleDeleteMemoryRoute(req, deps);
    }

    if (url.pathname === '/api/mcp/promote-memory' && req.method === 'POST') {
        return handlePromoteMemoryRoute(req, deps);
    }

    if (url.pathname === '/api/mcp/list-agents' && req.method === 'GET') {
        return handleListAgentsRoute(url, deps);
    }

    // ── Observations ──────────────────────────────────────────────────
    if (url.pathname === '/api/mcp/record-observation' && req.method === 'POST') {
        return handleRecordObservationRoute(req, deps);
    }

    if (url.pathname === '/api/mcp/list-observations' && req.method === 'POST') {
        return handleListObservationsRoute(req, deps);
    }

    if (url.pathname === '/api/mcp/boost-observation' && req.method === 'POST') {
        return handleBoostObservationRoute(req, deps);
    }

    if (url.pathname === '/api/mcp/dismiss-observation' && req.method === 'POST') {
        return handleDismissObservationRoute(req, deps);
    }

    if (url.pathname === '/api/mcp/observation-stats' && req.method === 'POST') {
        return handleObservationStatsRoute(req, deps);
    }

    return null;
}

async function handleSendMessageRoute(req: Request, deps: McpApiDeps): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, McpSendMessageSchema);
        const injectionDenied = checkInjection(deps.db, data.message, 'mcp_send_message', req);
        if (injectionDenied) return injectionDenied;

        const ctx = buildContext(deps, data.agentId);
        const result = await handleSendMessage(ctx, { to_agent: data.toAgent, message: data.message });
        return json({ response: extractResultText(result), isError: result.isError ?? false });
    } catch (err) {
        return handleRouteError(err);
    }
}

async function handleSaveMemoryRoute(req: Request, deps: McpApiDeps): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, McpSaveMemorySchema);
        const injectionDenied = checkInjection(deps.db, data.content, 'mcp_save_memory', req);
        if (injectionDenied) return injectionDenied;

        const ctx = buildContext(deps, data.agentId);
        const result = await handleSaveMemory(ctx, { key: data.key, content: data.content });
        return json({ response: extractResultText(result), isError: result.isError ?? false });
    } catch (err) {
        return handleRouteError(err);
    }
}

async function handleRecallMemoryRoute(req: Request, deps: McpApiDeps): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, McpRecallMemorySchema);

        const ctx = buildContext(deps, data.agentId);
        const result = await handleRecallMemory(ctx, { key: data.key, query: data.query });
        return json({ response: extractResultText(result), isError: result.isError ?? false });
    } catch (err) {
        return handleRouteError(err);
    }
}

async function handleReadOnChainMemoriesRoute(req: Request, deps: McpApiDeps): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, McpReadOnChainMemoriesSchema);

        const ctx = buildContext(deps, data.agentId);
        const result = await handleReadOnChainMemories(ctx, { search: data.search, limit: data.limit });
        return json({ response: extractResultText(result), isError: result.isError ?? false });
    } catch (err) {
        return handleRouteError(err);
    }
}

async function handleSyncOnChainMemoriesRoute(req: Request, deps: McpApiDeps): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, McpSyncOnChainMemoriesSchema);

        const ctx = buildContext(deps, data.agentId);
        const result = await handleSyncOnChainMemories(ctx, { limit: data.limit });
        return json({ response: extractResultText(result), isError: result.isError ?? false });
    } catch (err) {
        return handleRouteError(err);
    }
}

async function handleDeleteMemoryRoute(req: Request, deps: McpApiDeps): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, McpDeleteMemorySchema);

        const ctx = buildContext(deps, data.agentId);
        const result = await handleDeleteMemory(ctx, { key: data.key, mode: data.mode });
        return json({ response: extractResultText(result), isError: result.isError ?? false });
    } catch (err) {
        return handleRouteError(err);
    }
}

async function handlePromoteMemoryRoute(req: Request, deps: McpApiDeps): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, McpPromoteMemorySchema);

        const ctx = buildContext(deps, data.agentId);
        const result = await handlePromoteMemory(ctx, { key: data.key, confirmed: data.confirmed });
        return json({ response: extractResultText(result), isError: result.isError ?? false });
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
        return json({ response: extractResultText(result), isError: result.isError ?? false });
    } catch (err) {
        return handleRouteError(err);
    }
}

// ─── Observation routes ──────────────────────────────────────────────────────

async function handleRecordObservationRoute(req: Request, deps: McpApiDeps): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, McpRecordObservationSchema);
        const injectionDenied = checkInjection(deps.db, data.content, 'mcp_observation', req);
        if (injectionDenied) return injectionDenied;
        const ctx = buildContext(deps, data.agentId);
        const result = await handleRecordObservation(ctx, {
            content: data.content,
            source: data.source,
            source_id: data.sourceId,
            suggested_key: data.suggestedKey,
            relevance_score: data.relevanceScore,
        });
        return json({ response: extractResultText(result), isError: result.isError ?? false });
    } catch (err) {
        return handleRouteError(err);
    }
}

async function handleListObservationsRoute(req: Request, deps: McpApiDeps): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, McpListObservationsSchema);
        const ctx = buildContext(deps, data.agentId);
        const result = await handleListObservations(ctx, {
            status: data.status,
            source: data.source,
            query: data.query,
            limit: data.limit,
        });
        return json({ response: extractResultText(result), isError: result.isError ?? false });
    } catch (err) {
        return handleRouteError(err);
    }
}

async function handleBoostObservationRoute(req: Request, deps: McpApiDeps): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, McpBoostObservationSchema);
        const ctx = buildContext(deps, data.agentId);
        const result = await handleBoostObservation(ctx, { id: data.id, score_boost: data.scoreBoost });
        return json({ response: extractResultText(result), isError: result.isError ?? false });
    } catch (err) {
        return handleRouteError(err);
    }
}

async function handleDismissObservationRoute(req: Request, deps: McpApiDeps): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, McpDismissObservationSchema);
        const ctx = buildContext(deps, data.agentId);
        const result = await handleDismissObservation(ctx, { id: data.id });
        return json({ response: extractResultText(result), isError: result.isError ?? false });
    } catch (err) {
        return handleRouteError(err);
    }
}

async function handleObservationStatsRoute(req: Request, deps: McpApiDeps): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, McpObservationStatsSchema);
        const ctx = buildContext(deps, data.agentId);
        const result = await handleObservationStats(ctx);
        return json({ response: extractResultText(result), isError: result.isError ?? false });
    } catch (err) {
        return handleRouteError(err);
    }
}

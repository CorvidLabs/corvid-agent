import type { Database } from 'bun:sqlite';
import { handleProjectRoutes, handleBrowseDirs } from './projects';
import { handleAgentRoutes } from './agents';
import { handleSessionRoutes } from './sessions';
import { handleCouncilRoutes } from './councils';
import { handleWorkTaskRoutes } from './work-tasks';
import { handleMcpApiRoutes } from './mcp-api';
import type { ProcessManager } from '../process/manager';
import type { AlgoChatBridge } from '../algochat/bridge';
import type { AgentWalletService } from '../algochat/agent-wallet';
import type { AgentMessenger } from '../algochat/agent-messenger';
import type { AgentDirectory } from '../algochat/agent-directory';
import type { WorkTaskService } from '../work/service';
import { listConversations } from '../db/sessions';
import { searchAgentMessages } from '../db/agent-messages';

function json(data: unknown, status: number = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

export async function handleRequest(
    req: Request,
    db: Database,
    processManager: ProcessManager,
    algochatBridge: AlgoChatBridge | null,
    agentWalletService?: AgentWalletService | null,
    agentMessenger?: AgentMessenger | null,
    workTaskService?: WorkTaskService | null,
    selfTestService?: { run(testType: 'unit' | 'e2e' | 'all'): { sessionId: string } } | null,
    agentDirectory?: AgentDirectory | null,
): Promise<Response | null> {
    const url = new URL(req.url);

    // CORS headers for dev
    if (req.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: corsHeaders(),
        });
    }

    if (url.pathname === '/api/browse-dirs' && req.method === 'GET') {
        return addCorsAsync(handleBrowseDirs(req, url));
    }

    const projectResponse = handleProjectRoutes(req, url, db);
    if (projectResponse) return addCorsAsync(projectResponse);

    const agentResponse = handleAgentRoutes(req, url, db, agentWalletService, agentMessenger);
    if (agentResponse) return addCorsAsync(agentResponse);

    const sessionResponse = await handleSessionRoutes(req, url, db, processManager);
    if (sessionResponse) return addCorsAsync(sessionResponse);

    const councilResponse = handleCouncilRoutes(req, url, db, processManager, agentMessenger);
    if (councilResponse) return addCorsAsync(councilResponse);

    if (workTaskService) {
        const workTaskResponse = handleWorkTaskRoutes(req, url, workTaskService);
        if (workTaskResponse) return addCorsAsync(workTaskResponse);
    }

    // MCP API routes (used by stdio server subprocess)
    const mcpDeps = agentMessenger && agentDirectory && agentWalletService
        ? { db, agentMessenger, agentDirectory, agentWalletService }
        : null;
    const mcpResponse = handleMcpApiRoutes(req, url, mcpDeps);
    if (mcpResponse) return addCorsAsync(mcpResponse);

    // Resume a paused session (e.g. after API outage)
    const resumeMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/resume$/);
    if (resumeMatch && req.method === 'POST') {
        const sessionId = resumeMatch[1];
        const resumed = processManager.resumeSession(sessionId);
        if (resumed) {
            return addCors(json({ ok: true, message: `Session ${sessionId} resumed` }));
        }
        return addCors(json({ error: `Session ${sessionId} is not paused` }, 400));
    }

    // Escalation queue — list pending requests
    if (url.pathname === '/api/escalation-queue' && req.method === 'GET') {
        const requests = processManager.approvalManager.getQueuedRequests();
        return addCors(json({ requests }));
    }

    // Escalation queue — resolve a request
    const escalationMatch = url.pathname.match(/^\/api\/escalation-queue\/(\d+)\/resolve$/);
    if (escalationMatch && req.method === 'POST') {
        return addCorsAsync(handleEscalationResolve(req, processManager, parseInt(escalationMatch[1], 10)));
    }

    // Operational mode — get/set
    if (url.pathname === '/api/operational-mode' && req.method === 'GET') {
        return addCors(json({ mode: processManager.approvalManager.operationalMode }));
    }
    if (url.pathname === '/api/operational-mode' && req.method === 'POST') {
        return addCorsAsync(handleSetOperationalMode(req, processManager));
    }

    // Feed history — returns recent agent messages for the AlgoChat Feed
    if (url.pathname === '/api/feed/history' && req.method === 'GET') {
        const limit = Number(url.searchParams.get('limit') ?? '50');
        const offset = Number(url.searchParams.get('offset') ?? '0');
        const search = url.searchParams.get('search') ?? undefined;
        const agentId = url.searchParams.get('agentId') ?? undefined;
        const threadId = url.searchParams.get('threadId') ?? undefined;
        const result = searchAgentMessages(db, { limit, offset, search, agentId, threadId });
        return addCors(json({ messages: result.messages, total: result.total, limit, offset }));
    }

    // AlgoChat routes
    if (url.pathname === '/api/algochat/status' && req.method === 'GET') {
        const status = algochatBridge?.getStatus()
            ?? {
                enabled: false,
                address: null,
                network: 'testnet',
                syncInterval: 30000,
                activeConversations: 0,
            };
        return addCors(json(status));
    }

    if (url.pathname === '/api/algochat/conversations' && req.method === 'POST') {
        return addCors(json(listConversations(db)));
    }

    // Self-test route
    if (url.pathname === '/api/selftest/run' && req.method === 'POST') {
        if (!selfTestService) {
            return addCors(json({ error: 'Self-test service not available' }, 503));
        }
        return addCorsAsync(handleSelfTestRun(req, selfTestService));
    }

    return null;
}

async function handleSelfTestRun(
    req: Request,
    selfTestService: { run(testType: 'unit' | 'e2e' | 'all'): { sessionId: string } },
): Promise<Response> {
    let testType: 'unit' | 'e2e' | 'all' = 'all';
    try {
        const body = await req.json();
        if (body.testType && ['unit', 'e2e', 'all'].includes(body.testType)) {
            testType = body.testType;
        }
    } catch {
        // Default to 'all' if no body
    }

    try {
        const result = selfTestService.run(testType);
        return json({ sessionId: result.sessionId });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return json({ error: message }, 500);
    }
}

function corsHeaders(): Record<string, string> {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };
}

function addCors(response: Response): Response {
    const headers = corsHeaders();
    for (const [key, value] of Object.entries(headers)) {
        response.headers.set(key, value);
    }
    return response;
}

async function handleEscalationResolve(
    req: Request,
    processManager: ProcessManager,
    queueId: number,
): Promise<Response> {
    try {
        const body = await req.json() as { approved?: boolean };
        const approved = body.approved === true;
        const resolved = processManager.approvalManager.resolveQueuedRequest(queueId, approved);
        if (resolved) {
            return json({ ok: true, message: `Escalation #${queueId} ${approved ? 'approved' : 'denied'}` });
        }
        return json({ error: `Escalation #${queueId} not found or already resolved` }, 404);
    } catch {
        return json({ error: 'Invalid request body' }, 400);
    }
}

async function handleSetOperationalMode(
    req: Request,
    processManager: ProcessManager,
): Promise<Response> {
    try {
        const body = await req.json() as { mode?: string };
        const validModes = ['normal', 'queued', 'paused'];
        if (!body.mode || !validModes.includes(body.mode)) {
            return json({ error: `Invalid mode. Must be one of: ${validModes.join(', ')}` }, 400);
        }
        processManager.approvalManager.operationalMode = body.mode as 'normal' | 'queued' | 'paused';
        return json({ ok: true, mode: body.mode });
    } catch {
        return json({ error: 'Invalid request body' }, 400);
    }
}

async function addCorsAsync(response: Response | Promise<Response>): Promise<Response> {
    const resolved = await response;
    return addCors(resolved);
}

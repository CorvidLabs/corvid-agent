import type { Database } from 'bun:sqlite';
import { handleProjectRoutes, handleBrowseDirs } from './projects';
import { handleAgentRoutes } from './agents';
import { handleSessionRoutes } from './sessions';
import { handleCouncilRoutes } from './councils';
import { handleWorkTaskRoutes } from './work-tasks';
import type { ProcessManager } from '../process/manager';
import type { AlgoChatBridge } from '../algochat/bridge';
import type { AgentWalletService } from '../algochat/agent-wallet';
import type { AgentMessenger } from '../algochat/agent-messenger';
import type { WorkTaskService } from '../work/service';
import { listConversations } from '../db/sessions';

function json(data: unknown, status: number = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

export function handleRequest(
    req: Request,
    db: Database,
    processManager: ProcessManager,
    algochatBridge: AlgoChatBridge | null,
    agentWalletService?: AgentWalletService | null,
    agentMessenger?: AgentMessenger | null,
    workTaskService?: WorkTaskService | null,
    selfTestService?: { run(testType: 'unit' | 'e2e' | 'all'): { sessionId: string } } | null,
): Response | Promise<Response> | null {
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

    const sessionResponse = handleSessionRoutes(req, url, db, processManager);
    if (sessionResponse) return addCorsAsync(sessionResponse);

    const councilResponse = handleCouncilRoutes(req, url, db, processManager, agentMessenger);
    if (councilResponse) return addCorsAsync(councilResponse);

    if (workTaskService) {
        const workTaskResponse = handleWorkTaskRoutes(req, url, workTaskService);
        if (workTaskResponse) return addCorsAsync(workTaskResponse);
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

async function addCorsAsync(response: Response | Promise<Response>): Promise<Response> {
    const resolved = await response;
    return addCors(resolved);
}

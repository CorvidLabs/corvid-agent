import type { Database } from 'bun:sqlite';
import { handleProjectRoutes } from './projects';
import { handleAgentRoutes } from './agents';
import { handleSessionRoutes } from './sessions';
import type { ProcessManager } from '../process/manager';
import type { AlgoChatBridge } from '../algochat/bridge';
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
): Response | Promise<Response> | null {
    const url = new URL(req.url);

    // CORS headers for dev
    if (req.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: corsHeaders(),
        });
    }

    const projectResponse = handleProjectRoutes(req, url, db);
    if (projectResponse) return addCorsAsync(projectResponse);

    const agentResponse = handleAgentRoutes(req, url, db);
    if (agentResponse) return addCorsAsync(agentResponse);

    const sessionResponse = handleSessionRoutes(req, url, db, processManager);
    if (sessionResponse) return addCorsAsync(sessionResponse);

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

    return null;
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

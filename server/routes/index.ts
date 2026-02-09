import type { Database } from 'bun:sqlite';
import { handleProjectRoutes, handleBrowseDirs } from './projects';
import { handleAgentRoutes } from './agents';
import { handleSessionRoutes } from './sessions';
import { handleCouncilRoutes } from './councils';
import { handleWorkTaskRoutes } from './work-tasks';
import { handleMcpApiRoutes } from './mcp-api';
import { handleAllowlistRoutes } from './allowlist';
import { handleAnalyticsRoutes } from './analytics';
import { handleSystemLogRoutes } from './system-logs';
import { handleSettingsRoutes } from './settings';
import { handleScheduleRoutes } from './schedules';
import type { ProcessManager } from '../process/manager';
import type { SchedulerService } from '../scheduler/service';
import type { AlgoChatBridge } from '../algochat/bridge';
import type { AgentWalletService } from '../algochat/agent-wallet';
import type { AgentMessenger } from '../algochat/agent-messenger';
import type { AgentDirectory } from '../algochat/agent-directory';
import type { WorkTaskService } from '../work/service';
import { listConversations } from '../db/sessions';
import { searchAgentMessages } from '../db/agent-messages';
import { searchAlgoChatMessages, getWalletSummaries, getWalletMessages } from '../db/algochat-messages';
import { backupDatabase } from '../db/backup';
import { parseBodyOrThrow, ValidationError, EscalationResolveSchema, OperationalModeSchema, SelfTestSchema, SwitchNetworkSchema } from '../lib/validation';
import { createLogger } from '../lib/logger';
import { checkHttpAuth, loadAuthConfig, type AuthConfig } from '../middleware/auth';
import { RateLimiter, loadRateLimitConfig, checkRateLimit } from '../middleware/rate-limit';

// Load auth config once at module level
let authConfig: AuthConfig | null = null;
function getAuthConfig(): AuthConfig {
    if (!authConfig) authConfig = loadAuthConfig();
    return authConfig;
}

// Load rate limiter once at module level
const rateLimiter = new RateLimiter(loadRateLimitConfig());

const log = createLogger('Router');

function json(data: unknown, status: number = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

/**
 * Global error handler — catches any unhandled error from route handlers
 * and returns a proper JSON 500 response instead of crashing the server.
 */
function errorResponse(err: unknown): Response {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;

    log.error('Unhandled route error', { error: message, stack });

    const response = json({ error: message, timestamp: new Date().toISOString() }, 500);
    addCors(response);
    return response;
}

export type NetworkSwitchFn = (network: 'testnet' | 'mainnet') => Promise<void>;

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
    networkSwitchFn?: NetworkSwitchFn | null,
    schedulerService?: SchedulerService | null,
): Promise<Response | null> {
    const url = new URL(req.url);

    // CORS preflight — allow everything (local sandbox)
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Rate limiting — check before auth or route dispatch
    const rateLimited = checkRateLimit(req, url, rateLimiter);
    if (rateLimited) {
        addCors(rateLimited);
        return rateLimited;
    }

    try {
        const response = await handleRoutes(req, url, db, processManager, algochatBridge, agentWalletService, agentMessenger, workTaskService, selfTestService, agentDirectory, networkSwitchFn, schedulerService);
        if (response) addCors(response);
        return response;
    } catch (err) {
        return errorResponse(err);
    }
}

/** Inner route dispatch — separated so the global try/catch in handleRequest can wrap it. */
async function handleRoutes(
    req: Request,
    url: URL,
    db: Database,
    processManager: ProcessManager,
    algochatBridge: AlgoChatBridge | null,
    agentWalletService?: AgentWalletService | null,
    agentMessenger?: AgentMessenger | null,
    workTaskService?: WorkTaskService | null,
    selfTestService?: { run(testType: 'unit' | 'e2e' | 'all'): { sessionId: string } } | null,
    agentDirectory?: AgentDirectory | null,
    networkSwitchFn?: NetworkSwitchFn | null,
    schedulerService?: SchedulerService | null,
): Promise<Response | null> {

    if (url.pathname === '/api/browse-dirs' && req.method === 'GET') {
        // Auth check — browse-dirs exposes the filesystem, so require authentication
        const authDenied = checkHttpAuth(req, url, getAuthConfig());
        if (authDenied) return authDenied;

        return handleBrowseDirs(req, url, db);
    }

    const projectResponse = handleProjectRoutes(req, url, db);
    if (projectResponse) return projectResponse;

    const agentResponse = handleAgentRoutes(req, url, db, agentWalletService, agentMessenger);
    if (agentResponse) return agentResponse;

    const allowlistResponse = handleAllowlistRoutes(req, url, db);
    if (allowlistResponse) return allowlistResponse;

    const analyticsResponse = handleAnalyticsRoutes(req, url, db);
    if (analyticsResponse) return analyticsResponse;

    const systemLogResponse = handleSystemLogRoutes(req, url, db);
    if (systemLogResponse) return systemLogResponse;

    const settingsResponse = await handleSettingsRoutes(req, url, db);
    if (settingsResponse) return settingsResponse;

    const sessionResponse = await handleSessionRoutes(req, url, db, processManager);
    if (sessionResponse) return sessionResponse;

    const councilResponse = handleCouncilRoutes(req, url, db, processManager, agentMessenger);
    if (councilResponse) return councilResponse;

    if (workTaskService) {
        const workTaskResponse = handleWorkTaskRoutes(req, url, workTaskService);
        if (workTaskResponse) return workTaskResponse;
    }

    // Schedule routes (automation)
    const scheduleResponse = handleScheduleRoutes(req, url, db, schedulerService ?? null);
    if (scheduleResponse) return scheduleResponse;

    // MCP API routes (used by stdio server subprocess)
    const mcpDeps = agentMessenger && agentDirectory && agentWalletService
        ? { db, agentMessenger, agentDirectory, agentWalletService }
        : null;
    const mcpResponse = handleMcpApiRoutes(req, url, mcpDeps);
    if (mcpResponse) return mcpResponse;

    // Resume a paused session (e.g. after API outage)
    const resumeMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/resume$/);
    if (resumeMatch && req.method === 'POST') {
        const sessionId = resumeMatch[1];
        const resumed = processManager.resumeSession(sessionId);
        if (resumed) {
            return json({ ok: true, message: `Session ${sessionId} resumed` });
        }
        return json({ error: `Session ${sessionId} is not paused` }, 400);
    }

    // Escalation queue — list pending requests
    if (url.pathname === '/api/escalation-queue' && req.method === 'GET') {
        const requests = processManager.approvalManager.getQueuedRequests();
        return json({ requests });
    }

    // Escalation queue — resolve a request
    const escalationMatch = url.pathname.match(/^\/api\/escalation-queue\/(\d+)\/resolve$/);
    if (escalationMatch && req.method === 'POST') {
        return handleEscalationResolve(req, processManager, parseInt(escalationMatch[1], 10));
    }

    // Operational mode — get/set
    if (url.pathname === '/api/operational-mode' && req.method === 'GET') {
        return json({ mode: processManager.approvalManager.operationalMode });
    }
    if (url.pathname === '/api/operational-mode' && req.method === 'POST') {
        return handleSetOperationalMode(req, processManager);
    }

    // Feed history — returns recent agent messages AND algochat messages for the AlgoChat Feed
    if (url.pathname === '/api/feed/history' && req.method === 'GET') {
        const limit = Number(url.searchParams.get('limit') ?? '50');
        const offset = Number(url.searchParams.get('offset') ?? '0');
        const search = url.searchParams.get('search') ?? undefined;
        const agentId = url.searchParams.get('agentId') ?? undefined;
        const threadId = url.searchParams.get('threadId') ?? undefined;

        const agentResult = searchAgentMessages(db, { limit, offset, search, agentId, threadId });
        const algochatResult = searchAlgoChatMessages(db, { limit, offset, search });

        return json({
            messages: agentResult.messages,
            algochatMessages: algochatResult.messages,
            total: agentResult.total,
            algochatTotal: algochatResult.total,
            limit,
            offset,
        });
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
        return json(status);
    }

    // Switch AlgoChat network (testnet <-> mainnet)
    if (url.pathname === '/api/algochat/network' && req.method === 'POST') {
        if (!networkSwitchFn) {
            return json({ error: 'Network switching not available' }, 503);
        }
        try {
            const data = await parseBodyOrThrow(req, SwitchNetworkSchema);
            await networkSwitchFn(data.network);
            return json({ ok: true, network: data.network });
        } catch (err) {
            if (err instanceof ValidationError) return json({ error: err.message }, 400);
            const message = err instanceof Error ? err.message : String(err);
            return json({ error: message }, 500);
        }
    }

    if (url.pathname === '/api/algochat/conversations' && req.method === 'POST') {
        return json(listConversations(db));
    }

    // PSK exchange URI for mobile client connections
    if (url.pathname === '/api/algochat/psk-exchange' && req.method === 'GET') {
        if (!algochatBridge) {
            return json({ error: 'AlgoChat not configured' }, 503);
        }
        try {
            const result = algochatBridge.getPSKExchangeURI();
            return json(result);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return json({ error: message }, 500);
        }
    }

    // Generate new PSK for mobile client connections
    if (url.pathname === '/api/algochat/psk-exchange' && req.method === 'POST') {
        if (!algochatBridge) {
            return json({ error: 'AlgoChat not configured' }, 503);
        }
        try {
            const result = algochatBridge.generatePSKExchangeURI();
            return json(result);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return json({ error: message }, 500);
        }
    }

    // Database backup
    if (url.pathname === '/api/backup' && req.method === 'POST') {
        try {
            const result = backupDatabase(db);
            return json(result);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return json({ error: `Backup failed: ${message}` }, 500);
        }
    }

    // Self-test route
    if (url.pathname === '/api/selftest/run' && req.method === 'POST') {
        if (!selfTestService) {
            return json({ error: 'Self-test service not available' }, 503);
        }
        return handleSelfTestRun(req, selfTestService);
    }

    // Wallet viewer — summary of all external wallets
    if (url.pathname === '/api/wallets/summary' && req.method === 'GET') {
        const search = url.searchParams.get('search') ?? undefined;
        const wallets = getWalletSummaries(db, { search });
        return json({ wallets });
    }

    // Wallet viewer — messages for a specific wallet
    const walletMsgMatch = url.pathname.match(/^\/api\/wallets\/([^/]+)\/messages$/);
    if (walletMsgMatch && req.method === 'GET') {
        const address = decodeURIComponent(walletMsgMatch[1]);
        const limit = Number(url.searchParams.get('limit') ?? '50');
        const offset = Number(url.searchParams.get('offset') ?? '0');
        const result = getWalletMessages(db, address, limit, offset);
        return json(result);
    }

    return null;
}

async function handleSelfTestRun(
    req: Request,
    selfTestService: { run(testType: 'unit' | 'e2e' | 'all'): { sessionId: string } },
): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, SelfTestSchema);
        const testType = data?.testType ?? 'all';

        const result = selfTestService.run(testType);
        return json({ sessionId: result.sessionId });
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.message }, 400);
        const message = err instanceof Error ? err.message : String(err);
        return json({ error: message }, 500);
    }
}

// Simple CORS — allow everything. This is a local sandbox; the only external
// boundary is AlgoChat (on-chain identity). If you deploy on a server, restrict
// Access-Control-Allow-Origin to your dashboard's origin.
const CORS_HEADERS: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

function addCors(response: Response): void {
    for (const [key, value] of Object.entries(CORS_HEADERS)) {
        response.headers.set(key, value);
    }
}

async function handleEscalationResolve(
    req: Request,
    processManager: ProcessManager,
    queueId: number,
): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, EscalationResolveSchema);

        const resolved = processManager.approvalManager.resolveQueuedRequest(queueId, data.approved);
        if (resolved) {
            return json({ ok: true, message: `Escalation #${queueId} ${data.approved ? 'approved' : 'denied'}` });
        }
        return json({ error: `Escalation #${queueId} not found or already resolved` }, 404);
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.message }, 400);
        throw err;
    }
}

async function handleSetOperationalMode(
    req: Request,
    processManager: ProcessManager,
): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, OperationalModeSchema);

        processManager.approvalManager.operationalMode = data.mode;
        return json({ ok: true, mode: data.mode });
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.message }, 400);
        throw err;
    }
}

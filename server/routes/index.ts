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
import { handleWebhookRoutes } from './webhooks';
import { handleMentionPollingRoutes } from './mention-polling';
import { handleWorkflowRoutes } from './workflows';
import { handleSandboxRoutes } from './sandbox';
import { handleMarketplaceRoutes } from './marketplace';
import { handleReputationRoutes } from './reputation';
import { handleBillingRoutes } from './billing';
import { handleAuthFlowRoutes } from './auth-flow';
import { handleA2ARoutes } from './a2a';
import { handlePluginRoutes } from './plugins';
import { handlePersonaRoutes } from './personas';
import { handleSkillBundleRoutes } from './skill-bundles';
import { handleMcpServerRoutes } from './mcp-servers';
import { handleExamRoutes } from './exam';
import { handleSlackRoutes } from './slack';
import type { ProcessManager } from '../process/manager';
import type { SchedulerService } from '../scheduler/service';
import type { WebhookService } from '../webhooks/service';
import type { MentionPollingService } from '../polling/service';
import type { WorkflowService } from '../workflow/service';
import type { AlgoChatBridge } from '../algochat/bridge';
import type { AgentWalletService } from '../algochat/agent-wallet';
import type { AgentMessenger } from '../algochat/agent-messenger';
import type { AgentDirectory } from '../algochat/agent-directory';
import type { WorkTaskService } from '../work/service';
import { listConversations } from '../db/sessions';
import { searchAgentMessages } from '../db/agent-messages';
import { searchAlgoChatMessages, getWalletSummaries, getWalletMessages } from '../db/algochat-messages';
import { backupDatabase } from '../db/backup';
import { updateMemoryTxid } from '../db/agent-memories';
import { encryptMemoryContent } from '../lib/crypto';
import { loadAlgoChatConfig } from '../algochat/config';
import { parseBodyOrThrow, ValidationError, EscalationResolveSchema, OperationalModeSchema, SelfTestSchema, SwitchNetworkSchema, PSKContactNicknameSchema } from '../lib/validation';
import { createLogger } from '../lib/logger';
import { json, handleRouteError, safeNumParam } from '../lib/response';
import { buildCorsHeaders, applyCors, loadAuthConfig, type AuthConfig } from '../middleware/auth';
import { RateLimiter, loadRateLimitConfig } from '../middleware/rate-limit';
import {
    authGuard,
    roleGuard,
    rateLimitGuard,
    applyGuards,
    createRequestContext,
    requiresAdminRole,
} from '../middleware/guards';
import type { SandboxManager } from '../sandbox/manager';
import type { MarketplaceService } from '../marketplace/service';
import type { MarketplaceFederation } from '../marketplace/federation';
import type { ReputationScorer } from '../reputation/scorer';
import type { ReputationAttestation } from '../reputation/attestation';
import type { BillingService } from '../billing/service';
import type { UsageMeter } from '../billing/meter';

// Load auth config once at module level
let authConfig: AuthConfig | null = null;
function getAuthConfig(): AuthConfig {
    if (!authConfig) authConfig = loadAuthConfig();
    return authConfig;
}

// Load rate limiter once at module level
const rateLimiter = new RateLimiter(loadRateLimitConfig());

const log = createLogger('Router');

/**
 * Global error handler — catches any unhandled error from route handlers
 * and returns a proper JSON 500 response instead of crashing the server.
 */
function errorResponse(err: unknown): Response {
    // Log full error details server-side — never expose to client
    if (err instanceof Error) {
        log.error('Unhandled route error', { error: err.message, stack: err.stack });
    } else {
        log.error('Unhandled route error', { error: String(err) });
    }
    // Return a generic 500 — serverError() never includes error details in response
    return json({ error: 'Internal server error', timestamp: new Date().toISOString() }, 500);
}

export type NetworkSwitchFn = (network: 'testnet' | 'mainnet') => Promise<void>;

export interface RouteServices {
    db: Database;
    processManager: ProcessManager;
    algochatBridge: AlgoChatBridge | null;
    agentWalletService?: AgentWalletService | null;
    agentMessenger?: AgentMessenger | null;
    workTaskService?: WorkTaskService | null;
    selfTestService?: { run(testType: 'unit' | 'e2e' | 'all'): { sessionId: string } } | null;
    agentDirectory?: AgentDirectory | null;
    networkSwitchFn?: NetworkSwitchFn | null;
    schedulerService?: SchedulerService | null;
    webhookService?: WebhookService | null;
    mentionPollingService?: MentionPollingService | null;
    workflowService?: WorkflowService | null;
    sandboxManager?: SandboxManager | null;
    marketplace?: MarketplaceService | null;
    marketplaceFederation?: MarketplaceFederation | null;
    reputationScorer?: ReputationScorer | null;
    reputationAttestation?: ReputationAttestation | null;
    billing?: BillingService | null;
    usageMeter?: UsageMeter | null;
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
    networkSwitchFn?: NetworkSwitchFn | null,
    schedulerService?: SchedulerService | null,
    webhookService?: WebhookService | null,
    mentionPollingService?: MentionPollingService | null,
    workflowService?: WorkflowService | null,
    sandboxManager?: SandboxManager | null,
    marketplace?: MarketplaceService | null,
    marketplaceFederation?: MarketplaceFederation | null,
    reputationScorer?: ReputationScorer | null,
    reputationAttestation?: ReputationAttestation | null,
    billing?: BillingService | null,
    usageMeter?: UsageMeter | null,
): Promise<Response | null> {
    const url = new URL(req.url);
    const config = getAuthConfig();

    // CORS preflight — use configured CORS headers
    if (req.method === 'OPTIONS') {
        const corsHeaders = buildCorsHeaders(req, config);
        corsHeaders['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Slack webhook — validated by signing secret, no API key auth
    if (url.pathname === '/slack/events' && req.method === 'POST') {
        const slackResponse = handleSlackRoutes(req, url, db, processManager);
        if (slackResponse) {
            const resolved = slackResponse instanceof Promise ? await slackResponse : slackResponse;
            applyCors(resolved, req, config);
            return resolved;
        }
    }

    // Build request context and apply declarative guard chain
    const context = createRequestContext(url.searchParams.get('wallet') || undefined);

    // Guard chain: rate limit → auth → (optional role guard for admin paths)
    const guards = [
        rateLimitGuard(rateLimiter),
        authGuard(config),
    ];

    // Apply admin role guard for sensitive endpoints
    if (requiresAdminRole(url.pathname)) {
        guards.push(roleGuard('admin'));
    }

    const denied = applyGuards(req, url, context, ...guards);
    if (denied) {
        applyCors(denied, req, config);
        return denied;
    }

    try {
        const response = await handleRoutes(req, url, db, processManager, algochatBridge, agentWalletService, agentMessenger, workTaskService, selfTestService, agentDirectory, networkSwitchFn, schedulerService, webhookService, mentionPollingService, workflowService, sandboxManager, marketplace, marketplaceFederation, reputationScorer, reputationAttestation, billing, usageMeter);
        if (response) applyCors(response, req, config);
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
    webhookService?: WebhookService | null,
    mentionPollingService?: MentionPollingService | null,
    workflowService?: WorkflowService | null,
    sandboxManager?: SandboxManager | null,
    marketplace?: MarketplaceService | null,
    marketplaceFederation?: MarketplaceFederation | null,
    reputationScorer?: ReputationScorer | null,
    reputationAttestation?: ReputationAttestation | null,
    billing?: BillingService | null,
    usageMeter?: UsageMeter | null,
): Promise<Response | null> {

    if (url.pathname === '/api/browse-dirs' && req.method === 'GET') {
        return handleBrowseDirs(req, url, db);
    }

    const projectResponse = handleProjectRoutes(req, url, db);
    if (projectResponse) return projectResponse;

    const agentResponse = handleAgentRoutes(req, url, db, agentWalletService, agentMessenger);
    if (agentResponse) return agentResponse;

    // Persona routes (agent identity/personality)
    const personaResponse = handlePersonaRoutes(req, url, db);
    if (personaResponse) return personaResponse;

    // Skill bundle routes (composable tool + prompt packages)
    const skillBundleResponse = handleSkillBundleRoutes(req, url, db);
    if (skillBundleResponse) return skillBundleResponse;

    // External MCP server config routes
    const mcpServerResponse = handleMcpServerRoutes(req, url, db);
    if (mcpServerResponse) return mcpServerResponse;

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

    // Webhook routes (GitHub event-driven automation)
    const webhookResponse = handleWebhookRoutes(req, url, db, webhookService ?? null);
    if (webhookResponse) return webhookResponse;

    // Mention polling routes (local-first GitHub @mention detection)
    const pollingResponse = handleMentionPollingRoutes(req, url, db, mentionPollingService ?? null);
    if (pollingResponse) return pollingResponse;

    // Workflow routes (graph-based orchestration)
    const workflowResponse = handleWorkflowRoutes(req, url, db, workflowService ?? null);
    if (workflowResponse) return workflowResponse;

    // Sandbox routes (container management)
    const sandboxResponse = handleSandboxRoutes(req, url, db, sandboxManager);
    if (sandboxResponse) return sandboxResponse;

    // Marketplace routes
    const marketplaceResponse = handleMarketplaceRoutes(req, url, db, marketplace, marketplaceFederation);
    if (marketplaceResponse) return marketplaceResponse;

    // Reputation routes
    const reputationResponse = handleReputationRoutes(req, url, db, reputationScorer, reputationAttestation);
    if (reputationResponse) return reputationResponse;

    // Billing routes
    const billingResponse = await handleBillingRoutes(req, url, db, billing, usageMeter);
    if (billingResponse) return billingResponse;

    // Auth flow routes (device authorization for CLI login)
    const authFlowResponse = handleAuthFlowRoutes(req, url, db);
    if (authFlowResponse) return authFlowResponse;

    // Plugin routes (registry not yet instantiated — returns 503 until enabled)
    const pluginResponse = handlePluginRoutes(req, url, db, null);
    if (pluginResponse) return pluginResponse;

    // A2A inbound task routes
    const a2aResponse = await handleA2ARoutes(req, url, db, processManager);
    if (a2aResponse) return a2aResponse;

    // MCP API routes (used by stdio server subprocess)
    const mcpDeps = agentMessenger && agentDirectory && agentWalletService
        ? (() => {
            const algoChatCfg = loadAlgoChatConfig();
            return { db, agentMessenger, agentDirectory, agentWalletService, serverMnemonic: algoChatCfg.mnemonic, network: algoChatCfg.network };
          })()
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
        const limit = safeNumParam(url.searchParams.get('limit'), 50);
        const offset = safeNumParam(url.searchParams.get('offset'), 0);
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
        const status = algochatBridge
            ? await algochatBridge.getStatus()
            : { enabled: false, address: null, network: 'testnet' as const, syncInterval: 30000, activeConversations: 0, balance: 0 };
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
            return handleRouteError(err);
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
            return handleRouteError(err);
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
            return handleRouteError(err);
        }
    }

    // PSK contacts — list all for current network
    if (url.pathname === '/api/algochat/psk-contacts' && req.method === 'GET') {
        if (!algochatBridge) {
            return json({ error: 'AlgoChat not configured' }, 503);
        }
        return json({ contacts: algochatBridge.listPSKContacts() });
    }

    // PSK contacts — create new contact
    if (url.pathname === '/api/algochat/psk-contacts' && req.method === 'POST') {
        if (!algochatBridge) {
            return json({ error: 'AlgoChat not configured' }, 503);
        }
        try {
            const data = await parseBodyOrThrow(req, PSKContactNicknameSchema);
            const result = algochatBridge.createPSKContact(data.nickname);
            return json(result);
        } catch (err) {
            if (err instanceof ValidationError) return json({ error: err.detail }, 400);
            return handleRouteError(err);
        }
    }

    // PSK contacts — rename
    const pskContactPatchMatch = url.pathname.match(/^\/api\/algochat\/psk-contacts\/([^/]+)$/);
    if (pskContactPatchMatch && req.method === 'PATCH') {
        if (!algochatBridge) {
            return json({ error: 'AlgoChat not configured' }, 503);
        }
        try {
            const id = decodeURIComponent(pskContactPatchMatch[1]);
            const data = await parseBodyOrThrow(req, PSKContactNicknameSchema);
            const ok = algochatBridge.renamePSKContact(id, data.nickname);
            if (!ok) return json({ error: 'Contact not found' }, 404);
            return json({ ok: true });
        } catch (err) {
            if (err instanceof ValidationError) return json({ error: err.detail }, 400);
            return handleRouteError(err);
        }
    }

    // PSK contacts — cancel (soft-delete)
    const pskContactDeleteMatch = url.pathname.match(/^\/api\/algochat\/psk-contacts\/([^/]+)$/);
    if (pskContactDeleteMatch && req.method === 'DELETE') {
        if (!algochatBridge) {
            return json({ error: 'AlgoChat not configured' }, 503);
        }
        try {
            const id = decodeURIComponent(pskContactDeleteMatch[1]);
            const ok = algochatBridge.cancelPSKContact(id);
            if (!ok) return json({ error: 'Contact not found' }, 404);
            return json({ ok: true });
        } catch (err) {
            return handleRouteError(err);
        }
    }

    // PSK contacts — get QR URI
    const pskContactQrMatch = url.pathname.match(/^\/api\/algochat\/psk-contacts\/([^/]+)\/qr$/);
    if (pskContactQrMatch && req.method === 'GET') {
        if (!algochatBridge) {
            return json({ error: 'AlgoChat not configured' }, 503);
        }
        const id = decodeURIComponent(pskContactQrMatch[1]);
        const uri = algochatBridge.getPSKContactURI(id);
        if (!uri) return json({ error: 'Contact not found' }, 404);
        return json({ uri });
    }

    // Database backup
    if (url.pathname === '/api/backup' && req.method === 'POST') {
        try {
            const result = backupDatabase(db);
            return json(result);
        } catch (err) {
            log.error('Backup failed', { error: err instanceof Error ? err.message : String(err) });
            return json({ error: 'Backup failed' }, 500);
        }
    }

    // Memory backfill — re-send memories with NULL txids on-chain
    if (url.pathname === '/api/memories/backfill' && req.method === 'POST') {
        return handleMemoryBackfill(db, agentMessenger ?? null);
    }

    // Model exam routes
    const examResponse = await handleExamRoutes(req, url, db, processManager);
    if (examResponse) return examResponse;

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
        const limit = safeNumParam(url.searchParams.get('limit'), 50);
        const offset = safeNumParam(url.searchParams.get('offset'), 0);
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
        return handleRouteError(err);
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
        if (err instanceof ValidationError) return json({ error: err.detail }, 400);
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
        if (err instanceof ValidationError) return json({ error: err.detail }, 400);
        throw err;
    }
}

interface NullTxidRow {
    id: string;
    agent_id: string;
    key: string;
    content: string;
}

async function handleMemoryBackfill(
    db: Database,
    agentMessenger: AgentMessenger | null,
): Promise<Response> {
    if (!agentMessenger) {
        return json({ error: 'Agent messenger not available' }, 503);
    }

    const rows = db.query(
        "SELECT id, agent_id, key, content FROM agent_memories WHERE status IN ('pending', 'failed') ORDER BY created_at ASC",
    ).all() as NullTxidRow[];

    if (rows.length === 0) {
        return json({ ok: true, backfilled: 0, message: 'No pending or failed memories' });
    }

    const config = loadAlgoChatConfig();
    const results: Array<{ id: string; key: string; agentId: string; txid: string | null; error?: string }> = [];

    for (const row of rows) {
        try {
            const encrypted = await encryptMemoryContent(row.content, config.mnemonic, config.network);
            const txid = await agentMessenger.sendOnChainToSelf(
                row.agent_id,
                `[MEMORY:${row.key}] ${encrypted}`,
            );
            if (txid) {
                updateMemoryTxid(db, row.id, txid);
            }
            results.push({ id: row.id, key: row.key, agentId: row.agent_id, txid });
        } catch (err) {
            results.push({
                id: row.id,
                key: row.key,
                agentId: row.agent_id,
                txid: null,
                error: 'Failed to publish memory',
            });
        }
    }

    const succeeded = results.filter(r => r.txid !== null).length;
    log.info('Memory backfill complete', { total: rows.length, succeeded });

    return json({ ok: true, backfilled: succeeded, total: rows.length, results });
}

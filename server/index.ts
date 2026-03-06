import { getDb, initDb } from './db/connection';
import { handleRequest, initRateLimiterDb } from './routes/index';
import { createWebSocketHandler, broadcastAlgoChatMessage, tenantTopic } from './ws/handler';
import { onCouncilStageChange, onCouncilLog, onCouncilDiscussionMessage } from './routes/councils';
import { initAlgoChatService } from './algochat/service';
import { AlgoChatBridge } from './algochat/bridge';
import { AgentWalletService } from './algochat/agent-wallet';
import { AgentDirectory } from './algochat/agent-directory';
import { AgentMessenger } from './algochat/agent-messenger';
import { OnChainTransactor } from './algochat/on-chain-transactor';
import { WorkCommandRouter } from './algochat/work-command-router';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createLogger } from './lib/logger';
import { checkWsAuth, loadAuthConfig, validateStartupSecurity, timingSafeEqual } from './middleware/auth';
import { applySecurityHeaders } from './lib/security-headers';
import { handleOllamaRoutes } from './routes/ollama';
import { handleOpenApiRoutes } from './openapi/index';
import {
    renderMetrics,
    httpRequestsTotal,
    httpRequestDuration,
    activeSessions as activeSessionsGauge,
    parseTraceparent,
    generateTraceId,
    generateSpanId,
    buildTraceparent,
} from './observability/index';
import { runWithTraceId } from './observability/trace-context';
import { handleAuditRoutes } from './routes/audit';
import { buildAgentCard } from './a2a/agent-card';
import { extractTenantId } from './tenant/middleware';
import { DEFAULT_TENANT_ID } from './tenant/types';
import { getHealthCheck, getLivenessCheck, getReadinessCheck, type HealthCheckDeps } from './health/service';
import { listHealthSnapshots, getUptimeStats } from './db/health-snapshots';
import { bootstrapServices } from './bootstrap';

const log = createLogger('Server');

// Load auth configuration for WebSocket authentication
const authConfig = loadAuthConfig();
validateStartupSecurity(authConfig);

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const BIND_HOST = process.env.BIND_HOST || '127.0.0.1';
const CLIENT_DIST = join(import.meta.dir, '..', 'client', 'dist', 'client', 'browser');
const startTime = Date.now();

// Initialize database (legacy migrations run synchronously via getDb)
const db = getDb();

// Run file-based migrations (v53+) — non-blocking, logs on completion
initDb().then(() => {
    // Attach db to rate limiter for persistent state after migrations are applied
    initRateLimiterDb(db);
}).catch((err) => {
    log.error('File-based migration failed', { error: err instanceof Error ? err.message : String(err) });
});

// Bootstrap all application services (see server/bootstrap.ts)
const {
    shutdownCoordinator,
    providerRegistry,
    processManager,
    sessionLifecycle,
    algochatConfig,
    algochatState,
    memorySyncService,
    selfTestService,
    workTaskService,
    schedulerService,
    webhookService,
    mentionPollingService,
    workflowService,
    notificationService,
    questionDispatcher,
    responsePollingService,
    sandboxManager,
    marketplaceService,
    marketplaceFederation,
    reputationScorer,
    reputationAttestation,
    billingService,
    usageMeter,
    tenantService,
    multiTenant,
    performanceCollector,
    outcomeTrackerService,
    slackBridge,
    healthMonitorService,
    reputationVerifier,
    astParserService,
} = await bootstrapServices(db, startTime);

async function switchNetwork(network: 'testnet' | 'mainnet'): Promise<void> {
    log.info(`Switching AlgoChat network to ${network}`);

    // Stop existing services
    if (algochatState.bridge) {
        algochatState.bridge.stop();
        algochatState.bridge = null;
    }
    algochatState.walletService = null;
    algochatState.messenger = null;
    algochatState.directory = null;

    // Update the config
    (algochatConfig as { network: string }).network = network;

    // Reinitialize
    await initAlgoChat();
    log.info(`Network switched to ${network}`);
}

async function initAlgoChat(): Promise<void> {
    if (!algochatConfig.enabled) {
        log.info('AlgoChat disabled');
        return;
    }

    const service = await initAlgoChatService(algochatConfig);
    if (!service) return;

    // If agent network differs from main network, create a separate service for agents
    let agentService = service;
    if (algochatConfig.agentNetwork !== algochatConfig.network) {
        const agentConfig = { ...algochatConfig, network: algochatConfig.agentNetwork };
        const localService = await initAlgoChatService(agentConfig);
        if (localService) {
            agentService = localService;
            log.info(`Agent network: ${algochatConfig.agentNetwork} (separate from ${algochatConfig.network})`);
        } else {
            log.warn(`Failed to init agent network (${algochatConfig.agentNetwork}), falling back to ${algochatConfig.network}`);
        }
    }

    // Use the agent-network config for wallet and messenger operations
    const agentNetworkConfig = algochatConfig.agentNetwork !== algochatConfig.network
        ? { ...algochatConfig, network: algochatConfig.agentNetwork }
        : algochatConfig;

    algochatState.bridge = new AlgoChatBridge(db, processManager, algochatConfig, service);

    // Initialize agent wallet service on the agent network (localnet for funding/keys)
    algochatState.walletService = new AgentWalletService(db, agentNetworkConfig, agentService);

    // Only let the bridge use agent wallets if both networks match;
    // otherwise the bridge (testnet) would try to send from wallets
    // that only have funds on localnet.
    if (algochatConfig.agentNetwork === algochatConfig.network) {
        algochatState.bridge.setAgentWalletService(algochatState.walletService);
    }

    // Initialize agent directory and messenger on the agent network
    algochatState.directory = new AgentDirectory(db, algochatState.walletService);
    algochatState.bridge.setAgentDirectory(algochatState.directory);
    algochatState.bridge.setApprovalManager(processManager.approvalManager);
    algochatState.bridge.setOwnerQuestionManager(processManager.ownerQuestionManager);
    algochatState.bridge.setWorkTaskService(workTaskService);

    // Create OnChainTransactor — handles all Algorand transaction operations
    const onChainTransactor = new OnChainTransactor(db, agentService, algochatState.walletService, algochatState.directory);
    algochatState.bridge.setOnChainTransactor(onChainTransactor);

    algochatState.messenger = new AgentMessenger(db, agentNetworkConfig, onChainTransactor, processManager);
    const workCommandRouter = new WorkCommandRouter(db);
    workCommandRouter.setWorkTaskService(workTaskService);
    algochatState.messenger.setWorkCommandRouter(workCommandRouter);
    algochatState.bridge.setAgentMessenger(algochatState.messenger);

    // Register MCP services so agent sessions get corvid_* tools
    processManager.setMcpServices(algochatState.messenger, algochatState.directory, algochatState.walletService, {
        serverMnemonic: algochatConfig.mnemonic,
        network: agentNetworkConfig.network,
    }, workTaskService, schedulerService, workflowService, notificationService, questionDispatcher,
    reputationScorer, reputationAttestation, reputationVerifier, astParserService);

    // Forward AlgoChat events to WebSocket clients
    algochatState.bridge.onEvent((participant, content, direction) => {
        broadcastAlgoChatMessage(server, participant, content, direction);
    });

    // Publish encryption keys for all existing agent wallets
    await algochatState.walletService.publishAllKeys();

    algochatState.bridge.start();
    shutdownCoordinator.register({ name: 'AlgoChatBridge', priority: 25, handler: () => algochatState.bridge?.stop() });
}

// WebSocket handler — bridge reference is resolved lazily since init is async
const wsHandler = createWebSocketHandler(processManager, () => algochatState.bridge, authConfig, () => algochatState.messenger, () => workTaskService, () => schedulerService, () => processManager.ownerQuestionManager);

interface WsData {
    subscriptions: Map<string, unknown>;
    walletAddress?: string;
    authenticated: boolean;
    tenantId?: string;
}

/**
 * Check admin authentication for sensitive internal endpoints (/metrics, /api/audit-log).
 * When ADMIN_API_KEY env var is set, requires a matching Bearer token.
 * When no key is configured (dev mode), access is allowed without auth.
 */
function checkAdminAuth(req: Request): boolean {
    const adminKey = process.env.ADMIN_API_KEY;
    if (!adminKey) return true; // No key configured — dev mode, allow unauthenticated
    const authHeader = req.headers.get('authorization');
    if (!authHeader) return false;
    const token = authHeader.replace(/^Bearer\s+/i, '');
    return timingSafeEqual(token, adminKey);
}

// Start server
const server = Bun.serve<WsData>({
    port: PORT,
    hostname: BIND_HOST,

    async fetch(rawReq, server) {
        // Inject socket-level IP so getClientIp() can detect loopback connections
        // (Bun doesn't set X-Forwarded-For for direct connections)
        const socketAddr = server.requestIP(rawReq);
        let req = rawReq;
        if (socketAddr && !rawReq.headers.has('x-forwarded-for') && !rawReq.headers.has('x-real-ip')) {
            const headers = new Headers(rawReq.headers);
            headers.set('x-real-ip', socketAddr.address);
            req = new Request(rawReq.url, { method: rawReq.method, headers, body: rawReq.body } as RequestInit);
        }
        const url = new URL(req.url);
        const requestStart = performance.now();

        // Extract or generate trace ID from W3C traceparent header
        const traceparentHeader = req.headers.get('traceparent');
        const parsed = parseTraceparent(traceparentHeader);
        const traceId = parsed?.traceId ?? generateTraceId();
        const spanId = generateSpanId();

        // Helper to add trace headers and record metrics on response.
        // Returns a new Response to avoid mutating the original's headers.
        function instrumentResponse(response: Response, route: string): Response {
            const durationSec = (performance.now() - requestStart) / 1000;
            const statusCode = String(response.status);

            httpRequestsTotal.inc({ method: req.method, route, status_code: statusCode });
            httpRequestDuration.observe({ method: req.method, route, status_code: statusCode }, durationSec);

            // Construct a new Response with the traceparent header instead of mutating the original
            const headers = new Headers(response.headers);
            headers.set('traceparent', buildTraceparent(traceId, spanId));
            applySecurityHeaders(headers, BIND_HOST === '127.0.0.1');
            return new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers,
            });
        }

        // Prometheus metrics endpoint (requires admin auth when ADMIN_API_KEY is set)
        if (url.pathname === '/metrics' && req.method === 'GET') {
            if (!checkAdminAuth(req)) {
                return new Response(JSON.stringify({ error: 'Authentication required' }), {
                    status: 401,
                    headers: { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Bearer' },
                });
            }
            // Update active sessions gauge before rendering
            activeSessionsGauge.set(processManager.getActiveSessionIds().length);
            return instrumentResponse(
                new Response(renderMetrics(), {
                    headers: { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' },
                }),
                '/metrics',
            );
        }

        // Audit log endpoint (requires admin auth when ADMIN_API_KEY is set)
        if (url.pathname === '/api/audit-log' && req.method === 'GET') {
            if (!checkAdminAuth(req)) {
                return new Response(JSON.stringify({ error: 'Authentication required' }), {
                    status: 401,
                    headers: { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Bearer' },
                });
            }
            const auditResponse = handleAuditRoutes(req, url, db);
            if (auditResponse) return instrumentResponse(auditResponse, '/api/audit-log');
        }

        // WebSocket upgrade
        if (url.pathname === '/ws') {
            // Check upgrade-level auth (header or query param)
            const preAuthenticated = checkWsAuth(req, url, authConfig);

            // If API_KEY is set and auth failed, reject the upgrade with 401
            if (authConfig.apiKey && !preAuthenticated) {
                return new Response(JSON.stringify({ error: 'Authentication required' }), {
                    status: 401,
                    headers: { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Bearer' },
                });
            }

            // Extract wallet address if provided (from chat client)
            const walletAddress = url.searchParams.get('wallet') || undefined;
            if (walletAddress) {
                log.info('WebSocket connection with wallet identity', { wallet: walletAddress.slice(0, 8) + '...' });
            }

            // Resolve tenant for WS connection scoping
            let wsTenantId: string | undefined;
            if (multiTenant) {
                const tenantResult = extractTenantId(req, db, tenantService);
                if (tenantResult instanceof Response) {
                    return tenantResult; // 403 mismatch
                }
                wsTenantId = tenantResult.tenantId !== DEFAULT_TENANT_ID ? tenantResult.tenantId : undefined;
            }

            const upgraded = server.upgrade(rawReq, {
                data: { subscriptions: new Map(), walletAddress, authenticated: preAuthenticated, tenantId: wsTenantId },
            });
            if (upgraded) return undefined as unknown as Response;
            return new Response('WebSocket upgrade failed', { status: 400 });
        }

        // Run request handler within trace context so all logs include trace ID
        return runWithTraceId(traceId, async () => {
            // Health check endpoints (no auth required)
            if (req.method === 'GET' && (url.pathname === '/api/health' || url.pathname.startsWith('/api/health/') || url.pathname.startsWith('/health'))) {
                const healthDeps: HealthCheckDeps = {
                    db,
                    startTime,
                    version: (require('../package.json') as { version: string }).version,
                    getActiveSessions: () => processManager.getActiveSessionIds(),
                    isAlgoChatConnected: () => algochatState.bridge !== null,
                    isShuttingDown: () => shutdownCoordinator.getStatus().phase !== 'idle',
                    getSchedulerStats: () => schedulerService.getStats(),
                    getMentionPollingStats: () => mentionPollingService.getStats(),
                    getWorkflowStats: () => workflowService.getStats(),
                };

                // Liveness probe: /health/live
                if (url.pathname === '/health/live') {
                    return instrumentResponse(
                        new Response(JSON.stringify(getLivenessCheck()), {
                            headers: { 'Content-Type': 'application/json' },
                        }),
                        '/health/live',
                    );
                }

                // Readiness probe: /health/ready
                if (url.pathname === '/health/ready') {
                    const readiness = getReadinessCheck(healthDeps);
                    const httpStatus = readiness.status === 'ready' ? 200 : 503;
                    return instrumentResponse(
                        new Response(JSON.stringify(readiness), {
                            status: httpStatus,
                            headers: { 'Content-Type': 'application/json' },
                        }),
                        '/health/ready',
                    );
                }

                // Health history: /api/health/history
                if (url.pathname === '/api/health/history') {
                    const hours = Math.min(Math.max(Number(url.searchParams.get('hours') ?? '24'), 1), 720);
                    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
                    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? '100'), 1), 1000);
                    const snapshots = listHealthSnapshots(db, { limit, since });
                    const uptime = getUptimeStats(db, since);
                    return instrumentResponse(
                        new Response(JSON.stringify({ uptime, snapshots }), {
                            headers: { 'Content-Type': 'application/json' },
                        }),
                        '/api/health/history',
                    );
                }

                // Full health check: /health or /api/health
                if (url.pathname === '/health' || url.pathname === '/api/health') {
                    const health = await getHealthCheck(healthDeps);
                    const httpStatus = health.status === 'unhealthy' ? 503 : 200;
                    return instrumentResponse(
                        new Response(JSON.stringify(health), {
                            status: httpStatus,
                            headers: { 'Content-Type': 'application/json' },
                        }),
                        '/api/health',
                    );
                }
            }

            // A2A Protocol: Agent Card (public, no auth required)
            if (url.pathname === '/.well-known/agent-card.json' && req.method === 'GET') {
                const baseUrl = `${url.protocol}//${url.host}`;
                const card = buildAgentCard(baseUrl);
                return instrumentResponse(
                    new Response(JSON.stringify(card, null, 2), {
                        headers: {
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*',
                            'Cache-Control': 'public, max-age=300', // 5 min cache
                        },
                    }),
                    '/.well-known/agent-card.json',
                );
            }

            // LLM providers endpoint
            if (url.pathname === '/api/providers' && req.method === 'GET') {
                const providers = providerRegistry.getAll().map((p) => p.getInfo());
                return instrumentResponse(
                    new Response(JSON.stringify(providers), {
                        headers: { 'Content-Type': 'application/json' },
                    }),
                    '/api/providers',
                );
            }

            // Provider models endpoint — dynamic model listing (e.g. Ollama local models)
            const modelsMatch = url.pathname.match(/^\/api\/providers\/([^/]+)\/models$/);
            if (modelsMatch && req.method === 'GET') {
                const providerType = modelsMatch[1];
                const provider = providerRegistry.get(providerType as import('./providers/types').LlmProviderType);
                if (!provider) {
                    return instrumentResponse(
                        new Response(JSON.stringify({ error: `Unknown provider: ${providerType}` }), {
                            status: 404,
                            headers: { 'Content-Type': 'application/json' },
                        }),
                        '/api/providers/models',
                    );
                }
                // Refresh models if provider supports it (e.g. Ollama)
                if ('refreshModels' in provider && typeof (provider as { refreshModels: () => Promise<string[]> }).refreshModels === 'function') {
                    await (provider as { refreshModels: () => Promise<string[]> }).refreshModels();
                }
                const info = provider.getInfo();
                return instrumentResponse(
                    new Response(JSON.stringify({ models: info.models, defaultModel: info.defaultModel }), {
                        headers: { 'Content-Type': 'application/json' },
                    }),
                    '/api/providers/models',
                );
            }

            // Slack Events API webhook endpoint (no auth guard — Slack verifies via signing secret)
            if (url.pathname === '/api/slack/events' && req.method === 'POST') {
                if (!slackBridge) {
                    return instrumentResponse(
                        new Response(JSON.stringify({ error: 'Slack bridge not configured' }), {
                            status: 503,
                            headers: { 'Content-Type': 'application/json' },
                        }),
                        '/api/slack/events',
                    );
                }
                const slackResponse = await slackBridge.handleEventRequest(req);
                return instrumentResponse(slackResponse, '/api/slack/events');
            }

            // OpenAPI spec & Swagger UI (public, no auth required)
            const openApiResponse = handleOpenApiRoutes(req, url);
            if (openApiResponse) return instrumentResponse(openApiResponse, url.pathname);

            // Ollama model management routes
            const ollamaResponse = await handleOllamaRoutes(req, url, (status) => {
                const msg = JSON.stringify({ type: 'ollama_pull_progress', ...status });
                publishToTenant('ollama', msg); // Ollama is system-wide, no tenant scoping
            });
            if (ollamaResponse) return instrumentResponse(ollamaResponse, '/api/ollama');

            // API routes
            const apiResponse = await handleRequest(req, db, processManager, algochatState.bridge, algochatState.walletService, algochatState.messenger, workTaskService, selfTestService, algochatState.directory, switchNetwork, schedulerService, webhookService, mentionPollingService, workflowService, sandboxManager, marketplaceService, marketplaceFederation, reputationScorer, reputationAttestation, billingService, usageMeter, tenantService, performanceCollector, outcomeTrackerService);
            if (apiResponse) {
                // Normalize route for metrics (strip IDs for cardinality control)
                const route = url.pathname.replace(/\/[0-9a-f-]{8,}/gi, '/:id');
                return instrumentResponse(apiResponse, route);
            }

            // Mobile chat client
            if (url.pathname === '/chat') {
                const chatPath = join(import.meta.dir, 'public', 'chat.html');
                if (existsSync(chatPath)) {
                    return instrumentResponse(
                        new Response(Bun.file(chatPath), {
                            headers: { 'Content-Type': 'text/html' },
                        }),
                        '/chat',
                    );
                }
            }

            // Serve Angular static files
            if (existsSync(CLIENT_DIST)) {
                const filePath = join(CLIENT_DIST, url.pathname);

                // Check if path exists as a file
                if (existsSync(filePath) && !filePath.endsWith('/')) {
                    const headers: Record<string, string> = {};
                    const basename = url.pathname.split('/').pop() ?? '';
                    // Angular outputHashing:"all" produces files like main.abc1234f.js
                    if (/\.[a-f0-9]{8,}\.\w+$/.test(basename)) {
                        headers['Cache-Control'] = 'public, max-age=31536000, immutable';
                    } else if (basename === 'index.html') {
                        headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
                    } else {
                        headers['Cache-Control'] = 'public, max-age=3600';
                    }
                    return instrumentResponse(new Response(Bun.file(filePath), { headers }), '/static');
                }

                // SPA fallback - serve index.html for unmatched routes
                const indexPath = join(CLIENT_DIST, 'index.html');
                if (existsSync(indexPath)) {
                    return instrumentResponse(
                        new Response(Bun.file(indexPath), {
                            headers: {
                                'Content-Type': 'text/html',
                                'Cache-Control': 'no-cache, no-store, must-revalidate',
                            },
                        }),
                        '/static',
                    );
                }
            }

            return instrumentResponse(new Response('Not Found', { status: 404 }), '/not-found');
        });
    },

    websocket: wsHandler,
});

/**
 * Resolve the tenant for an agent (used by event broadcasts).
 * Returns undefined in single-tenant mode (flat topics).
 */
function resolveAgentTenantForBroadcast(agentId: string): string | undefined {
    if (!multiTenant) return undefined;
    const row = db.query('SELECT tenant_id FROM agents WHERE id = ?').get(agentId) as { tenant_id: string } | null;
    const tid = row?.tenant_id;
    return tid && tid !== DEFAULT_TENANT_ID ? tid : undefined;
}

/**
 * Resolve the tenant for a council launch (used by council event broadcasts).
 * Looks up any agent in the council's sessions.
 */
function resolveCouncilTenantForBroadcast(launchId: string): string | undefined {
    if (!multiTenant) return undefined;
    const row = db.query(
        `SELECT a.tenant_id FROM sessions s
         JOIN agents a ON s.agent_id = a.id
         WHERE s.council_launch_id = ? LIMIT 1`,
    ).get(launchId) as { tenant_id: string } | null;
    const tid = row?.tenant_id;
    return tid && tid !== DEFAULT_TENANT_ID ? tid : undefined;
}

/**
 * Publish a message to a tenant-scoped topic.
 * In single-tenant mode, publishes to the flat topic.
 */
function publishToTenant(baseTopic: string, data: string, tid?: string): void {
    server.publish(tenantTopic(baseTopic, tid), data);
}

// Wire broadcast function so MCP tools can publish to WS clients
processManager.setBroadcast((topic, data) => server.publish(topic, data));

// Wire notification service broadcast (publishes to 'owner' topic)
notificationService.setBroadcast((msg) => server.publish(tenantTopic('owner'), JSON.stringify(msg)));

// Broadcast council events to tenant-scoped WS topics
onCouncilStageChange((launchId, stage, sessionIds) => {
    const msg = JSON.stringify({ type: 'council_stage_change', launchId, stage, sessionIds });
    publishToTenant('council', msg, resolveCouncilTenantForBroadcast(launchId));
});

onCouncilLog((logEntry) => {
    const msg = JSON.stringify({ type: 'council_log', log: logEntry });
    publishToTenant('council', msg, resolveCouncilTenantForBroadcast(logEntry.launchId));
});

onCouncilDiscussionMessage((message) => {
    const msg = JSON.stringify({ type: 'council_discussion_message', message });
    publishToTenant('council', msg, resolveAgentTenantForBroadcast(message.agentId));
});

// Broadcast schedule events to tenant-scoped WS topics
schedulerService.onEvent((event) => {
    const msg = JSON.stringify({ type: event.type, ...spreadScheduleEvent(event) });
    // Resolve tenant from schedule/execution agentId if available
    const eventData = event.data as Record<string, unknown> | undefined;
    const agentId = (eventData as { agentId?: string } | undefined)?.agentId;
    publishToTenant('council', msg, agentId ? resolveAgentTenantForBroadcast(agentId) : undefined);
});

function spreadScheduleEvent(event: { type: string; data: unknown }): Record<string, unknown> {
    switch (event.type) {
        case 'schedule_update':
            return { schedule: event.data };
        case 'schedule_execution_update':
            return { execution: event.data };
        case 'schedule_approval_request':
            return event.data as Record<string, unknown>;
        default:
            return {};
    }
}

// Broadcast webhook events to tenant-scoped WS topics
webhookService.onEvent((event) => {
    const msg = JSON.stringify({ type: event.type, delivery: event.data });
    const delivery = event.data as Record<string, unknown> | undefined;
    const agentId = (delivery as { agentId?: string } | undefined)?.agentId;
    publishToTenant('council', msg, agentId ? resolveAgentTenantForBroadcast(agentId) : undefined);
});

// Broadcast mention polling events to tenant-scoped WS topics
mentionPollingService.onEvent((event) => {
    const eventData = event.data as Record<string, unknown>;
    const msg = JSON.stringify({ type: event.type, ...eventData });
    const agentId = (eventData as { agentId?: string }).agentId;
    publishToTenant('council', msg, agentId ? resolveAgentTenantForBroadcast(agentId) : undefined);
});

// Broadcast workflow events to tenant-scoped WS topics
workflowService.onEvent((event) => {
    const msg = JSON.stringify({ type: event.type, ...spreadWorkflowEvent(event) });
    publishToTenant('council', msg); // Workflows don't carry agentId in events yet
});

function spreadWorkflowEvent(event: { type: string; data: unknown }): Record<string, unknown> {
    switch (event.type) {
        case 'workflow_update':
            return { workflow: event.data };
        case 'workflow_run_update':
            return { run: event.data };
        case 'workflow_node_update':
            return { nodeRun: event.data };
        default:
            return {};
    }
}

// Initialize AlgoChat after server starts
initAlgoChat().then(() => {
    // Wire agent message broadcasts once messenger is available
    if (algochatState.messenger) {
        algochatState.messenger.onMessageUpdate((message) => {
            const msg = JSON.stringify({ type: 'agent_message_update', message });
            const fromTid = message.fromAgentId ? resolveAgentTenantForBroadcast(message.fromAgentId) : undefined;
            publishToTenant('algochat', msg, fromTid);
        });
    }

    // Start memory sync service if AlgoChat is available
    if (algochatState.messenger) {
        memorySyncService.setServices(algochatState.messenger, algochatConfig.mnemonic, algochatConfig.network);
        memorySyncService.start();
    }

    // Start the scheduler now that all services are available
    // Give it the messenger if AlgoChat is initialized
    if (algochatState.messenger) {
        schedulerService.setAgentMessenger(algochatState.messenger);
        workflowService.setAgentMessenger(algochatState.messenger);
        notificationService.setAgentMessenger(algochatState.messenger);
        questionDispatcher.setAgentMessenger(algochatState.messenger);
    }
    notificationService.start();
    responsePollingService.start();
    schedulerService.start();
    mentionPollingService.start();
    workflowService.start();
    usageMeter.start();
    healthMonitorService.start();
}).catch((err) => {
    log.error('Failed to initialize AlgoChat', { error: err instanceof Error ? err.message : String(err) });
    // Start scheduler, polling, workflows, and notifications even if AlgoChat fails — they can still do GitHub ops and work tasks
    notificationService.start();
    responsePollingService.start();
    schedulerService.start();
    mentionPollingService.start();
    workflowService.start();
    usageMeter.start();
    healthMonitorService.start();
});

// Start session lifecycle cleanup after server is running
sessionLifecycle.start();

log.info(`Server running at http://${BIND_HOST}:${PORT}`);

// Global error handlers for 24/7 operation
process.on('unhandledRejection', (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    // Abort errors are expected when killing sessions — downgrade to debug
    if (message === 'Operation aborted' || message === 'The operation was aborted' || (reason instanceof Error && reason.name === 'AbortError')) {
        log.debug('Unhandled rejection (abort — expected during session cleanup)', { reason: message });
        return;
    }
    log.error('Unhandled rejection', { reason: message });
});

process.on('uncaughtException', (err) => {
    log.error('Uncaught exception, shutting down', { error: err.message, stack: err.stack });
    logShutdownDiagnostics('uncaughtException');
    shutdownCoordinator.shutdown().finally(() => process.exit(1));
});

// Shutdown diagnostics — log enough context to diagnose unexpected kills
function logShutdownDiagnostics(signal: string): void {
    const uptimeSeconds = Math.round((Date.now() - startTime) / 1000);
    const mem = process.memoryUsage();
    let parentInfo = `ppid=${process.ppid}`;
    try {
        // Try to identify the parent process that may have sent the signal
        const result = Bun.spawnSync(['ps', '-p', String(process.ppid), '-o', 'comm=']);
        const parentName = result.stdout.toString().trim();
        if (parentName) parentInfo += ` (${parentName})`;
    } catch { /* ignore */ }

    log.info(`Shutting down (${signal})`, {
        uptime: `${uptimeSeconds}s`,
        parent: parentInfo,
        activeSessions: processManager.getActiveSessionIds().length,
        rss: `${Math.round(mem.rss / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(mem.heapUsed / 1024 / 1024)}MB`,
    });
}

// Coordinated graceful shutdown via ShutdownCoordinator.
// SIGINT (ctrl-C) exits 0; SIGTERM exits 1 so launchd/run.sh know it wasn't intentional.
shutdownCoordinator.registerSignals(logShutdownDiagnostics, { SIGINT: 0, SIGTERM: 1 });

import { getDb, initDb } from './db/connection';
import { handleRequest, initRateLimiterDb } from './routes/index';
import { createWebSocketHandler } from './ws/handler';
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
import { handlePermissionRoutes } from './routes/permissions';
import { handleHealthRoutes } from './routes/health';
import { buildAgentCard } from './a2a/agent-card';
import { extractTenantId } from './tenant/middleware';
import { DEFAULT_TENANT_ID } from './tenant/types';
import type { HealthCheckDeps } from './health/service';
import { bootstrapServices } from './bootstrap';
import { wireEventBroadcasting, publishToTenant } from './events/broadcasting';
import { initAlgoChat, switchNetwork as switchAlgoChatNetwork, wirePostInit, type AlgoChatInitDeps } from './algochat/init';

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
    permissionBroker,
} = await bootstrapServices(db, startTime);

// AlgoChat init dependencies (shared by init, switchNetwork, and post-init wiring)
const algochatInitDeps: AlgoChatInitDeps = {
    db, server: null!, processManager, algochatConfig, algochatState,
    workTaskService, schedulerService, workflowService, notificationService,
    questionDispatcher, reputationScorer, reputationAttestation, reputationVerifier,
    astParserService, permissionBroker, shutdownCoordinator, memorySyncService,
    responsePollingService, usageMeter, healthMonitorService, mentionPollingService,
};

async function switchNetwork(network: 'testnet' | 'mainnet'): Promise<void> {
    await switchAlgoChatNetwork(algochatInitDeps, network);
}

// WebSocket handler — bridge reference is resolved lazily since init is async
const wsHandler = createWebSocketHandler(processManager, () => algochatState.bridge, authConfig, () => algochatState.messenger, () => workTaskService, () => schedulerService, () => processManager.ownerQuestionManager, () => db);

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

            const permResponse = handlePermissionRoutes(req, url, db);
            if (permResponse) {
                const resolved = permResponse instanceof Promise ? await permResponse : permResponse;
                return instrumentResponse(resolved, '/api/permissions');
            }
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

                const healthResponse = await handleHealthRoutes(req, url, healthDeps, db);
                if (healthResponse) return instrumentResponse(healthResponse, url.pathname);
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
                publishToTenant(server, 'ollama', msg); // Ollama is system-wide, no tenant scoping
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

// Patch the server reference into AlgoChat init deps (server wasn't available at declaration time)
algochatInitDeps.server = server;

// Wire all service event broadcasting to WebSocket topics
wireEventBroadcasting({
    server, db, processManager, schedulerService, webhookService,
    mentionPollingService, workflowService, notificationService, multiTenant,
});

// Initialize AlgoChat after server starts
initAlgoChat(algochatInitDeps).then(() => {
    wirePostInit(algochatInitDeps);
}).catch((err) => {
    log.error('Failed to initialize AlgoChat', { error: err instanceof Error ? err.message : String(err) });
    // Start background services even if AlgoChat fails
    wirePostInit(algochatInitDeps);
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

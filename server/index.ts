import { getDb, closeDb, initDb } from './db/connection';
import { handleRequest, initRateLimiterDb } from './routes/index';
import { ProcessManager } from './process/manager';
import { createWebSocketHandler, broadcastAlgoChatMessage } from './ws/handler';
import { onCouncilStageChange, onCouncilLog, onCouncilDiscussionMessage } from './routes/councils';
import { loadAlgoChatConfig } from './algochat/config';
import { initAlgoChatService } from './algochat/service';
import { AlgoChatBridge } from './algochat/bridge';
import { AgentWalletService } from './algochat/agent-wallet';
import { AgentDirectory } from './algochat/agent-directory';
import { AgentMessenger } from './algochat/agent-messenger';
import { OnChainTransactor } from './algochat/on-chain-transactor';
import { WorkCommandRouter } from './algochat/work-command-router';
import { SelfTestService } from './selftest/service';
import { WorkTaskService } from './work/service';
import { SchedulerService } from './scheduler/service';
import { WebhookService } from './webhooks/service';
import { MentionPollingService } from './polling/service';
import { WorkflowService } from './workflow/service';
import { SessionLifecycleManager } from './process/session-lifecycle';
import { MemorySyncService } from './db/memory-sync';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createLogger } from './lib/logger';
import { DedupService } from './lib/dedup';
import { ShutdownCoordinator } from './lib/shutdown-coordinator';
import { checkWsAuth, loadAuthConfig, validateStartupSecurity, timingSafeEqual } from './middleware/auth';
import { LlmProviderRegistry } from './providers/registry';
import { AnthropicProvider } from './providers/anthropic/provider';
import { OllamaProvider } from './providers/ollama/provider';
import { handleOllamaRoutes } from './routes/ollama';
import { handleOpenApiRoutes } from './openapi/index';
import { listProjects, createProject } from './db/projects';
import {
    initObservability,
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
import { AstParserService } from './ast/service';
import { NotificationService } from './notifications/service';
import { QuestionDispatcher } from './notifications/question-dispatcher';
import { ResponsePollingService } from './notifications/response-poller';
import { SandboxManager } from './sandbox/manager';
import { MarketplaceService } from './marketplace/service';
import { MarketplaceFederation } from './marketplace/federation';
import { ReputationScorer } from './reputation/scorer';
import { ReputationAttestation } from './reputation/attestation';
import { ReputationVerifier } from './reputation/verifier';
import { MemoryManager } from './memory/index';
import { AutonomousLoopService } from './improvement/service';
import { TelegramBridge } from './telegram/bridge';
import { DiscordBridge } from './discord/bridge';
import { SlackBridge } from './slack/bridge';
import { TenantService } from './tenant/context';
import { BillingService } from './billing/service';
import { UsageMeter } from './billing/meter';
import { getHealthCheck, getLivenessCheck, getReadinessCheck, type HealthCheckDeps } from './health/service';

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

// Initialize centralized dedup service (TTL + LRU + optional SQLite persistence)
const dedupService = DedupService.init(db);
dedupService.start();

// Initialize shutdown coordinator (30s grace period, configurable via env)
const SHUTDOWN_GRACE_MS = parseInt(process.env.SHUTDOWN_GRACE_MS ?? '30000', 10);
const shutdownCoordinator = new ShutdownCoordinator(SHUTDOWN_GRACE_MS);

// Initialize observability (OpenTelemetry tracing + metrics) — non-blocking, opt-in.
// Empty catch is intentional: initObservability() logs warnings internally when
// the OTLP endpoint is unavailable, so we silently swallow the rejection here.
initObservability().catch(() => {});

// Initialize AST parser service (non-critical — warn on failure)
const astParserService = new AstParserService();
astParserService.init().catch((err) => {
    log.warn('AST parser service failed to initialize', { error: err instanceof Error ? err.message : String(err) });
});

// Initialize LLM provider registry
const providerRegistry = LlmProviderRegistry.getInstance();
providerRegistry.register(new AnthropicProvider());
const ollamaProvider = new OllamaProvider();
providerRegistry.register(ollamaProvider);

// Ollama startup validation — health-check when Ollama is the only enabled provider
const isOllamaOnly = !providerRegistry.get('anthropic') && !providerRegistry.get('openai');
if (isOllamaOnly) {
    const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
    try {
        const tagsResponse = await fetch(`${ollamaHost}/api/tags`, { signal: AbortSignal.timeout(5_000) });
        if (tagsResponse.ok) {
            const tagsData = (await tagsResponse.json()) as { models?: Array<{ name: string }> };
            const modelCount = tagsData.models?.length ?? 0;
            if (modelCount === 0) {
                log.warn('Ollama is running but no models are pulled. Suggested: ollama pull qwen3:8b');
            } else {
                log.info(`Ollama health check OK — ${modelCount} model(s) available`);
            }
        } else {
            log.error(`Ollama health check failed (HTTP ${tagsResponse.status}). Is Ollama running at ${ollamaHost}?`);
        }
    } catch (err) {
        log.error('Ollama is unreachable — install from https://ollama.com and run: ollama serve', {
            host: ollamaHost,
            error: err instanceof Error ? err.message : String(err),
        });
    }
}

// Fire-and-forget: refresh Ollama models on startup (warn if not running)
ollamaProvider.refreshModels().catch((err) => {
    log.warn('Ollama not available on startup', { error: err instanceof Error ? err.message : String(err) });
});

// Ensure a project exists for the server's own codebase
{
    const projects = listProjects(db);
    const selfProject = projects.find((p) => p.workingDir === process.cwd());
    if (!selfProject) {
        createProject(db, {
            name: 'corvid-agent',
            workingDir: process.cwd(),
        });
    }
}

// Initialize process manager
const processManager = new ProcessManager(db);

// Initialize session lifecycle manager for automatic cleanup of expired sessions
const sessionLifecycle = new SessionLifecycleManager(db);

// Initialize memory sync service (started after AlgoChat init)
const memorySyncService = new MemorySyncService(db);

// Initialize AlgoChat
const algochatConfig = loadAlgoChatConfig();
let algochatBridge: AlgoChatBridge | null = null;
let agentWalletService: AgentWalletService | null = null;
let agentMessenger: AgentMessenger | null = null;
let agentDirectory: AgentDirectory | null = null;
const selfTestService = new SelfTestService(db, processManager);
const workTaskService = new WorkTaskService(db, processManager, astParserService);
workTaskService.recoverStaleTasks().catch((err) =>
    log.error('Failed to recover stale work tasks', { error: err instanceof Error ? err.message : String(err) }),
);

// Initialize scheduler (cron/interval automation for agents)
const schedulerService = new SchedulerService(db, processManager, workTaskService);

// Initialize webhook service (GitHub event-driven automation)
const webhookService = new WebhookService(db, processManager, workTaskService);

// Initialize mention polling service (local-first GitHub @mention detection)
const mentionPollingService = new MentionPollingService(db, processManager, workTaskService);

// Initialize workflow service (graph-based orchestration)
const workflowService = new WorkflowService(db, processManager, workTaskService);

// Initialize notification service (multi-channel owner notifications)
const notificationService = new NotificationService(db);

// Initialize question dispatcher and response poller (two-way question channels)
const questionDispatcher = new QuestionDispatcher(db);
const responsePollingService = new ResponsePollingService(db, processManager.ownerQuestionManager);

// Initialize sandbox manager (opt-in via SANDBOX_ENABLED=true)
const sandboxEnabled = process.env.SANDBOX_ENABLED === 'true';
const sandboxManager = sandboxEnabled ? new SandboxManager(db) : null;
if (sandboxManager) {
    sandboxManager.initialize().catch((err: Error) => {
        log.warn('Sandbox manager failed to initialize', { error: err.message });
    });
}

// Initialize marketplace
const marketplaceService = new MarketplaceService(db);
const marketplaceFederation = new MarketplaceFederation(db);

// Initialize reputation system
const reputationScorer = new ReputationScorer(db);
const reputationAttestation = new ReputationAttestation(db);
const reputationVerifier = new ReputationVerifier();

// Initialize memory manager (for structured memory with semantic search)
const memoryManager = new MemoryManager(db);

// Initialize autonomous improvement loop service
const improvementLoopService = new AutonomousLoopService(
    db, processManager, workTaskService, memoryManager, reputationScorer,
);
schedulerService.setImprovementLoopService(improvementLoopService);
schedulerService.setReputationServices(reputationScorer, reputationAttestation);
schedulerService.setNotificationService(notificationService);

// Initialize multi-tenant (opt-in via MULTI_TENANT=true)
const multiTenant = process.env.MULTI_TENANT === 'true';
const tenantService = new TenantService(db, multiTenant);

// Initialize billing
const billingService = new BillingService(db);
const usageMeter = new UsageMeter(db, billingService);

// Initialize bidirectional Telegram bridge (opt-in via env vars)
let telegramBridge: TelegramBridge | null = null;
if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
    telegramBridge = new TelegramBridge(db, processManager, {
        botToken: process.env.TELEGRAM_BOT_TOKEN,
        chatId: process.env.TELEGRAM_CHAT_ID,
        allowedUserIds: (process.env.TELEGRAM_ALLOWED_USER_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean),
    });
    telegramBridge.start();
    shutdownCoordinator.registerService('TelegramBridge', telegramBridge, 20);
    log.info('Telegram bridge initialized');
}

// Initialize bidirectional Discord bridge (opt-in via env vars)
let discordBridge: DiscordBridge | null = null;
if (process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_CHANNEL_ID) {
    discordBridge = new DiscordBridge(db, processManager, {
        botToken: process.env.DISCORD_BOT_TOKEN,
        channelId: process.env.DISCORD_CHANNEL_ID,
        allowedUserIds: process.env.DISCORD_ALLOWED_USER_IDS
            ? process.env.DISCORD_ALLOWED_USER_IDS.split(',').map(s => s.trim()).filter(Boolean)
            : [],
    });
    discordBridge.start();
    shutdownCoordinator.registerService('DiscordBridge', discordBridge, 20);
    log.info('Discord bridge initialized');
}

// Initialize bidirectional Slack bridge (opt-in via env vars)
let slackBridge: SlackBridge | null = null;
if (process.env.SLACK_BOT_TOKEN && process.env.SLACK_SIGNING_SECRET) {
    slackBridge = new SlackBridge(db, processManager, {
        botToken: process.env.SLACK_BOT_TOKEN,
        signingSecret: process.env.SLACK_SIGNING_SECRET,
        channelId: process.env.SLACK_CHANNEL_ID ?? '',
        allowedUserIds: process.env.SLACK_ALLOWED_USER_IDS
            ? process.env.SLACK_ALLOWED_USER_IDS.split(',').map(s => s.trim()).filter(Boolean)
            : [],
    });
    slackBridge.start();
    shutdownCoordinator.registerService('SlackBridge', slackBridge, 20);
    log.info('Slack bridge initialized');
}

// Register all services with the shutdown coordinator.
// Priority convention: 0=pollers/schedulers, 10=processing, 20=bridges, 30=process manager, 40=persistence, 50=database
shutdownCoordinator.registerService('ResponsePollingService', responsePollingService, 0);
shutdownCoordinator.registerService('NotificationService', notificationService, 0);
shutdownCoordinator.registerService('WorkflowService', workflowService, 0);
shutdownCoordinator.registerService('SchedulerService', schedulerService, 0);
shutdownCoordinator.registerService('MentionPollingService', mentionPollingService, 0);
shutdownCoordinator.registerService('SessionLifecycleManager', sessionLifecycle, 0);
shutdownCoordinator.registerService('UsageMeter', usageMeter, 5);
shutdownCoordinator.register({ name: 'MarketplaceFederation', priority: 5, handler: () => marketplaceFederation.stopPeriodicSync() });
shutdownCoordinator.registerService('MemorySyncService', memorySyncService, 10);
if (sandboxManager) {
    shutdownCoordinator.register({ name: 'SandboxManager', priority: 15, handler: () => sandboxManager.shutdown(), timeoutMs: 10_000 });
}
shutdownCoordinator.register({ name: 'ProcessManager', priority: 30, handler: () => processManager.shutdown(), timeoutMs: 15_000 });
shutdownCoordinator.registerService('DedupService', dedupService, 40);
shutdownCoordinator.register({ name: 'Database', priority: 50, handler: () => closeDb() });

async function switchNetwork(network: 'testnet' | 'mainnet'): Promise<void> {
    log.info(`Switching AlgoChat network to ${network}`);

    // Stop existing services
    if (algochatBridge) {
        algochatBridge.stop();
        algochatBridge = null;
    }
    agentWalletService = null;
    agentMessenger = null;
    agentDirectory = null;

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

    algochatBridge = new AlgoChatBridge(db, processManager, algochatConfig, service);

    // Initialize agent wallet service on the agent network (localnet for funding/keys)
    agentWalletService = new AgentWalletService(db, agentNetworkConfig, agentService);

    // Only let the bridge use agent wallets if both networks match;
    // otherwise the bridge (testnet) would try to send from wallets
    // that only have funds on localnet.
    if (algochatConfig.agentNetwork === algochatConfig.network) {
        algochatBridge.setAgentWalletService(agentWalletService);
    }

    // Initialize agent directory and messenger on the agent network
    agentDirectory = new AgentDirectory(db, agentWalletService);
    algochatBridge.setAgentDirectory(agentDirectory);
    algochatBridge.setApprovalManager(processManager.approvalManager);
    algochatBridge.setOwnerQuestionManager(processManager.ownerQuestionManager);
    algochatBridge.setWorkTaskService(workTaskService);

    // Create OnChainTransactor — handles all Algorand transaction operations
    const onChainTransactor = new OnChainTransactor(db, agentService, agentWalletService, agentDirectory);
    algochatBridge.setOnChainTransactor(onChainTransactor);

    agentMessenger = new AgentMessenger(db, agentNetworkConfig, onChainTransactor, processManager);
    const workCommandRouter = new WorkCommandRouter(db);
    workCommandRouter.setWorkTaskService(workTaskService);
    agentMessenger.setWorkCommandRouter(workCommandRouter);
    algochatBridge.setAgentMessenger(agentMessenger);

    // Register MCP services so agent sessions get corvid_* tools
    processManager.setMcpServices(agentMessenger, agentDirectory, agentWalletService, {
        serverMnemonic: algochatConfig.mnemonic,
        network: agentNetworkConfig.network,
    }, workTaskService, schedulerService, workflowService, notificationService, questionDispatcher,
    reputationScorer, reputationAttestation, reputationVerifier, astParserService);

    // Forward AlgoChat events to WebSocket clients
    algochatBridge.onEvent((participant, content, direction) => {
        broadcastAlgoChatMessage(server, participant, content, direction);
    });

    // Publish encryption keys for all existing agent wallets
    await agentWalletService.publishAllKeys();

    algochatBridge.start();
    shutdownCoordinator.register({ name: 'AlgoChatBridge', priority: 25, handler: () => algochatBridge?.stop() });
}

// WebSocket handler — bridge reference is resolved lazily since init is async
const wsHandler = createWebSocketHandler(processManager, () => algochatBridge, authConfig, () => agentMessenger, () => workTaskService, () => schedulerService, () => processManager.ownerQuestionManager);

interface WsData {
    subscriptions: Map<string, unknown>;
    walletAddress?: string;
    authenticated: boolean;
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

    async fetch(req, server) {
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
            headers.set('X-Content-Type-Options', 'nosniff');
            headers.set('X-Frame-Options', 'DENY');
            headers.set('X-XSS-Protection', '0');
            headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
            if (BIND_HOST !== '127.0.0.1') {
                headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
            }
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

            const upgraded = server.upgrade(req, {
                data: { subscriptions: new Map(), walletAddress, authenticated: preAuthenticated },
            });
            if (upgraded) return undefined as unknown as Response;
            return new Response('WebSocket upgrade failed', { status: 400 });
        }

        // Run request handler within trace context so all logs include trace ID
        return runWithTraceId(traceId, async () => {
            // Health check endpoints (no auth required)
            if (req.method === 'GET' && (url.pathname === '/api/health' || url.pathname.startsWith('/health'))) {
                const healthDeps: HealthCheckDeps = {
                    db,
                    startTime,
                    version: (require('../package.json') as { version: string }).version,
                    getActiveSessions: () => processManager.getActiveSessionIds(),
                    isAlgoChatConnected: () => algochatBridge !== null,
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
                server.publish('ollama', msg);
            });
            if (ollamaResponse) return instrumentResponse(ollamaResponse, '/api/ollama');

            // API routes
            const apiResponse = await handleRequest(req, db, processManager, algochatBridge, agentWalletService, agentMessenger, workTaskService, selfTestService, agentDirectory, switchNetwork, schedulerService, webhookService, mentionPollingService, workflowService, sandboxManager, marketplaceService, marketplaceFederation, reputationScorer, reputationAttestation, billingService, usageMeter, tenantService);
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
                    return instrumentResponse(new Response(Bun.file(filePath)), '/static');
                }

                // SPA fallback - serve index.html for unmatched routes
                const indexPath = join(CLIENT_DIST, 'index.html');
                if (existsSync(indexPath)) {
                    return instrumentResponse(
                        new Response(Bun.file(indexPath), {
                            headers: { 'Content-Type': 'text/html' },
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

// Wire broadcast function so MCP tools can publish to WS clients
processManager.setBroadcast((topic, data) => server.publish(topic, data));

// Wire notification service broadcast (publishes to 'owner' topic)
notificationService.setBroadcast((msg) => server.publish('owner', JSON.stringify(msg)));

// Broadcast council events to all WebSocket clients
onCouncilStageChange((launchId, stage, sessionIds) => {
    const msg = JSON.stringify({ type: 'council_stage_change', launchId, stage, sessionIds });
    server.publish('council', msg);
});

onCouncilLog((logEntry) => {
    const msg = JSON.stringify({ type: 'council_log', log: logEntry });
    server.publish('council', msg);
});

onCouncilDiscussionMessage((message) => {
    const msg = JSON.stringify({ type: 'council_discussion_message', message });
    server.publish('council', msg);
});

// Broadcast schedule events to all WebSocket clients
schedulerService.onEvent((event) => {
    const msg = JSON.stringify({ type: event.type, ...spreadScheduleEvent(event) });
    server.publish('council', msg); // Use 'council' topic since all clients subscribe to it
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

// Broadcast webhook events to all WebSocket clients
webhookService.onEvent((event) => {
    const msg = JSON.stringify({ type: event.type, delivery: event.data });
    server.publish('council', msg); // Use 'council' topic since all clients subscribe to it
});

// Broadcast mention polling events to all WebSocket clients
mentionPollingService.onEvent((event) => {
    const msg = JSON.stringify({ type: event.type, ...event.data as Record<string, unknown> });
    server.publish('council', msg); // Use 'council' topic since all clients subscribe to it
});

// Broadcast workflow events to all WebSocket clients
workflowService.onEvent((event) => {
    const msg = JSON.stringify({ type: event.type, ...spreadWorkflowEvent(event) });
    server.publish('council', msg); // Use 'council' topic since all clients subscribe to it
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
    if (agentMessenger) {
        agentMessenger.onMessageUpdate((message) => {
            const msg = JSON.stringify({ type: 'agent_message_update', message });
            server.publish('algochat', msg);
        });
    }

    // Start memory sync service if AlgoChat is available
    if (agentMessenger) {
        memorySyncService.setServices(agentMessenger, algochatConfig.mnemonic, algochatConfig.network);
        memorySyncService.start();
    }

    // Start the scheduler now that all services are available
    // Give it the agentMessenger if AlgoChat is initialized
    if (agentMessenger) {
        schedulerService.setAgentMessenger(agentMessenger);
        workflowService.setAgentMessenger(agentMessenger);
        notificationService.setAgentMessenger(agentMessenger);
        questionDispatcher.setAgentMessenger(agentMessenger);
    }
    notificationService.start();
    responsePollingService.start();
    schedulerService.start();
    mentionPollingService.start();
    workflowService.start();
    usageMeter.start();
}).catch((err) => {
    log.error('Failed to initialize AlgoChat', { error: err instanceof Error ? err.message : String(err) });
    // Start scheduler, polling, workflows, and notifications even if AlgoChat fails — they can still do GitHub ops and work tasks
    notificationService.start();
    responsePollingService.start();
    schedulerService.start();
    mentionPollingService.start();
    workflowService.start();
    usageMeter.start();
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

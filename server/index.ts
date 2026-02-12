import { getDb, closeDb } from './db/connection';
import { handleRequest } from './routes/index';
import { ProcessManager } from './process/manager';
import { createWebSocketHandler, broadcastAlgoChatMessage } from './ws/handler';
import { onCouncilStageChange, onCouncilLog, onCouncilDiscussionMessage } from './routes/councils';
import { loadAlgoChatConfig } from './algochat/config';
import { initAlgoChatService } from './algochat/service';
import { AlgoChatBridge } from './algochat/bridge';
import { AgentWalletService } from './algochat/agent-wallet';
import { AgentDirectory } from './algochat/agent-directory';
import { AgentMessenger } from './algochat/agent-messenger';
import { SelfTestService } from './selftest/service';
import { WorkTaskService } from './work/service';
import { SchedulerService } from './scheduler/service';
import { SessionLifecycleManager } from './process/session-lifecycle';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createLogger } from './lib/logger';
import { checkWsAuth, loadAuthConfig, validateStartupSecurity } from './middleware/auth';
import { LlmProviderRegistry } from './providers/registry';
import { AnthropicProvider } from './providers/anthropic/provider';
import { OllamaProvider } from './providers/ollama/provider';
import { handleOllamaRoutes } from './routes/ollama';
import { listProjects, createProject } from './db/projects';

const log = createLogger('Server');

// Load auth configuration for WebSocket authentication
const authConfig = loadAuthConfig();
validateStartupSecurity(authConfig);

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const BIND_HOST = process.env.BIND_HOST || '127.0.0.1';
const CLIENT_DIST = join(import.meta.dir, '..', 'client', 'dist', 'client', 'browser');
const startTime = Date.now();

// Initialize database
const db = getDb();

// Initialize LLM provider registry
const providerRegistry = LlmProviderRegistry.getInstance();
providerRegistry.register(new AnthropicProvider());
const ollamaProvider = new OllamaProvider();
providerRegistry.register(ollamaProvider);

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

// Initialize AlgoChat
const algochatConfig = loadAlgoChatConfig();
let algochatBridge: AlgoChatBridge | null = null;
let agentWalletService: AgentWalletService | null = null;
let agentMessenger: AgentMessenger | null = null;
let agentDirectory: AgentDirectory | null = null;
const selfTestService = new SelfTestService(db, processManager);
const workTaskService = new WorkTaskService(db, processManager);
workTaskService.recoverStaleTasks().catch((err) =>
    log.error('Failed to recover stale work tasks', { error: err instanceof Error ? err.message : String(err) }),
);

// Initialize scheduler (cron/interval automation for agents)
const schedulerService = new SchedulerService(db, processManager, workTaskService);

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
    algochatBridge.setWorkTaskService(workTaskService);
    agentMessenger = new AgentMessenger(db, agentNetworkConfig, agentService, agentWalletService, agentDirectory, processManager);
    agentMessenger.setWorkTaskService(workTaskService);
    algochatBridge.setAgentMessenger(agentMessenger);

    // Register MCP services so agent sessions get corvid_* tools
    processManager.setMcpServices(agentMessenger, agentDirectory, agentWalletService, {
        serverMnemonic: algochatConfig.mnemonic,
        network: agentNetworkConfig.network,
    }, workTaskService, schedulerService);

    // Forward AlgoChat events to WebSocket clients
    algochatBridge.onEvent((participant, content, direction) => {
        broadcastAlgoChatMessage(server, participant, content, direction);
    });

    // Publish encryption keys for all existing agent wallets
    await agentWalletService.publishAllKeys();

    algochatBridge.start();
}

// WebSocket handler — bridge reference is resolved lazily since init is async
const wsHandler = createWebSocketHandler(processManager, () => algochatBridge, () => agentMessenger, () => workTaskService, () => schedulerService);

interface WsData {
    subscriptions: Map<string, unknown>;
    walletAddress?: string;
}

// Start server
const server = Bun.serve<WsData>({
    port: PORT,
    hostname: BIND_HOST,

    async fetch(req, server) {
        const url = new URL(req.url);

        // WebSocket upgrade
        if (url.pathname === '/ws') {
            if (!checkWsAuth(req, url, authConfig)) {
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
                data: { subscriptions: new Map(), walletAddress },
            });
            if (upgraded) return undefined as unknown as Response;
            return new Response('WebSocket upgrade failed', { status: 400 });
        }

        // Health check endpoint
        if (url.pathname === '/api/health' && req.method === 'GET') {
            const health: Record<string, unknown> = {
                status: 'ok',
                uptime: (Date.now() - startTime) / 1000,
                activeSessions: processManager.getActiveSessionIds().length,
                algochat: algochatBridge !== null,
                timestamp: new Date().toISOString(),
            };
            health.scheduler = schedulerService.getStats();
            return new Response(JSON.stringify(health), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // LLM providers endpoint
        if (url.pathname === '/api/providers' && req.method === 'GET') {
            const providers = providerRegistry.getAll().map((p) => p.getInfo());
            return new Response(JSON.stringify(providers), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // Provider models endpoint — dynamic model listing (e.g. Ollama local models)
        const modelsMatch = url.pathname.match(/^\/api\/providers\/([^/]+)\/models$/);
        if (modelsMatch && req.method === 'GET') {
            const providerType = modelsMatch[1];
            const provider = providerRegistry.get(providerType as import('./providers/types').LlmProviderType);
            if (!provider) {
                return new Response(JSON.stringify({ error: `Unknown provider: ${providerType}` }), {
                    status: 404,
                    headers: { 'Content-Type': 'application/json' },
                });
            }
            // Refresh models if provider supports it (e.g. Ollama)
            if ('refreshModels' in provider && typeof (provider as { refreshModels: () => Promise<string[]> }).refreshModels === 'function') {
                await (provider as { refreshModels: () => Promise<string[]> }).refreshModels();
            }
            const info = provider.getInfo();
            return new Response(JSON.stringify({ models: info.models, defaultModel: info.defaultModel }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // Ollama model management routes
        const ollamaResponse = await handleOllamaRoutes(req, url, (status) => {
            const msg = JSON.stringify({ type: 'ollama_pull_progress', ...status });
            server.publish('ollama', msg);
        });
        if (ollamaResponse) return ollamaResponse;

        // API routes
        const apiResponse = await handleRequest(req, db, processManager, algochatBridge, agentWalletService, agentMessenger, workTaskService, selfTestService, agentDirectory, switchNetwork, schedulerService);
        if (apiResponse) return apiResponse;

        // Mobile chat client
        if (url.pathname === '/chat') {
            const chatPath = join(import.meta.dir, 'public', 'chat.html');
            if (existsSync(chatPath)) {
                return new Response(Bun.file(chatPath), {
                    headers: { 'Content-Type': 'text/html' },
                });
            }
        }

        // Serve Angular static files
        if (existsSync(CLIENT_DIST)) {
            let filePath = join(CLIENT_DIST, url.pathname);

            // Check if path exists as a file
            if (existsSync(filePath) && !filePath.endsWith('/')) {
                return new Response(Bun.file(filePath));
            }

            // SPA fallback - serve index.html for unmatched routes
            const indexPath = join(CLIENT_DIST, 'index.html');
            if (existsSync(indexPath)) {
                return new Response(Bun.file(indexPath), {
                    headers: { 'Content-Type': 'text/html' },
                });
            }
        }

        return new Response('Not Found', { status: 404 });
    },

    websocket: wsHandler,
});

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

// Initialize AlgoChat after server starts
initAlgoChat().then(() => {
    // Wire agent message broadcasts once messenger is available
    if (agentMessenger) {
        agentMessenger.onMessageUpdate((message) => {
            const msg = JSON.stringify({ type: 'agent_message_update', message });
            server.publish('algochat', msg);
        });
    }

    // Start the scheduler now that all services are available
    // Give it the agentMessenger if AlgoChat is initialized
    if (agentMessenger) {
        schedulerService.setAgentMessenger(agentMessenger);
    }
    schedulerService.start();
}).catch((err) => {
    log.error('Failed to initialize AlgoChat', { error: err instanceof Error ? err.message : String(err) });
    // Start scheduler even if AlgoChat fails — it can still do GitHub ops and work tasks
    schedulerService.start();
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
    gracefulShutdown();
    process.exit(1);
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

function gracefulShutdown(): void {
    schedulerService.stop();
    sessionLifecycle.stop();
    processManager.shutdown();
    algochatBridge?.stop();
    closeDb();
}

// Graceful shutdown
process.on('SIGINT', () => {
    logShutdownDiagnostics('SIGINT');
    gracefulShutdown();
    process.exit(0);
});

process.on('SIGTERM', () => {
    logShutdownDiagnostics('SIGTERM');
    gracefulShutdown();
    // Exit non-zero so launchd/run.sh know this was NOT an intentional stop.
    // Only SIGINT (ctrl-C / manual stop) exits 0.
    process.exit(1);
});

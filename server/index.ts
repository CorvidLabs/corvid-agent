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
import { SessionLifecycleManager } from './process/session-lifecycle';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createLogger } from './lib/logger';
import { checkWsAuth, loadAuthConfig, validateStartupSecurity } from './middleware/auth';

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

// Ensure a project exists for the server's own codebase
{
    const { listProjects, createProject } = require('./db/projects');
    const projects = listProjects(db);
    const selfProject = projects.find((p: { workingDir: string }) => p.workingDir === process.cwd());
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
    }, workTaskService);

    // Forward AlgoChat events to WebSocket clients
    algochatBridge.onEvent((participant, content, direction) => {
        broadcastAlgoChatMessage(server, participant, content, direction);
    });

    // Publish encryption keys for all existing agent wallets
    await agentWalletService.publishAllKeys();

    algochatBridge.start();
}

// WebSocket handler — bridge reference is resolved lazily since init is async
const wsHandler = createWebSocketHandler(processManager, () => algochatBridge, () => agentMessenger, () => workTaskService);

interface WsData {
    subscriptions: Map<string, unknown>;
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
            const upgraded = server.upgrade(req, {
                data: { subscriptions: new Map() },
            });
            if (upgraded) return undefined as unknown as Response;
            return new Response('WebSocket upgrade failed', { status: 400 });
        }

        // Health check endpoint
        if (url.pathname === '/api/health' && req.method === 'GET') {
            const health = {
                status: 'ok',
                uptime: (Date.now() - startTime) / 1000,
                activeSessions: processManager.getActiveSessionIds().length,
                algochat: algochatBridge !== null,
                timestamp: new Date().toISOString(),
            };
            return new Response(JSON.stringify(health), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // API routes
        const apiResponse = await handleRequest(req, db, processManager, algochatBridge, agentWalletService, agentMessenger, workTaskService, selfTestService, agentDirectory, switchNetwork);
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

// Initialize AlgoChat after server starts
initAlgoChat().then(() => {
    // Wire agent message broadcasts once messenger is available
    if (agentMessenger) {
        agentMessenger.onMessageUpdate((message) => {
            const msg = JSON.stringify({ type: 'agent_message_update', message });
            server.publish('algochat', msg);
        });
    }
}).catch((err) => {
    log.error('Failed to initialize AlgoChat', { error: err instanceof Error ? err.message : String(err) });
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
    sessionLifecycle.stop();
    processManager.shutdown();
    algochatBridge?.stop();
    closeDb();
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
    log.info('Shutting down (SIGINT)');
    sessionLifecycle.stop();
    processManager.shutdown();
    algochatBridge?.stop();
    closeDb();
    process.exit(0);
});

process.on('SIGTERM', () => {
    log.info('Shutting down (SIGTERM)');
    sessionLifecycle.stop();
    processManager.shutdown();
    algochatBridge?.stop();
    closeDb();
    process.exit(0);
});

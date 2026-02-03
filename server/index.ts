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
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createLogger } from './lib/logger';

const log = createLogger('Server');

const PORT = parseInt(process.env.PORT ?? '3000', 10);
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

// Initialize AlgoChat
const algochatConfig = loadAlgoChatConfig();
let algochatBridge: AlgoChatBridge | null = null;
let agentWalletService: AgentWalletService | null = null;
let agentMessenger: AgentMessenger | null = null;
let agentDirectory: AgentDirectory | null = null;
const selfTestService = new SelfTestService(db, processManager);
const workTaskService = new WorkTaskService(db, processManager);

async function initAlgoChat(): Promise<void> {
    if (!algochatConfig.enabled) {
        log.info('AlgoChat disabled');
        return;
    }

    const service = await initAlgoChatService(algochatConfig);
    if (!service) return;

    algochatBridge = new AlgoChatBridge(db, processManager, algochatConfig, service);

    // Initialize agent wallet service
    agentWalletService = new AgentWalletService(db, algochatConfig, service);
    algochatBridge.setAgentWalletService(agentWalletService);

    // Initialize agent directory and messenger
    agentDirectory = new AgentDirectory(db, agentWalletService);
    algochatBridge.setAgentDirectory(agentDirectory);
    algochatBridge.setApprovalManager(processManager.approvalManager);
    algochatBridge.setWorkTaskService(workTaskService);
    agentMessenger = new AgentMessenger(db, algochatConfig, service, agentWalletService, agentDirectory, processManager);
    agentMessenger.setWorkTaskService(workTaskService);

    // Register MCP services so agent sessions get corvid_* tools
    processManager.setMcpServices(agentMessenger, agentDirectory, agentWalletService);

    // Forward AlgoChat events to WebSocket clients
    algochatBridge.onEvent((participant, content, direction) => {
        broadcastAlgoChatMessage(server, participant, content, direction);
    });

    // Publish encryption keys for all existing agent wallets on localnet
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

    async fetch(req, server) {
        const url = new URL(req.url);

        // WebSocket upgrade
        if (url.pathname === '/ws') {
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
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
            });
        }

        // API routes
        const apiResponse = handleRequest(req, db, processManager, algochatBridge, agentWalletService, agentMessenger, workTaskService, selfTestService, agentDirectory);
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

log.info(`Server running at http://localhost:${PORT}`);

// Global error handlers for 24/7 operation
process.on('unhandledRejection', (reason) => {
    log.error('Unhandled rejection', { reason: reason instanceof Error ? reason.message : String(reason) });
});

process.on('uncaughtException', (err) => {
    log.error('Uncaught exception, shutting down', { error: err.message, stack: err.stack });
    processManager.shutdown();
    algochatBridge?.stop();
    closeDb();
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
    log.info('Shutting down (SIGINT)');
    processManager.shutdown();
    algochatBridge?.stop();
    closeDb();
    process.exit(0);
});

process.on('SIGTERM', () => {
    log.info('Shutting down (SIGTERM)');
    processManager.shutdown();
    algochatBridge?.stop();
    closeDb();
    process.exit(0);
});

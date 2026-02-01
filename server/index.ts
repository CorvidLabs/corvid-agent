import { getDb, closeDb } from './db/connection';
import { handleRequest } from './routes/index';
import { ProcessManager } from './process/manager';
import { createWebSocketHandler, broadcastAlgoChatMessage } from './ws/handler';
import { loadAlgoChatConfig } from './algochat/config';
import { initAlgoChatService } from './algochat/service';
import { AlgoChatBridge } from './algochat/bridge';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const CLIENT_DIST = join(import.meta.dir, '..', 'client', 'dist', 'client', 'browser');

// Initialize database
const db = getDb();

// Initialize process manager
const processManager = new ProcessManager(db);

// Initialize AlgoChat
const algochatConfig = loadAlgoChatConfig();
let algochatBridge: AlgoChatBridge | null = null;

async function initAlgoChat(): Promise<void> {
    if (!algochatConfig.enabled) {
        console.log('[CorvidAgent] AlgoChat disabled');
        return;
    }

    const service = await initAlgoChatService(algochatConfig);
    if (!service) return;

    algochatBridge = new AlgoChatBridge(db, processManager, algochatConfig, service);

    // Forward AlgoChat events to WebSocket clients
    algochatBridge.onEvent((participant, content, direction) => {
        broadcastAlgoChatMessage(server, participant, content, direction);
    });

    algochatBridge.start();
}

// WebSocket handler — bridge reference is resolved lazily since init is async
const wsHandler = createWebSocketHandler(processManager, () => algochatBridge);

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

        // API routes
        const apiResponse = handleRequest(req, db, processManager, algochatBridge);
        if (apiResponse) return apiResponse;

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

// Initialize AlgoChat after server starts
initAlgoChat().catch((err) => {
    console.error('Failed to initialize AlgoChat:', err);
});

console.log(`[CorvidAgent] Server running at http://localhost:${PORT}`);

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n[CorvidAgent] Shutting down...');
    processManager.shutdown();
    algochatBridge?.stop();
    closeDb();
    process.exit(0);
});

process.on('SIGTERM', () => {
    processManager.shutdown();
    algochatBridge?.stop();
    closeDb();
    process.exit(0);
});

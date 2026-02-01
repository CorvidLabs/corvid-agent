import type { ServerWebSocket } from 'bun';
import type { ProcessManager, EventCallback } from '../process/manager';
import type { ClientMessage, ServerMessage } from '../../shared/ws-protocol';
import { isClientMessage } from '../../shared/ws-protocol';
import type { AlgoChatBridge } from '../algochat/bridge';

interface WsData {
    subscriptions: Map<string, EventCallback>;
}

export function createWebSocketHandler(
    processManager: ProcessManager,
    getBridge: () => AlgoChatBridge | null,
) {
    return {
        open(ws: ServerWebSocket<WsData>) {
            ws.data = { subscriptions: new Map() };
        },

        message(ws: ServerWebSocket<WsData>, message: string | Buffer) {
            const raw = typeof message === 'string' ? message : message.toString();

            let parsed: unknown;
            try {
                parsed = JSON.parse(raw);
            } catch {
                sendError(ws, 'Invalid JSON');
                return;
            }

            if (!isClientMessage(parsed)) {
                sendError(ws, 'Invalid message format');
                return;
            }

            handleClientMessage(ws, parsed, processManager, getBridge);
        },

        close(ws: ServerWebSocket<WsData>) {
            // Clean up all subscriptions
            if (ws.data?.subscriptions) {
                for (const [sessionId, callback] of ws.data.subscriptions) {
                    processManager.unsubscribe(sessionId, callback);
                }
                ws.data.subscriptions.clear();
            }
        },
    };
}

function handleClientMessage(
    ws: ServerWebSocket<WsData>,
    msg: ClientMessage,
    processManager: ProcessManager,
    getBridge: () => AlgoChatBridge | null,
): void {
    switch (msg.type) {
        case 'subscribe': {
            if (ws.data.subscriptions.has(msg.sessionId)) return;

            const callback: EventCallback = (sessionId, event) => {
                const serverMsg: ServerMessage = {
                    type: 'session_event',
                    sessionId,
                    event: {
                        eventType: event.type,
                        data: event,
                        timestamp: new Date().toISOString(),
                    },
                };
                ws.send(JSON.stringify(serverMsg));
            };

            processManager.subscribe(msg.sessionId, callback);
            ws.data.subscriptions.set(msg.sessionId, callback);
            break;
        }

        case 'unsubscribe': {
            const callback = ws.data.subscriptions.get(msg.sessionId);
            if (callback) {
                processManager.unsubscribe(msg.sessionId, callback);
                ws.data.subscriptions.delete(msg.sessionId);
            }
            break;
        }

        case 'send_message': {
            const sent = processManager.sendMessage(msg.sessionId, msg.content);
            if (!sent) {
                sendError(ws, `Session ${msg.sessionId} is not running`);
            }
            break;
        }

        case 'chat_send': {
            console.log(`[WS] chat_send received: agentId=${msg.agentId}, content="${msg.content.slice(0, 50)}"`);
            const bridge = getBridge();
            if (!bridge) {
                console.log('[WS] chat_send: bridge is null, AlgoChat not available');
                sendError(ws, 'AlgoChat is not available');
                break;
            }

            bridge.handleLocalMessage(msg.agentId, msg.content, (participant, content, direction) => {
                console.log(`[WS] chat_send sendFn: participant=${participant}, direction=${direction}, content="${content.slice(0, 50)}"`);

                const serverMsg: ServerMessage = {
                    type: 'algochat_message',
                    participant,
                    content,
                    direction,
                };
                ws.send(JSON.stringify(serverMsg));
            }).catch((err) => {
                sendError(ws, `Chat error: ${err instanceof Error ? err.message : String(err)}`);
            });
            break;
        }
    }
}

function sendError(ws: ServerWebSocket<WsData>, message: string): void {
    const msg: ServerMessage = { type: 'error', message };
    ws.send(JSON.stringify(msg));
}

export function broadcastAlgoChatMessage(
    server: { publish: (topic: string, data: string) => void },
    participant: string,
    content: string,
    direction: 'inbound' | 'outbound',
): void {
    const msg: ServerMessage = {
        type: 'algochat_message',
        participant,
        content,
        direction,
    };
    server.publish('algochat', JSON.stringify(msg));
}

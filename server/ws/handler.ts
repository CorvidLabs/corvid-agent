import type { ServerWebSocket } from 'bun';
import type { ProcessManager, EventCallback } from '../process/manager';
import type { ClientMessage, ServerMessage } from '../../shared/ws-protocol';
import { isClientMessage } from '../../shared/ws-protocol';
import type { AlgoChatBridge } from '../algochat/bridge';
import type { AgentMessenger } from '../algochat/agent-messenger';
import type { WorkTaskService } from '../work/service';
import { createLogger } from '../lib/logger';

const log = createLogger('WebSocket');

interface WsData {
    subscriptions: Map<string, EventCallback>;
    walletAddress?: string;
}

export function createWebSocketHandler(
    processManager: ProcessManager,
    getBridge: () => AlgoChatBridge | null,
    getMessenger?: () => AgentMessenger | null,
    getWorkTaskService?: () => WorkTaskService | null,
) {
    return {
        open(ws: ServerWebSocket<WsData>) {
            ws.data = { subscriptions: new Map() };
            ws.subscribe('council');
            ws.subscribe('algochat');
            log.info('WebSocket connection opened');
        },

        message(ws: ServerWebSocket<WsData>, message: string | Buffer) {
            const raw = typeof message === 'string' ? message : message.toString();
            log.debug('WS message received', { raw: raw.slice(0, 200) });

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

            handleClientMessage(ws, parsed, processManager, getBridge, getMessenger, getWorkTaskService);
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
    getMessenger?: () => AgentMessenger | null,
    getWorkTaskService?: () => WorkTaskService | null,
): void {
    switch (msg.type) {
        case 'subscribe': {
            if (ws.data.subscriptions.has(msg.sessionId)) return;

            const callback: EventCallback = (sessionId, event) => {
                // Forward approval requests as dedicated messages
                if (event.type === 'approval_request') {
                    const approvalEvent = event as unknown as { id: string; sessionId: string; toolName: string; description: string; createdAt: number; timeoutMs: number };
                    const approvalMsg: ServerMessage = {
                        type: 'approval_request',
                        request: {
                            id: approvalEvent.id,
                            sessionId: approvalEvent.sessionId,
                            toolName: approvalEvent.toolName,
                            description: approvalEvent.description,
                            createdAt: approvalEvent.createdAt,
                            timeoutMs: approvalEvent.timeoutMs,
                        },
                    };
                    ws.send(JSON.stringify(approvalMsg));
                    return;
                }

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
            log.info('send_message received', { sessionId: msg.sessionId, content: msg.content.slice(0, 80) });
            const sent = processManager.sendMessage(msg.sessionId, msg.content);
            log.info('send_message result', { sessionId: msg.sessionId, sent });
            if (!sent) {
                sendError(ws, `Session ${msg.sessionId} is not running`);
            }
            break;
        }

        case 'chat_send': {
            const walletCtx = ws.data?.walletAddress;
            log.debug(`chat_send received`, { agentId: msg.agentId, content: msg.content.slice(0, 50), wallet: walletCtx?.slice(0, 8) });
            const bridge = getBridge();
            if (!bridge) {
                log.debug('chat_send: bridge is null, AlgoChat not available');
                sendError(ws, 'AlgoChat is not available');
                break;
            }

            bridge.handleLocalMessage(msg.agentId, msg.content, (participant, content, direction) => {
                log.debug('chat_send response', { participant, direction, content: content.slice(0, 50) });

                const serverMsg: ServerMessage = {
                    type: 'algochat_message',
                    participant,
                    content,
                    direction,
                };
                ws.send(JSON.stringify(serverMsg));
            }, msg.projectId, (event) => {
                // Map LocalChatEvent to ServerMessage
                let serverMsg: ServerMessage | null = null;
                switch (event.type) {
                    case 'stream':
                        serverMsg = { type: 'chat_stream', agentId: msg.agentId, chunk: event.chunk, done: event.done };
                        break;
                    case 'tool_use':
                        serverMsg = { type: 'chat_tool_use', agentId: msg.agentId, toolName: event.toolName, input: event.input };
                        break;
                    case 'thinking':
                        serverMsg = { type: 'chat_thinking', agentId: msg.agentId, active: event.active };
                        break;
                    case 'session_info':
                        serverMsg = { type: 'chat_session', agentId: msg.agentId, sessionId: event.sessionId };
                        break;
                }
                if (serverMsg) {
                    ws.send(JSON.stringify(serverMsg));
                }
            }).catch((err) => {
                sendError(ws, `Chat error: ${err instanceof Error ? err.message : String(err)}`);
            });
            break;
        }

        case 'agent_invoke': {
            const messenger = getMessenger?.();
            if (!messenger) {
                sendError(ws, 'Agent messaging not available');
                break;
            }

            messenger.invoke({
                fromAgentId: msg.fromAgentId,
                toAgentId: msg.toAgentId,
                content: msg.content,
                paymentMicro: msg.paymentMicro,
                projectId: msg.projectId,
            }).then((result) => {
                const serverMsg: ServerMessage = {
                    type: 'agent_message_update',
                    message: result.message,
                };
                ws.send(JSON.stringify(serverMsg));

                // Subscribe to status updates for this session
                if (result.sessionId) {
                    const invokeCallback = (_sessionId: string, event: { type: string }) => {
                        if (event.type === 'result' || event.type === 'session_exited') {
                            processManager.unsubscribe(result.sessionId as string, invokeCallback);
                            // Re-fetch the message to get the final state
                            import('../db/agent-messages').then(({ getAgentMessage }) => {
                                const updated = getAgentMessage(
                                    (messenger as unknown as { db: import('bun:sqlite').Database }).db,
                                    result.message.id,
                                );
                                if (updated) {
                                    const updateMsg: ServerMessage = {
                                        type: 'agent_message_update',
                                        message: updated,
                                    };
                                    ws.send(JSON.stringify(updateMsg));
                                }
                            });
                        }
                    };
                    processManager.subscribe(result.sessionId, invokeCallback);
                }
            }).catch((err) => {
                sendError(ws, `Invoke error: ${err instanceof Error ? err.message : String(err)}`);
            });
            break;
        }

        case 'approval_response': {
            processManager.approvalManager.resolveRequest(msg.requestId, {
                requestId: msg.requestId,
                behavior: msg.behavior,
                message: msg.message,
            });
            break;
        }

        case 'create_work_task': {
            const workTaskService = getWorkTaskService?.();
            if (!workTaskService) {
                sendError(ws, 'Work task service not available');
                break;
            }

            workTaskService.create({
                agentId: msg.agentId,
                description: msg.description,
                projectId: msg.projectId,
            }).then((task) => {
                const serverMsg: ServerMessage = { type: 'work_task_update', task };
                ws.send(JSON.stringify(serverMsg));

                // Register for completion update
                workTaskService.onComplete(task.id, (completedTask) => {
                    const updateMsg: ServerMessage = { type: 'work_task_update', task: completedTask };
                    ws.send(JSON.stringify(updateMsg));
                });
            }).catch((err) => {
                sendError(ws, `Work task error: ${err instanceof Error ? err.message : String(err)}`);
            });
            break;
        }

        case 'agent_reward': {
            const bridge = getBridge();
            const walletService = bridge?.getAgentWalletService();
            if (!walletService) {
                sendError(ws, 'Wallet service not available');
                break;
            }

            const { agentId, microAlgos } = msg;
            if (microAlgos < 1000 || microAlgos > 100_000_000) {
                sendError(ws, 'microAlgos must be between 1000 and 100000000');
                break;
            }

            walletService.fundAgent(agentId, microAlgos).then(async () => {
                const { getAgent } = await import('../db/agents');
                const agent = getAgent((bridge as unknown as { db: import('bun:sqlite').Database }).db, agentId);
                if (!agent?.walletAddress) return;

                const balance = await walletService.getBalance(agent.walletAddress);
                const balanceMsg: ServerMessage = {
                    type: 'agent_balance',
                    agentId,
                    balance,
                    funded: agent.walletFundedAlgo,
                };
                ws.send(JSON.stringify(balanceMsg));
            }).catch((err) => {
                sendError(ws, `Reward error: ${err instanceof Error ? err.message : String(err)}`);
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
    direction: 'inbound' | 'outbound' | 'status',
): void {
    const msg: ServerMessage = {
        type: 'algochat_message',
        participant,
        content,
        direction,
    };
    server.publish('algochat', JSON.stringify(msg));
}

import type { ServerWebSocket } from 'bun';
import type { ProcessManager, EventCallback } from '../process/manager';
import type { ClientMessage, ServerMessage, StreamEvent } from '../../shared/ws-protocol';
import { isClientMessage } from '../../shared/ws-protocol';
import type { ClaudeStreamEvent } from '../process/types';
import type { Database } from 'bun:sqlite';
import type { AlgoChatBridge } from '../algochat/bridge';
import type { AgentMessenger } from '../algochat/agent-messenger';
import type { WorkTaskService } from '../work/service';
import type { SchedulerService } from '../scheduler/service';
import type { OwnerQuestionManager } from '../process/owner-question-manager';
import type { AuthConfig } from '../middleware/auth';
import { timingSafeEqual } from '../middleware/auth';
import { getSession } from '../db/sessions';
import { createLogger } from '../lib/logger';

const log = createLogger('WebSocket');

/** Convert a ClaudeStreamEvent to the WebSocket StreamEvent wire format. */
function toStreamEvent(event: ClaudeStreamEvent): StreamEvent {
    return { eventType: event.type, data: event, timestamp: new Date().toISOString() } as StreamEvent;
}

/** Server-initiated ping interval (ms). */
export const HEARTBEAT_INTERVAL_MS = 30_000;

/** Time to wait for a pong response before closing the connection (ms). */
export const PONG_TIMEOUT_MS = 10_000;

/** Time to wait for post-connect authentication before closing (ms). */
export const AUTH_TIMEOUT_MS = 5_000;

export interface WsData {
    subscriptions: Map<string, EventCallback>;
    walletAddress?: string;
    authenticated: boolean;
    tenantId?: string;
    heartbeatTimer?: ReturnType<typeof setInterval> | null;
    pongTimeoutTimer?: ReturnType<typeof setTimeout> | null;
    authTimeoutTimer?: ReturnType<typeof setTimeout> | null;
}

/**
 * Build a tenant-namespaced topic name.
 * In single-tenant mode (no tenantId), returns the base topic for backwards compat.
 * In multi-tenant mode, returns `base:tenantId`.
 */
export function tenantTopic(base: string, tenantId?: string): string {
    if (!tenantId || tenantId === 'default') return base;
    return `${base}:${tenantId}`;
}

/** Start the heartbeat ping interval for a connection. Sends welcome on first call. */
function startHeartbeat(ws: ServerWebSocket<WsData>): void {
    stopHeartbeat(ws);

    // Send welcome message with server timestamp for clock sync
    safeSend(ws, { type: 'welcome', serverTime: new Date().toISOString() });

    ws.data.heartbeatTimer = setInterval(() => {
        // Send ping with server timestamp
        safeSend(ws, { type: 'ping', serverTime: new Date().toISOString() });

        // Start pong timeout — if no pong within PONG_TIMEOUT_MS, close
        ws.data.pongTimeoutTimer = setTimeout(() => {
            log.warn('WebSocket pong timeout — closing stale connection');
            try { ws.close(4002, 'Pong timeout'); } catch { /* already closed */ }
        }, PONG_TIMEOUT_MS);
    }, HEARTBEAT_INTERVAL_MS);
}

/** Stop heartbeat and pong timeout timers for a connection. */
function stopHeartbeat(ws: ServerWebSocket<WsData>): void {
    if (ws.data?.heartbeatTimer) {
        clearInterval(ws.data.heartbeatTimer);
        ws.data.heartbeatTimer = null;
    }
    if (ws.data?.pongTimeoutTimer) {
        clearTimeout(ws.data.pongTimeoutTimer);
        ws.data.pongTimeoutTimer = null;
    }
}

/** Clear the post-connect authentication timeout timer. */
function clearAuthTimeout(ws: ServerWebSocket<WsData>): void {
    if (ws.data?.authTimeoutTimer) {
        clearTimeout(ws.data.authTimeoutTimer);
        ws.data.authTimeoutTimer = null;
    }
}

export function createWebSocketHandler(
    processManager: ProcessManager,
    getBridge: () => AlgoChatBridge | null,
    authConfig: AuthConfig,
    getMessenger?: () => AgentMessenger | null,
    getWorkTaskService?: () => WorkTaskService | null,
    getSchedulerService?: () => SchedulerService | null,
    getOwnerQuestionManager?: () => OwnerQuestionManager | null,
    getDb?: () => Database,
) {
    return {
        open(ws: ServerWebSocket<WsData>) {
            // authenticated flag is set during upgrade in index.ts
            const isAuthenticated = ws.data?.authenticated ?? false;
            const tid = ws.data?.tenantId;
            ws.data = { subscriptions: new Map(), walletAddress: ws.data?.walletAddress, authenticated: isAuthenticated, tenantId: tid };

            if (isAuthenticated) {
                // Pre-authenticated at upgrade — subscribe to broadcast topics immediately
                subscribeToTopics(ws);
                startHeartbeat(ws);
                log.info('WebSocket connection opened (pre-authenticated)');
            } else {
                // Start auth timeout — client must authenticate within AUTH_TIMEOUT_MS
                ws.data.authTimeoutTimer = setTimeout(() => {
                    log.warn('WebSocket auth timeout — closing unauthenticated connection');
                    try { ws.close(4001, 'Authentication timeout'); } catch { /* already closed */ }
                }, AUTH_TIMEOUT_MS);
                log.info('WebSocket connection opened (awaiting auth)');
            }
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
                const preview = raw.slice(0, 200);
                log.warn('Invalid WS message format', { raw: preview });
                sendError(ws, 'Invalid message format');
                return;
            }

            // Handle pong response — clear the pong timeout timer
            if (parsed.type === 'pong') {
                if (ws.data.pongTimeoutTimer) {
                    clearTimeout(ws.data.pongTimeoutTimer);
                    ws.data.pongTimeoutTimer = null;
                }
                return;
            }

            // Handle first-message authentication
            if (parsed.type === 'auth') {
                if (ws.data.authenticated) {
                    sendError(ws, 'Already authenticated');
                    return;
                }
                if (!authConfig.apiKey) {
                    // No API key configured — auto-authenticate
                    clearAuthTimeout(ws);
                    ws.data.authenticated = true;
                    subscribeToTopics(ws);
                    startHeartbeat(ws);
                    return;
                }
                if (timingSafeEqual(parsed.key, authConfig.apiKey)) {
                    clearAuthTimeout(ws);
                    ws.data.authenticated = true;
                    subscribeToTopics(ws);
                    startHeartbeat(ws);
                    log.info('WebSocket authenticated via first-message auth');
                    return;
                }
                log.warn('WebSocket auth failed: invalid key');
                sendError(ws, 'Invalid API key');
                ws.close(4001, 'Invalid API key');
                return;
            }

            // Gate all other messages behind authentication
            if (!ws.data.authenticated) {
                sendError(ws, 'Authentication required. Send { "type": "auth", "key": "<key>" } first.');
                return;
            }

            handleClientMessage(ws, parsed, processManager, getBridge, getMessenger, getWorkTaskService, getSchedulerService, getOwnerQuestionManager, getDb);
        },

        close(ws: ServerWebSocket<WsData>) {
            // Stop all timers
            stopHeartbeat(ws);
            clearAuthTimeout(ws);

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

function subscribeToTopics(ws: ServerWebSocket<WsData>): void {
    const tid = ws.data?.tenantId;
    ws.subscribe(tenantTopic('council', tid));
    ws.subscribe(tenantTopic('algochat', tid));
    ws.subscribe(tenantTopic('scheduler', tid));
    ws.subscribe(tenantTopic('ollama', tid));
    ws.subscribe(tenantTopic('owner', tid));
}

function handleClientMessage(
    ws: ServerWebSocket<WsData>,
    msg: ClientMessage,
    processManager: ProcessManager,
    getBridge: () => AlgoChatBridge | null,
    getMessenger?: () => AgentMessenger | null,
    getWorkTaskService?: () => WorkTaskService | null,
    getSchedulerService?: () => SchedulerService | null,
    getOwnerQuestionManager?: () => OwnerQuestionManager | null,
    getDb?: () => Database,
): void {
    switch (msg.type) {
        case 'subscribe': {
            if (ws.data.subscriptions.has(msg.sessionId)) return;

            const callback: EventCallback = (sessionId, event) => {
                // Forward approval requests as dedicated messages
                if (event.type === 'approval_request') {
                    const approvalMsg: ServerMessage = {
                        type: 'approval_request',
                        request: {
                            id: event.id as string,
                            sessionId: event.sessionId as string,
                            toolName: event.toolName as string,
                            description: event.description as string,
                            createdAt: event.createdAt as number,
                            timeoutMs: event.timeoutMs as number,
                        },
                    };
                    ws.send(JSON.stringify(approvalMsg));
                    return;
                }

                // Forward session errors as dedicated recovery messages
                if (event.type === 'session_error') {
                    const errorEvent = event as import('../process/types').SessionErrorRecoveryEvent;
                    const errorMsg: ServerMessage = {
                        type: 'session_error',
                        sessionId,
                        error: {
                            message: errorEvent.error.message,
                            errorType: errorEvent.error.errorType,
                            severity: errorEvent.error.severity,
                            recoverable: errorEvent.error.recoverable,
                            sessionStatus: 'error',
                        },
                    };
                    ws.send(JSON.stringify(errorMsg));
                    return;
                }

                const serverMsg: ServerMessage = {
                    type: 'session_event',
                    sessionId,
                    event: toStreamEvent(event),
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
                const db = getDb?.();
                const session = db ? getSession(db, msg.sessionId) : null;
                if (session) {
                    log.info('Auto-resuming idle session', { sessionId: msg.sessionId, status: session.status });
                    processManager.resumeProcess(session, msg.content);
                } else {
                    sendError(ws, `Session ${msg.sessionId} not found`);
                }
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
                log.error('Chat error', { error: err instanceof Error ? err.message : String(err) });
                sendError(ws, 'Chat request failed', undefined, 'CHAT_ERROR');
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
                safeSend(ws, serverMsg);

                // Subscribe to status updates for this session
                if (result.sessionId) {
                    const invokeCallback = (_sessionId: string, event: { type: string }) => {
                        if (event.type === 'result' || event.type === 'session_exited') {
                            processManager.unsubscribe(result.sessionId as string, invokeCallback);
                            // Re-fetch the message to get the final state
                            import('../db/agent-messages').then(({ getAgentMessage }) => {
                                const updated = getAgentMessage(
                                    messenger.db,
                                    result.message.id,
                                );
                                if (updated) {
                                    const updateMsg: ServerMessage = {
                                        type: 'agent_message_update',
                                        message: updated,
                                    };
                                    safeSend(ws, updateMsg);
                                }
                            }).catch((err) => {
                                log.warn('Failed to re-fetch agent message', { error: err instanceof Error ? err.message : String(err) });
                            });
                        }
                    };
                    processManager.subscribe(result.sessionId, invokeCallback);
                }
            }).catch((err) => {
                log.error('Agent invoke error', { error: err instanceof Error ? err.message : String(err) });
                sendError(ws, 'Agent invocation failed', undefined, 'INVOKE_ERROR');
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
                safeSend(ws, serverMsg);

                // Register for completion update
                workTaskService.onComplete(task.id, (completedTask) => {
                    const updateMsg: ServerMessage = { type: 'work_task_update', task: completedTask };
                    safeSend(ws, updateMsg);
                });
            }).catch((err) => {
                log.error('Work task error', { error: err instanceof Error ? err.message : String(err) });
                sendError(ws, 'Work task creation failed', undefined, 'WORK_TASK_ERROR');
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
                const agent = getAgent(bridge!.db, agentId);
                if (!agent?.walletAddress) return;

                const balance = await walletService.getBalance(agent.walletAddress);
                const balanceMsg: ServerMessage = {
                    type: 'agent_balance',
                    agentId,
                    balance,
                    funded: agent.walletFundedAlgo,
                };
                safeSend(ws, balanceMsg);
            }).catch((err) => {
                log.error('Agent reward error', { error: err instanceof Error ? err.message : String(err) });
                sendError(ws, 'Agent reward failed', undefined, 'REWARD_ERROR');
            });
            break;
        }

        case 'schedule_approval': {
            const scheduler = getSchedulerService?.();
            if (!scheduler) {
                sendError(ws, 'Scheduler service not available');
                break;
            }

            const execution = scheduler.resolveApproval(msg.executionId, msg.approved);
            if (!execution) {
                sendError(ws, 'Execution not found or not awaiting approval');
            } else {
                const serverMsg: ServerMessage = { type: 'schedule_execution_update', execution };
                safeSend(ws, serverMsg);
            }
            break;
        }

        case 'question_response': {
            const questionManager = getOwnerQuestionManager?.();
            if (!questionManager) {
                sendError(ws, 'Owner question service not available');
                break;
            }

            const resolved = questionManager.resolveQuestion(msg.questionId, {
                questionId: msg.questionId,
                answer: msg.answer,
                selectedOption: msg.selectedOption ?? null,
            });
            if (!resolved) {
                sendError(ws, 'Question not found or already answered');
            }
            break;
        }
    }
}

/** Send a message to a WebSocket, guarding against closed connections. */
function safeSend(ws: ServerWebSocket<WsData>, msg: ServerMessage): void {
    try {
        ws.send(JSON.stringify(msg));
    } catch {
        // Connection closed before async callback fired — ignore
    }
}

function sendError(ws: ServerWebSocket<WsData>, message: string, severity?: import('../../shared/ws-protocol').ErrorSeverity, errorCode?: string): void {
    safeSend(ws, { type: 'error', message, severity, errorCode });
}

export function broadcastAlgoChatMessage(
    server: { publish: (topic: string, data: string) => void },
    participant: string,
    content: string,
    direction: 'inbound' | 'outbound' | 'status',
    tenantId?: string,
): void {
    const msg: ServerMessage = {
        type: 'algochat_message',
        participant,
        content,
        direction,
    };
    server.publish(tenantTopic('algochat', tenantId), JSON.stringify(msg));
}

import { Injectable, signal, computed } from '@angular/core';
import { environment } from '../../../environments/environment';
import type { ClientWsMessage, ServerWsMessage, StreamEvent } from '../models/ws-message.model';

type MessageHandler = (msg: ServerWsMessage) => void;

@Injectable({ providedIn: 'root' })
export class WebSocketService {
    private ws: WebSocket | null = null;
    private handlers = new Set<MessageHandler>();
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private subscribedSessions = new Set<string>();

    readonly connected = signal(false);
    readonly connectionStatus = computed(() => this.connected() ? 'connected' : 'disconnected');

    connect(): void {
        if (this.ws?.readyState === WebSocket.OPEN) return;

        const wsUrl = environment.apiKey
            ? `${environment.wsUrl}?token=${encodeURIComponent(environment.apiKey)}`
            : environment.wsUrl;
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            this.connected.set(true);
            // Re-subscribe to any sessions
            for (const sessionId of this.subscribedSessions) {
                this.send({ type: 'subscribe', sessionId });
            }
        };

        this.ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data) as ServerWsMessage;
                for (const handler of this.handlers) {
                    handler(msg);
                }
            } catch {
                // Ignore malformed messages
            }
        };

        this.ws.onclose = () => {
            this.connected.set(false);
            this.scheduleReconnect();
        };

        this.ws.onerror = () => {
            this.ws?.close();
        };
    }

    disconnect(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.ws?.close();
        this.ws = null;
        this.connected.set(false);
    }

    subscribe(sessionId: string): void {
        this.subscribedSessions.add(sessionId);
        this.send({ type: 'subscribe', sessionId });
    }

    unsubscribe(sessionId: string): void {
        this.subscribedSessions.delete(sessionId);
        this.send({ type: 'unsubscribe', sessionId });
    }

    sendMessage(sessionId: string, content: string): void {
        this.send({ type: 'send_message', sessionId, content });
    }

    sendChatMessage(agentId: string, content: string, projectId?: string): void {
        this.send({ type: 'chat_send', agentId, content, ...(projectId ? { projectId } : {}) });
    }

    sendReward(agentId: string, microAlgos: number): void {
        this.send({ type: 'agent_reward', agentId, microAlgos });
    }

    sendAgentInvoke(fromAgentId: string, toAgentId: string, content: string, paymentMicro?: number, projectId?: string): void {
        this.send({ type: 'agent_invoke', fromAgentId, toAgentId, content, ...(paymentMicro ? { paymentMicro } : {}), ...(projectId ? { projectId } : {}) });
    }

    sendApprovalResponse(requestId: string, behavior: 'allow' | 'deny', message?: string): void {
        this.send({ type: 'approval_response', requestId, behavior, ...(message ? { message } : {}) });
    }

    createWorkTask(agentId: string, description: string, projectId?: string): void {
        this.send({ type: 'create_work_task', agentId, description, ...(projectId ? { projectId } : {}) });
    }

    onMessage(handler: MessageHandler): () => void {
        this.handlers.add(handler);
        return () => this.handlers.delete(handler);
    }

    private send(msg: ClientWsMessage): void {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(msg));
        }
    }

    private scheduleReconnect(): void {
        if (this.reconnectTimer) return;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, 3000);
    }
}

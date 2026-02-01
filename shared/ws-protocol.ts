export type ClientMessage =
    | { type: 'subscribe'; sessionId: string }
    | { type: 'unsubscribe'; sessionId: string }
    | { type: 'send_message'; sessionId: string; content: string }
    | { type: 'chat_send'; agentId: string; content: string };

export type ServerMessage =
    | { type: 'session_event'; sessionId: string; event: StreamEvent }
    | { type: 'session_status'; sessionId: string; status: string }
    | { type: 'algochat_message'; participant: string; content: string; direction: 'inbound' | 'outbound' }
    | { type: 'error'; message: string };

export interface StreamEvent {
    eventType: string;
    data: unknown;
    timestamp: string;
}

export function isClientMessage(data: unknown): data is ClientMessage {
    if (typeof data !== 'object' || data === null) return false;
    const msg = data as Record<string, unknown>;
    if (typeof msg.type !== 'string') return false;

    switch (msg.type) {
        case 'subscribe':
        case 'unsubscribe':
            return typeof msg.sessionId === 'string';
        case 'send_message':
            return typeof msg.sessionId === 'string' && typeof msg.content === 'string';
        case 'chat_send':
            return typeof msg.agentId === 'string' && typeof msg.content === 'string';
        default:
            return false;
    }
}

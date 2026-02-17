import type { NotificationPayload, ChannelSendResult } from '../types';

export async function sendWebSocket(
    broadcastFn: (msg: unknown) => void,
    payload: NotificationPayload,
): Promise<ChannelSendResult> {
    broadcastFn({
        type: 'agent_notification',
        agentId: payload.agentId,
        sessionId: payload.sessionId ?? '',
        title: payload.title ?? null,
        message: payload.message,
        level: payload.level,
        timestamp: payload.timestamp,
    });
    return { success: true };
}

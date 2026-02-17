import type { NotificationPayload, ChannelSendResult } from '../types';
import type { AgentMessenger } from '../../algochat/agent-messenger';
import { createLogger } from '../../lib/logger';

const log = createLogger('NotifyAlgoChat');

export async function sendAlgoChat(
    messenger: AgentMessenger,
    toAddress: string,
    payload: NotificationPayload,
): Promise<ChannelSendResult> {
    try {
        const content = [
            payload.title ? `[${payload.level.toUpperCase()}] ${payload.title}` : `[${payload.level.toUpperCase()}]`,
            payload.message,
        ].join('\n');

        const txid = await messenger.sendNotificationToAddress(
            payload.agentId,
            toAddress,
            content,
        );

        if (!txid) {
            return { success: false, error: 'sendNotificationToAddress returned null (no wallet or service unavailable)' };
        }

        return { success: true, externalRef: txid };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn('AlgoChat send error', { error: message });
        return { success: false, error: message };
    }
}

import type { NotificationPayload, ChannelSendResult } from '../types';
import { createLogger } from '../../lib/logger';

const log = createLogger('NotifyWhatsApp');

const LEVEL_EMOJI: Record<string, string> = {
    info: '\u2139\ufe0f',
    success: '\u2705',
    warning: '\u26a0\ufe0f',
    error: '\ud83d\udea8',
};

/**
 * Send a notification via WhatsApp Business API.
 *
 * Requires a WhatsApp Business API endpoint (Cloud API or on-prem).
 * Config: { phoneNumberId, accessToken, recipientPhone }
 */
export async function sendWhatsApp(
    phoneNumberId: string,
    accessToken: string,
    recipientPhone: string,
    payload: NotificationPayload,
): Promise<ChannelSendResult> {
    try {
        const emoji = LEVEL_EMOJI[payload.level] ?? LEVEL_EMOJI.info;
        const title = payload.title ? `*${payload.title}*\n` : '';
        const text = `${emoji} ${title}${payload.message}\n\n_Agent: ${payload.agentId.slice(0, 8)}..._`;

        const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: recipientPhone,
                type: 'text',
                text: { body: text },
            }),
            signal: AbortSignal.timeout(10_000),
        });

        const data = await response.json() as {
            messages?: Array<{ id: string }>;
            error?: { message: string; code: number };
        };

        if (data.error) {
            log.warn('WhatsApp API error', { error: data.error.message, code: data.error.code });
            return { success: false, error: `WhatsApp API: ${data.error.message}` };
        }

        const messageId = data.messages?.[0]?.id ?? '';
        return { success: true, externalRef: messageId };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn('WhatsApp send error', { error: message });
        return { success: false, error: message };
    }
}

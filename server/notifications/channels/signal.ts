import type { NotificationPayload, ChannelSendResult } from '../types';
import { createLogger } from '../../lib/logger';

const log = createLogger('NotifySignal');

const LEVEL_EMOJI: Record<string, string> = {
    info: '\u2139\ufe0f',
    success: '\u2705',
    warning: '\u26a0\ufe0f',
    error: '\ud83d\udea8',
};

/**
 * Send a notification via Signal Bot (signal-cli REST API).
 *
 * Requires signal-cli-rest-api running (https://github.com/bbernhard/signal-cli-rest-api).
 * Config: { signalApiUrl, senderNumber, recipientNumber }
 */
export async function sendSignal(
    signalApiUrl: string,
    senderNumber: string,
    recipientNumber: string,
    payload: NotificationPayload,
): Promise<ChannelSendResult> {
    try {
        const emoji = LEVEL_EMOJI[payload.level] ?? LEVEL_EMOJI.info;
        const title = payload.title ? `*${payload.title}*\n` : '';
        const text = `${emoji} ${title}${payload.message}\n\nAgent: ${payload.agentId.slice(0, 8)}...`;

        const url = `${signalApiUrl}/v2/send`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: text,
                number: senderNumber,
                recipients: [recipientNumber],
            }),
            signal: AbortSignal.timeout(10_000),
        });

        if (!response.ok) {
            const body = await response.text().catch(() => '');
            log.warn('Signal API error', { status: response.status, body: body.slice(0, 200) });
            return { success: false, error: `HTTP ${response.status}: ${body.slice(0, 200)}` };
        }

        const data = await response.json().catch(() => ({})) as {
            timestamp?: string;
        };

        return { success: true, externalRef: data.timestamp ?? '' };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn('Signal send error', { error: message });
        return { success: false, error: message };
    }
}

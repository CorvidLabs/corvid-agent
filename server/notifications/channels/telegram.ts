import type { NotificationPayload, ChannelSendResult } from '../types';
import { createLogger } from '../../lib/logger';

const log = createLogger('NotifyTelegram');

const LEVEL_EMOJI: Record<string, string> = {
    info: 'ℹ️',
    success: '✅',
    warning: '⚠️',
    error: '🚨',
};

export async function sendTelegram(
    botToken: string,
    chatId: string,
    payload: NotificationPayload,
): Promise<ChannelSendResult> {
    try {
        const emoji = LEVEL_EMOJI[payload.level] ?? LEVEL_EMOJI.info;
        const title = payload.title ? `*${payload.title}*\n` : '';
        const text = `${emoji} ${title}${payload.message}\n\n_Agent: ${payload.agentId.slice(0, 8)}..._`;

        const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text,
                parse_mode: 'Markdown',
            }),
            signal: AbortSignal.timeout(10_000),
        });

        const data = await response.json() as { ok: boolean; result?: { message_id: number }; description?: string };

        if (!data.ok) {
            log.warn('Telegram API error', { description: data.description });
            return { success: false, error: data.description ?? 'Telegram API error' };
        }

        return { success: true, externalRef: String(data.result?.message_id ?? '') };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn('Telegram send error', { error: message });
        return { success: false, error: message };
    }
}

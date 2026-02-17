import type { NotificationPayload, ChannelSendResult } from '../types';
import { createLogger } from '../../lib/logger';

const log = createLogger('NotifyDiscord');

const LEVEL_COLORS: Record<string, number> = {
    info: 0x3498db,     // blue
    success: 0x2ecc71,  // green
    warning: 0xf39c12,  // orange
    error: 0xe74c3c,    // red
};

export async function sendDiscord(
    webhookUrl: string,
    payload: NotificationPayload,
): Promise<ChannelSendResult> {
    try {
        const embed = {
            title: payload.title ?? 'Agent Notification',
            description: payload.message,
            color: LEVEL_COLORS[payload.level] ?? LEVEL_COLORS.info,
            footer: { text: `Agent: ${payload.agentId.slice(0, 8)}... | ${payload.level}` },
            timestamp: payload.timestamp,
        };

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ embeds: [embed] }),
            signal: AbortSignal.timeout(10_000),
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            log.warn('Discord webhook failed', { status: response.status, body: text.slice(0, 200) });
            return { success: false, error: `HTTP ${response.status}: ${text.slice(0, 200)}` };
        }

        return { success: true };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn('Discord send error', { error: message });
        return { success: false, error: message };
    }
}

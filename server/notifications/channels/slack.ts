import type { NotificationPayload, ChannelSendResult } from '../types';
import { createLogger } from '../../lib/logger';

const log = createLogger('NotifySlack');

const LEVEL_COLORS: Record<string, string> = {
    info: '#3498db',     // blue
    success: '#2ecc71',  // green
    warning: '#f39c12',  // orange
    error: '#e74c3c',    // red
};

function validateWebhookUrl(url: string): void {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        throw new Error('Invalid webhook URL');
    }
    if (parsed.protocol !== 'https:') {
        throw new Error('Slack webhook URL must use HTTPS');
    }
    const hostname = parsed.hostname;
    if (!hostname.endsWith('.slack.com') && hostname !== 'slack.com' && hostname !== 'hooks.slack.com') {
        throw new Error('Slack webhook URL must point to slack.com');
    }
}

export async function sendSlack(
    webhookUrl: string,
    payload: NotificationPayload,
): Promise<ChannelSendResult> {
    try {
        validateWebhookUrl(webhookUrl);

        const color = LEVEL_COLORS[payload.level] ?? LEVEL_COLORS.info;
        const title = payload.title ?? 'Agent Notification';

        const body = {
            attachments: [
                {
                    color,
                    title,
                    text: payload.message,
                    footer: `Agent: ${payload.agentId.slice(0, 8)}... | ${payload.level}`,
                    ts: Math.floor(new Date(payload.timestamp).getTime() / 1000),
                },
            ],
        };

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(10_000),
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            log.warn('Slack webhook failed', { status: response.status, body: text.slice(0, 200) });
            return { success: false, error: `HTTP ${response.status}: ${text.slice(0, 200)}` };
        }

        return { success: true };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn('Slack send error', { error: message });
        return { success: false, error: message };
    }
}

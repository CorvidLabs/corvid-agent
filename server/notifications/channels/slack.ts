import type { NotificationPayload, ChannelSendResult } from '../types';
import { createLogger } from '../../lib/logger';

const log = createLogger('NotifySlack');

const LEVEL_EMOJI: Record<string, string> = {
    info: 'ℹ️',
    success: '✅',
    warning: '⚠️',
    error: '🚨',
};

const LEVEL_COLORS: Record<string, string> = {
    info: '#2196F3',
    success: '#4CAF50',
    warning: '#FF9800',
    error: '#F44336',
};

export async function sendSlack(
    botToken: string,
    channel: string,
    payload: NotificationPayload,
    threadTs?: string,
): Promise<ChannelSendResult> {
    try {
        const emoji = LEVEL_EMOJI[payload.level] ?? LEVEL_EMOJI.info;
        const color = LEVEL_COLORS[payload.level] ?? LEVEL_COLORS.info;
        const title = payload.title ?? 'Agent Notification';

        const blocks = [
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `${emoji} *${title}*\n${payload.message}`,
                },
            },
            {
                type: 'context',
                elements: [
                    {
                        type: 'mrkdwn',
                        text: `Agent: \`${payload.agentId.slice(0, 8)}...\` | ${payload.level.toUpperCase()}`,
                    },
                ],
            },
        ];

        const body: Record<string, unknown> = {
            channel,
            blocks,
            attachments: [{ color, blocks: [] }],
            unfurl_links: false,
        };

        if (threadTs) {
            body.thread_ts = threadTs;
        }

        const response = await fetch('https://slack.com/api/chat.postMessage', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${botToken}`,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(10_000),
        });

        const data = await response.json() as { ok: boolean; ts?: string; error?: string };

        if (!data.ok) {
            log.warn('Slack API error', { error: data.error });
            return { success: false, error: data.error ?? 'Slack API error' };
        }

        return { success: true, externalRef: data.ts ?? '' };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn('Slack send error', { error: message });
        return { success: false, error: message };
    }
}

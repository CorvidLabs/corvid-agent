import type { ChannelSendResult } from '../types';
import { createLogger } from '../../lib/logger';

const log = createLogger('SlackQuestion');

export async function sendSlackQuestion(
    botToken: string,
    channel: string,
    questionId: string,
    question: string,
    options: string[] | null,
    context: string | null,
    agentId: string,
): Promise<ChannelSendResult> {
    try {
        const shortId = questionId.slice(0, 8);
        const contextBlock = context ? `\n\n_Context: ${context}_` : '';

        const blocks: Array<Record<string, unknown>> = [
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `❓ *Agent Question*\n\n${question}${contextBlock}`,
                },
            },
        ];

        if (options && options.length > 0) {
            const elements = options.map((opt, idx) => ({
                type: 'button',
                text: { type: 'plain_text', text: opt.slice(0, 75), emoji: true },
                action_id: `q:${shortId}:${idx}`,
                value: String(idx),
            }));

            // Slack limits actions blocks to 25 elements, but keep it reasonable
            blocks.push({
                type: 'actions',
                elements: elements.slice(0, 25),
            });
        }

        blocks.push({
            type: 'context',
            elements: [
                {
                    type: 'mrkdwn',
                    text: `Agent: \`${agentId.slice(0, 8)}...\` | Reply in thread for freeform answer`,
                },
            ],
        });

        const response = await fetch('https://slack.com/api/chat.postMessage', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${botToken}`,
            },
            body: JSON.stringify({
                channel,
                blocks,
                unfurl_links: false,
            }),
            signal: AbortSignal.timeout(10_000),
        });

        const data = await response.json() as { ok: boolean; ts?: string; error?: string };

        if (!data.ok) {
            log.warn('Slack question dispatch error', { error: data.error });
            return { success: false, error: data.error ?? 'Slack API error' };
        }

        // Store channel:ts as external ref for response polling
        return { success: true, externalRef: `${channel}:${data.ts ?? ''}` };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn('Slack question send error', { error: message });
        return { success: false, error: message };
    }
}

import type { ChannelSendResult } from '../types';
import { createLogger } from '../../lib/logger';

const log = createLogger('QuestionSlack');

export async function sendSlackQuestion(
    botToken: string,
    channelId: string,
    questionId: string,
    question: string,
    options: string[] | null,
    context: string | null,
    agentId: string,
): Promise<ChannelSendResult> {
    try {
        const shortId = questionId.slice(0, 8);
        const blocks: Array<Record<string, unknown>> = [];

        // Header
        blocks.push({
            type: 'header',
            text: { type: 'plain_text', text: 'Agent Question', emoji: true },
        });

        // Question text
        blocks.push({
            type: 'section',
            text: { type: 'mrkdwn', text: question },
        });

        // Context if provided
        if (context) {
            blocks.push({
                type: 'context',
                elements: [{ type: 'mrkdwn', text: `_Context: ${context}_` }],
            });
        }

        // Options as numbered list
        if (options?.length) {
            const optionsText = options.map((opt, i) => `${i + 1}. ${opt}`).join('\n');
            blocks.push({
                type: 'section',
                text: { type: 'mrkdwn', text: `*Options:*\n${optionsText}` },
            });

            // Interactive buttons for options
            const actionElements = options.map((opt, i) => ({
                type: 'button',
                text: { type: 'plain_text', text: `${i + 1}. ${opt.slice(0, 30)}`, emoji: true },
                action_id: `q_${shortId}_${i}`,
                value: `q:${shortId}:${i}`,
            }));

            blocks.push({
                type: 'actions',
                elements: actionElements.slice(0, 5), // Slack limits to 5 buttons per block
            });
        }

        // Footer
        blocks.push({
            type: 'context',
            elements: [{
                type: 'mrkdwn',
                text: `Agent: ${agentId.slice(0, 8)}... | Q: ${shortId}`,
            }],
        });

        const body = {
            channel: channelId,
            text: `Agent Question: ${question}`, // Fallback text
            blocks,
        };

        const response = await fetch('https://slack.com/api/chat.postMessage', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${botToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(10_000),
        });

        const data = await response.json() as {
            ok: boolean;
            ts?: string;
            error?: string;
        };

        if (!data.ok) {
            log.warn('Slack API error', { error: data.error });
            return { success: false, error: data.error ?? 'Slack API error' };
        }

        return { success: true, externalRef: data.ts ?? '' };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn('Slack question send error', { error: message });
        return { success: false, error: message };
    }
}

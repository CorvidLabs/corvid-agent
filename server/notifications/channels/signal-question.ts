import type { ChannelSendResult } from '../types';
import { createLogger } from '../../lib/logger';

const log = createLogger('QuestionSignal');

/**
 * Send a question to the owner via Signal Bot (signal-cli REST API).
 *
 * Signal doesn't support interactive buttons, so we use numbered options
 * and instruct the user to reply with a number or freeform text.
 */
export async function sendSignalQuestion(
    signalApiUrl: string,
    senderNumber: string,
    recipientNumber: string,
    questionId: string,
    question: string,
    options: string[] | null,
    context: string | null,
    agentId: string,
): Promise<ChannelSendResult> {
    try {
        const shortId = questionId.slice(0, 8);
        const textParts: string[] = [
            `[QUESTION:${shortId}] ${question}`,
        ];

        if (context) {
            textParts.push('', `Context: ${context}`);
        }

        if (options?.length) {
            textParts.push('', 'Options:');
            for (let i = 0; i < options.length; i++) {
                textParts.push(`${i + 1}. ${options[i]}`);
            }
        }

        textParts.push('', `Reply with [ANS:${shortId}] followed by number or text.`);
        textParts.push(`Agent: ${agentId.slice(0, 8)}...`);

        const url = `${signalApiUrl}/v2/send`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: textParts.join('\n'),
                number: senderNumber,
                recipients: [recipientNumber],
            }),
            signal: AbortSignal.timeout(10_000),
        });

        if (!response.ok) {
            const body = await response.text().catch(() => '');
            log.warn('Signal question API error', { status: response.status, body: body.slice(0, 200) });
            return { success: false, error: `HTTP ${response.status}: ${body.slice(0, 200)}` };
        }

        const data = await response.json().catch(() => ({})) as {
            timestamp?: string;
        };

        return { success: true, externalRef: data.timestamp ?? '' };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn('Signal question send error', { error: message });
        return { success: false, error: message };
    }
}

import type { ChannelSendResult } from '../types';
import { createLogger } from '../../lib/logger';

const log = createLogger('QuestionWhatsApp');

/**
 * Send a question to the owner via WhatsApp Business API.
 *
 * Uses interactive message with buttons when options are provided (max 3),
 * falls back to numbered list for more options.
 */
export async function sendWhatsAppQuestion(
    phoneNumberId: string,
    accessToken: string,
    recipientPhone: string,
    questionId: string,
    question: string,
    options: string[] | null,
    context: string | null,
    agentId: string,
): Promise<ChannelSendResult> {
    try {
        const shortId = questionId.slice(0, 8);
        const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;

        // WhatsApp interactive buttons support max 3 buttons
        if (options?.length && options.length <= 3) {
            const bodyText = context
                ? `${question}\n\n_Context: ${context}_\n\n_Agent: ${agentId.slice(0, 8)}... | Q: ${shortId}_`
                : `${question}\n\n_Agent: ${agentId.slice(0, 8)}... | Q: ${shortId}_`;

            const buttons = options.map((opt, i) => ({
                type: 'reply' as const,
                reply: {
                    id: `q:${shortId}:${i}`,
                    title: opt.slice(0, 20), // WhatsApp button title max 20 chars
                },
            }));

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`,
                },
                body: JSON.stringify({
                    messaging_product: 'whatsapp',
                    to: recipientPhone,
                    type: 'interactive',
                    interactive: {
                        type: 'button',
                        body: { text: bodyText },
                        action: { buttons },
                    },
                }),
                signal: AbortSignal.timeout(10_000),
            });

            const data = await response.json() as {
                messages?: Array<{ id: string }>;
                error?: { message: string };
            };

            if (data.error) {
                log.warn('WhatsApp question API error', { error: data.error.message });
                return { success: false, error: `WhatsApp API: ${data.error.message}` };
            }

            return { success: true, externalRef: data.messages?.[0]?.id ?? '' };
        }

        // Fallback: plain text with numbered options
        const textParts: string[] = [
            `*Agent Question*`,
            question,
        ];

        if (context) {
            textParts.push('', `_Context: ${context}_`);
        }

        if (options?.length) {
            textParts.push('', 'Options:');
            for (let i = 0; i < options.length; i++) {
                textParts.push(`${i + 1}. ${options[i]}`);
            }
        }

        textParts.push('', `Reply with number or text.`);
        textParts.push(`_Agent: ${agentId.slice(0, 8)}... | Q: ${shortId}_`);

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
                text: { body: textParts.join('\n') },
            }),
            signal: AbortSignal.timeout(10_000),
        });

        const data = await response.json() as {
            messages?: Array<{ id: string }>;
            error?: { message: string };
        };

        if (data.error) {
            log.warn('WhatsApp question API error', { error: data.error.message });
            return { success: false, error: `WhatsApp API: ${data.error.message}` };
        }

        return { success: true, externalRef: data.messages?.[0]?.id ?? '' };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn('WhatsApp question send error', { error: message });
        return { success: false, error: message };
    }
}

import type { ChannelSendResult } from '../types';
import { createLogger } from '../../lib/logger';

const log = createLogger('QuestionTelegram');

export async function sendTelegramQuestion(
    botToken: string,
    chatId: string,
    questionId: string,
    question: string,
    options: string[] | null,
    context: string | null,
    agentId: string,
): Promise<ChannelSendResult> {
    try {
        const shortId = questionId.slice(0, 8);
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

        textParts.push('', `_Agent: ${agentId.slice(0, 8)}... | Q: ${shortId}_`);

        const text = textParts.join('\n');

        // Build inline keyboard if options provided
        let replyMarkup: Record<string, unknown> | undefined;
        if (options?.length) {
            const buttons = options.map((opt, i) => ({
                text: `${i + 1}. ${opt.slice(0, 30)}`,
                callback_data: `q:${shortId}:${i}`,
            }));
            // One button per row
            const keyboard = buttons.map((b) => [b]);
            // Add "Other" button for freeform
            keyboard.push([{
                text: 'Other (reply to this message)',
                callback_data: `q:${shortId}:other`,
            }]);
            replyMarkup = { inline_keyboard: keyboard };
        }

        const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
        const body: Record<string, unknown> = {
            chat_id: chatId,
            text,
            parse_mode: 'Markdown',
        };
        if (replyMarkup) {
            body.reply_markup = replyMarkup;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(10_000),
        });

        const data = await response.json() as {
            ok: boolean;
            result?: { message_id: number };
            description?: string;
        };

        if (!data.ok) {
            log.warn('Telegram API error', { description: data.description });
            return { success: false, error: data.description ?? 'Telegram API error' };
        }

        return { success: true, externalRef: String(data.result?.message_id ?? '') };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn('Telegram question send error', { error: message });
        return { success: false, error: message };
    }
}

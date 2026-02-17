import type { ChannelSendResult } from '../types';
import type { AgentMessenger } from '../../algochat/agent-messenger';
import { createLogger } from '../../lib/logger';

const log = createLogger('QuestionAlgoChat');

export async function sendAlgoChatQuestion(
    messenger: AgentMessenger,
    toAddress: string,
    questionId: string,
    question: string,
    options: string[] | null,
    agentId: string,
): Promise<ChannelSendResult> {
    try {
        const shortId = questionId.slice(0, 8);
        const parts: string[] = [
            `[QUESTION:${shortId}] ${question}`,
        ];

        if (options?.length) {
            const optionList = options.map((opt, i) => `${i + 1}. ${opt}`).join(' ');
            parts.push(`Options: ${optionList}`);
        }

        parts.push(`Reply with [ANS:${shortId}] followed by number or text.`);

        const content = parts.join('\n');

        const txid = await messenger.sendNotificationToAddress(
            agentId,
            toAddress,
            content,
        );

        if (!txid) {
            return { success: false, error: 'sendNotificationToAddress returned null (no wallet or service unavailable)' };
        }

        return { success: true, externalRef: txid };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn('AlgoChat question send error', { error: message });
        return { success: false, error: message };
    }
}

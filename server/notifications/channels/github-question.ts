import type { ChannelSendResult } from '../types';
import * as github from '../../github/operations';
import { createLogger } from '../../lib/logger';

const log = createLogger('QuestionGitHub');

export async function sendGitHubQuestion(
    repo: string,
    questionId: string,
    question: string,
    options: string[] | null,
    context: string | null,
    agentId: string,
): Promise<ChannelSendResult> {
    try {
        const title = `[Question] ${question.slice(0, 60)}${question.length > 60 ? '...' : ''}`;

        const bodyParts: string[] = [
            question,
            '',
        ];

        if (context) {
            bodyParts.push('**Context:**', context, '');
        }

        if (options?.length) {
            bodyParts.push('**Options:**');
            for (let i = 0; i < options.length; i++) {
                bodyParts.push(`- [ ] **${i + 1}.** ${options[i]}`);
            }
            bodyParts.push('');
        }

        bodyParts.push(
            '---',
            `Reply in a comment to answer. Use option number (e.g. \`1\`) or write a freeform response.`,
            '',
            `_Agent: \`${agentId.slice(0, 8)}...\` | Question: \`${questionId.slice(0, 8)}\`_`,
        );

        const body = bodyParts.join('\n');
        const labels = ['corvid-question', 'awaiting-response'];

        const result = await github.createIssue(repo, title, body, labels);

        if (!result.ok) {
            log.warn('GitHub question issue creation failed', { repo, error: result.error });
            return { success: false, error: result.error ?? 'Failed to create issue' };
        }

        return { success: true, externalRef: result.issueUrl };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn('GitHub question send error', { error: message });
        return { success: false, error: message };
    }
}

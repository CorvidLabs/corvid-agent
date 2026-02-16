import type { NotificationPayload, ChannelSendResult } from '../types';
import * as github from '../../github/operations';
import { createLogger } from '../../lib/logger';

const log = createLogger('NotifyGitHub');

export async function sendGitHub(
    repo: string,
    payload: NotificationPayload,
    labels?: string[],
): Promise<ChannelSendResult> {
    try {
        const title = `[${payload.level}] ${payload.title ?? 'Agent Notification'}`;
        const body = [
            payload.message,
            '',
            '---',
            `Agent: \`${payload.agentId}\``,
            payload.sessionId ? `Session: \`${payload.sessionId}\`` : null,
            `Level: **${payload.level}**`,
            `Timestamp: ${payload.timestamp}`,
        ].filter(Boolean).join('\n');

        const issueLabels = labels ?? ['corvid-notification', payload.level];

        const result = await github.createIssue(repo, title, body, issueLabels);

        if (!result.ok) {
            log.warn('GitHub issue creation failed', { repo, error: result.error });
            return { success: false, error: result.error ?? 'Failed to create issue' };
        }

        return { success: true, externalRef: result.issueUrl };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn('GitHub send error', { error: message });
        return { success: false, error: message };
    }
}

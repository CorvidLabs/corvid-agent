/**
 * Discord post action handler — sends a formatted message or embed directly
 * to a Discord channel as the primary action (not just an output destination).
 *
 * Supports pipeline variable interpolation for chaining with other actions
 * (e.g. daily_review → discord_post with {{pipeline.steps.review.result}}).
 */
import type { AgentSchedule, ScheduleAction } from '../../../shared/types';
import { updateExecutionStatus } from '../../db/schedules';
import { createLogger } from '../../lib/logger';
import type { HandlerContext } from './types';

const log = createLogger('DiscordPost');

const DEFAULT_COLOR = 0x5865f2; // Discord blurple

export async function execDiscordPost(
    _ctx: HandlerContext,
    executionId: string,
    schedule: AgentSchedule,
    action: ScheduleAction,
): Promise<void> {
    const channelId = action.channelId;
    if (!channelId) {
        updateExecutionStatus(_ctx.db, executionId, 'failed', {
            result: 'No channelId provided for discord_post action',
        });
        return;
    }

    const botToken = process.env.DISCORD_BOT_TOKEN;
    if (!botToken) {
        updateExecutionStatus(_ctx.db, executionId, 'failed', {
            result: 'DISCORD_BOT_TOKEN not configured',
        });
        return;
    }

    const content = action.message ?? '';
    const embedTitle = action.embedTitle;
    const embedColor = action.embedColor ?? DEFAULT_COLOR;

    // Build the message payload — use an embed if title is provided, plain text otherwise.
    const payload: Record<string, unknown> = {};

    if (embedTitle) {
        payload.embeds = [{
            title: embedTitle,
            description: content.slice(0, 4000),
            color: embedColor,
            timestamp: new Date().toISOString(),
            footer: { text: `Schedule: ${schedule.name}` },
        }];
    } else if (content) {
        // Split long messages at 2000 char Discord limit
        payload.content = content.slice(0, 2000);
    } else {
        updateExecutionStatus(_ctx.db, executionId, 'failed', {
            result: 'No message or embedTitle provided — nothing to post',
        });
        return;
    }

    try {
        const response = await fetch(
            `https://discord.com/api/v10/channels/${channelId}/messages`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bot ${botToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(10_000),
            },
        );

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            updateExecutionStatus(_ctx.db, executionId, 'failed', {
                result: `Discord API error ${response.status}: ${text.slice(0, 200)}`,
            });
            return;
        }

        const data = await response.json() as { id?: string };
        const messageId = data.id ?? 'unknown';

        updateExecutionStatus(_ctx.db, executionId, 'completed', {
            result: `Posted to Discord channel ${channelId} (message ${messageId})`,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('Discord post failed', { channelId, error: message });
        updateExecutionStatus(_ctx.db, executionId, 'failed', { result: message });
    }
}

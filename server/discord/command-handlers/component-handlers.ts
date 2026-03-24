/**
 * Discord button/component interaction handlers.
 *
 * Handles resume_thread, new_session, archive_thread, and stop_session
 * button clicks from Discord message components.
 */

import type { InteractionContext } from '../commands';
import type { DiscordInteractionData } from '../types';
import { PermissionLevel } from '../types';
import type { ThreadSessionInfo } from '../thread-manager';
import { archiveThread } from '../thread-manager';
import { createLogger } from '../../lib/logger';
import {
    respondToInteraction,
    acknowledgeButton,
    assertSnowflake,
} from '../embeds';
import { resolvePermissionLevel } from '../permissions';

const log = createLogger('DiscordCommands');

export async function handleComponentInteraction(
    ctx: InteractionContext,
    interaction: DiscordInteractionData,
): Promise<void> {
    const customId = interaction.data?.custom_id;
    if (!customId) return;

    const userId = interaction.member?.user?.id ?? interaction.user?.id;
    if (!userId) return;

    assertSnowflake(interaction.channel_id, 'channel ID');

    const permLevel = resolvePermissionLevel(ctx.config, ctx.mutedUsers, userId, interaction.member?.roles, interaction.channel_id);
    if (permLevel <= PermissionLevel.BLOCKED) {
        await respondToInteraction(interaction, 'You do not have permission to use this bot.');
        return;
    }

    const [action] = customId.split(':');

    switch (action) {
        case 'resume_thread': {
            if (permLevel < PermissionLevel.STANDARD) {
                await respondToInteraction(interaction, 'You need a higher role to resume sessions.');
                return;
            }
            const threadId = interaction.channel_id;
            const info = ctx.threadSessions.get(threadId) ?? tryRecoverThreadFromCtx(ctx, threadId);
            if (!info) {
                await respondToInteraction(interaction, 'No session found for this thread. Use `/session` to start a new one.');
                return;
            }

            // Un-archive the thread if it was archived
            await unarchiveThread(ctx.config.botToken, threadId);

            // Resubscribe for responses
            if (!ctx.threadCallbacks.has(threadId)) {
                ctx.subscribeForResponseWithEmbed(info.sessionId, threadId, info.agentName, info.agentModel, info.projectName, info.displayColor);
            }
            ctx.threadLastActivity.set(threadId, Date.now());

            await acknowledgeButton(interaction, 'Session resumed — send a message to continue.');
            break;
        }

        case 'new_session': {
            if (permLevel < PermissionLevel.STANDARD) {
                await respondToInteraction(interaction, 'You need a higher role to create sessions.');
                return;
            }
            await respondToInteraction(interaction, 'Use `/session` to start a new conversation with an agent.');
            break;
        }

        case 'archive_thread': {
            const threadId = interaction.channel_id;
            const info = ctx.threadSessions.get(threadId);

            // Clean up subscriptions if any
            const cb = ctx.threadCallbacks.get(threadId);
            if (cb) {
                ctx.processManager.unsubscribe(cb.sessionId, cb.callback);
                ctx.threadCallbacks.delete(threadId);
            }
            ctx.threadSessions.delete(threadId);
            ctx.threadLastActivity.delete(threadId);

            // Stop the process if still running
            if (info && ctx.processManager.isRunning(info.sessionId)) {
                ctx.processManager.stopProcess(info.sessionId);
            }

            await acknowledgeButton(interaction, 'Thread archived.');
            await archiveThread(ctx.config.botToken, threadId);
            break;
        }

        case 'stop_session': {
            const threadId = interaction.channel_id;
            const info = ctx.threadSessions.get(threadId);
            if (!info) {
                await respondToInteraction(interaction, 'No active session in this thread.');
                return;
            }

            if (info.ownerUserId && info.ownerUserId !== userId && permLevel < PermissionLevel.ADMIN) {
                await respondToInteraction(interaction, 'Only the session owner or an admin can stop this session.');
                return;
            }

            ctx.processManager.stopProcess(info.sessionId);
            const cb = ctx.threadCallbacks.get(threadId);
            if (cb) {
                ctx.processManager.unsubscribe(cb.sessionId, cb.callback);
                ctx.threadCallbacks.delete(threadId);
            }

            // Trigger buddy review if configured
            if (info.buddyConfig && ctx.buddyService) {
                const agentId = ctx.db.query<{ agent_id: string }, [string]>(
                    'SELECT agent_id FROM sessions WHERE id = ? LIMIT 1',
                ).get(info.sessionId)?.agent_id;
                if (agentId) {
                    ctx.buddyService.startSession({
                        leadAgentId: agentId,
                        buddyAgentId: info.buddyConfig.buddyAgentId,
                        prompt: info.topic ?? 'End-of-session review',
                        source: 'discord',
                        sessionId: info.sessionId,
                        maxRounds: info.buddyConfig.maxRounds,
                    }).catch(err => {
                        log.warn('Failed to start buddy review for /session', {
                            sessionId: info.sessionId,
                            error: err instanceof Error ? err.message : String(err),
                        });
                    });
                    await acknowledgeButton(interaction, `Session stopped. **${info.buddyConfig.buddyAgentName}** is reviewing...`);
                } else {
                    await acknowledgeButton(interaction, 'Session stopped.');
                }
            } else {
                await acknowledgeButton(interaction, 'Session stopped.');
            }
            break;
        }

        default:
            log.debug('Unknown button custom_id', { customId });
            await respondToInteraction(interaction, 'Unknown action.');
    }
}

/** Try to recover a thread session from the database. Used by component interactions. */
function tryRecoverThreadFromCtx(
    ctx: InteractionContext,
    threadId: string,
): ThreadSessionInfo | null {
    try {
        const row = ctx.db.query(
            `SELECT s.id, s.agent_id, s.initial_prompt, a.name as agent_name, a.model as agent_model, p.name as project_name
             FROM sessions s
             LEFT JOIN agents a ON a.id = s.agent_id
             LEFT JOIN projects p ON p.id = s.project_id
             WHERE s.name = ? AND s.source = 'discord'
             ORDER BY s.created_at DESC LIMIT 1`,
        ).get(`Discord thread:${threadId}`) as { id: string; agent_id: string; initial_prompt: string; agent_name: string; agent_model: string; project_name: string | null } | null;

        if (!row) {
            log.info('No session found in DB for thread recovery', { threadId, searchName: `Discord thread:${threadId}` });
            return null;
        }

        log.info('Recovered thread session from DB', { threadId, sessionId: row.id, agentName: row.agent_name });
        const info: ThreadSessionInfo = {
            sessionId: row.id,
            agentName: row.agent_name || 'Agent',
            agentModel: row.agent_model || 'unknown',
            ownerUserId: '',
            topic: row.initial_prompt || undefined,
            projectName: row.project_name || undefined,
        };
        ctx.threadSessions.set(threadId, info);
        return info;
    } catch (err) {
        log.error('Failed to recover thread session from DB', {
            threadId,
            error: err instanceof Error ? err.message : String(err),
        });
        return null;
    }
}

/** Un-archive a thread so it can receive messages again. */
async function unarchiveThread(botToken: string, threadId: string): Promise<void> {
    assertSnowflake(threadId, 'thread ID');
    const { discordFetch } = await import('../embeds');
    const response = await discordFetch(
        `https://discord.com/api/v10/channels/${threadId}`,
        {
            method: 'PATCH',
            headers: {
                'Authorization': `Bot ${botToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ archived: false }),
        },
    );
    if (!response.ok) {
        log.debug('Failed to unarchive thread', { threadId, status: response.status });
    }
}

/**
 * Discord moderation and council command handlers.
 *
 * Handles `/council`, `/mute`, and `/unmute` commands.
 */

import type { InteractionContext } from '../commands';
import type { DiscordInteractionData } from '../types';
import { PermissionLevel } from '../types';
import { listCouncils, getCouncilLaunch } from '../../db/councils';
import { launchCouncil, onCouncilStageChange } from '../../councils/discussion';
import { listProjects } from '../../db/projects';
import { createLogger } from '../../lib/logger';
import {
    respondToInteraction,
    sendEmbed,
} from '../embeds';

const log = createLogger('DiscordCommands');

export async function handleCouncilCommand(
    ctx: InteractionContext,
    interaction: DiscordInteractionData,
    permLevel: number,
    getOption: (name: string) => string | undefined,
): Promise<void> {
    if (permLevel < PermissionLevel.ADMIN) {
        await respondToInteraction(interaction, 'Council deliberation requires admin permissions.');
        return;
    }
    const topic = getOption('topic');
    if (!topic) {
        await respondToInteraction(interaction, 'Please provide a topic.');
        return;
    }
    const councils = listCouncils(ctx.db);
    if (councils.length === 0) {
        await respondToInteraction(interaction, 'No councils configured.');
        return;
    }
    const council = councils[0];
    const projects = listProjects(ctx.db);
    const project = projects[0];
    if (!project) {
        await respondToInteraction(interaction, 'No projects configured.');
        return;
    }
    try {
        const result = launchCouncil(ctx.db, ctx.processManager, council.id, project.id, topic, null);

        const councilChannelId = interaction.channel_id;

        await respondToInteraction(interaction,
            `Council deliberation launched.\nCouncil: **${council.name}**\nLaunch ID: \`${result.launchId.slice(0, 8)}\`\nSessions: ${result.sessionIds.length}`);

        if (councilChannelId) {
            const unsubscribe = onCouncilStageChange((launchId, stage) => {
                if (launchId !== result.launchId || stage !== 'complete') return;
                unsubscribe();

                const launch = getCouncilLaunch(ctx.db, result.launchId);
                const synthesis = launch?.synthesis || '(No synthesis produced)';

                sendEmbed(ctx.delivery, ctx.config.botToken, councilChannelId, {
                    title: `Council Complete: ${council.name}`,
                    description: synthesis.slice(0, 4096),
                    color: 0x57f287,
                    footer: { text: `Topic: ${topic.slice(0, 100)} · Launch: ${result.launchId.slice(0, 8)}` },
                }).catch(err => {
                    log.warn('Failed to post council synthesis to Discord', {
                        launchId: result.launchId,
                        error: err instanceof Error ? err.message : String(err),
                    });
                });
            });
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await respondToInteraction(interaction, `Failed to launch council: ${msg}`);
    }
}

export async function handleMuteCommand(
    ctx: InteractionContext,
    interaction: DiscordInteractionData,
    permLevel: number,
    getOption: (name: string) => string | undefined,
): Promise<void> {
    if (permLevel < PermissionLevel.ADMIN) {
        await respondToInteraction(interaction, 'Only admins can mute users.');
        return;
    }
    const targetUser = getOption('user');
    if (!targetUser) {
        await respondToInteraction(interaction, 'Please specify a user.');
        return;
    }
    ctx.muteUser(targetUser);
    await respondToInteraction(interaction, `User <@${targetUser}> has been muted from bot interactions.`);
}

export async function handleUnmuteCommand(
    ctx: InteractionContext,
    interaction: DiscordInteractionData,
    permLevel: number,
    getOption: (name: string) => string | undefined,
): Promise<void> {
    if (permLevel < PermissionLevel.ADMIN) {
        await respondToInteraction(interaction, 'Only admins can unmute users.');
        return;
    }
    const targetUser = getOption('user');
    if (!targetUser) {
        await respondToInteraction(interaction, 'Please specify a user.');
        return;
    }
    ctx.unmuteUser(targetUser);
    await respondToInteraction(interaction, `User <@${targetUser}> has been unmuted.`);
}

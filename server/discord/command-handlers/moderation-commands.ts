/**
 * Discord moderation and council command handlers.
 *
 * Handles `/council`, `/mute`, and `/unmute` commands.
 */

import { launchCouncil, onCouncilStageChange } from '../../councils/discussion';
import { listAgents } from '../../db/agents';
import { createCouncil, getCouncilLaunch, listCouncils } from '../../db/councils';
import { listProjects } from '../../db/projects';
import { createLogger } from '../../lib/logger';
import type { InteractionContext } from '../commands';
import { respondEphemeral, respondToInteraction, sendEmbed } from '../embeds';
import type { DiscordInteractionData } from '../types';
import { PermissionLevel } from '../types';

const log = createLogger('DiscordCommands');

export async function handleCouncilCommand(
  ctx: InteractionContext,
  interaction: DiscordInteractionData,
  permLevel: number,
  getOption: (name: string) => string | undefined,
): Promise<void> {
  if (permLevel < PermissionLevel.ADMIN) {
    await respondEphemeral(interaction, 'Council deliberation requires admin permissions.');
    return;
  }
  const topic = getOption('topic');
  if (!topic) {
    await respondToInteraction(interaction, 'Please provide a topic.');
    return;
  }

  // Resolve council: by name, by ad-hoc agents, or fallback to first
  const councilNameOpt = getOption('council_name');
  const agentsOpt = getOption('agents');

  let councilId: string;
  let councilLabel: string;

  if (councilNameOpt) {
    // User selected an existing council by name
    const councils = listCouncils(ctx.db);
    const match = councils.find((c) => c.name.toLowerCase() === councilNameOpt.toLowerCase());
    if (!match) {
      const available = councils.map((c) => c.name).join(', ');
      await respondEphemeral(interaction, `Council "${councilNameOpt}" not found.\nAvailable: ${available || 'none'}`);
      return;
    }
    councilId = match.id;
    councilLabel = match.name;
  } else if (agentsOpt) {
    // Ad-hoc council from comma-separated agent names
    const agentNames = agentsOpt
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean);
    if (agentNames.length < 2) {
      await respondEphemeral(interaction, 'Ad-hoc council requires at least 2 agents. Separate names with commas.');
      return;
    }
    const allAgents = listAgents(ctx.db);
    const matched: typeof allAgents = [];
    const notFound: string[] = [];

    for (const name of agentNames) {
      const agent = allAgents.find((a) => a.name.toLowerCase() === name.toLowerCase());
      if (agent) {
        matched.push(agent);
      } else {
        notFound.push(name);
      }
    }
    if (notFound.length > 0) {
      const available = allAgents.map((a) => a.name).join(', ');
      await respondEphemeral(
        interaction,
        `Agent(s) not found: ${notFound.join(', ')}\nAvailable: ${available || 'none'}`,
      );
      return;
    }

    const agentIds = matched.map((a) => a.id);
    const council = createCouncil(ctx.db, {
      name: `Discord Council ${new Date().toISOString().slice(0, 16)}`,
      description: `Ad-hoc: ${matched.map((a) => a.name).join(', ')}`,
      agentIds,
      chairmanAgentId: agentIds[0],
      discussionRounds: 2,
    });
    councilId = council.id;
    councilLabel = council.name;
  } else {
    // Fallback: use first existing council
    const councils = listCouncils(ctx.db);
    if (councils.length === 0) {
      await respondToInteraction(
        interaction,
        'No councils configured. Use `council_name` to pick one or `agents` to create an ad-hoc council.',
      );
      return;
    }
    councilId = councils[0].id;
    councilLabel = councils[0].name;
  }

  // Resolve project: by name or fallback to first
  const projectOpt = getOption('project');
  const projects = listProjects(ctx.db);
  let projectId: string;

  if (projectOpt) {
    const match = projects.find((p) => p.name.toLowerCase() === projectOpt.toLowerCase());
    if (!match) {
      const available = projects.map((p) => p.name).join(', ');
      await respondEphemeral(interaction, `Project "${projectOpt}" not found.\nAvailable: ${available || 'none'}`);
      return;
    }
    projectId = match.id;
  } else {
    if (projects.length === 0) {
      await respondToInteraction(interaction, 'No projects configured.');
      return;
    }
    projectId = projects[0].id;
  }

  try {
    const result = launchCouncil(ctx.db, ctx.processManager, councilId, projectId, topic, null);

    const councilChannelId = interaction.channel_id;

    await respondToInteraction(
      interaction,
      `Council deliberation launched.\nCouncil: **${councilLabel}**\nLaunch ID: \`${result.launchId.slice(0, 8)}\`\nSessions: ${result.sessionIds.length}`,
    );

    if (councilChannelId) {
      const unsubscribe = onCouncilStageChange((launchId, stage) => {
        if (launchId !== result.launchId || stage !== 'complete') return;
        unsubscribe();

        const launch = getCouncilLaunch(ctx.db, result.launchId);
        const synthesis = launch?.synthesis || '(No synthesis produced)';

        sendEmbed(ctx.delivery, ctx.config.botToken, councilChannelId, {
          title: `Council Complete: ${councilLabel}`,
          description: synthesis.slice(0, 4096),
          color: 0x57f287,
          footer: { text: `Topic: ${topic.slice(0, 100)} · Launch: ${result.launchId.slice(0, 8)}` },
        }).catch((err) => {
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
    await respondEphemeral(interaction, 'Only admins can mute users.');
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
    await respondEphemeral(interaction, 'Only admins can unmute users.');
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

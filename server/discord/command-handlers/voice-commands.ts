/**
 * Discord voice command handlers.
 *
 * Handles `/voice join` and `/voice leave` subcommands.
 */

import { ChannelType, type ChatInputCommandInteraction } from 'discord.js';
import type { InteractionContext } from '../commands';
import { respondEphemeral, respondToInteraction } from '../embeds';
import type { VoiceConnectionManager } from '../voice/connection-manager';

export async function handleVoiceCommand(
  ctx: InteractionContext,
  interaction: ChatInputCommandInteraction,
  voiceManager: VoiceConnectionManager,
): Promise<void> {
  const sub = interaction.options.getSubcommand();

  switch (sub) {
    case 'join':
      await handleVoiceJoin(ctx, interaction, voiceManager);
      break;
    case 'leave':
      await handleVoiceLeave(ctx, interaction, voiceManager);
      break;
    case 'status':
      await handleVoiceStatus(interaction, voiceManager);
      break;
    default:
      await respondEphemeral(interaction, `Unknown subcommand: ${sub}`);
  }
}

async function handleVoiceJoin(
  _ctx: InteractionContext,
  interaction: ChatInputCommandInteraction,
  voiceManager: VoiceConnectionManager,
): Promise<void> {
  const channel = interaction.options.getChannel('channel', true);

  // Validate it's a voice channel
  if (channel.type !== ChannelType.GuildVoice && channel.type !== ChannelType.GuildStageVoice) {
    await respondEphemeral(interaction, `<#${channel.id}> is not a voice channel.`);
    return;
  }

  const guildId = interaction.guildId;
  if (!guildId) {
    await respondEphemeral(interaction, 'This command can only be used in a server.');
    return;
  }

  // Defer since voice connection might take a moment
  await interaction.deferReply();

  try {
    const info = await voiceManager.join(guildId, channel.id, channel.name ?? undefined);
    await interaction.editReply(`Joined voice channel <#${info.channelId}>. Listening silently.`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await interaction.editReply(`Failed to join voice channel: ${msg}`);
  }
}

async function handleVoiceLeave(
  _ctx: InteractionContext,
  interaction: ChatInputCommandInteraction,
  voiceManager: VoiceConnectionManager,
): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await respondEphemeral(interaction, 'This command can only be used in a server.');
    return;
  }

  const info = voiceManager.getConnection(guildId);
  const left = voiceManager.leave(guildId);

  if (left && info) {
    await respondToInteraction(interaction, `Left voice channel <#${info.channelId}>.`);
  } else {
    await respondEphemeral(interaction, 'Not currently in a voice channel.');
  }
}

async function handleVoiceStatus(
  interaction: ChatInputCommandInteraction,
  voiceManager: VoiceConnectionManager,
): Promise<void> {
  const connections = voiceManager.getConnections();

  if (connections.length === 0) {
    await respondToInteraction(interaction, 'Not connected to any voice channels.');
    return;
  }

  const lines = connections.map((c) => {
    const duration = Math.round((Date.now() - c.joinedAt) / 60_000);
    return `• <#${c.channelId}> — connected for ${duration}m`;
  });

  await respondToInteraction(interaction, `**Voice connections:**\n${lines.join('\n')}`);
}

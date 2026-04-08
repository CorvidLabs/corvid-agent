/**
 * Discord voice command handlers.
 *
 * Handles `/voice join`, `/voice leave`, `/voice listen`, `/voice deafen`,
 * and `/voice status` subcommands.
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
    case 'listen':
      await handleVoiceListen(interaction, voiceManager);
      break;
    case 'deafen':
      await handleVoiceDeafen(interaction, voiceManager);
      break;
    case 'say':
      await handleVoiceSay(interaction, voiceManager);
      break;
    case 'shutup':
      await handleVoiceShutup(interaction, voiceManager);
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

async function handleVoiceListen(
  interaction: ChatInputCommandInteraction,
  voiceManager: VoiceConnectionManager,
): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await respondEphemeral(interaction, 'This command can only be used in a server.');
    return;
  }

  if (!voiceManager.isConnected(guildId)) {
    await respondEphemeral(interaction, 'Not connected to a voice channel. Use `/voice join` first.');
    return;
  }

  if (voiceManager.isListening(guildId)) {
    await respondEphemeral(interaction, 'Already listening and transcribing.');
    return;
  }

  // Post transcriptions to the text channel where this command was used
  const textChannelId = interaction.channelId;
  const started = voiceManager.startListening(guildId, textChannelId);
  if (started) {
    const info = voiceManager.getConnection(guildId);
    await respondToInteraction(
      interaction,
      `Now listening and transcribing audio in <#${info?.channelId}>. Transcriptions will be posted here.`,
    );
  } else {
    await respondEphemeral(interaction, 'Failed to start listening.');
  }
}

async function handleVoiceDeafen(
  interaction: ChatInputCommandInteraction,
  voiceManager: VoiceConnectionManager,
): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await respondEphemeral(interaction, 'This command can only be used in a server.');
    return;
  }

  const stopped = voiceManager.stopListening(guildId);
  if (stopped) {
    await respondToInteraction(interaction, 'Stopped listening. Still connected to voice channel.');
  } else {
    await respondEphemeral(interaction, 'Not currently listening.');
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
    const listening = voiceManager.isListening(c.guildId);
    const speaking = voiceManager.isSpeaking(c.guildId);
    const labels: string[] = [];
    if (listening) labels.push('STT active');
    if (speaking) labels.push('TTS playing');
    const suffix = labels.length > 0 ? ` | ${labels.join(', ')}` : '';
    return `• <#${c.channelId}> — connected for ${duration}m${suffix}`;
  });

  await respondToInteraction(interaction, `**Voice connections:**\n${lines.join('\n')}`);
}

async function handleVoiceSay(
  interaction: ChatInputCommandInteraction,
  voiceManager: VoiceConnectionManager,
): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await respondEphemeral(interaction, 'This command can only be used in a server.');
    return;
  }

  if (!voiceManager.isConnected(guildId)) {
    await respondEphemeral(interaction, 'Not connected to a voice channel. Use `/voice join` first.');
    return;
  }

  const text = interaction.options.getString('text', true);
  if (!text.trim()) {
    await respondEphemeral(interaction, 'Please provide text to speak.');
    return;
  }

  if (text.length > 4096) {
    await respondEphemeral(interaction, 'Text too long (max 4096 characters).');
    return;
  }

  // Defer since TTS synthesis + playback takes time
  await interaction.deferReply();

  try {
    await voiceManager.speak(guildId, text);
    const info = voiceManager.getConnection(guildId);
    const truncated = text.length > 100 ? `${text.substring(0, 100)}…` : text;
    await interaction.editReply(`Speaking in <#${info?.channelId}>: ${truncated}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await interaction.editReply(`TTS failed: ${msg}`);
  }
}

async function handleVoiceShutup(
  interaction: ChatInputCommandInteraction,
  voiceManager: VoiceConnectionManager,
): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await respondEphemeral(interaction, 'This command can only be used in a server.');
    return;
  }

  const stopped = voiceManager.stopSpeaking(guildId);
  if (stopped) {
    await respondToInteraction(interaction, 'Stopped speaking.');
  } else {
    await respondEphemeral(interaction, 'Not currently speaking.');
  }
}

/**
 * Discord admin command handlers.
 *
 * Handles `/admin channels|users|roles|mode|public|show` subcommands.
 * All changes persist to `discord_config` DB table and hot-reload within 30s.
 */

import type { Database } from 'bun:sqlite';
import type { ChatInputCommandInteraction } from 'discord.js';
import { recordAudit } from '../db/audit';
import { updateDiscordConfig } from '../db/discord-config';
import { respondToInteraction, respondToInteractionEmbed, respondToInteractionEmbeds } from './embeds';
import { type GuildCache, getRoleName, suggestRoleMappings } from './guild-api';
import type { DiscordBridgeConfig } from './types';

/** Discord snowflake IDs are purely numeric strings. */
const DISCORD_SNOWFLAKE_RE = /^\d{17,20}$/;

function levelName(level: number): string {
  return level === 0
    ? 'Blocked'
    : level === 1
      ? 'Basic'
      : level === 2
        ? 'Standard'
        : level === 3
          ? 'Admin'
          : `Level ${level}`;
}

export async function handleAdminCommand(
  db: Database,
  config: DiscordBridgeConfig,
  mutedUsers: Set<string>,
  threadSessionCount: number,
  interaction: ChatInputCommandInteraction,
  guildCache?: GuildCache,
  syncGuildData?: () => void,
): Promise<void> {
  const groupName = interaction.options.getSubcommandGroup(false);
  const subName = interaction.options.getSubcommand(false);

  if (!subName) {
    await respondToInteraction(interaction, 'Missing subcommand.');
    return;
  }

  // Direct subcommands (mode, public, show, setup, sync)
  if (!groupName) {
    if (subName === 'show') {
      await handleAdminShow(config, mutedUsers, threadSessionCount, interaction, guildCache);
      return;
    }

    if (subName === 'setup') {
      await handleAdminSetup(db, config, interaction, guildCache);
      return;
    }

    if (subName === 'sync') {
      syncGuildData?.();
      await respondToInteractionEmbed(interaction, {
        title: 'Guild Sync Triggered',
        description:
          'Fetching roles, channels, and server info from Discord...\n\nThis runs automatically every 5 minutes. Use `/admin show` to see the cached data.',
        color: 0x5865f2,
      });
      return;
    }

    if (subName === 'mode') {
      const mode = interaction.options.getString('value');
      if (mode !== 'chat' && mode !== 'work_intake') {
        await respondToInteraction(interaction, 'Invalid mode. Use `chat` or `work_intake`.');
        return;
      }
      updateDiscordConfig(db, 'mode', mode);
      config.mode = mode;
      recordAudit(
        db,
        'discord_config_update',
        interaction.user.id,
        'discord_config',
        'mode',
        JSON.stringify({ value: mode }),
      );
      await respondToInteractionEmbed(interaction, {
        title: 'Bridge Mode Updated',
        description: `Mode set to **${mode === 'chat' ? 'Chat' : 'Work Intake'}**`,
        color: 0x57f287,
        footer: { text: mode === 'chat' ? 'Messages route to agent sessions' : 'Messages create async work tasks' },
      });
      return;
    }

    if (subName === 'public') {
      const enabled = interaction.options.getBoolean('enabled') ?? false;
      updateDiscordConfig(db, 'public_mode', String(enabled));
      config.publicMode = enabled;
      recordAudit(
        db,
        'discord_config_update',
        interaction.user.id,
        'discord_config',
        'public_mode',
        JSON.stringify({ value: enabled }),
      );
      await respondToInteractionEmbed(interaction, {
        title: 'Public Mode Updated',
        description: enabled
          ? 'Public mode **enabled** — all users can interact (subject to role permissions)'
          : 'Public mode **disabled** — only allowed users can interact',
        color: enabled ? 0x57f287 : 0xed4245,
      });
      return;
    }

    await respondToInteraction(interaction, `Unknown admin subcommand: ${subName}`);
    return;
  }

  // Subcommand groups (channels, users, roles)
  switch (groupName) {
    case 'channels':
      await handleAdminChannels(db, config, interaction, subName);
      break;
    case 'users':
      await handleAdminUsers(db, config, interaction, subName);
      break;
    case 'roles':
      await handleAdminRoles(db, config, interaction, subName, guildCache);
      break;
    default:
      await respondToInteraction(interaction, `Unknown admin subcommand: ${groupName}`);
  }
}

async function handleAdminChannels(
  db: Database,
  config: DiscordBridgeConfig,
  interaction: ChatInputCommandInteraction,
  subName: string,
): Promise<void> {
  const current = config.additionalChannelIds ?? [];

  switch (subName) {
    case 'add': {
      const channelId = interaction.options.getChannel('channel')?.id ?? '';
      if (!channelId || !DISCORD_SNOWFLAKE_RE.test(channelId)) {
        await respondToInteraction(interaction, 'Invalid channel.');
        return;
      }
      if (channelId === config.channelId) {
        await respondToInteraction(interaction, 'That is already the primary channel.');
        return;
      }
      if (current.includes(channelId)) {
        await respondToInteraction(interaction, `<#${channelId}> is already monitored.`);
        return;
      }
      const updated = [...current, channelId];
      updateDiscordConfig(db, 'additional_channel_ids', updated.join(','));
      config.additionalChannelIds = updated;
      recordAudit(
        db,
        'discord_config_update',
        interaction.user.id,
        'discord_config',
        'additional_channel_ids',
        JSON.stringify({ action: 'add', channelId }),
      );
      await respondToInteractionEmbed(interaction, {
        title: 'Channel Added',
        description: `<#${channelId}> is now being monitored.\n\nTotal monitored: **${updated.length + 1}** (including primary)`,
        color: 0x57f287,
      });
      break;
    }
    case 'remove': {
      const channelId = interaction.options.getChannel('channel')?.id ?? '';
      if (!channelId || !DISCORD_SNOWFLAKE_RE.test(channelId)) {
        await respondToInteraction(interaction, 'Invalid channel.');
        return;
      }
      if (channelId === config.channelId) {
        await respondToInteraction(
          interaction,
          'Cannot remove the primary channel. Change `DISCORD_CHANNEL_ID` in your environment to change it.',
        );
        return;
      }
      if (!current.includes(channelId)) {
        await respondToInteraction(interaction, `<#${channelId}> is not in the monitored list.`);
        return;
      }
      const updated = current.filter((id) => id !== channelId);
      updateDiscordConfig(db, 'additional_channel_ids', updated.join(','));
      config.additionalChannelIds = updated;
      recordAudit(
        db,
        'discord_config_update',
        interaction.user.id,
        'discord_config',
        'additional_channel_ids',
        JSON.stringify({ action: 'remove', channelId }),
      );
      await respondToInteractionEmbed(interaction, {
        title: 'Channel Removed',
        description: `<#${channelId}> removed from monitoring.\n\nTotal monitored: **${updated.length + 1}** (including primary)`,
        color: 0xed4245,
      });
      break;
    }
    case 'list': {
      const allChannels = [`<#${config.channelId}> *(primary)*`, ...current.map((id) => `<#${id}>`)];
      await respondToInteractionEmbed(interaction, {
        title: 'Monitored Channels',
        description: allChannels.join('\n') || 'No channels configured.',
        color: 0x5865f2,
        footer: { text: `${allChannels.length} channel${allChannels.length === 1 ? '' : 's'} total` },
      });
      break;
    }
  }
}

async function handleAdminUsers(
  db: Database,
  config: DiscordBridgeConfig,
  interaction: ChatInputCommandInteraction,
  subName: string,
): Promise<void> {
  const current = [...config.allowedUserIds];

  switch (subName) {
    case 'add': {
      const userId = interaction.options.getUser('user')?.id ?? '';
      if (!userId || !DISCORD_SNOWFLAKE_RE.test(userId)) {
        await respondToInteraction(interaction, 'Invalid user.');
        return;
      }
      if (current.includes(userId)) {
        await respondToInteraction(interaction, `<@${userId}> is already on the allow list.`);
        return;
      }
      const updated = [...current, userId];
      updateDiscordConfig(db, 'allowed_user_ids', updated.join(','));
      config.allowedUserIds = updated;
      recordAudit(
        db,
        'discord_config_update',
        interaction.user.id,
        'discord_config',
        'allowed_user_ids',
        JSON.stringify({ action: 'add', userId }),
      );
      await respondToInteractionEmbed(interaction, {
        title: 'User Added',
        description: `<@${userId}> added to the allow list.\n\nTotal allowed: **${updated.length}**`,
        color: 0x57f287,
      });
      break;
    }
    case 'remove': {
      const userId = interaction.options.getUser('user')?.id ?? '';
      if (!userId || !DISCORD_SNOWFLAKE_RE.test(userId)) {
        await respondToInteraction(interaction, 'Invalid user.');
        return;
      }
      if (!current.includes(userId)) {
        await respondToInteraction(interaction, `<@${userId}> is not on the allow list.`);
        return;
      }
      const updated = current.filter((id) => id !== userId);
      updateDiscordConfig(db, 'allowed_user_ids', updated.join(','));
      config.allowedUserIds = updated;
      recordAudit(
        db,
        'discord_config_update',
        interaction.user.id,
        'discord_config',
        'allowed_user_ids',
        JSON.stringify({ action: 'remove', userId }),
      );
      await respondToInteractionEmbed(interaction, {
        title: 'User Removed',
        description: `<@${userId}> removed from the allow list.\n\nTotal allowed: **${updated.length}**`,
        color: 0xed4245,
      });
      break;
    }
    case 'list': {
      const userLines =
        current.length > 0
          ? current.map((id) => `<@${id}>`).join('\n')
          : '_No users on allow list — all users have access (legacy mode with empty list)_';
      await respondToInteractionEmbed(interaction, {
        title: 'Allowed Users',
        description: userLines,
        color: 0x5865f2,
        footer: {
          text: `${current.length} user${current.length === 1 ? '' : 's'} · ${config.publicMode ? 'Public mode (roles take precedence)' : 'Legacy mode (allow list enforced)'}`,
        },
      });
      break;
    }
  }
}

async function handleAdminRoles(
  db: Database,
  config: DiscordBridgeConfig,
  interaction: ChatInputCommandInteraction,
  subName: string,
  guildCache?: GuildCache,
): Promise<void> {
  const current = { ...(config.rolePermissions ?? {}) };
  const cachedRoles = guildCache?.roles ?? [];

  switch (subName) {
    case 'set': {
      const roleId = interaction.options.getRole('role')?.id ?? '';
      const level = interaction.options.getInteger('level') ?? -1;
      if (!roleId || !DISCORD_SNOWFLAKE_RE.test(roleId)) {
        await respondToInteraction(interaction, 'Invalid role.');
        return;
      }
      if (level < 0 || level > 3 || !Number.isInteger(level)) {
        await respondToInteraction(interaction, 'Permission level must be 0-3.');
        return;
      }
      current[roleId] = level;
      const json = JSON.stringify(current);
      updateDiscordConfig(db, 'role_permissions', json);
      config.rolePermissions = current;
      const roleName = getRoleName(cachedRoles, roleId);
      recordAudit(
        db,
        'discord_config_update',
        interaction.user.id,
        'discord_config',
        'role_permissions',
        JSON.stringify({ action: 'set', roleId, roleName, level }),
      );
      await respondToInteractionEmbed(interaction, {
        title: 'Role Permission Set',
        description: `<@&${roleId}> → **${levelName(level)}** (${level})`,
        color: 0x57f287,
        footer: {
          text: `${Object.keys(current).length} role mapping${Object.keys(current).length === 1 ? '' : 's'} configured`,
        },
      });
      break;
    }
    case 'remove': {
      const roleId = interaction.options.getRole('role')?.id ?? '';
      if (!roleId || !DISCORD_SNOWFLAKE_RE.test(roleId)) {
        await respondToInteraction(interaction, 'Invalid role.');
        return;
      }
      if (!(roleId in current)) {
        await respondToInteraction(interaction, `<@&${roleId}> has no permission override.`);
        return;
      }
      delete current[roleId];
      const json = JSON.stringify(current);
      updateDiscordConfig(db, 'role_permissions', json);
      config.rolePermissions = current;
      recordAudit(
        db,
        'discord_config_update',
        interaction.user.id,
        'discord_config',
        'role_permissions',
        JSON.stringify({ action: 'remove', roleId }),
      );
      await respondToInteractionEmbed(interaction, {
        title: 'Role Permission Removed',
        description: `<@&${roleId}> permission override removed.\nUsers with this role will get the default level (**${levelName(config.defaultPermissionLevel ?? 1)}**).`,
        color: 0xed4245,
      });
      break;
    }
    case 'list': {
      const entries = Object.entries(current);
      const roleLines =
        entries.length > 0
          ? entries
              .map(([rid, lvl]) => {
                const name = getRoleName(cachedRoles, rid);
                const nameTag = name !== rid ? ` (${name})` : '';
                return `<@&${rid}>${nameTag} → **${levelName(lvl)}** (${lvl})`;
              })
              .join('\n')
          : '_No role permissions configured_';

      // Show unmapped server roles if guild cache is available
      const unmappedRoles = cachedRoles.filter(
        (r) => !(r.id in current) && !r.managed && r.id !== config.guildId, // skip @everyone
      );
      const unmappedField =
        unmappedRoles.length > 0
          ? unmappedRoles
              .sort((a, b) => b.position - a.position)
              .slice(0, 15)
              .map((r) => `<@&${r.id}> (${r.name})`)
              .join('\n')
          : null;

      const fields = [
        {
          name: 'Default Level',
          value: `**${levelName(config.defaultPermissionLevel ?? 1)}** (${config.defaultPermissionLevel ?? 1})`,
          inline: true,
        },
        {
          name: 'Public Mode',
          value: config.publicMode ? 'Enabled' : 'Disabled',
          inline: true,
        },
      ];
      if (unmappedField) {
        fields.push({
          name: `Unmapped Roles (${unmappedRoles.length})`,
          value: unmappedField.slice(0, 1024),
          inline: false,
        });
      }

      await respondToInteractionEmbed(interaction, {
        title: 'Role Permissions',
        description: roleLines,
        color: 0x5865f2,
        fields,
        footer: {
          text:
            entries.length > 0
              ? `${entries.length} mapping${entries.length === 1 ? '' : 's'} · ${cachedRoles.length} server roles cached`
              : 'Use /admin roles set or /admin setup to add mappings',
        },
      });
      break;
    }
  }
}

async function handleAdminShow(
  config: DiscordBridgeConfig,
  mutedUsers: Set<string>,
  threadSessionCount: number,
  interaction: ChatInputCommandInteraction,
  guildCache?: GuildCache,
): Promise<void> {
  const cachedRoles = guildCache?.roles ?? [];
  const guildInfo = guildCache?.info;

  const channels = [
    `<#${config.channelId}> *(primary)*`,
    ...(config.additionalChannelIds ?? []).map((id) => `<#${id}>`),
  ];
  const users = config.allowedUserIds.length > 0 ? config.allowedUserIds.map((id) => `<@${id}>`).join(', ') : '_none_';
  const roleEntries = Object.entries(config.rolePermissions ?? {});
  const roles =
    roleEntries.length > 0
      ? roleEntries
          .map(([rid, lvl]) => {
            const name = getRoleName(cachedRoles, rid);
            const nameTag = name !== rid ? ` (${name})` : '';
            return `<@&${rid}>${nameTag}=${levelName(lvl)}`;
          })
          .join(', ')
      : '_none_';

  const fields = [
    {
      name: 'Mode',
      value: config.mode === 'work_intake' ? 'Work Intake' : 'Chat',
      inline: true,
    },
    {
      name: 'Public Mode',
      value: config.publicMode ? 'Enabled' : 'Disabled',
      inline: true,
    },
    {
      name: 'Default Permission',
      value: `${levelName(config.defaultPermissionLevel ?? 1)} (${config.defaultPermissionLevel ?? 1})`,
      inline: true,
    },
    {
      name: `Channels (${channels.length})`,
      value: channels.join('\n').slice(0, 1024),
      inline: false,
    },
    {
      name: 'Allowed Users',
      value: users.slice(0, 1024),
      inline: false,
    },
    {
      name: 'Role Permissions',
      value: roles.slice(0, 1024),
      inline: false,
    },
    {
      name: 'Muted Users',
      value:
        mutedUsers.size > 0
          ? [...mutedUsers]
              .map((id) => `<@${id}>`)
              .join(', ')
              .slice(0, 1024)
          : '_none_',
      inline: false,
    },
  ];

  // Add guild info if available
  if (guildInfo) {
    fields.push({
      name: 'Server Info',
      value: [
        `**${guildInfo.name}**`,
        guildInfo.description ? `_${guildInfo.description}_` : null,
        guildInfo.memberCount ? `Members: ~${guildInfo.memberCount}` : null,
        guildInfo.rulesChannelId ? `Rules: <#${guildInfo.rulesChannelId}>` : null,
        `Roles cached: ${cachedRoles.length}`,
        `Channels cached: ${guildCache?.channels?.length ?? 0}`,
      ]
        .filter(Boolean)
        .join('\n'),
      inline: false,
    });
  }

  await respondToInteractionEmbed(interaction, {
    title: 'Bot Configuration',
    color: 0x5865f2,
    fields,
    footer: { text: `Active sessions: ${threadSessionCount} · Guild sync every 5m · Config reload every 30s` },
  });
}

// ─── /admin setup ─────────────────────────────────────────────────────────

/**
 * Auto-configure role permissions by scanning the guild's roles.
 * Uses heuristics to suggest mappings, applies them, and enables public mode.
 */
async function handleAdminSetup(
  db: Database,
  config: DiscordBridgeConfig,
  interaction: ChatInputCommandInteraction,
  guildCache?: GuildCache,
): Promise<void> {
  const cachedRoles = guildCache?.roles ?? [];
  const guildInfo = guildCache?.info;
  const guildId = config.guildId;

  if (!guildId) {
    await respondToInteractionEmbed(interaction, {
      title: 'Setup Failed',
      description: 'No guild ID configured. Set `DISCORD_GUILD_ID` in your environment.',
      color: 0xed4245,
    });
    return;
  }

  if (cachedRoles.length === 0) {
    await respondToInteractionEmbed(interaction, {
      title: 'Setup Failed',
      description: 'No guild roles cached yet. Try `/admin sync` first, then run setup again.',
      color: 0xed4245,
    });
    return;
  }

  // Generate suggestions
  const suggestions = suggestRoleMappings(cachedRoles, guildId);
  const suggestionEntries = Object.entries(suggestions);

  // Build the new role permissions (merge with existing)
  const merged = { ...(config.rolePermissions ?? {}) };
  let newCount = 0;
  for (const [roleId, { level }] of suggestionEntries) {
    if (!(roleId in merged)) {
      merged[roleId] = level;
      newCount++;
    }
  }

  // Apply role permissions
  const json = JSON.stringify(merged);
  updateDiscordConfig(db, 'role_permissions', json);
  config.rolePermissions = merged;

  // Enable public mode with BASIC default
  updateDiscordConfig(db, 'public_mode', 'true');
  config.publicMode = true;
  updateDiscordConfig(db, 'default_permission_level', '1');
  config.defaultPermissionLevel = 1;

  recordAudit(
    db,
    'discord_config_update',
    interaction.user.id,
    'discord_config',
    'setup',
    JSON.stringify({
      action: 'auto_setup',
      newMappings: newCount,
      totalMappings: Object.keys(merged).length,
      publicMode: true,
    }),
  );

  // Build response
  const mappingLines = Object.entries(merged)
    .sort(([, a], [, b]) => b - a) // sort by level descending
    .map(([rid, lvl]) => {
      const name = getRoleName(cachedRoles, rid);
      const suggestion = suggestions[rid];
      const tag = suggestion && !(rid in (config.rolePermissions ?? {})) ? ' *(auto)*' : '';
      return `<@&${rid}> (${name}) → **${levelName(lvl)}**${tag}`;
    });

  const embeds = [
    {
      title: 'Public Mode Setup Complete',
      description: [
        `Scanned **${cachedRoles.length}** server roles and configured permissions.`,
        '',
        `**${newCount}** new mapping${newCount === 1 ? '' : 's'} added (${Object.keys(merged).length} total).`,
        'Public mode is now **enabled** — all users can interact.',
        `Default permission: **${levelName(1)}** (chat only).`,
      ].join('\n'),
      color: 0x57f287,
    },
    {
      title: 'Role Mappings',
      description: mappingLines.join('\n').slice(0, 4000) || '_No mappings_',
      color: 0x5865f2,
      fields: [
        ...(guildInfo?.rulesChannelId
          ? [
              {
                name: 'Server Rules Channel',
                value: `<#${guildInfo.rulesChannelId}>`,
                inline: true,
              },
            ]
          : []),
      ],
      footer: { text: 'Use /admin roles set to adjust individual mappings · /admin public false to disable' },
    },
  ];

  await respondToInteractionEmbeds(interaction, embeds);
}

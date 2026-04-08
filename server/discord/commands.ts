/**
 * Discord slash command registration and interaction dispatch.
 *
 * Builds command definitions using SlashCommandBuilder (type-safe, auto-validated),
 * registers them via DiscordRestClient.putCommands(), and dispatches interaction
 * events to the appropriate handler.
 *
 * Command handler implementations are in ./command-handlers/.
 * Part of the discord.js migration (#1800).
 */

import type { Database } from 'bun:sqlite';
import { GuildMember, PermissionFlagsBits, SlashCommandBuilder, type BaseInteraction, type ChatInputCommandInteraction } from 'discord.js';
import type { BuddyService } from '../buddy/service';
import type { DeliveryTracker } from '../lib/delivery-tracker';
import { createLogger } from '../lib/logger';
import type { ProcessManager } from '../process/manager';
import type { WorkTaskService } from '../work/service';
import { handleAdminCommand } from './admin-commands';
import { handleAgentPersonaCommand, handleAgentSkillCommand } from './command-handlers/agent-config-commands';
import { handleAutocomplete } from './command-handlers/autocomplete-handler';
import { handleComponentInteraction } from './command-handlers/component-handlers';
import {
  handleAgentsCommand,
  handleConfigCommand,
  handleDashboardCommand,
  handleHelpCommand,
  handleQuickstartCommand,
  handleStatusCommand,
  handleTasksCommand,
  handleToolsCommand,
} from './command-handlers/info-commands';
import { handleMessageCommand } from './command-handlers/message-commands';
import { handleCouncilCommand, handleMuteCommand, handleUnmuteCommand } from './command-handlers/moderation-commands';
import { handleScheduleCommand } from './command-handlers/schedule-commands';

// Command handler imports
import { handleSessionCommand, handleWorkCommand } from './command-handlers/session-commands';
import { handleVoiceCommand } from './command-handlers/voice-commands';
import type { VoiceConnectionManager } from './voice/connection-manager';
import { respondEphemeral, respondToInteraction } from './embeds';
import type { GuildCache } from './guild-api';
import type { MentionSessionInfo } from './message-handler';
import { checkRateLimit, resolvePermissionLevel } from './permissions';
import { getRestClient } from './rest-client';
import type { ThreadCallbackInfo, ThreadSessionInfo } from './thread-manager';
import type { DiscordBridgeConfig } from './types';
import { PermissionLevel } from './types';

const log = createLogger('DiscordCommands');

/**
 * Build all slash command definitions using discord.js SlashCommandBuilder.
 *
 * Using builders instead of raw JSON objects provides:
 * - Compile-time type checking on option types and constraints
 * - Automatic validation (option count limits, name length, etc.)
 * - Self-documenting intent — option types are explicit method names
 */
function buildCommands(): ReturnType<SlashCommandBuilder['toJSON']>[] {
  return [
    // ─── /session ────────────────────────────────────────────────────────────
    new SlashCommandBuilder()
      .setName('session')
      .setDescription('Start a new conversation thread with an agent')
      .addStringOption((o) =>
        o.setName('agent').setDescription('Agent to start the session with').setRequired(true).setAutocomplete(true),
      )
      .addStringOption((o) => o.setName('topic').setDescription('Topic for the conversation').setRequired(true))
      .addStringOption((o) =>
        o
          .setName('project')
          .setDescription('Project to work on (defaults to agent default)')
          .setRequired(false)
          .setAutocomplete(true),
      )
      .addStringOption((o) =>
        o
          .setName('buddy')
          .setDescription('Pair with a buddy agent for end-of-session review (optional)')
          .setRequired(false)
          .setAutocomplete(true),
      )
      .addIntegerOption((o) =>
        o.setName('rounds').setDescription('Max buddy review rounds (default: 3)').setRequired(false),
      )
      .toJSON(),

    // ─── /work ───────────────────────────────────────────────────────────────
    new SlashCommandBuilder()
      .setName('work')
      .setDescription('Create a work task (branch + PR)')
      .addStringOption((o) =>
        o.setName('description').setDescription('What the agent should work on').setRequired(true),
      )
      .addStringOption((o) =>
        o.setName('agent').setDescription('Agent to assign the task to').setRequired(false).setAutocomplete(true),
      )
      .addStringOption((o) =>
        o
          .setName('project')
          .setDescription('Project to work on (defaults to agent default)')
          .setRequired(false)
          .setAutocomplete(true),
      )
      .addStringOption((o) =>
        o
          .setName('buddy')
          .setDescription('Pair with a buddy agent for review (optional)')
          .setRequired(false)
          .setAutocomplete(true),
      )
      .addIntegerOption((o) =>
        o.setName('rounds').setDescription('Max buddy review rounds (default: 3)').setRequired(false),
      )
      .toJSON(),

    // ─── /message ────────────────────────────────────────────────────────────
    new SlashCommandBuilder()
      .setName('message')
      .setDescription('Quick agent chat (restricted tools). + add project, buddy, rounds.')
      .addStringOption((o) =>
        o.setName('agent').setDescription('Agent to talk to').setRequired(true).setAutocomplete(true),
      )
      .addStringOption((o) => o.setName('text').setDescription('Your message').setRequired(true))
      .addStringOption((o) =>
        o
          .setName('project')
          .setDescription('Project context (defaults to agent default)')
          .setRequired(false)
          .setAutocomplete(true),
      )
      .addStringOption((o) =>
        o
          .setName('buddy')
          .setDescription('Pair with a buddy agent for review (optional)')
          .setRequired(false)
          .setAutocomplete(true),
      )
      .addIntegerOption((o) =>
        o.setName('rounds').setDescription('Max buddy review rounds (default: 3)').setRequired(false),
      )
      .toJSON(),

    // ─── /agents ─────────────────────────────────────────────────────────────
    new SlashCommandBuilder().setName('agents').setDescription('List all available agents').toJSON(),

    // ─── /status ─────────────────────────────────────────────────────────────
    new SlashCommandBuilder().setName('status').setDescription('Show system status and key metrics').toJSON(),

    // ─── /dashboard ──────────────────────────────────────────────────────────
    new SlashCommandBuilder()
      .setName('dashboard')
      .setDescription('Comprehensive system overview with agents, tasks, and schedules')
      .toJSON(),

    // ─── /tasks ──────────────────────────────────────────────────────────────
    new SlashCommandBuilder().setName('tasks').setDescription('View active work tasks and queue status').toJSON(),

    // ─── /schedule ───────────────────────────────────────────────────────────
    new SlashCommandBuilder()
      .setName('schedule')
      .setDescription('Manage scheduled actions')
      .addSubcommand((sub) => sub.setName('list').setDescription('Show all schedules and their status'))
      .addSubcommand((sub) =>
        sub
          .setName('create')
          .setDescription('Create a new scheduled action')
          .addStringOption((o) => o.setName('name').setDescription('Schedule name').setRequired(true))
          .addStringOption((o) =>
            o.setName('agent').setDescription('Agent to run the schedule').setRequired(false).setAutocomplete(true),
          )
          .addStringOption((o) =>
            o.setName('cron').setDescription('Cron expression (e.g. "0 9 * * *" for 9am daily)').setRequired(false),
          )
          .addStringOption((o) =>
            o
              .setName('action_type')
              .setDescription('Action type')
              .setRequired(false)
              .addChoices(
                { name: 'Discord Post', value: 'discord_post' },
                { name: 'Daily Review', value: 'daily_review' },
                { name: 'Status Check-in', value: 'status_checkin' },
                { name: 'Codebase Review', value: 'codebase_review' },
                { name: 'Dependency Audit', value: 'dependency_audit' },
                { name: 'PR Review', value: 'review_prs' },
              ),
          )
          .addStringOption((o) =>
            o.setName('channel').setDescription('Discord channel ID for discord_post actions').setRequired(false),
          )
          .addStringOption((o) =>
            o
              .setName('template')
              .setDescription('Pipeline template ID (use /schedule templates to see options)')
              .setRequired(false),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName('pause')
          .setDescription('Pause a schedule')
          .addStringOption((o) =>
            o.setName('schedule').setDescription('Schedule ID (use /schedule list to find)').setRequired(true),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName('resume')
          .setDescription('Resume a paused schedule')
          .addStringOption((o) => o.setName('schedule').setDescription('Schedule ID').setRequired(true)),
      )
      .addSubcommand((sub) =>
        sub
          .setName('delete')
          .setDescription('Delete a schedule permanently')
          .addStringOption((o) => o.setName('schedule').setDescription('Schedule ID').setRequired(true)),
      )
      .addSubcommand((sub) => sub.setName('templates').setDescription('List available pipeline templates'))
      .toJSON(),

    // ─── /config (admin-only) ─────────────────────────────────────────────────
    new SlashCommandBuilder()
      .setName('config')
      .setDescription('Show current bot configuration (non-sensitive)')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .toJSON(),

    // ─── /council (admin-only) ────────────────────────────────────────────────
    new SlashCommandBuilder()
      .setName('council')
      .setDescription('Launch a council deliberation on a topic')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addStringOption((o) => o.setName('topic').setDescription('The topic to deliberate on').setRequired(true))
      .addStringOption((o) =>
        o
          .setName('council_name')
          .setDescription('Pick an existing council (leave blank to use agents instead)')
          .setRequired(false)
          .setAutocomplete(true),
      )
      .addStringOption((o) =>
        o
          .setName('agents')
          .setDescription('Comma-separated agent names for ad-hoc council (e.g. "Corvid,Buddy")')
          .setRequired(false),
      )
      .addStringOption((o) =>
        o
          .setName('project')
          .setDescription('Project context (defaults to first available)')
          .setRequired(false)
          .setAutocomplete(true),
      )
      .toJSON(),

    // ─── /quickstart ─────────────────────────────────────────────────────────
    new SlashCommandBuilder().setName('quickstart').setDescription('Guided walkthrough for new users').toJSON(),

    // ─── /help ───────────────────────────────────────────────────────────────
    new SlashCommandBuilder().setName('help').setDescription('Show available commands and usage').toJSON(),

    // ─── /tools ──────────────────────────────────────────────────────────────
    new SlashCommandBuilder()
      .setName('tools')
      .setDescription('Browse the MCP tool catalog')
      .addStringOption((o) =>
        o
          .setName('category')
          .setDescription('Filter by category')
          .setRequired(false)
          .addChoices(
            { name: 'Communication & Memory', value: 'communication' },
            { name: 'Agent Management', value: 'agents' },
            { name: 'Session & Work', value: 'work' },
            { name: 'Research', value: 'research' },
            { name: 'GitHub', value: 'github' },
            { name: 'Notifications & Reputation', value: 'notifications' },
            { name: 'Code Tools', value: 'code' },
          ),
      )
      .toJSON(),

    // ─── /voice (admin-only) ──────────────────────────────────────────────────
    new SlashCommandBuilder()
      .setName('voice')
      .setDescription('Manage voice channel presence')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addSubcommand((sub) =>
        sub
          .setName('join')
          .setDescription('Join a voice channel (listen only)')
          .addChannelOption((o) => o.setName('channel').setDescription('Voice channel to join').setRequired(true)),
      )
      .addSubcommand((sub) => sub.setName('leave').setDescription('Leave the current voice channel'))
      .addSubcommand((sub) => sub.setName('status').setDescription('Show current voice connection status'))
      .addSubcommand((sub) => sub.setName('listen').setDescription('Start transcribing voice audio (STT)'))
      .addSubcommand((sub) => sub.setName('deafen').setDescription('Stop transcribing voice audio'))
      .toJSON(),

    // ─── /mute (admin-only) ───────────────────────────────────────────────────
    new SlashCommandBuilder()
      .setName('mute')
      .setDescription('Mute a user from bot interactions (admin only)')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addUserOption((o) => o.setName('user').setDescription('The user to mute').setRequired(true))
      .toJSON(),

    // ─── /unmute (admin-only) ─────────────────────────────────────────────────
    new SlashCommandBuilder()
      .setName('unmute')
      .setDescription('Unmute a user (admin only)')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addUserOption((o) => o.setName('user').setDescription('The user to unmute').setRequired(true))
      .toJSON(),

    // ─── /admin (admin-only) ──────────────────────────────────────────────────
    new SlashCommandBuilder()
      .setName('admin')
      .setDescription('Manage bot configuration (admin only)')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      // Subcommand groups
      .addSubcommandGroup((grp) =>
        grp
          .setName('channels')
          .setDescription('Manage monitored channels')
          .addSubcommand((sub) =>
            sub
              .setName('add')
              .setDescription('Add a channel to the monitored list')
              .addChannelOption((o) => o.setName('channel').setDescription('The channel to add').setRequired(true)),
          )
          .addSubcommand((sub) =>
            sub
              .setName('remove')
              .setDescription('Remove a channel from the monitored list')
              .addChannelOption((o) => o.setName('channel').setDescription('The channel to remove').setRequired(true)),
          )
          .addSubcommand((sub) => sub.setName('list').setDescription('Show all monitored channels')),
      )
      .addSubcommandGroup((grp) =>
        grp
          .setName('users')
          .setDescription('Manage allowed users')
          .addSubcommand((sub) =>
            sub
              .setName('add')
              .setDescription('Add a user to the allow list')
              .addUserOption((o) => o.setName('user').setDescription('The user to allow').setRequired(true)),
          )
          .addSubcommand((sub) =>
            sub
              .setName('remove')
              .setDescription('Remove a user from the allow list')
              .addUserOption((o) => o.setName('user').setDescription('The user to remove').setRequired(true)),
          )
          .addSubcommand((sub) => sub.setName('list').setDescription('Show all allowed users')),
      )
      .addSubcommandGroup((grp) =>
        grp
          .setName('roles')
          .setDescription('Manage role permissions')
          .addSubcommand((sub) =>
            sub
              .setName('set')
              .setDescription('Set permission level for a role')
              .addRoleOption((o) => o.setName('role').setDescription('The role to configure').setRequired(true))
              .addIntegerOption((o) =>
                o
                  .setName('level')
                  .setDescription('Permission level (0=blocked, 1=basic, 2=standard, 3=admin)')
                  .setRequired(true)
                  .addChoices(
                    { name: 'Blocked (0)', value: 0 },
                    { name: 'Basic (1) — chat, @mention', value: 1 },
                    { name: 'Standard (2) — slash commands', value: 2 },
                    { name: 'Admin (3) — full access', value: 3 },
                  ),
              ),
          )
          .addSubcommand((sub) =>
            sub
              .setName('remove')
              .setDescription('Remove permission override for a role')
              .addRoleOption((o) => o.setName('role').setDescription('The role to remove').setRequired(true)),
          )
          .addSubcommand((sub) => sub.setName('list').setDescription('Show all role permission mappings')),
      )
      // Plain subcommands (not in a group)
      .addSubcommand((sub) =>
        sub
          .setName('mode')
          .setDescription('Set the bridge mode')
          .addStringOption((o) =>
            o
              .setName('value')
              .setDescription('Bridge mode')
              .setRequired(true)
              .addChoices(
                { name: 'Chat — interactive conversations', value: 'chat' },
                { name: 'Work Intake — fire-and-forget tasks', value: 'work_intake' },
              ),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName('public')
          .setDescription('Toggle public mode (role-based access for all users)')
          .addBooleanOption((o) =>
            o.setName('enabled').setDescription('Enable or disable public mode').setRequired(true),
          ),
      )
      .addSubcommand((sub) => sub.setName('show').setDescription('Show current bot configuration'))
      .addSubcommand((sub) => sub.setName('setup').setDescription('Auto-configure roles and enable public mode'))
      .addSubcommand((sub) => sub.setName('sync').setDescription('Re-sync server roles and channels from Discord'))
      .toJSON(),

    // ─── /agent-skill (admin-only) ────────────────────────────────────────────
    new SlashCommandBuilder()
      .setName('agent-skill')
      .setDescription('Manage skill bundles assigned to an agent')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addSubcommand((sub) =>
        sub
          .setName('add')
          .setDescription('Assign a skill bundle to an agent')
          .addStringOption((o) =>
            o.setName('agent').setDescription('Agent to configure').setRequired(true).setAutocomplete(true),
          )
          .addStringOption((o) =>
            o.setName('skill').setDescription('Skill bundle to assign').setRequired(true).setAutocomplete(true),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName('remove')
          .setDescription('Unassign a skill bundle from an agent')
          .addStringOption((o) =>
            o.setName('agent').setDescription('Agent to configure').setRequired(true).setAutocomplete(true),
          )
          .addStringOption((o) =>
            o.setName('skill').setDescription('Skill bundle to remove').setRequired(true).setAutocomplete(true),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName('list')
          .setDescription('Show skill bundles assigned to an agent')
          .addStringOption((o) =>
            o.setName('agent').setDescription('Agent to inspect').setRequired(true).setAutocomplete(true),
          ),
      )
      .toJSON(),

    // ─── /agent-persona (admin-only) ──────────────────────────────────────────
    new SlashCommandBuilder()
      .setName('agent-persona')
      .setDescription('Manage personas assigned to an agent')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addSubcommand((sub) =>
        sub
          .setName('add')
          .setDescription('Assign a persona to an agent')
          .addStringOption((o) =>
            o.setName('agent').setDescription('Agent to configure').setRequired(true).setAutocomplete(true),
          )
          .addStringOption((o) =>
            o.setName('persona').setDescription('Persona to assign').setRequired(true).setAutocomplete(true),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName('remove')
          .setDescription('Unassign a persona from an agent')
          .addStringOption((o) =>
            o.setName('agent').setDescription('Agent to configure').setRequired(true).setAutocomplete(true),
          )
          .addStringOption((o) =>
            o.setName('persona').setDescription('Persona to remove').setRequired(true).setAutocomplete(true),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName('list')
          .setDescription('Show personas assigned to an agent')
          .addStringOption((o) =>
            o.setName('agent').setDescription('Agent to inspect').setRequired(true).setAutocomplete(true),
          ),
      )
      .toJSON(),
  ];
}

export async function registerSlashCommands(_db: Database, config: DiscordBridgeConfig): Promise<void> {
  const appId = config.appId;
  if (!appId) return;

  const commands = buildCommands();

  try {
    const restClient = getRestClient();
    const registered = await restClient.putCommands(appId, config.guildId, commands);
    log.info('Discord slash commands registered', {
      count: registered.length,
      commands: registered.map((c) => c.name),
      scope: config.guildId ? 'guild' : 'global',
    });
  } catch (err) {
    log.error('Failed to register Discord slash commands', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Context needed by the interaction handler to delegate to bridge methods. */
export interface InteractionContext {
  db: Database;
  config: DiscordBridgeConfig;
  processManager: ProcessManager;
  workTaskService: WorkTaskService | null;
  delivery: DeliveryTracker;
  mutedUsers: Set<string>;
  threadSessions: Map<string, ThreadSessionInfo>;
  threadCallbacks: Map<string, ThreadCallbackInfo>;
  threadLastActivity: Map<string, number>;
  createStandaloneThread: (channelId: string, name: string) => Promise<string | null>;
  subscribeForResponseWithEmbed: (
    sessionId: string,
    threadId: string,
    agentName: string,
    agentModel: string,
    projectName?: string,
    displayColor?: string | null,
    displayIcon?: string | null,
    avatarUrl?: string | null,
  ) => void;
  sendTaskResult: (
    channelId: string,
    task: import('../../shared/types/work-tasks').WorkTask,
    mentionUserId?: string,
  ) => Promise<void>;
  muteUser: (userId: string) => void;
  unmuteUser: (userId: string) => void;
  /** Mention session map for /message command inline replies. */
  mentionSessions: Map<string, MentionSessionInfo>;
  /** Subscribe for adaptive inline response (used by /message command). */
  subscribeForInlineResponse: (
    sessionId: string,
    channelId: string,
    replyToMessageId: string,
    agentName: string,
    agentModel: string,
    onBotMessage?: (botMessageId: string) => void,
    projectName?: string,
    displayColor?: string | null,
    displayIcon?: string | null,
    avatarUrl?: string | null,
  ) => void;
  /** Cached guild roles/channels/info from Discord API. */
  guildCache: GuildCache;
  /** Trigger a guild data re-sync from Discord API. */
  syncGuildData: () => void;
  /** Buddy service for post-response review (optional — may not be initialized). */
  buddyService?: BuddyService | null;
  /** Shared per-user timestamp map for rate limiting (same map used by channel messages). */
  userMessageTimestamps: Map<string, number[]>;
  /** Rate limit window in milliseconds. */
  rateLimitWindowMs: number;
  /** Max messages allowed per window. */
  rateLimitMaxMessages: number;
  /** Voice connection manager (optional — only present when voice is enabled). */
  voiceManager?: VoiceConnectionManager | null;
}

/**
 * Unified command handler signature — every entry in COMMAND_HANDLERS receives the full
 * resolved context so handlers can pick exactly what they need.
 */
type CommandHandler = (
  ctx: InteractionContext,
  interaction: ChatInputCommandInteraction,
  permLevel: number,
  userId: string,
) => Promise<void>;

/**
 * Command registration entry — pairs a handler with a declarative minimum permission level.
 *
 * When `minPermission` is set, the dispatcher rejects callers below that level before
 * invoking the handler. Handlers do not need to repeat the check internally.
 * Commands with no `minPermission` are available to all non-blocked users.
 * Commands with mixed sub-command permissions (e.g. /schedule) keep those checks in the handler.
 */
type CommandEntry = {
  handler: CommandHandler;
  minPermission?: number;
};

/**
 * Map-based slash command dispatcher.
 *
 * Adding a new command: add one entry here. No other file needs to change.
 * O(1) lookup replaces the previous linear switch statement.
 *
 * Declare `minPermission` to enforce a permission floor before the handler runs.
 */
const COMMAND_HANDLERS = new Map<string, CommandEntry>([
  [
    'session',
    {
      handler: (ctx, interaction, permLevel, userId) =>
        handleSessionCommand(ctx, interaction, permLevel, userId),
      minPermission: PermissionLevel.STANDARD,
    },
  ],
  [
    'message',
    {
      handler: (ctx, interaction, permLevel, userId) =>
        handleMessageCommand(ctx, interaction, permLevel, userId),
      minPermission: PermissionLevel.BASIC,
    },
  ],
  [
    'work',
    {
      handler: (ctx, interaction, permLevel, userId) =>
        handleWorkCommand(ctx, interaction, permLevel, userId),
      minPermission: PermissionLevel.STANDARD,
    },
  ],
  ['agents', { handler: (ctx, interaction) => handleAgentsCommand(ctx, interaction) }],
  ['status', { handler: (ctx, interaction) => handleStatusCommand(ctx, interaction) }],
  ['dashboard', { handler: (ctx, interaction) => handleDashboardCommand(ctx, interaction) }],
  ['tasks', { handler: (ctx, interaction) => handleTasksCommand(ctx, interaction) }],
  ['schedule', { handler: (ctx, interaction, permLevel) => handleScheduleCommand(ctx, interaction, permLevel) }],
  [
    'config',
    {
      handler: (ctx, interaction, permLevel) => handleConfigCommand(ctx, interaction, permLevel),
      minPermission: PermissionLevel.ADMIN,
    },
  ],
  [
    'council',
    {
      handler: (ctx, interaction, permLevel, userId) => handleCouncilCommand(ctx, interaction, permLevel, userId),
      minPermission: PermissionLevel.ADMIN,
    },
  ],
  ['quickstart', { handler: (ctx, interaction) => handleQuickstartCommand(ctx, interaction) }],
  ['help', { handler: (_ctx, interaction) => handleHelpCommand(interaction) }],
  ['tools', { handler: (_ctx, interaction) => handleToolsCommand(interaction) }],
  [
    'mute',
    {
      handler: (ctx, interaction, permLevel, userId) => handleMuteCommand(ctx, interaction, permLevel, userId),
      minPermission: PermissionLevel.ADMIN,
    },
  ],
  [
    'unmute',
    {
      handler: (ctx, interaction, permLevel, userId) => handleUnmuteCommand(ctx, interaction, permLevel, userId),
      minPermission: PermissionLevel.ADMIN,
    },
  ],
  [
    'voice',
    {
      handler: async (ctx, interaction) => {
        if (!ctx.voiceManager) {
          await respondEphemeral(interaction, 'Voice is not available — Discord client not ready.');
          return;
        }
        await handleVoiceCommand(ctx, interaction, ctx.voiceManager);
      },
      minPermission: PermissionLevel.ADMIN,
    },
  ],
  [
    'admin',
    {
      handler: async (ctx, interaction) => {
        await handleAdminCommand(
          ctx.db,
          ctx.config,
          ctx.mutedUsers,
          ctx.threadSessions.size,
          interaction,
          ctx.guildCache,
          ctx.syncGuildData,
        );
      },
      minPermission: PermissionLevel.ADMIN,
    },
  ],
  [
    'agent-skill',
    {
      handler: (ctx, interaction, permLevel) => handleAgentSkillCommand(ctx, interaction, permLevel),
      minPermission: PermissionLevel.ADMIN,
    },
  ],
  [
    'agent-persona',
    {
      handler: (ctx, interaction, permLevel) => handleAgentPersonaCommand(ctx, interaction, permLevel),
      minPermission: PermissionLevel.ADMIN,
    },
  ],
]);

export async function handleInteraction(ctx: InteractionContext, interaction: BaseInteraction): Promise<void> {
  // Handle button/component interactions
  if (interaction.isMessageComponent()) {
    await handleComponentInteraction(ctx, interaction);
    return;
  }

  // Handle autocomplete interactions — query DB live so new agents/projects appear immediately
  if (interaction.isAutocomplete()) {
    await handleAutocomplete(ctx, interaction);
    return;
  }

  // Only handle chat input (slash) commands
  if (!interaction.isChatInputCommand()) return;

  const commandName = interaction.commandName;

  const userId = interaction.user.id;

  // Extract member roles for permission resolution
  const memberRoles: string[] = [];
  if (interaction.member) {
    const m = interaction.member;
    if (m.roles instanceof GuildMember || (typeof m.roles === 'object' && 'cache' in m.roles)) {
      memberRoles.push(...(m.roles as GuildMember['roles']).cache.keys());
    } else if (Array.isArray(m.roles)) {
      memberRoles.push(...(m.roles as string[]));
    }
  }

  // Role-based permission check
  const permLevel = resolvePermissionLevel(
    ctx.config,
    ctx.mutedUsers,
    userId,
    memberRoles,
    interaction.channelId ?? undefined,
  );
  if (permLevel <= PermissionLevel.BLOCKED) {
    await respondEphemeral(interaction, 'You do not have permission to use this bot.');
    return;
  }

  // Rate-limit slash commands using the same per-user timestamps as channel messages
  if (
    !checkRateLimit(
      ctx.config,
      ctx.userMessageTimestamps,
      userId,
      ctx.rateLimitWindowMs,
      ctx.rateLimitMaxMessages,
      permLevel,
    )
  ) {
    await respondEphemeral(interaction, 'You are sending commands too quickly. Please wait before trying again.');
    return;
  }

  const entry = COMMAND_HANDLERS.get(commandName);
  if (!entry) {
    await respondToInteraction(interaction, `Unknown command: ${commandName}`);
    return;
  }

  // Declarative permission middleware — rejects before the handler runs
  if (entry.minPermission !== undefined && permLevel < entry.minPermission) {
    await respondEphemeral(interaction, 'You do not have permission to use this command.');
    return;
  }

  await entry.handler(ctx, interaction, permLevel, userId);
}

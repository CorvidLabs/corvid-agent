/**
 * Discord slash command registration and interaction dispatch.
 *
 * Builds command definitions, registers them with Discord API,
 * and dispatches interaction events to the appropriate handler.
 *
 * Command handler implementations are in ./command-handlers/.
 */

import type { Database } from 'bun:sqlite';
import type { ProcessManager } from '../process/manager';
import type { WorkTaskService } from '../work/service';
import type {
    DiscordBridgeConfig,
    DiscordInteractionData,
} from './types';
import { InteractionType, PermissionLevel } from './types';
import { createLogger } from '../lib/logger';
import type { DeliveryTracker } from '../lib/delivery-tracker';
import { respondToInteraction } from './embeds';
import { resolvePermissionLevel } from './permissions';
import { handleAdminCommand } from './admin-commands';
import type { ThreadSessionInfo, ThreadCallbackInfo } from './thread-manager';

// Command handler imports
import { handleSessionCommand, handleWorkCommand } from './command-handlers/session-commands';
import {
    handleAgentsCommand,
    handleStatusCommand,
    handleDashboardCommand,
    handleTasksCommand,
    handleScheduleCommand,
    handleConfigCommand,
    handleQuickstartCommand,
    handleHelpCommand,
} from './command-handlers/info-commands';
import { handleCouncilCommand, handleMuteCommand, handleUnmuteCommand } from './command-handlers/moderation-commands';
import { handleComponentInteraction } from './command-handlers/component-handlers';
import { handleAutocomplete } from './command-handlers/autocomplete-handler';

const log = createLogger('DiscordCommands');

export async function registerSlashCommands(
    _db: Database,
    config: DiscordBridgeConfig,
): Promise<void> {
    const appId = config.appId;
    if (!appId) return;

    const commands = [
        {
            name: 'session',
            description: 'Start a new conversation thread with an agent',
            type: 1,
            options: [
                {
                    name: 'agent',
                    description: 'Agent to start the session with',
                    type: 3,
                    required: true,
                    autocomplete: true,
                },
                {
                    name: 'topic',
                    description: 'Topic for the conversation',
                    type: 3,
                    required: true,
                },
                {
                    name: 'project',
                    description: 'Project to work on (defaults to agent default)',
                    type: 3,
                    required: false,
                    autocomplete: true,
                },
            ],
        },
        {
            name: 'work',
            description: 'Create a work task (branch + PR)',
            type: 1,
            options: [
                {
                    name: 'description',
                    description: 'What the agent should work on',
                    type: 3,
                    required: true,
                },
                {
                    name: 'agent',
                    description: 'Agent to assign the task to',
                    type: 3,
                    required: false,
                    autocomplete: true,
                },
                {
                    name: 'project',
                    description: 'Project to work on (defaults to agent default)',
                    type: 3,
                    required: false,
                    autocomplete: true,
                },
            ],
        },
        { name: 'agents', description: 'List all available agents', type: 1 },
        { name: 'status', description: 'Show system status and key metrics', type: 1 },
        { name: 'dashboard', description: 'Comprehensive system overview with agents, tasks, and schedules', type: 1 },
        { name: 'tasks', description: 'View active work tasks and queue status', type: 1 },
        { name: 'schedule', description: 'Show schedule status and next runs', type: 1 },
        {
            name: 'config',
            description: 'Show current bot configuration (non-sensitive)',
            type: 1,
            default_member_permissions: '8',
        },
        {
            name: 'council',
            description: 'Launch a council deliberation on a topic',
            type: 1,
            default_member_permissions: '8',
            options: [{
                name: 'topic',
                description: 'The topic to deliberate on',
                type: 3,
                required: true,
            }],
        },
        { name: 'quickstart', description: 'Guided walkthrough for new users', type: 1 },
        { name: 'help', description: 'Show available commands and usage', type: 1 },
        {
            name: 'mute',
            description: 'Mute a user from bot interactions (admin only)',
            type: 1,
            default_member_permissions: '8',
            options: [{ name: 'user', description: 'The user to mute', type: 6, required: true }],
        },
        {
            name: 'unmute',
            description: 'Unmute a user (admin only)',
            type: 1,
            default_member_permissions: '8',
            options: [{ name: 'user', description: 'The user to unmute', type: 6, required: true }],
        },
        {
            name: 'admin',
            description: 'Manage bot configuration (admin only)',
            type: 1,
            default_member_permissions: '8',
            options: [
                {
                    name: 'channels',
                    description: 'Manage monitored channels',
                    type: 2,
                    options: [
                        {
                            name: 'add', description: 'Add a channel to the monitored list', type: 1,
                            options: [{ name: 'channel', description: 'The channel to add', type: 7, required: true }],
                        },
                        {
                            name: 'remove', description: 'Remove a channel from the monitored list', type: 1,
                            options: [{ name: 'channel', description: 'The channel to remove', type: 7, required: true }],
                        },
                        { name: 'list', description: 'Show all monitored channels', type: 1 },
                    ],
                },
                {
                    name: 'users',
                    description: 'Manage allowed users',
                    type: 2,
                    options: [
                        {
                            name: 'add', description: 'Add a user to the allow list', type: 1,
                            options: [{ name: 'user', description: 'The user to allow', type: 6, required: true }],
                        },
                        {
                            name: 'remove', description: 'Remove a user from the allow list', type: 1,
                            options: [{ name: 'user', description: 'The user to remove', type: 6, required: true }],
                        },
                        { name: 'list', description: 'Show all allowed users', type: 1 },
                    ],
                },
                {
                    name: 'roles',
                    description: 'Manage role permissions',
                    type: 2,
                    options: [
                        {
                            name: 'set', description: 'Set permission level for a role', type: 1,
                            options: [
                                { name: 'role', description: 'The role to configure', type: 8, required: true },
                                {
                                    name: 'level', description: 'Permission level (0=blocked, 1=basic, 2=standard, 3=admin)', type: 4, required: true,
                                    choices: [
                                        { name: 'Blocked (0)', value: 0 },
                                        { name: 'Basic (1) — chat, @mention', value: 1 },
                                        { name: 'Standard (2) — slash commands', value: 2 },
                                        { name: 'Admin (3) — full access', value: 3 },
                                    ],
                                },
                            ],
                        },
                        {
                            name: 'remove', description: 'Remove permission override for a role', type: 1,
                            options: [{ name: 'role', description: 'The role to remove', type: 8, required: true }],
                        },
                        { name: 'list', description: 'Show all role permission mappings', type: 1 },
                    ],
                },
                {
                    name: 'mode',
                    description: 'Set the bridge mode',
                    type: 1,
                    options: [{
                        name: 'value', description: 'Bridge mode', type: 3, required: true,
                        choices: [
                            { name: 'Chat — interactive conversations', value: 'chat' },
                            { name: 'Work Intake — fire-and-forget tasks', value: 'work_intake' },
                        ],
                    }],
                },
                {
                    name: 'public',
                    description: 'Toggle public mode (role-based access for all users)',
                    type: 1,
                    options: [{ name: 'enabled', description: 'Enable or disable public mode', type: 5, required: true }],
                },
                { name: 'show', description: 'Show current bot configuration', type: 1 },
            ],
        },
    ];

    // Register globally or per-guild
    const url = config.guildId
        ? `https://discord.com/api/v10/applications/${appId}/guilds/${config.guildId}/commands`
        : `https://discord.com/api/v10/applications/${appId}/commands`;

    const response = await fetch(url, {
        method: 'PUT',
        headers: {
            'Authorization': `Bot ${config.botToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(commands),
    });

    if (response.ok) {
        const registered = await response.json() as Array<{ name: string }>;
        log.info('Discord slash commands registered', {
            count: registered.length,
            commands: registered.map(c => c.name),
            scope: config.guildId ? 'guild' : 'global',
        });

        // When using guild commands, clear any stale global commands so they don't shadow guild ones
        if (config.guildId) {
            const globalUrl = `https://discord.com/api/v10/applications/${appId}/commands`;
            const globalRes = await fetch(globalUrl, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bot ${config.botToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify([]),
            });
            if (globalRes.ok) {
                log.info('Cleared stale global slash commands');
            } else {
                log.warn('Failed to clear global slash commands', {
                    status: globalRes.status,
                });
            }
        }
    } else {
        const error = await response.text();
        log.error('Failed to register Discord slash commands', {
            status: response.status,
            error: error.slice(0, 500),
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
    subscribeForResponseWithEmbed: (sessionId: string, threadId: string, agentName: string, agentModel: string, projectName?: string, displayColor?: string | null) => void;
    sendTaskResult: (channelId: string, task: import('../../shared/types/work-tasks').WorkTask, mentionUserId?: string) => Promise<void>;
    muteUser: (userId: string) => void;
    unmuteUser: (userId: string) => void;
}

export async function handleInteraction(
    ctx: InteractionContext,
    interaction: DiscordInteractionData,
): Promise<void> {
    // Handle button/component interactions
    if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
        await handleComponentInteraction(ctx, interaction);
        return;
    }

    // Handle autocomplete interactions — query DB live so new agents/projects appear immediately
    if (interaction.type === InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE) {
        await handleAutocomplete(ctx, interaction);
        return;
    }

    // Only handle application commands
    if (interaction.type !== InteractionType.APPLICATION_COMMAND) return;

    const commandName = interaction.data?.name;
    if (!commandName) return;

    const userId = interaction.member?.user?.id ?? interaction.user?.id;
    if (!userId) return;

    // Role-based permission check
    const permLevel = resolvePermissionLevel(ctx.config, ctx.mutedUsers, userId, interaction.member?.roles);
    if (permLevel <= PermissionLevel.BLOCKED) {
        await respondToInteraction(interaction, 'You do not have permission to use this bot.');
        return;
    }

    const options = interaction.data?.options ?? [];
    const getOption = (name: string) => options.find(o => o.name === name)?.value as string | undefined;

    switch (commandName) {
        case 'session':
            await handleSessionCommand(ctx, interaction, permLevel, getOption, userId);
            break;
        case 'work':
            await handleWorkCommand(ctx, interaction, permLevel, getOption, userId);
            break;
        case 'agents':
            await handleAgentsCommand(ctx, interaction);
            break;
        case 'status':
            await handleStatusCommand(ctx, interaction);
            break;
        case 'dashboard':
            await handleDashboardCommand(ctx, interaction);
            break;
        case 'tasks':
            await handleTasksCommand(ctx, interaction);
            break;
        case 'schedule':
            await handleScheduleCommand(ctx, interaction);
            break;
        case 'config':
            await handleConfigCommand(ctx, interaction, permLevel);
            break;
        case 'council':
            await handleCouncilCommand(ctx, interaction, permLevel, getOption);
            break;
        case 'quickstart':
            await handleQuickstartCommand(ctx, interaction);
            break;
        case 'help':
            await handleHelpCommand(interaction);
            break;
        case 'mute':
            await handleMuteCommand(ctx, interaction, permLevel, getOption);
            break;
        case 'unmute':
            await handleUnmuteCommand(ctx, interaction, permLevel, getOption);
            break;
        case 'admin': {
            if (permLevel < PermissionLevel.ADMIN) {
                await respondToInteraction(interaction, 'Only admins can use `/admin` commands.');
                break;
            }
            await handleAdminCommand(ctx.db, ctx.config, ctx.mutedUsers, ctx.threadSessions.size, interaction, options);
            break;
        }
        default:
            await respondToInteraction(interaction, `Unknown command: ${commandName}`);
    }
}

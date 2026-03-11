/**
 * Discord slash command registration and handling.
 *
 * Builds command definitions, registers them with Discord API,
 * and dispatches interaction events to the appropriate handler.
 */

import type { Database } from 'bun:sqlite';
import type { SessionSource } from '../../shared/types';
import type { ProcessManager } from '../process/manager';
import type { WorkTaskService } from '../work/service';
import type {
    DiscordBridgeConfig,
    DiscordInteractionData,
} from './types';
import { InteractionType, InteractionCallbackType, PermissionLevel, ButtonStyle } from './types';
import { listAgents } from '../db/agents';
import { listCouncils, getCouncilLaunch } from '../db/councils';
import { launchCouncil, onCouncilStageChange } from '../councils/discussion';
import { createSession } from '../db/sessions';
import { listProjects } from '../db/projects';
import { createLogger } from '../lib/logger';
import type { DeliveryTracker } from '../lib/delivery-tracker';
import {
    respondToInteraction,
    respondToInteractionEmbed,
    acknowledgeButton,
    sendEmbed,
    sendEmbedWithButtons,
    buildActionRow,
    agentColor,
    assertSnowflake,
} from './embeds';
import { resolvePermissionLevel } from './permissions';
import { handleAdminCommand } from './admin-commands';
import type { ThreadSessionInfo, ThreadCallbackInfo } from './thread-manager';

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
        { name: 'status', description: 'Show bot status and active sessions', type: 1 },
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
    subscribeForResponseWithEmbed: (sessionId: string, threadId: string, agentName: string, agentModel: string) => void;
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
        case 'session': {
            if (permLevel < PermissionLevel.STANDARD) {
                await respondToInteraction(interaction, 'You need a higher role to create sessions. Try @mentioning the bot for a quick reply.');
                break;
            }
            const agentName = getOption('agent');
            const topic = getOption('topic');
            const projectName = getOption('project');
            if (!agentName || !topic) {
                await respondToInteraction(interaction, 'Please provide both an agent and a topic.');
                break;
            }

            const agents = listAgents(ctx.db);
            if (agents.length === 0) {
                await respondToInteraction(interaction, 'No agents configured. Create an agent first.');
                break;
            }

            const agent = agents.find(a =>
                a.name.toLowerCase() === agentName.toLowerCase() ||
                a.name.toLowerCase().replace(/\s+/g, '') === agentName.toLowerCase().replace(/\s+/g, '')
            );
            if (!agent) {
                const names = agents.map(a => a.name).join(', ');
                await respondToInteraction(interaction, `Agent not found: "${agentName}". Available: ${names}`);
                break;
            }

            const allProjects = listProjects(ctx.db);
            let project;
            if (projectName) {
                project = allProjects.find(p => p.name.toLowerCase() === projectName.toLowerCase());
                if (!project) {
                    const names = allProjects.map(p => p.name).join(', ');
                    await respondToInteraction(interaction, `Project not found: "${projectName}". Available: ${names}`);
                    break;
                }
            } else {
                project = agent.defaultProjectId
                    ? allProjects.find(p => p.id === agent.defaultProjectId) ?? allProjects[0]
                    : allProjects[0];
            }
            if (!project) {
                await respondToInteraction(interaction, 'No projects configured.');
                break;
            }

            // Create a standalone thread (not attached to a message)
            const threadName = `${agent.name} — ${topic}`;
            const threadId = await ctx.createStandaloneThread(ctx.config.channelId, threadName);
            if (!threadId) {
                await respondToInteraction(interaction, 'Failed to create conversation thread.');
                break;
            }

            const session = createSession(ctx.db, {
                projectId: project.id,
                agentId: agent.id,
                name: `Discord thread:${threadId}`,
                initialPrompt: topic,
                source: 'discord' as SessionSource,
            });

            ctx.threadSessions.set(threadId, {
                sessionId: session.id,
                agentName: agent.name,
                agentModel: agent.model || 'unknown',
                ownerUserId: userId,
                topic,
            });
            ctx.threadLastActivity.set(threadId, Date.now());

            ctx.processManager.startProcess(session, topic);
            ctx.subscribeForResponseWithEmbed(session.id, threadId, agent.name, agent.model || 'unknown');

            // Post a welcome embed with Stop button in the thread
            sendEmbedWithButtons(ctx.delivery, ctx.config.botToken, threadId, {
                description: `**${agent.name}** is working on: ${topic}`,
                color: agentColor(agent.name),
                footer: { text: `${agent.name} · ${agent.model || 'unknown'}` },
            }, [
                buildActionRow(
                    { label: 'Stop', customId: 'stop_session', style: ButtonStyle.DANGER, emoji: '⏹' },
                ),
            ]).catch(() => {});

            await respondToInteraction(interaction,
                `Session started in <#${threadId}> with **${agent.name}**.\nTopic: ${topic}`);
            break;
        }

        case 'work': {
            if (permLevel < PermissionLevel.STANDARD) {
                await respondToInteraction(interaction, 'You need a higher role to create work tasks.');
                break;
            }
            if (!ctx.workTaskService) {
                await respondToInteraction(interaction, 'Work task service not available.');
                break;
            }

            const workDescription = getOption('description');
            if (!workDescription) {
                await respondToInteraction(interaction, 'Please provide a task description.');
                break;
            }

            const workAgentName = getOption('agent');
            const workProjectName = getOption('project');

            // Resolve agent
            const allAgents = listAgents(ctx.db);
            let workAgent;
            if (workAgentName) {
                workAgent = allAgents.find(a =>
                    a.name.toLowerCase() === workAgentName.toLowerCase() ||
                    a.name.toLowerCase().replace(/\s+/g, '') === workAgentName.toLowerCase().replace(/\s+/g, '')
                );
                if (!workAgent) {
                    const names = allAgents.map(a => a.name).join(', ');
                    await respondToInteraction(interaction, `Agent not found: "${workAgentName}". Available: ${names}`);
                    break;
                }
            } else {
                workAgent = ctx.config.defaultAgentId
                    ? allAgents.find(a => a.id === ctx.config.defaultAgentId) ?? allAgents[0]
                    : allAgents[0];
            }
            if (!workAgent) {
                await respondToInteraction(interaction, 'No agents configured.');
                break;
            }

            // Resolve project
            const workProjects = listProjects(ctx.db);
            let workProjectId: string | undefined;
            if (workProjectName) {
                const workProject = workProjects.find(p => p.name.toLowerCase() === workProjectName.toLowerCase());
                if (!workProject) {
                    const names = workProjects.map(p => p.name).join(', ');
                    await respondToInteraction(interaction, `Project not found: "${workProjectName}". Available: ${names}`);
                    break;
                }
                workProjectId = workProject.id;
            }

            // Defer the response since task creation may take a moment
            await respondToInteraction(interaction, `Creating work task for **${workAgent.name}**...`);

            const channelId = interaction.channel_id;
            try {
                const task = await ctx.workTaskService.create({
                    agentId: workAgent.id,
                    description: workDescription,
                    projectId: workProjectId,
                    source: 'discord',
                    requesterInfo: { discordUserId: userId },
                });

                // Send a rich confirmation embed in the channel
                if (channelId) {
                    const fields: Array<{ name: string; value: string; inline?: boolean }> = [
                        { name: 'Agent', value: workAgent.name, inline: true },
                        { name: 'Status', value: 'In Progress', inline: true },
                    ];
                    if (task.branchName) {
                        fields.push({ name: 'Branch', value: `\`${task.branchName}\``, inline: false });
                    }

                    await sendEmbed(ctx.delivery, ctx.config.botToken, channelId, {
                        title: 'Work Task Created',
                        description: workDescription.slice(0, 300) + (workDescription.length > 300 ? '...' : ''),
                        color: 0x5865f2,
                        fields,
                        footer: { text: `Task: ${task.id} · You'll be notified when it completes` },
                    });

                    // Subscribe for completion notification
                    ctx.workTaskService.onComplete(task.id, (completedTask) => {
                        ctx.sendTaskResult(channelId, completedTask, userId).catch(err => {
                            log.error('Failed to send task result to Discord', {
                                taskId: completedTask.id,
                                error: err instanceof Error ? err.message : String(err),
                            });
                        });
                    });
                }
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                log.error('Discord /work command failed', { error: message, userId });
                if (channelId) {
                    await sendEmbed(ctx.delivery, ctx.config.botToken, channelId, {
                        title: 'Work Task Failed',
                        description: `Could not create work task: ${message.slice(0, 500)}`,
                        color: 0xed4245,
                    });
                }
            }
            break;
        }

        case 'agents': {
            const agents = listAgents(ctx.db);
            if (agents.length === 0) {
                await respondToInteraction(interaction, 'No agents configured.');
                break;
            }
            const lines = agents.map(a => `\u2022 **${a.name}** (${a.model || 'no model'})`);
            await respondToInteraction(interaction, `Available agents:\n${lines.join('\n')}`);
            break;
        }

        case 'status': {
            const activeSessions = ctx.threadSessions.size;
            await respondToInteraction(interaction,
                `Active thread sessions: **${activeSessions}**\nUse \`/session\` to start a new conversation.`);
            break;
        }

        case 'council': {
            if (permLevel < PermissionLevel.ADMIN) {
                await respondToInteraction(interaction, 'Council deliberation requires admin permissions.');
                break;
            }
            const topic = getOption('topic');
            if (!topic) {
                await respondToInteraction(interaction, 'Please provide a topic.');
                break;
            }
            const councils = listCouncils(ctx.db);
            if (councils.length === 0) {
                await respondToInteraction(interaction, 'No councils configured.');
                break;
            }
            const council = councils[0];
            const projects = listProjects(ctx.db);
            const project = projects[0];
            if (!project) {
                await respondToInteraction(interaction, 'No projects configured.');
                break;
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
            break;
        }

        case 'mute': {
            if (permLevel < PermissionLevel.ADMIN) {
                await respondToInteraction(interaction, 'Only admins can mute users.');
                break;
            }
            const targetUser = getOption('user');
            if (!targetUser) {
                await respondToInteraction(interaction, 'Please specify a user.');
                break;
            }
            ctx.muteUser(targetUser);
            await respondToInteraction(interaction, `User <@${targetUser}> has been muted from bot interactions.`);
            break;
        }

        case 'unmute': {
            if (permLevel < PermissionLevel.ADMIN) {
                await respondToInteraction(interaction, 'Only admins can unmute users.');
                break;
            }
            const targetUser = getOption('user');
            if (!targetUser) {
                await respondToInteraction(interaction, 'Please specify a user.');
                break;
            }
            ctx.unmuteUser(targetUser);
            await respondToInteraction(interaction, `User <@${targetUser}> has been unmuted.`);
            break;
        }

        case 'quickstart': {
            const agents = listAgents(ctx.db);
            const agentCount = agents.length;
            const firstAgent = agents[0]?.name ?? 'your agent';

            const steps = [
                '**1. Start a session**',
                `Use \`/session\` to pick an agent and topic. ${agentCount > 0 ? `Try \`/session ${firstAgent} Hello!\`` : 'Set up an agent first in the dashboard.'}`,
                '',
                '**2. Chat in the thread**',
                'A new thread is created for your conversation. Send messages and the agent will respond.',
                '',
                '**3. Quick one-off replies**',
                `@mention the bot in the channel for a fast reply without creating a thread.`,
                '',
                '**4. Explore commands**',
                'Use `/help` to see all available commands and what they do.',
            ].join('\n');

            await respondToInteractionEmbed(interaction, {
                title: 'Welcome to CorvidAgent!',
                description: steps,
                color: 0x5865f2,
                fields: [
                    {
                        name: 'Available Agents',
                        value: agentCount > 0
                            ? agents.slice(0, 5).map(a => `\`${a.name}\` — ${a.model || 'unknown'}`).join('\n')
                                + (agentCount > 5 ? `\n_...and ${agentCount - 5} more (use \`/agents\`)_` : '')
                            : '_No agents configured yet — check the dashboard._',
                        inline: false,
                    },
                ],
                footer: { text: 'Use /help to see all commands' },
            });
            break;
        }

        case 'help': {
            await respondToInteractionEmbed(interaction, {
                title: 'CorvidAgent Commands',
                color: 0x5865f2,
                fields: [
                    {
                        name: 'Conversations',
                        value: [
                            '`/session <agent> <topic>` — Start a threaded conversation',
                            '`/quickstart` — Guided walkthrough for new users',
                            '`@mention` — Quick one-off reply in channel',
                        ].join('\n'),
                        inline: false,
                    },
                    {
                        name: 'Information',
                        value: [
                            '`/agents` — List all available agents and models',
                            '`/status` — Show active sessions and bot status',
                            '`/help` — Show this help message',
                        ].join('\n'),
                        inline: false,
                    },
                    {
                        name: 'Advanced',
                        value: [
                            '`/council <topic>` — Launch a multi-agent council deliberation',
                            '`/mute <user>` — Mute a user (admin)',
                            '`/unmute <user>` — Unmute a user (admin)',
                        ].join('\n'),
                        inline: false,
                    },
                    {
                        name: 'Admin Configuration',
                        value: [
                            '`/admin channels add/remove/list` — Manage monitored channels',
                            '`/admin users add/remove/list` — Manage allowed users',
                            '`/admin roles set/remove/list` — Manage role permissions',
                            '`/admin mode <chat|work_intake>` — Set bridge mode',
                            '`/admin public <on|off>` — Toggle public mode',
                            '`/admin show` — Show current configuration',
                        ].join('\n'),
                        inline: false,
                    },
                ],
                footer: { text: 'New here? Try /quickstart for a guided walkthrough' },
            });
            break;
        }

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

async function handleAutocomplete(
    ctx: InteractionContext,
    interaction: DiscordInteractionData,
): Promise<void> {
    const options = interaction.data?.options ?? [];
    const focused = options.find(o => o.focused) ?? options.flatMap(o => o.options ?? []).find(o => o.focused);
    if (!focused) return;

    const query = String(focused.value ?? '').toLowerCase();
    let choices: { name: string; value: string }[] = [];

    if (focused.name === 'agent') {
        const agents = listAgents(ctx.db);
        choices = agents
            .filter(a => !query || a.name.toLowerCase().includes(query))
            .slice(0, 25)
            .map(a => ({
                name: `${a.name} (${a.model || 'unknown'})`.slice(0, 100),
                value: a.name,
            }));
    } else if (focused.name === 'project') {
        const projects = listProjects(ctx.db);
        choices = projects
            .filter(p => !query || p.name.toLowerCase().includes(query) ||
                (p.description ?? '').toLowerCase().includes(query))
            .slice(0, 25)
            .map(p => ({
                name: `${p.name}${p.description ? ` — ${p.description}` : ''}`.slice(0, 100),
                value: p.name,
            }));
    }

    const response = await fetch(
        `https://discord.com/api/v10/interactions/${interaction.id}/${interaction.token}/callback`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: InteractionCallbackType.AUTOCOMPLETE_RESULT,
                data: { choices },
            }),
        },
    );

    if (!response.ok) {
        const error = await response.text();
        log.error('Failed to respond to autocomplete', {
            status: response.status,
            error: error.slice(0, 200),
        });
    }
}

async function handleComponentInteraction(
    ctx: InteractionContext,
    interaction: DiscordInteractionData,
): Promise<void> {
    const customId = interaction.data?.custom_id;
    if (!customId) return;

    const userId = interaction.member?.user?.id ?? interaction.user?.id;
    if (!userId) return;

    assertSnowflake(interaction.channel_id, 'channel ID');

    const permLevel = resolvePermissionLevel(ctx.config, ctx.mutedUsers, userId, interaction.member?.roles);
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
                ctx.subscribeForResponseWithEmbed(info.sessionId, threadId, info.agentName, info.agentModel);
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

            await acknowledgeButton(interaction, 'Session stopped.');
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
            `SELECT s.id, s.agent_id, s.initial_prompt, a.name as agent_name, a.model as agent_model
             FROM sessions s
             LEFT JOIN agents a ON a.id = s.agent_id
             WHERE s.name = ? AND s.source = 'discord'
             ORDER BY s.created_at DESC LIMIT 1`,
        ).get(`Discord thread:${threadId}`) as { id: string; agent_id: string; initial_prompt: string; agent_name: string; agent_model: string } | null;

        if (!row) return null;

        const info: ThreadSessionInfo = {
            sessionId: row.id,
            agentName: row.agent_name || 'Agent',
            agentModel: row.agent_model || 'unknown',
            ownerUserId: '',
            topic: row.initial_prompt || undefined,
        };
        ctx.threadSessions.set(threadId, info);
        return info;
    } catch {
        return null;
    }
}

/** Un-archive a thread so it can receive messages again. */
async function unarchiveThread(botToken: string, threadId: string): Promise<void> {
    assertSnowflake(threadId, 'thread ID');
    const response = await fetch(
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

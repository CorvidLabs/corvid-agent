import type { Database } from 'bun:sqlite';
import type { ProcessManager } from '../process/manager';
import type { SessionSource } from '../../shared/types';
import type { WorkTaskService } from '../work/service';
import type {
    DiscordBridgeConfig,
    DiscordMessageData,
    DiscordInteractionData,
} from './types';
import { InteractionType, InteractionCallbackType, PermissionLevel, ComponentType, ButtonStyle } from './types';
import type { DiscordActionRow } from './types';
import { DiscordGateway } from './gateway';
import { listAgents } from '../db/agents';
import { listCouncils, getCouncilLaunch } from '../db/councils';
import { launchCouncil, onCouncilStageChange } from '../councils/discussion';
import { createSession, getSession } from '../db/sessions';
import { listProjects } from '../db/projects';
import { createLogger } from '../lib/logger';
import { scanForInjection } from '../lib/prompt-injection';
import { extractContentText } from '../process/types';
import { recordAudit } from '../db/audit';
import { getDeliveryTracker, type DeliveryTracker } from '../lib/delivery-tracker';
import { splitMessage, splitEmbedDescription } from './message-formatter';
import { getDiscordConfig } from '../db/discord-config';

const log = createLogger('DiscordBridge');

const MAX_MESSAGE_LENGTH = 2000;

/** Discord snowflake IDs are purely numeric strings. */
const DISCORD_SNOWFLAKE_RE = /^\d{17,20}$/;

/** Discord interaction tokens are alphanumeric with dashes, dots, and underscores. */
const DISCORD_TOKEN_RE = /^[\w.\-]{20,500}$/;

function assertSnowflake(value: string, label: string): void {
    if (!DISCORD_SNOWFLAKE_RE.test(value)) {
        throw new Error(`Invalid Discord ${label}: expected snowflake ID`);
    }
}

function assertInteractionToken(value: string): void {
    if (!DISCORD_TOKEN_RE.test(value)) {
        throw new Error('Invalid Discord interaction token');
    }
}

/**
 * Bidirectional Discord bridge using raw WebSocket gateway.
 * No external Discord library dependencies.
 *
 * Supports two modes:
 * - `chat` (default): Messages route to persistent agent sessions.
 * - `work_intake`: Messages create async work tasks via WorkTaskService.
 *
 * Security note: This bridge authenticates via the Discord Gateway WebSocket API
 * using a bot token — it does NOT use the HTTP-based Interactions endpoint.
 * Therefore, Ed25519 request signature validation (X-Signature-Ed25519) is not
 * applicable here. If Discord Interactions support is added in the future,
 * Ed25519 verification must be implemented for that endpoint.
 */
export class DiscordBridge {
    private db: Database;
    private processManager: ProcessManager;
    private workTaskService: WorkTaskService | null;
    private config: DiscordBridgeConfig;
    private gateway: DiscordGateway;

    private botUserId: string | null = null;
    private running = false;

    // Map Discord threadId → session info (for thread-based conversations)
    private threadSessions: Map<string, { sessionId: string; agentName: string; agentModel: string; ownerUserId: string; topic?: string }> = new Map();
    /** Active subscription callbacks per thread — used to unsubscribe before re-subscribing. */
    private threadCallbacks: Map<string, { sessionId: string; callback: import('../process/interfaces').EventCallback }> = new Map();

    // Per-user rate limiting: userId → timestamps of recent messages
    private userMessageTimestamps: Map<string, number[]> = new Map();
    private readonly RATE_LIMIT_WINDOW_MS = 60_000;
    private readonly RATE_LIMIT_MAX_MESSAGES = 10;
    private delivery: DeliveryTracker = getDeliveryTracker();

    /** Track last activity per thread for stale detection */
    private threadLastActivity: Map<string, number> = new Map();
    private staleCheckTimer: ReturnType<typeof setInterval> | null = null;
    /** Stale thread auto-archive after 2 hours of inactivity */
    private readonly STALE_THREAD_MS = 2 * 60 * 60 * 1000;

    /** Users muted from bot interactions (admin-managed). */
    private mutedUsers: Set<string> = new Set();

    /** Users who have interacted at least once — used for first-interaction welcome tips. */
    private interactedUsers: Set<string> = new Set();

    /** Debounce timer for updateSlashCommands — coalesces rapid agent changes. */
    private slashCommandDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    private static readonly SLASH_COMMAND_DEBOUNCE_MS = 2_000;

    /** Periodic config reload timer — picks up DB changes without restart */
    private configReloadTimer: ReturnType<typeof setInterval> | null = null;
    private static readonly CONFIG_RELOAD_INTERVAL_MS = 30_000; // 30 seconds

    constructor(
        db: Database,
        processManager: ProcessManager,
        config: DiscordBridgeConfig,
        workTaskService?: WorkTaskService,
    ) {
        this.db = db;
        this.processManager = processManager;
        this.config = config;
        this.workTaskService = workTaskService ?? null;
        this.gateway = new DiscordGateway(config, {
            onMessage: (data) => {
                this.handleMessage(data).catch(err => {
                    log.error('Error handling Discord message', { error: err instanceof Error ? err.message : String(err) });
                });
            },
            onInteraction: (data) => {
                this.handleInteraction(data).catch(err => {
                    log.error('Error handling Discord interaction', { error: err instanceof Error ? err.message : String(err) });
                });
            },
            onReady: (sessionId, botUserId) => {
                if (botUserId) {
                    this.botUserId = botUserId;
                }
                log.info('Discord bridge received gateway ready', { sessionId, botUserId });
            },
        });
    }

    private get mode() {
        return this.config.mode ?? 'chat';
    }

    start(): void {
        if (this.running) return;
        this.running = true;
        log.info('Discord bridge starting', { channelId: this.config.channelId, mode: this.mode });
        this.gateway.start();

        // Register slash commands if app ID is configured
        if (this.config.appId) {
            this.registerSlashCommands().catch(err => {
                log.error('Failed to register Discord slash commands', {
                    error: err instanceof Error ? err.message : String(err),
                });
            });
        }

        // Start periodic stale thread check (every 10 minutes)
        this.staleCheckTimer = setInterval(() => {
            this.archiveStaleThreads().catch(err => {
                log.warn('Stale thread check failed', { error: err instanceof Error ? err.message : String(err) });
            });
        }, 10 * 60 * 1000);

        // Start periodic config reload from DB (every 30 seconds)
        this.reloadConfigFromDb();
        this.configReloadTimer = setInterval(() => {
            this.reloadConfigFromDb();
        }, DiscordBridge.CONFIG_RELOAD_INTERVAL_MS);
    }

    stop(): void {
        this.running = false;
        this.gateway.stop();
        if (this.staleCheckTimer) {
            clearInterval(this.staleCheckTimer);
            this.staleCheckTimer = null;
        }
        if (this.configReloadTimer) {
            clearInterval(this.configReloadTimer);
            this.configReloadTimer = null;
        }
        log.info('Discord bridge stopped');
    }

    /** Update the bot's presence on the live gateway connection. */
    updatePresence(statusText?: string, activityType?: number): void {
        this.gateway.updatePresence(statusText, activityType);
    }

    /**
     * Reload dynamic config from the discord_config DB table.
     * Merges DB values into the live config — env-only fields (botToken, channelId,
     * appId, guildId) are never overwritten.
     */
    reloadConfigFromDb(): void {
        try {
            const dbConfig = getDiscordConfig(this.db);

            // Apply all dynamic fields unconditionally — DB defaults are correct
            // when a key is deleted, so conditional merging would prevent clearing values.
            this.config.additionalChannelIds = dbConfig.additionalChannelIds;
            this.config.allowedUserIds = dbConfig.allowedUserIds;
            this.config.mode = dbConfig.mode;
            this.config.defaultAgentId = dbConfig.defaultAgentId ?? undefined;
            this.config.publicMode = dbConfig.publicMode;
            this.config.rolePermissions = dbConfig.rolePermissions;
            this.config.defaultPermissionLevel = dbConfig.defaultPermissionLevel;
            this.config.rateLimitByLevel = dbConfig.rateLimitByLevel;

            // Update bot presence if status/activity changed
            this.gateway.updatePresence(dbConfig.statusText, dbConfig.activityType);
        } catch (err) {
            log.warn('Failed to reload Discord config from DB', {
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    // ── Slash Command Registration ─────────────────────────────────────

    /**
     * Public debounced entry point — call when agents are created/updated/deleted.
     * Coalesces rapid successive calls into a single Discord API request (2 s debounce).
     */
    updateSlashCommands(): void {
        if (!this.config.appId || !this.running) return;
        if (this.slashCommandDebounceTimer) {
            clearTimeout(this.slashCommandDebounceTimer);
        }
        this.slashCommandDebounceTimer = setTimeout(() => {
            this.slashCommandDebounceTimer = null;
            this.registerSlashCommands().catch(err => {
                log.error('Failed to refresh Discord slash commands', {
                    error: err instanceof Error ? err.message : String(err),
                });
            });
        }, DiscordBridge.SLASH_COMMAND_DEBOUNCE_MS);
    }

    private async registerSlashCommands(): Promise<void> {
        const appId = this.config.appId;
        if (!appId) return;

        // Build agent choices for /session from the database
        const agents = listAgents(this.db);
        const agentChoices = agents.slice(0, 25).map(a => ({
            name: `${a.name} (${a.model || 'unknown'})`.slice(0, 100),
            value: a.name,
        }));

        const commands = [
            {
                name: 'session',
                description: 'Start a new conversation thread with an agent',
                type: 1, // CHAT_INPUT
                options: [
                    {
                        name: 'agent',
                        description: 'Agent to start the session with',
                        type: 3, // STRING
                        required: true,
                        ...(agentChoices.length > 0 ? { choices: agentChoices } : {}),
                    },
                    {
                        name: 'topic',
                        description: 'Topic for the conversation',
                        type: 3, // STRING
                        required: true,
                    },
                ],
            },
            {
                name: 'agents',
                description: 'List all available agents',
                type: 1,
            },
            {
                name: 'status',
                description: 'Show bot status and active sessions',
                type: 1,
            },
            {
                name: 'council',
                description: 'Launch a council deliberation on a topic',
                type: 1,
                options: [{
                    name: 'topic',
                    description: 'The topic to deliberate on',
                    type: 3, // STRING
                    required: true,
                }],
            },
            {
                name: 'quickstart',
                description: 'Guided walkthrough for new users',
                type: 1,
            },
            {
                name: 'help',
                description: 'Show available commands and usage',
                type: 1,
            },
            {
                name: 'mute',
                description: 'Mute a user from bot interactions (admin only)',
                type: 1,
                options: [{
                    name: 'user',
                    description: 'The user to mute',
                    type: 6, // USER
                    required: true,
                }],
            },
            {
                name: 'unmute',
                description: 'Unmute a user (admin only)',
                type: 1,
                options: [{
                    name: 'user',
                    description: 'The user to unmute',
                    type: 6, // USER
                    required: true,
                }],
            },
        ];

        // Register globally or per-guild
        const url = this.config.guildId
            ? `https://discord.com/api/v10/applications/${appId}/guilds/${this.config.guildId}/commands`
            : `https://discord.com/api/v10/applications/${appId}/commands`;

        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `Bot ${this.config.botToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(commands),
        });

        if (response.ok) {
            const registered = await response.json() as Array<{ name: string }>;
            log.info('Discord slash commands registered', {
                count: registered.length,
                commands: registered.map(c => c.name),
                scope: this.config.guildId ? 'guild' : 'global',
            });
        } else {
            const error = await response.text();
            log.error('Failed to register Discord slash commands', {
                status: response.status,
                error: error.slice(0, 500),
            });
        }
    }

    // ── Interaction Handling ─────────────────────────────────────────────

    private async handleInteraction(interaction: DiscordInteractionData): Promise<void> {
        // Handle button/component interactions
        if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
            await this.handleComponentInteraction(interaction);
            return;
        }

        // Only handle application commands
        if (interaction.type !== InteractionType.APPLICATION_COMMAND) return;

        const commandName = interaction.data?.name;
        if (!commandName) return;

        const userId = interaction.member?.user?.id ?? interaction.user?.id;
        if (!userId) return;

        // Role-based permission check
        const permLevel = this.resolvePermissionLevel(userId, interaction.member?.roles);
        if (permLevel <= PermissionLevel.BLOCKED) {
            await this.respondToInteraction(interaction, 'You do not have permission to use this bot.');
            return;
        }

        const options = interaction.data?.options ?? [];
        const getOption = (name: string) => options.find(o => o.name === name)?.value as string | undefined;

        switch (commandName) {
            case 'session': {
                if (permLevel < PermissionLevel.STANDARD) {
                    await this.respondToInteraction(interaction, 'You need a higher role to create sessions. Try @mentioning the bot for a quick reply.');
                    break;
                }
                const agentName = getOption('agent');
                const topic = getOption('topic');
                if (!agentName || !topic) {
                    await this.respondToInteraction(interaction, 'Please provide both an agent and a topic.');
                    break;
                }

                const agents = listAgents(this.db);
                if (agents.length === 0) {
                    await this.respondToInteraction(interaction, 'No agents configured. Create an agent first.');
                    break;
                }

                const agent = agents.find(a =>
                    a.name.toLowerCase() === agentName.toLowerCase() ||
                    a.name.toLowerCase().replace(/\s+/g, '') === agentName.toLowerCase().replace(/\s+/g, '')
                );
                if (!agent) {
                    const names = agents.map(a => a.name).join(', ');
                    await this.respondToInteraction(interaction, `Agent not found: "${agentName}". Available: ${names}`);
                    break;
                }

                const projects = listProjects(this.db);
                const project = agent.defaultProjectId
                    ? projects.find(p => p.id === agent.defaultProjectId) ?? projects[0]
                    : projects[0];
                if (!project) {
                    await this.respondToInteraction(interaction, 'No projects configured.');
                    break;
                }

                // Create a standalone thread (not attached to a message)
                const threadName = `${agent.name} — ${topic}`;
                const threadId = await this.createStandaloneThread(this.config.channelId, threadName);
                if (!threadId) {
                    await this.respondToInteraction(interaction, 'Failed to create conversation thread.');
                    break;
                }

                const session = createSession(this.db, {
                    projectId: project.id,
                    agentId: agent.id,
                    name: `Discord thread:${threadId}`,
                    initialPrompt: topic,
                    source: 'discord' as SessionSource,
                });

                this.threadSessions.set(threadId, {
                    sessionId: session.id,
                    agentName: agent.name,
                    agentModel: agent.model || 'unknown',
                    ownerUserId: userId,
                    topic,
                });
                this.threadLastActivity.set(threadId, Date.now());

                this.processManager.startProcess(session, topic);
                this.subscribeForResponseWithEmbed(session.id, threadId, agent.name, agent.model || 'unknown');

                // Post a welcome embed with Stop button in the thread
                this.sendEmbedWithButtons(threadId, {
                    description: `**${agent.name}** is working on: ${topic}`,
                    color: this.agentColor(agent.name),
                    footer: { text: `${agent.name} · ${agent.model || 'unknown'}` },
                }, [
                    this.buildActionRow(
                        { label: 'Stop', customId: 'stop_session', style: ButtonStyle.DANGER, emoji: '⏹' },
                    ),
                ]).catch(() => {});

                await this.respondToInteraction(interaction,
                    `Session started in <#${threadId}> with **${agent.name}**.\nTopic: ${topic}`);
                break;
            }

            case 'agents': {
                const agents = listAgents(this.db);
                if (agents.length === 0) {
                    await this.respondToInteraction(interaction, 'No agents configured.');
                    break;
                }
                const lines = agents.map(a => `\u2022 **${a.name}** (${a.model || 'no model'})`);
                await this.respondToInteraction(interaction, `Available agents:\n${lines.join('\n')}`);
                break;
            }

            case 'status': {
                const activeSessions = this.threadSessions.size;
                await this.respondToInteraction(interaction,
                    `Active thread sessions: **${activeSessions}**\nUse \`/session\` to start a new conversation.`);
                break;
            }

            case 'council': {
                if (permLevel < PermissionLevel.ADMIN) {
                    await this.respondToInteraction(interaction, 'Council deliberation requires admin permissions.');
                    break;
                }
                const topic = getOption('topic');
                if (!topic) {
                    await this.respondToInteraction(interaction, 'Please provide a topic.');
                    break;
                }
                const councils = listCouncils(this.db);
                if (councils.length === 0) {
                    await this.respondToInteraction(interaction, 'No councils configured.');
                    break;
                }
                const council = councils[0];
                const projects = listProjects(this.db);
                const project = projects[0];
                if (!project) {
                    await this.respondToInteraction(interaction, 'No projects configured.');
                    break;
                }
                try {
                    const result = launchCouncil(this.db, this.processManager, council.id, project.id, topic, null);

                    // Get the channel where the interaction happened for posting results
                    const councilChannelId = interaction.channel_id;

                    await this.respondToInteraction(interaction,
                        `Council deliberation launched.\nCouncil: **${council.name}**\nLaunch ID: \`${result.launchId.slice(0, 8)}\`\nSessions: ${result.sessionIds.length}`);

                    // Subscribe for council completion and post synthesis to Discord
                    if (councilChannelId) {
                        const unsubscribe = onCouncilStageChange((launchId, stage) => {
                            if (launchId !== result.launchId || stage !== 'complete') return;
                            unsubscribe();

                            const launch = getCouncilLaunch(this.db, result.launchId);
                            const synthesis = launch?.synthesis || '(No synthesis produced)';

                            this.sendEmbed(councilChannelId, {
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
                    await this.respondToInteraction(interaction, `Failed to launch council: ${msg}`);
                }
                break;
            }

            case 'mute': {
                if (permLevel < PermissionLevel.ADMIN) {
                    await this.respondToInteraction(interaction, 'Only admins can mute users.');
                    break;
                }
                const targetUser = getOption('user');
                if (!targetUser) {
                    await this.respondToInteraction(interaction, 'Please specify a user.');
                    break;
                }
                this.muteUser(targetUser);
                await this.respondToInteraction(interaction, `User <@${targetUser}> has been muted from bot interactions.`);
                break;
            }

            case 'unmute': {
                if (permLevel < PermissionLevel.ADMIN) {
                    await this.respondToInteraction(interaction, 'Only admins can unmute users.');
                    break;
                }
                const targetUser = getOption('user');
                if (!targetUser) {
                    await this.respondToInteraction(interaction, 'Please specify a user.');
                    break;
                }
                this.unmuteUser(targetUser);
                await this.respondToInteraction(interaction, `User <@${targetUser}> has been unmuted.`);
                break;
            }

            case 'quickstart': {
                const agents = listAgents(this.db);
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

                await this.respondToInteractionEmbed(interaction, {
                    title: 'Welcome to CorvidAgent!',
                    description: steps,
                    color: 0x5865f2, // Discord blurple
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
                await this.respondToInteractionEmbed(interaction, {
                    title: 'CorvidAgent Commands',
                    color: 0x5865f2, // Discord blurple
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
                    ],
                    footer: { text: 'New here? Try /quickstart for a guided walkthrough' },
                });
                break;
            }

            default:
                await this.respondToInteraction(interaction, `Unknown command: ${commandName}`);
        }
    }

    private async respondToInteraction(interaction: DiscordInteractionData, content: string): Promise<void> {
        assertSnowflake(interaction.id, 'interaction ID');
        assertInteractionToken(interaction.token);
        const response = await fetch(
            `https://discord.com/api/v10/interactions/${interaction.id}/${interaction.token}/callback`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: InteractionCallbackType.CHANNEL_MESSAGE,
                    data: { content: content.slice(0, MAX_MESSAGE_LENGTH) },
                }),
            },
        );

        if (!response.ok) {
            const error = await response.text();
            log.error('Failed to respond to Discord interaction', {
                status: response.status,
                error: error.slice(0, 200),
            });
        }
    }

    // ── Component (Button) Interaction Handling ──────────────────────────

    /**
     * Handle button clicks and other component interactions.
     * Button custom_ids use the format: `action:param1:param2`
     */
    private async handleComponentInteraction(interaction: DiscordInteractionData): Promise<void> {
        const customId = interaction.data?.custom_id;
        if (!customId) return;

        const userId = interaction.member?.user?.id ?? interaction.user?.id;
        if (!userId) return;

        assertSnowflake(interaction.channel_id, 'channel ID');

        const permLevel = this.resolvePermissionLevel(userId, interaction.member?.roles);
        if (permLevel <= PermissionLevel.BLOCKED) {
            await this.respondToInteraction(interaction, 'You do not have permission to use this bot.');
            return;
        }

        const [action] = customId.split(':');

        switch (action) {
            case 'resume_thread': {
                if (permLevel < PermissionLevel.STANDARD) {
                    await this.respondToInteraction(interaction, 'You need a higher role to resume sessions.');
                    return;
                }
                const threadId = interaction.channel_id;
                const info = this.threadSessions.get(threadId) ?? this.tryRecoverThread(threadId);
                if (!info) {
                    await this.respondToInteraction(interaction, 'No session found for this thread. Use `/session` to start a new one.');
                    return;
                }

                // Un-archive the thread if it was archived
                await this.unarchiveThread(threadId);

                // Resubscribe for responses
                if (!this.threadCallbacks.has(threadId)) {
                    this.subscribeForResponseWithEmbed(info.sessionId, threadId, info.agentName, info.agentModel);
                }
                this.threadLastActivity.set(threadId, Date.now());

                // Acknowledge the button press
                await this.acknowledgeButton(interaction, 'Session resumed — send a message to continue.');
                break;
            }

            case 'new_session': {
                if (permLevel < PermissionLevel.STANDARD) {
                    await this.respondToInteraction(interaction, 'You need a higher role to create sessions.');
                    return;
                }
                // Direct them to use /session
                await this.respondToInteraction(interaction, 'Use `/session` to start a new conversation with an agent.');
                break;
            }

            case 'stop_session': {
                const threadId = interaction.channel_id;
                const info = this.threadSessions.get(threadId);
                if (!info) {
                    await this.respondToInteraction(interaction, 'No active session in this thread.');
                    return;
                }

                // Only the owner or admins can stop
                if (info.ownerUserId && info.ownerUserId !== userId && permLevel < PermissionLevel.ADMIN) {
                    await this.respondToInteraction(interaction, 'Only the session owner or an admin can stop this session.');
                    return;
                }

                this.processManager.stopProcess(info.sessionId);
                const cb = this.threadCallbacks.get(threadId);
                if (cb) {
                    this.processManager.unsubscribe(cb.sessionId, cb.callback);
                    this.threadCallbacks.delete(threadId);
                }

                // Don't rename thread — keep original topic visible
                await this.acknowledgeButton(interaction, 'Session stopped.');
                break;
            }

            default:
                log.debug('Unknown button custom_id', { customId });
                await this.respondToInteraction(interaction, 'Unknown action.');
        }
    }

    /**
     * Acknowledge a button interaction with an ephemeral message.
     */
    private async acknowledgeButton(interaction: DiscordInteractionData, message: string): Promise<void> {
        assertSnowflake(interaction.id, 'interaction ID');
        assertInteractionToken(interaction.token);
        const response = await fetch(
            `https://discord.com/api/v10/interactions/${interaction.id}/${interaction.token}/callback`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: InteractionCallbackType.CHANNEL_MESSAGE,
                    data: { content: message, flags: 64 }, // 64 = ephemeral
                }),
            },
        );

        if (!response.ok) {
            const error = await response.text();
            log.error('Failed to acknowledge button', { status: response.status, error: error.slice(0, 200) });
        }
    }

    /**
     * Respond to an interaction with a rich embed (optionally ephemeral).
     */
    private async respondToInteractionEmbed(
        interaction: DiscordInteractionData,
        embed: {
            title?: string;
            description?: string;
            color?: number;
            fields?: Array<{ name: string; value: string; inline?: boolean }>;
            footer?: { text: string };
        },
        ephemeral = false,
    ): Promise<void> {
        assertSnowflake(interaction.id, 'interaction ID');
        assertInteractionToken(interaction.token);
        const response = await fetch(
            `https://discord.com/api/v10/interactions/${interaction.id}/${interaction.token}/callback`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: InteractionCallbackType.CHANNEL_MESSAGE,
                    data: {
                        embeds: [embed],
                        ...(ephemeral ? { flags: 64 } : {}),
                    },
                }),
            },
        );

        if (!response.ok) {
            const error = await response.text();
            log.error('Failed to respond to Discord interaction with embed', {
                status: response.status,
                error: error.slice(0, 200),
            });
        }
    }

    /**
     * Send an embed with action row buttons.
     */
    private async sendEmbedWithButtons(
        channelId: string,
        embed: {
            title?: string;
            description?: string;
            color?: number;
            fields?: Array<{ name: string; value: string; inline?: boolean }>;
            footer?: { text: string };
        },
        components: DiscordActionRow[],
    ): Promise<void> {
        try {
            await this.delivery.sendWithReceipt('discord', async () => {
                const response = await fetch(
                    `https://discord.com/api/v10/channels/${channelId}/messages`,
                    {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bot ${this.config.botToken}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ embeds: [embed], components }),
                    },
                );

                if (!response.ok) {
                    const error = await response.text();
                    log.error('Failed to send Discord embed with buttons', { status: response.status, error: error.slice(0, 200) });
                    throw new Error(`Discord embed+buttons failed: ${response.status}`);
                }
            });
        } catch {
            // Error already logged by DeliveryTracker
        }
    }

    /**
     * Build an action row with buttons.
     */
    private buildActionRow(...buttons: Array<{ label: string; customId: string; style?: number; emoji?: string }>): DiscordActionRow {
        return {
            type: ComponentType.ACTION_ROW,
            components: buttons.map(b => ({
                type: ComponentType.BUTTON,
                style: b.style ?? ButtonStyle.SECONDARY,
                label: b.label,
                custom_id: b.customId,
                ...(b.emoji ? { emoji: { name: b.emoji } } : {}),
            })),
        };
    }

    /**
     * Un-archive a thread so it can receive messages again.
     */
    private async unarchiveThread(threadId: string): Promise<void> {
        assertSnowflake(threadId, 'thread ID');
        const response = await fetch(
            `https://discord.com/api/v10/channels/${threadId}`,
            {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bot ${this.config.botToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ archived: false }),
            },
        );
        if (!response.ok) {
            log.debug('Failed to unarchive thread', { threadId, status: response.status });
        }
    }

    private checkRateLimit(userId: string, permLevel?: number): boolean {
        const now = Date.now();
        const timestamps = this.userMessageTimestamps.get(userId) ?? [];
        const recent = timestamps.filter(t => now - t < this.RATE_LIMIT_WINDOW_MS);

        // Tiered rate limiting: higher permission levels get higher limits
        let maxMessages = this.RATE_LIMIT_MAX_MESSAGES;
        if (permLevel !== undefined && this.config.rateLimitByLevel) {
            maxMessages = this.config.rateLimitByLevel[permLevel] ?? maxMessages;
        }

        if (recent.length >= maxMessages) return false;
        recent.push(now);
        this.userMessageTimestamps.set(userId, recent);
        return true;
    }

    /**
     * Resolve a user's permission level based on their roles.
     * Returns the highest permission level from all matching roles.
     */
    private resolvePermissionLevel(userId: string, memberRoles?: string[]): number {
        // Muted users are always blocked
        if (this.mutedUsers.has(userId)) return PermissionLevel.BLOCKED;

        // Legacy mode: use allowedUserIds
        if (!this.config.publicMode) {
            if (this.config.allowedUserIds.length > 0) {
                return this.config.allowedUserIds.includes(userId)
                    ? PermissionLevel.ADMIN
                    : PermissionLevel.BLOCKED;
            }
            return PermissionLevel.ADMIN; // No restrictions configured
        }

        // Public mode with role-based access
        if (!this.config.rolePermissions || !memberRoles?.length) {
            return this.config.defaultPermissionLevel ?? PermissionLevel.BASIC;
        }

        let maxLevel = this.config.defaultPermissionLevel ?? PermissionLevel.BASIC;
        for (const roleId of memberRoles) {
            const level = this.config.rolePermissions[roleId];
            if (level !== undefined && level > maxLevel) {
                maxLevel = level;
            }
        }
        return maxLevel;
    }

    /**
     * Check if a channel is one we're monitoring.
     */
    private isMonitoredChannel(channelId: string): boolean {
        if (channelId === this.config.channelId) return true;
        return this.config.additionalChannelIds?.includes(channelId) ?? false;
    }

    /**
     * Mute a user from bot interactions. Admin action.
     */
    muteUser(userId: string): void {
        this.mutedUsers.add(userId);
        log.info('User muted from Discord bot', { userId });
    }

    /**
     * Unmute a user. Admin action.
     */
    unmuteUser(userId: string): void {
        this.mutedUsers.delete(userId);
        log.info('User unmuted from Discord bot', { userId });
    }

    /**
     * Send a one-time welcome tip to a user on their first interaction.
     * Fire-and-forget — does not block the message flow.
     */
    private sendFirstInteractionTip(userId: string, channelId: string): void {
        if (this.interactedUsers.has(userId)) return;
        this.interactedUsers.add(userId);
        this.sendEmbed(channelId, {
            description: [
                `Hey <@${userId}>! Looks like your first time here.`,
                '',
                'Use `/quickstart` for a guided walkthrough, or `/help` to see all commands.',
                'You can also @mention me for a quick reply!',
            ].join('\n'),
            color: 0x57f287, // green
            footer: { text: 'This tip only appears once' },
        }).catch(() => {});
    }

    private async handleMessage(data: DiscordMessageData): Promise<void> {
        // Ignore bot messages
        if (data.author.bot) return;

        const text = data.content;
        if (!text) return;

        const userId = data.author.id;
        const channelId = data.channel_id;

        // Check if this message is in a thread we're tracking or a monitored channel
        const isMonitored = this.isMonitoredChannel(channelId);
        let isOurThread = this.threadSessions.has(channelId);
        // Try to recover thread from DB if not in memory (e.g. after server restart)
        if (!isOurThread && !isMonitored) {
            isOurThread = this.tryRecoverThread(channelId) !== null;
        }
        if (!isMonitored && !isOurThread) return;

        // Resolve permission level
        const permLevel = this.resolvePermissionLevel(userId, data.member?.roles);
        if (permLevel <= PermissionLevel.BLOCKED) {
            log.warn('Blocked Discord user', { userId, username: data.author.username, permLevel });
            await this.sendMessage(channelId, 'You do not have permission to interact with this bot.');
            return;
        }

        // Per-user rate limiting with tiered limits
        if (!this.checkRateLimit(userId, permLevel)) {
            await this.sendMessage(channelId, 'Slow down! Please wait before sending more messages.');
            return;
        }

        // Prompt injection scan
        const injectionResult = scanForInjection(text);
        if (injectionResult.blocked) {
            log.warn('Blocked message: prompt injection detected', {
                userId,
                username: data.author.username,
                confidence: injectionResult.confidence,
                patterns: injectionResult.matches.map((m) => m.pattern),
                contentPreview: text.slice(0, 100),
            });
            recordAudit(
                this.db,
                'injection_blocked',
                userId,
                'discord_message',
                null,
                JSON.stringify({
                    channel: 'discord',
                    confidence: injectionResult.confidence,
                    patterns: injectionResult.matches.map((m) => m.pattern),
                    contentPreview: text.slice(0, 200),
                }),
            );
            await this.sendMessage(channelId, 'Message blocked: content policy violation.');
            return;
        }

        // If this message is in a thread we're tracking, route to that thread's session
        if (isOurThread) {
            this.sendFirstInteractionTip(userId, channelId);
            // Acknowledge receipt with reaction and show typing
            this.addReaction(channelId, data.id, '%F0%9F%91%80').catch(() => {}); // 👀
            this.sendTypingIndicator(channelId).catch(() => {});
            await this.routeToThread(channelId, userId, text);
            return;
        }

        // Passive channel mode: only respond to @mentions in the main channel
        const isBotMentioned = this.botUserId
            ? data.mentions?.some(m => m.id === this.botUserId) ?? false
            : false;

        if (!isBotMentioned) return; // silently ignore regular channel messages

        // First-interaction welcome tip for @mention users
        this.sendFirstInteractionTip(userId, channelId);

        // Acknowledge with reaction and typing indicator
        this.addReaction(channelId, data.id, '%F0%9F%91%80').catch(() => {}); // 👀
        this.sendTypingIndicator(channelId).catch(() => {});

        // Handle @mention as one-off reply or work intake
        if (this.mode === 'work_intake') {
            await this.handleWorkIntake(channelId, data.id, userId, text);
        } else {
            await this.handleMentionReply(channelId, userId, data.id, text);
        }
    }

    // ── Work Intake Mode ─────────────────────────────────────────────────

    private async handleWorkIntake(
        channelId: string,
        messageId: string,
        userId: string,
        text: string,
    ): Promise<void> {
        if (!this.workTaskService) {
            await this.sendMessage(channelId, 'Work intake mode requires WorkTaskService. Check server configuration.');
            return;
        }

        // Strip bot mentions from the task description
        const description = text.replace(/<@!?\d+>/g, '').trim();
        if (!description) {
            await this.sendMessage(channelId, 'Please provide a task description.');
            return;
        }

        // Resolve agent
        const agents = listAgents(this.db);
        const agent = this.config.defaultAgentId
            ? agents.find(a => a.id === this.config.defaultAgentId) ?? agents[0]
            : agents[0];
        if (!agent) {
            await this.sendMessage(channelId, 'No agents configured. Create an agent first.');
            return;
        }

        try {
            const task = await this.workTaskService.create({
                agentId: agent.id,
                description,
                source: 'discord',
                sourceId: messageId,
                requesterInfo: { discordUserId: userId, channelId, messageId },
            });

            log.info('Work task created from Discord', { taskId: task.id, userId });

            // Send acknowledgment embed
            await this.sendEmbed(channelId, {
                title: 'Task Queued',
                description: `**${task.id}**\n\n${description.slice(0, 200)}${description.length > 200 ? '...' : ''}`,
                color: 0x5865f2, // Discord blurple
                footer: { text: `Status: ${task.status}` },
            });

            // Subscribe for completion
            this.workTaskService.onComplete(task.id, (completedTask) => {
                this.sendTaskResult(channelId, completedTask).catch(err => {
                    log.error('Failed to send task result to Discord', {
                        taskId: completedTask.id,
                        error: err instanceof Error ? err.message : String(err),
                    });
                });
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            log.error('Failed to create work task from Discord', { error: message, userId });

            await this.sendEmbed(channelId, {
                title: 'Task Failed',
                description: message.slice(0, 500),
                color: 0xed4245, // Red
            });
        }
    }

    private async sendTaskResult(channelId: string, task: import('../../shared/types/work-tasks').WorkTask): Promise<void> {
        if (task.status === 'completed') {
            const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

            if (task.prUrl) {
                fields.push({ name: 'Pull Request', value: task.prUrl, inline: false });
            }

            if (task.summary) {
                fields.push({ name: 'Summary', value: task.summary.slice(0, 1024), inline: false });
            }

            await this.sendEmbed(channelId, {
                title: 'Task Completed',
                description: task.description.slice(0, 200),
                color: 0x57f287, // Green
                fields,
                footer: { text: `Task: ${task.id}` },
            });
        } else if (task.status === 'failed') {
            await this.sendEmbed(channelId, {
                title: 'Task Failed',
                description: task.description.slice(0, 200),
                color: 0xed4245, // Red
                fields: task.error
                    ? [{ name: 'Error', value: task.error.slice(0, 1024), inline: false }]
                    : [],
                footer: { text: `Task: ${task.id} | Iterations: ${task.iterationCount}` },
            });
        }
    }

    // ── Discord Embeds ───────────────────────────────────────────────────

    private async sendEmbed(
        channelId: string,
        embed: {
            title?: string;
            description?: string;
            color?: number;
            fields?: Array<{ name: string; value: string; inline?: boolean }>;
            footer?: { text: string };
        },
    ): Promise<void> {
        try {
            await this.delivery.sendWithReceipt('discord', async () => {
                const response = await fetch(
                    `https://discord.com/api/v10/channels/${channelId}/messages`,
                    {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bot ${this.config.botToken}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ embeds: [embed] }),
                    },
                );

                if (!response.ok) {
                    const error = await response.text();
                    log.error('Failed to send Discord embed', { status: response.status, error: error.slice(0, 200) });
                    throw new Error(`Discord embed failed: ${response.status}`);
                }
            });
        } catch {
            // Error already logged by DeliveryTracker
        }
    }

    // ── Chat Mode ────────────────────────────────────────────────────────

    /**
     * Handle an @mention in the main channel with a one-off reply.
     * No thread or persistent session is created.
     */
    private async handleMentionReply(channelId: string, _userId: string, messageId: string, text: string): Promise<void> {
        const agent = this.resolveDefaultAgent();
        if (!agent) {
            await this.sendMessage(channelId, 'No agents configured. Create an agent first.');
            return;
        }

        const projects = listProjects(this.db);
        const project = agent.defaultProjectId
            ? projects.find(p => p.id === agent.defaultProjectId) ?? projects[0]
            : projects[0];

        if (!project) {
            await this.sendMessage(channelId, 'No projects configured.');
            return;
        }

        // Strip bot mention from text
        const cleanText = text.replace(/<@!?\d+>/g, '').trim();
        if (!cleanText) return;

        // Create an ephemeral session for the one-off reply
        const session = createSession(this.db, {
            projectId: project.id,
            agentId: agent.id,
            name: `Discord mention:${messageId}`,
            initialPrompt: cleanText,
            source: 'discord' as SessionSource,
        });

        this.processManager.startProcess(session, cleanText);

        // Subscribe and send response inline (not in a thread)
        this.subscribeForInlineResponse(session.id, channelId, messageId, agent.name, agent.model || 'unknown');
    }

    /**
     * Subscribe for agent response and send it as an inline reply in the channel.
     * Used for one-off @mention responses.
     */
    private subscribeForInlineResponse(
        sessionId: string,
        channelId: string,
        replyToMessageId: string,
        agentName: string,
        agentModel: string,
    ): void {
        let buffer = '';
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;
        const color = this.agentColor(agentName);

        const flush = async () => {
            if (!buffer) return;
            const text = buffer;
            buffer = '';

            // Smart-split long responses at natural boundaries
            const parts = splitEmbedDescription(text);
            for (let i = 0; i < parts.length; i++) {
                // Only first chunk is a reply to the original message
                if (i === 0) {
                    await this.sendReplyEmbed(channelId, replyToMessageId, {
                        description: parts[i],
                        color,
                        footer: { text: `${agentName} · ${agentModel}` },
                    });
                } else {
                    await this.sendEmbed(channelId, {
                        description: parts[i],
                        color,
                        footer: { text: `${agentName} · ${agentModel}` },
                    });
                }
            }
        };

        this.processManager.subscribe(sessionId, (_sid, event) => {
            if (event.type === 'assistant' && event.message) {
                const msg = event.message as { content?: unknown };
                const content = extractContentText(msg.content as string | import('../process/types').ContentBlock[] | undefined);
                if (content) {
                    buffer += content;
                    if (debounceTimer) clearTimeout(debounceTimer);
                    debounceTimer = setTimeout(() => flush(), 1500);
                }
            }

            if (event.type === 'result') {
                if (debounceTimer) clearTimeout(debounceTimer);
                flush();
            }
        });
    }

    /**
     * Send an embed as a reply to a specific message.
     */
    private async sendReplyEmbed(
        channelId: string,
        replyToMessageId: string,
        embed: {
            description?: string;
            color?: number;
            footer?: { text: string };
        },
    ): Promise<void> {
        assertSnowflake(channelId, 'channel ID');
        assertSnowflake(replyToMessageId, 'message ID');
        try {
            await this.delivery.sendWithReceipt('discord', async () => {
                const response = await fetch(
                    `https://discord.com/api/v10/channels/${encodeURIComponent(channelId)}/messages`,
                    {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bot ${this.config.botToken}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            embeds: [embed],
                            message_reference: { message_id: replyToMessageId },
                        }),
                    },
                );

                if (!response.ok) {
                    const error = await response.text();
                    log.error('Failed to send Discord reply embed', { status: response.status, error: error.slice(0, 200) });
                    throw new Error(`Discord reply embed failed: ${response.status}`);
                }
            });
        } catch {
            // Error already logged by DeliveryTracker
        }
    }

    /**
     * Route a message within an existing thread to the thread's session.
     * Any user can participate — conversations are shared within threads.
     */
    private async routeToThread(threadId: string, _userId: string, text: string): Promise<void> {
        // Track activity for stale detection
        this.threadLastActivity.set(threadId, Date.now());

        let threadInfo = this.threadSessions.get(threadId);

        // Try to recover thread mapping from DB if not in memory (e.g. after server restart)
        if (!threadInfo) {
            threadInfo = this.tryRecoverThread(threadId) ?? undefined;
            if (!threadInfo) return;
        }

        const { sessionId, agentName, agentModel } = threadInfo;

        // Check if session still exists (stopped/error sessions can be resumed)
        const session = getSession(this.db, sessionId);
        if (!session) {
            this.threadSessions.delete(threadId);
            await this.sendEmbedWithButtons(threadId, {
                description: 'This conversation has ended.',
                color: 0x95a5a6,
            }, [
                this.buildActionRow(
                    { label: 'New Session', customId: 'new_session', style: ButtonStyle.PRIMARY, emoji: '➕' },
                ),
            ]);
            return;
        }

        const sent = this.processManager.sendMessage(sessionId, text);
        if (!sent) {
            // Resume with conversation context instead of starting fresh
            this.processManager.resumeProcess(session, text);
            this.subscribeForResponseWithEmbed(sessionId, threadId, agentName, agentModel);
            return;
        }

        this.subscribeForResponseWithEmbed(sessionId, threadId, agentName, agentModel);
    }

    /**
     * Try to recover a thread-to-session mapping from the database.
     * Sessions are named `Discord thread:{threadId}` so we can look them up.
     */
    private tryRecoverThread(threadId: string): { sessionId: string; agentName: string; agentModel: string; ownerUserId: string; topic?: string } | null {
        try {
            const row = this.db.query(
                `SELECT s.id, s.agent_id, s.initial_prompt, a.name as agent_name, a.model as agent_model
                 FROM sessions s
                 LEFT JOIN agents a ON a.id = s.agent_id
                 WHERE s.name = ? AND s.source = 'discord'
                 ORDER BY s.created_at DESC LIMIT 1`,
            ).get(`Discord thread:${threadId}`) as { id: string; agent_id: string; initial_prompt: string; agent_name: string; agent_model: string } | null;

            if (!row) return null;

            const info = {
                sessionId: row.id,
                agentName: row.agent_name || 'Agent',
                agentModel: row.agent_model || 'unknown',
                ownerUserId: '',
                topic: row.initial_prompt || undefined,
            };
            this.threadSessions.set(threadId, info);
            log.info('Recovered thread session from DB', { threadId, sessionId: row.id });
            return info;
        } catch (err) {
            log.warn('Failed to recover thread session', { threadId, error: err instanceof Error ? err.message : String(err) });
            return null;
        }
    }

    /**
     * Resolve the default agent.
     * Priority: config default > first agent.
     */
    private resolveDefaultAgent(): import('../../shared/types').Agent | null {
        const agents = listAgents(this.db);
        if (agents.length === 0) return null;

        if (this.config.defaultAgentId) {
            const defaultAgent = agents.find(a => a.id === this.config.defaultAgentId);
            if (defaultAgent) return defaultAgent;
        }

        return agents[0];
    }

    /**
     * Create a standalone Discord thread (not attached to a message).
     * Used by /session command. Returns the thread channel ID, or null on failure.
     */
    private async createStandaloneThread(channelId: string, name: string): Promise<string | null> {
        assertSnowflake(channelId, 'channel ID');
        const safeChannelId = encodeURIComponent(channelId);
        const response = await fetch(
            `https://discord.com/api/v10/channels/${safeChannelId}/threads`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bot ${this.config.botToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: name.slice(0, 100),
                    type: 11, // GUILD_PUBLIC_THREAD
                    auto_archive_duration: 1440, // 24 hours
                }),
            },
        );

        if (response.ok) {
            const thread = await response.json() as { id: string };
            log.info('Discord standalone thread created', { threadId: thread.id, name: name.slice(0, 60) });
            return thread.id;
        }

        const error = await response.text();
        log.error('Failed to create Discord thread', { status: response.status, error: error.slice(0, 200) });
        return null;
    }

    /**
     * Subscribe for agent responses and send them as rich embeds in the thread.
     * Shows agent name and model in the embed footer.
     */
    private subscribeForResponseWithEmbed(
        sessionId: string,
        threadId: string,
        agentName: string,
        agentModel: string,
    ): void {
        // Unsubscribe the previous callback for this thread to prevent duplicates
        const prev = this.threadCallbacks.get(threadId);
        if (prev) {
            this.processManager.unsubscribe(prev.sessionId, prev.callback);
        }

        let buffer = '';
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;
        let lastStatusTime = 0;
        let lastTypingTime = 0;
        const STATUS_DEBOUNCE_MS = 3000; // Don't flood status updates
        const TYPING_REFRESH_MS = 8000; // Refresh typing indicator before 10s expiry

        // Agent color — consistent per agent name
        const color = this.agentColor(agentName);

        const flush = async () => {
            if (!buffer) return;
            const text = buffer;
            buffer = '';

            // Smart-split long responses at natural boundaries
            const parts = splitEmbedDescription(text);
            for (const part of parts) {
                await this.sendEmbed(threadId, {
                    description: part,
                    color,
                    footer: { text: `${agentName} · ${agentModel}` },
                });
            }
        };

        const callback: import('../process/interfaces').EventCallback = (_sid, event) => {
            if (event.type === 'assistant' && event.message) {
                const msg = event.message as { content?: unknown };
                const content = extractContentText(msg.content as string | import('../process/types').ContentBlock[] | undefined);

                if (content) {
                    buffer += content;
                    if (debounceTimer) clearTimeout(debounceTimer);
                    debounceTimer = setTimeout(() => flush(), 1500);
                }

                // Refresh typing indicator periodically while agent is responding
                const now = Date.now();
                if (now - lastTypingTime >= TYPING_REFRESH_MS) {
                    lastTypingTime = now;
                    this.sendTypingIndicator(threadId).catch(() => {});
                }
            }

            // Show tool status updates (e.g. "Creating work task...", "Searching...")
            if (event.type === 'tool_status' && event.statusMessage) {
                const now = Date.now();
                if (now - lastStatusTime >= STATUS_DEBOUNCE_MS) {
                    lastStatusTime = now;
                    this.sendEmbed(threadId, {
                        description: `⏳ ${event.statusMessage}`,
                        color: 0x95a5a6, // Gray for status
                        footer: { text: `${agentName} · working...` },
                    }).catch(() => {}); // Best-effort
                }
                // Refresh typing indicator with status updates
                if (now - lastTypingTime >= TYPING_REFRESH_MS) {
                    lastTypingTime = now;
                    this.sendTypingIndicator(threadId).catch(() => {});
                }
            }

            if (event.type === 'result') {
                if (debounceTimer) clearTimeout(debounceTimer);
                flush();
                // Clean up tracking on completion
                this.threadCallbacks.delete(threadId);

                // Send completion message with Resume button (don't rename thread — keep original topic visible)
                this.sendEmbedWithButtons(threadId, {
                    description: 'Session complete. Send a message to continue, or use the buttons below.',
                    color: 0x57f287,
                    footer: { text: `${agentName} · done` },
                }, [
                    this.buildActionRow(
                        { label: 'Resume', customId: 'resume_thread', style: ButtonStyle.SUCCESS, emoji: '🔄' },
                        { label: 'New Session', customId: 'new_session', style: ButtonStyle.SECONDARY, emoji: '➕' },
                    ),
                ]).catch(() => {});
            }

            // Notify thread on session error
            if (event.type === 'session_error') {
                const errEvent = event as { error?: { message?: string; errorType?: string } };
                const errMsg = errEvent.error?.message || 'Unknown error';
                this.sendEmbedWithButtons(threadId, {
                    title: 'Session Error',
                    description: errMsg.slice(0, 4096),
                    color: 0xff3355, // Red
                    footer: { text: `${agentName} · ${errEvent.error?.errorType || 'error'}` },
                }, [
                    this.buildActionRow(
                        { label: 'Resume', customId: 'resume_thread', style: ButtonStyle.SUCCESS, emoji: '🔄' },
                    ),
                ]).catch(() => {});
            }

            // Notify thread on unexpected exit (no result received)
            if (event.type === 'session_exited') {
                if (debounceTimer) clearTimeout(debounceTimer);
                flush(); // Flush any buffered text first
                this.threadCallbacks.delete(threadId);
            }
        };

        this.processManager.subscribe(sessionId, callback);
        this.threadCallbacks.set(threadId, { sessionId, callback });
    }

    /** Generate a consistent color for an agent name. */
    private agentColor(name: string): number {
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
        }
        // Map to a pleasant color range (avoid very dark/light)
        const hue = Math.abs(hash) % 360;
        // HSL to RGB approximation for Discord embed colors
        const s = 0.6, l = 0.5;
        const c = (1 - Math.abs(2 * l - 1)) * s;
        const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
        const m = l - c / 2;
        let r = 0, g = 0, b = 0;
        if (hue < 60) { r = c; g = x; }
        else if (hue < 120) { r = x; g = c; }
        else if (hue < 180) { g = c; b = x; }
        else if (hue < 240) { g = x; b = c; }
        else if (hue < 300) { r = x; b = c; }
        else { r = c; b = x; }
        return (Math.round((r + m) * 255) << 16)
             | (Math.round((g + m) * 255) << 8)
             | Math.round((b + m) * 255);
    }

    // ── Thread Management ─────────────────────────────────────────────────

    /**
     * Archive threads that have been inactive for STALE_THREAD_MS.
     * Sends a closing message before archiving.
     */
    private async archiveStaleThreads(): Promise<void> {
        const now = Date.now();
        const staleThreads: string[] = [];

        for (const [threadId, lastActive] of this.threadLastActivity) {
            if (now - lastActive >= this.STALE_THREAD_MS) {
                staleThreads.push(threadId);
            }
        }

        for (const threadId of staleThreads) {
            try {
                await this.sendEmbedWithButtons(threadId, {
                    description: 'This conversation has been idle. Archiving thread.',
                    color: 0x95a5a6,
                }, [
                    this.buildActionRow(
                        { label: 'Resume', customId: 'resume_thread', style: ButtonStyle.SUCCESS, emoji: '🔄' },
                        { label: 'New Session', customId: 'new_session', style: ButtonStyle.SECONDARY, emoji: '➕' },
                    ),
                ]);

                await this.archiveThread(threadId);
                this.threadLastActivity.delete(threadId);
                this.threadSessions.delete(threadId);
                const cb = this.threadCallbacks.get(threadId);
                if (cb) {
                    this.processManager.unsubscribe(cb.sessionId, cb.callback);
                    this.threadCallbacks.delete(threadId);
                }
                log.info('Auto-archived stale thread', { threadId });
            } catch (err) {
                log.warn('Failed to archive stale thread', {
                    threadId,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }
    }

    /**
     * Archive a thread via the Discord API.
     */
    private async archiveThread(threadId: string): Promise<void> {
        assertSnowflake(threadId, 'thread ID');
        const response = await fetch(
            `https://discord.com/api/v10/channels/${threadId}`,
            {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bot ${this.config.botToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ archived: true }),
            },
        );

        if (!response.ok) {
            const error = await response.text();
            log.warn('Failed to archive thread', { threadId, status: response.status, error: error.slice(0, 200) });
        }
    }

    // ── Messaging ────────────────────────────────────────────────────────

    async sendMessage(channelId: string, content: string): Promise<void> {
        // Smart-split at natural boundaries (paragraphs, sentences, code blocks)
        const chunks = splitMessage(content, MAX_MESSAGE_LENGTH);

        for (const chunk of chunks) {
            try {
                await this.delivery.sendWithReceipt('discord', async () => {
                    const response = await fetch(
                        `https://discord.com/api/v10/channels/${channelId}/messages`,
                        {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bot ${this.config.botToken}`,
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({ content: chunk }),
                        },
                    );

                    if (!response.ok) {
                        const error = await response.text();
                        log.error('Failed to send Discord message', { status: response.status, error: error.slice(0, 200) });
                        throw new Error(`Discord sendMessage failed: ${response.status}`);
                    }
                });
            } catch {
                // Error already logged by DeliveryTracker
            }
        }
    }

    // ── Typing Indicator ─────────────────────────────────────────────────

    /**
     * Send a typing indicator to a channel.
     * Lasts ~10 seconds or until a message is sent.
     */
    async sendTypingIndicator(channelId: string): Promise<void> {
        try {
            const response = await fetch(
                `https://discord.com/api/v10/channels/${channelId}/typing`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bot ${this.config.botToken}`,
                    },
                },
            );
            if (!response.ok) {
                log.debug('Failed to send typing indicator', { status: response.status });
            }
        } catch {
            // Best-effort — don't fail on typing indicator errors
        }
    }

    // ── Message Reactions ────────────────────────────────────────────────

    /**
     * Add a reaction to a message. Used to acknowledge receipt before full response.
     * @param emoji URL-encoded emoji (e.g. '%F0%9F%91%80' for 👀, '%E2%9C%85' for ✅)
     */
    async addReaction(channelId: string, messageId: string, emoji: string): Promise<void> {
        try {
            assertSnowflake(channelId, 'channel ID');
            assertSnowflake(messageId, 'message ID');
            const response = await fetch(
                `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}/reactions/${emoji}/@me`,
                {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bot ${this.config.botToken}`,
                    },
                },
            );
            if (!response.ok) {
                log.debug('Failed to add reaction', { status: response.status, emoji });
            }
        } catch {
            // Best-effort — don't fail on reaction errors
        }
    }

    /**
     * Remove a reaction from a message.
     */
    async removeReaction(channelId: string, messageId: string, emoji: string): Promise<void> {
        try {
            assertSnowflake(channelId, 'channel ID');
            assertSnowflake(messageId, 'message ID');
            const response = await fetch(
                `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}/reactions/${emoji}/@me`,
                {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bot ${this.config.botToken}`,
                    },
                },
            );
            if (!response.ok) {
                log.debug('Failed to remove reaction', { status: response.status, emoji });
            }
        } catch {
            // Best-effort
        }
    }
}

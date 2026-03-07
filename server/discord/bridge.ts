import type { Database } from 'bun:sqlite';
import type { ProcessManager } from '../process/manager';
import type { SessionSource } from '../../shared/types';
import type { WorkTaskService } from '../work/service';
import type {
    DiscordBridgeConfig,
    DiscordGatewayPayload,
    DiscordHelloData,
    DiscordReadyData,
    DiscordMessageData,
    DiscordInteractionData,
} from './types';
import { GatewayOp, GatewayIntent, InteractionType, InteractionCallbackType } from './types';
import { listAgents } from '../db/agents';
import { listCouncils } from '../db/councils';
import { launchCouncil } from '../councils/discussion';
import { createSession, getSession } from '../db/sessions';
import { listProjects } from '../db/projects';
import { createLogger } from '../lib/logger';
import { scanForInjection } from '../lib/prompt-injection';
import { extractContentText } from '../process/types';
import { recordAudit } from '../db/audit';

const log = createLogger('DiscordBridge');

const GATEWAY_URL = 'wss://gateway.discord.gg/?v=10&encoding=json';
const MAX_MESSAGE_LENGTH = 2000;

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

    private ws: WebSocket | null = null;
    private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    private heartbeatAcked = true;
    private sequence: number | null = null;
    private sessionId: string | null = null;
    // Note: resume_gateway_url from Discord READY is intentionally not stored
    // to avoid SSRF risk. We always reconnect via the hardcoded gateway URL.
    private running = false;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 10;

    // Map Discord userId → active session info (sessionId + threadId + agent)
    private userSessions: Map<string, { sessionId: string; threadId: string; agentName: string }> = new Map();

    // Map Discord threadId → session info (for thread-based conversations)
    private threadSessions: Map<string, { sessionId: string; agentName: string; agentModel: string; ownerUserId: string }> = new Map();

    // Map Discord userId → preferred agent ID (set by /switch)
    private userPreferredAgent: Map<string, string> = new Map();

    // Per-user rate limiting: userId → timestamps of recent messages
    private userMessageTimestamps: Map<string, number[]> = new Map();
    private readonly RATE_LIMIT_WINDOW_MS = 60_000;
    private readonly RATE_LIMIT_MAX_MESSAGES = 10;

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
    }

    private get mode() {
        return this.config.mode ?? 'chat';
    }

    start(): void {
        if (this.running) return;
        this.running = true;
        log.info('Discord bridge starting', { channelId: this.config.channelId, mode: this.mode });
        this.connect();

        // Register slash commands if app ID is configured
        if (this.config.appId) {
            this.registerSlashCommands().catch(err => {
                log.error('Failed to register Discord slash commands', {
                    error: err instanceof Error ? err.message : String(err),
                });
            });
        }
    }

    stop(): void {
        this.running = false;
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
        if (this.ws) {
            this.ws.close(1000, 'Shutting down');
            this.ws = null;
        }
        log.info('Discord bridge stopped');
    }

    private connect(): void {
        // Always use the hardcoded gateway URL to prevent SSRF.
        // Discord handles re-identification when we don't use the resume URL.
        log.info('Connecting to Discord gateway');

        this.ws = new WebSocket(GATEWAY_URL);

        this.ws.onopen = () => {
            log.info('Discord gateway connected');
            this.reconnectAttempts = 0;
        };

        this.ws.onmessage = (event) => {
            try {
                const payload = JSON.parse(String(event.data)) as DiscordGatewayPayload;
                this.handleGatewayMessage(payload);
            } catch (err) {
                log.error('Failed to parse gateway message', { error: err instanceof Error ? err.message : String(err) });
            }
        };

        this.ws.onclose = (event) => {
            log.warn('Discord gateway disconnected', { code: event.code, reason: event.reason });
            if (this.heartbeatTimer) {
                clearInterval(this.heartbeatTimer);
                this.heartbeatTimer = null;
            }
            if (this.running) {
                this.scheduleReconnect();
            }
        };

        this.ws.onerror = (event) => {
            log.error('Discord gateway error', { error: String(event) });
        };
    }

    private handleGatewayMessage(payload: DiscordGatewayPayload): void {
        // Update sequence number
        if (payload.s !== null) {
            this.sequence = payload.s;
        }

        switch (payload.op) {
            case GatewayOp.HELLO: {
                const data = payload.d as DiscordHelloData;
                this.startHeartbeat(data.heartbeat_interval);
                // If we have a session, try to resume; otherwise identify
                if (this.sessionId) {
                    this.resume();
                } else {
                    this.identify();
                }
                break;
            }

            case GatewayOp.HEARTBEAT_ACK:
                this.heartbeatAcked = true;
                break;

            case GatewayOp.DISPATCH:
                this.handleDispatch(payload);
                break;

            case GatewayOp.RECONNECT:
                log.info('Discord requested reconnect');
                this.ws?.close(4000, 'Reconnect requested');
                break;

            case GatewayOp.INVALID_SESSION: {
                const resumable = payload.d as boolean;
                log.warn('Discord invalid session', { resumable });
                if (!resumable) {
                    this.sessionId = null;
                }
                // Wait 1-5 seconds before re-identifying
                setTimeout(() => {
                    if (this.sessionId) {
                        this.resume();
                    } else {
                        this.identify();
                    }
                }, 1000 + Math.random() * 4000);
                break;
            }
        }
    }

    private handleDispatch(payload: DiscordGatewayPayload): void {
        switch (payload.t) {
            case 'READY': {
                const data = payload.d as DiscordReadyData;
                this.sessionId = data.session_id;
                // resume_gateway_url intentionally not stored (SSRF prevention)
                log.info('Discord gateway ready', { sessionId: this.sessionId });
                break;
            }

            case 'RESUMED':
                log.info('Discord session resumed');
                break;

            case 'MESSAGE_CREATE': {
                const data = payload.d as DiscordMessageData;
                this.handleMessage(data).catch(err => {
                    log.error('Error handling Discord message', { error: err instanceof Error ? err.message : String(err) });
                });
                break;
            }

            case 'INTERACTION_CREATE': {
                const data = payload.d as DiscordInteractionData;
                this.handleInteraction(data).catch(err => {
                    log.error('Error handling Discord interaction', { error: err instanceof Error ? err.message : String(err) });
                });
                break;
            }
        }
    }

    private identify(): void {
        this.send({
            op: GatewayOp.IDENTIFY,
            d: {
                token: this.config.botToken,
                intents: GatewayIntent.GUILD_MESSAGES | GatewayIntent.MESSAGE_CONTENT,
                properties: {
                    os: 'linux',
                    browser: 'corvid-agent',
                    device: 'corvid-agent',
                },
                presence: this.buildPresence(),
            },
            s: null,
            t: null,
        });
    }

    /**
     * Build the presence payload from DISCORD_STATUS and DISCORD_ACTIVITY_TYPE env vars.
     * Activity types: 0=Playing, 1=Streaming, 2=Listening, 3=Watching, 5=Competing
     */
    private buildPresence(): Record<string, unknown> {
        const statusText = process.env.DISCORD_STATUS ?? 'corvid-agent';
        const activityType = parseInt(process.env.DISCORD_ACTIVITY_TYPE ?? '3', 10); // default: Watching
        return {
            status: 'online',
            activities: [{
                name: statusText,
                type: activityType,
            }],
            since: null,
            afk: false,
        };
    }

    /** Update the bot's presence on the live gateway connection. */
    updatePresence(statusText?: string, activityType?: number): void {
        this.send({
            op: GatewayOp.PRESENCE_UPDATE,
            d: {
                status: 'online',
                activities: [{
                    name: statusText ?? process.env.DISCORD_STATUS ?? 'corvid-agent',
                    type: activityType ?? parseInt(process.env.DISCORD_ACTIVITY_TYPE ?? '3', 10),
                }],
                since: null,
                afk: false,
            },
            s: null,
            t: null,
        });
    }

    // ── Slash Command Registration ─────────────────────────────────────

    private async registerSlashCommands(): Promise<void> {
        const appId = this.config.appId;
        if (!appId) return;

        const commands = [
            {
                name: 'status',
                description: 'Show your current session ID',
                type: 1, // CHAT_INPUT
            },
            {
                name: 'new',
                description: 'Clear your session and start fresh',
                type: 1,
            },
            {
                name: 'agents',
                description: 'List all available agents',
                type: 1,
            },
            {
                name: 'switch',
                description: 'Switch to a different agent',
                type: 1,
                options: [{
                    name: 'agent',
                    description: 'Name of the agent to switch to',
                    type: 3, // STRING
                    required: true,
                }],
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
        // Only handle application commands
        if (interaction.type !== InteractionType.APPLICATION_COMMAND) return;

        const commandName = interaction.data?.name;
        if (!commandName) return;

        const userId = interaction.member?.user?.id ?? interaction.user?.id;
        if (!userId) return;

        // Authorization check
        if (this.config.allowedUserIds.length > 0 && !this.config.allowedUserIds.includes(userId)) {
            await this.respondToInteraction(interaction, 'Unauthorized.');
            return;
        }

        const options = interaction.data?.options ?? [];
        const getOption = (name: string) => options.find(o => o.name === name)?.value as string | undefined;

        switch (commandName) {
            case 'status': {
                const info = this.userSessions.get(userId);
                if (info) {
                    await this.respondToInteraction(interaction, `Agent: **${info.agentName}** | Session: \`${info.sessionId.slice(0, 8)}\``);
                } else {
                    await this.respondToInteraction(interaction, 'No active session. Send a message to start one.');
                }
                break;
            }

            case 'new': {
                this.userSessions.delete(userId);
                await this.respondToInteraction(interaction, 'Session cleared. Your next message will start a new conversation thread.');
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

            case 'switch': {
                const targetName = getOption('agent');
                if (!targetName) {
                    await this.respondToInteraction(interaction, 'Please provide an agent name.');
                    break;
                }
                const agents = listAgents(this.db);
                const targetAgent = agents.find(a =>
                    a.name.toLowerCase() === targetName.toLowerCase() ||
                    a.name.toLowerCase().replace(/\s+/g, '') === targetName.toLowerCase().replace(/\s+/g, '')
                );
                if (!targetAgent) {
                    const names = agents.map(a => a.name).join(', ');
                    await this.respondToInteraction(interaction, `Agent not found: "${targetName}". Available: ${names}`);
                    break;
                }
                this.userSessions.delete(userId);
                this.userPreferredAgent.set(userId, targetAgent.id);
                await this.respondToInteraction(interaction, `Switched to **${targetAgent.name}**. Your next message will start a new session with this agent.`);
                break;
            }

            case 'council': {
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
                    await this.respondToInteraction(interaction,
                        `Council deliberation launched.\nCouncil: **${council.name}**\nLaunch ID: ${result.launchId}\nSessions: ${result.sessionIds.length}`);
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    await this.respondToInteraction(interaction, `Failed to launch council: ${msg}`);
                }
                break;
            }

            default:
                await this.respondToInteraction(interaction, `Unknown command: ${commandName}`);
        }
    }

    private async respondToInteraction(interaction: DiscordInteractionData, content: string): Promise<void> {
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

    private resume(): void {
        this.send({
            op: GatewayOp.RESUME,
            d: {
                token: this.config.botToken,
                session_id: this.sessionId,
                seq: this.sequence,
            },
            s: null,
            t: null,
        });
    }

    private startHeartbeat(intervalMs: number): void {
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);

        // Use a fixed heartbeat interval (41.25s, Discord's typical default).
        // The server-provided value is validated but we use a constant to prevent
        // resource exhaustion from malicious/malformed gateway payloads.
        const HEARTBEAT_MS = 41_250;
        if (intervalMs < 10_000 || intervalMs > 120_000) {
            log.warn('Discord heartbeat interval out of range, using default', { received: intervalMs });
        }

        // Send first heartbeat after jitter
        setTimeout(() => this.heartbeat(), Math.random() * HEARTBEAT_MS);

        this.heartbeatTimer = setInterval(() => {
            if (!this.heartbeatAcked) {
                log.warn('Discord heartbeat not acknowledged, reconnecting');
                this.ws?.close(4000, 'Heartbeat timeout');
                return;
            }
            this.heartbeat();
        }, HEARTBEAT_MS);
    }

    private heartbeat(): void {
        this.heartbeatAcked = false;
        this.send({
            op: GatewayOp.HEARTBEAT,
            d: this.sequence,
            s: null,
            t: null,
        });
    }

    private send(payload: DiscordGatewayPayload): void {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(payload));
        }
    }

    private scheduleReconnect(): void {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            log.error('Max Discord reconnect attempts reached, giving up');
            this.running = false;
            return;
        }

        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 60000);
        this.reconnectAttempts++;
        log.info(`Reconnecting to Discord in ${delay}ms (attempt ${this.reconnectAttempts})`);

        setTimeout(() => {
            if (this.running) {
                this.connect();
            }
        }, delay);
    }

    private checkRateLimit(userId: string): boolean {
        const now = Date.now();
        const timestamps = this.userMessageTimestamps.get(userId) ?? [];
        const recent = timestamps.filter(t => now - t < this.RATE_LIMIT_WINDOW_MS);
        if (recent.length >= this.RATE_LIMIT_MAX_MESSAGES) return false;
        recent.push(now);
        this.userMessageTimestamps.set(userId, recent);
        return true;
    }

    private async handleMessage(data: DiscordMessageData): Promise<void> {
        // Ignore bot messages
        if (data.author.bot) return;

        const text = data.content;
        if (!text) return;

        const userId = data.author.id;
        const channelId = data.channel_id;

        // Allow messages from configured channel OR from threads we created
        const isMainChannel = channelId === this.config.channelId;
        const isOurThread = this.threadSessions.has(channelId);
        if (!isMainChannel && !isOurThread) return;

        // Authorization check
        if (this.config.allowedUserIds.length > 0 && !this.config.allowedUserIds.includes(userId)) {
            log.warn('Unauthorized Discord user', { userId, username: data.author.username });
            await this.sendMessage(channelId, 'Unauthorized.');
            return;
        }

        // Per-user rate limiting (10 messages per 60 seconds)
        if (!this.checkRateLimit(userId)) {
            await this.sendMessage(channelId, 'Rate limit exceeded. Please wait before sending more messages.');
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

        // Handle text commands (slash commands are handled via INTERACTION_CREATE)
        if (text.startsWith('/')) {
            const handled = await this.handleCommand(channelId, userId, text);
            if (handled) return;
        }

        // If this message is in a thread we're tracking, route to that thread's session
        if (isOurThread) {
            await this.routeToThread(channelId, userId, text);
            return;
        }

        // Route based on mode
        if (this.mode === 'work_intake') {
            await this.handleWorkIntake(channelId, data.id, userId, text);
        } else {
            await this.routeToChatAgent(channelId, userId, data.id, text);
        }
    }

    // ── Command Handling ──────────────────────────────────────────────────

    private async handleCommand(channelId: string, userId: string, text: string): Promise<boolean> {
        const trimmed = text.trim();

        if (trimmed === '/status') {
            const info = this.userSessions.get(userId);
            if (info) {
                await this.sendMessage(channelId, `Agent: **${info.agentName}** | Session: \`${info.sessionId.slice(0, 8)}\``);
            } else {
                await this.sendMessage(channelId, 'No active session. Send a message to start one.');
            }
            return true;
        }

        if (trimmed === '/new') {
            this.userSessions.delete(userId);
            await this.sendMessage(channelId, 'Session cleared. Your next message will start a new session.');
            return true;
        }

        if (trimmed === '/agents') {
            const agents = listAgents(this.db);
            if (agents.length === 0) {
                await this.sendMessage(channelId, 'No agents configured.');
                return true;
            }
            const lines = agents.map(a => `\u2022 **${a.name}** (${a.model || 'no model'})`);
            await this.sendMessage(channelId, `Available agents:\n${lines.join('\n')}`);
            return true;
        }

        if (trimmed.startsWith('/switch ')) {
            const targetName = trimmed.slice('/switch '.length).trim();
            if (!targetName) {
                await this.sendMessage(channelId, 'Usage: `/switch <AgentName>`');
                return true;
            }
            const agents = listAgents(this.db);
            const targetAgent = agents.find(a =>
                a.name.toLowerCase() === targetName.toLowerCase() ||
                a.name.toLowerCase().replace(/\s+/g, '') === targetName.toLowerCase().replace(/\s+/g, '')
            );
            if (!targetAgent) {
                const names = agents.map(a => a.name).join(', ');
                await this.sendMessage(channelId, `Agent not found: "${targetName}". Available: ${names}`);
                return true;
            }
            this.userSessions.delete(userId);
            await this.sendMessage(channelId, `Switched to **${targetAgent.name}**. Your next message will start a new session with this agent.`);
            // Store the preferred agent so routeToChatAgent picks it up
            this.userPreferredAgent.set(userId, targetAgent.id);
            return true;
        }

        if (trimmed.startsWith('/council ')) {
            const topic = trimmed.slice('/council '.length).trim();
            if (!topic) {
                await this.sendMessage(channelId, 'Usage: `/council <topic>`');
                return true;
            }
            const councils = listCouncils(this.db);
            if (councils.length === 0) {
                await this.sendMessage(channelId, 'No councils configured.');
                return true;
            }
            const council = councils[0];
            const projects = listProjects(this.db);
            const project = projects[0];
            if (!project) {
                await this.sendMessage(channelId, 'No projects configured.');
                return true;
            }
            try {
                const result = launchCouncil(this.db, this.processManager, council.id, project.id, topic, null);
                await this.sendMessage(channelId, `Council deliberation launched.\nCouncil: **${council.name}**\nLaunch ID: ${result.launchId}\nSessions: ${result.sessionIds.length}`);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                await this.sendMessage(channelId, `Failed to launch council: ${msg}`);
            }
            return true;
        }

        if (trimmed === '/help') {
            const helpText = [
                '**Commands** (also available as slash commands):',
                '`/status` — Show your current agent and session',
                '`/new` — Start a new conversation thread',
                '`/agents` — List all available agents',
                '`/switch <AgentName>` — Switch to a different agent',
                '`/council <topic>` — Launch a council deliberation',
                '`/help` — Show this help message',
                '',
                'Each conversation gets its own thread. Anyone can reply in a thread to join the conversation.',
            ].join('\n');
            await this.sendMessage(channelId, helpText);
            return true;
        }

        // Not a recognized command
        return false;
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
        }
    }

    // ── Chat Mode ────────────────────────────────────────────────────────

    /**
     * Route a message from the main channel to an agent.
     * Creates a Discord thread from the user's message for the conversation.
     */
    private async routeToChatAgent(channelId: string, userId: string, messageId: string, text: string): Promise<void> {
        const agent = this.resolveAgent(userId);
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

        // Create a Discord thread from the user's message
        const threadName = `${agent.name} — ${text.slice(0, 80)}${text.length > 80 ? '...' : ''}`;
        const threadId = await this.createThread(channelId, messageId, threadName);
        if (!threadId) {
            await this.sendMessage(channelId, 'Failed to create conversation thread.');
            return;
        }

        const session = createSession(this.db, {
            projectId: project.id,
            agentId: agent.id,
            name: `Discord thread (user ${userId})`,
            initialPrompt: text,
            source: 'discord' as SessionSource,
        });

        // Track the session for both user and thread
        this.userSessions.set(userId, { sessionId: session.id, threadId, agentName: agent.name });
        this.threadSessions.set(threadId, {
            sessionId: session.id,
            agentName: agent.name,
            agentModel: agent.model || 'unknown',
            ownerUserId: userId,
        });

        this.processManager.startProcess(session, text);
        this.subscribeForResponseWithEmbed(session.id, threadId, agent.name, agent.model || 'unknown');
    }

    /**
     * Route a message within an existing thread to the thread's session.
     * Any user can participate — conversations are shared within threads.
     */
    private async routeToThread(threadId: string, _userId: string, text: string): Promise<void> {
        const threadInfo = this.threadSessions.get(threadId);
        if (!threadInfo) return;

        const { sessionId, agentName, agentModel } = threadInfo;

        // Check if session still exists and is active
        const session = getSession(this.db, sessionId);
        if (!session || session.status === 'stopped' || session.status === 'error') {
            this.threadSessions.delete(threadId);
            await this.sendMessage(threadId, 'This conversation has ended. Start a new one in the main channel.');
            return;
        }

        const sent = this.processManager.sendMessage(sessionId, text);
        if (!sent) {
            // Try to restart the process
            this.processManager.startProcess(session, text);
            this.subscribeForResponseWithEmbed(sessionId, threadId, agentName, agentModel);
            return;
        }

        this.subscribeForResponseWithEmbed(sessionId, threadId, agentName, agentModel);
    }

    /**
     * Resolve which agent to use for a new session.
     * Priority: user's preferred agent > config default > first agent.
     */
    private resolveAgent(userId: string): import('../../shared/types').Agent | null {
        const agents = listAgents(this.db);
        if (agents.length === 0) return null;

        // Check user's preferred agent (set by /switch)
        const preferredId = this.userPreferredAgent.get(userId);
        if (preferredId) {
            const preferred = agents.find(a => a.id === preferredId);
            if (preferred) return preferred;
        }

        // Check config default agent
        if (this.config.defaultAgentId) {
            const defaultAgent = agents.find(a => a.id === this.config.defaultAgentId);
            if (defaultAgent) return defaultAgent;
        }

        return agents[0];
    }

    /**
     * Create a Discord thread from a message.
     * Returns the thread channel ID, or null on failure.
     */
    private async createThread(channelId: string, messageId: string, name: string): Promise<string | null> {
        const response = await fetch(
            `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}/threads`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bot ${this.config.botToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: name.slice(0, 100), // Discord thread name limit
                    auto_archive_duration: 1440, // 24 hours
                }),
            },
        );

        if (response.ok) {
            const thread = await response.json() as { id: string };
            log.info('Discord thread created', { threadId: thread.id, name: name.slice(0, 60) });
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
        let buffer = '';
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;

        // Agent color — consistent per agent name
        const color = this.agentColor(agentName);

        const flush = async () => {
            if (!buffer) return;
            const text = buffer;
            buffer = '';
            await this.sendEmbed(threadId, {
                description: text.slice(0, 4096), // Discord embed description limit
                color,
                footer: { text: `${agentName} · ${agentModel}` },
            });
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

    // ── Messaging ────────────────────────────────────────────────────────

    async sendMessage(channelId: string, content: string): Promise<void> {
        // Discord has a 2000 character limit per message
        const chunks: string[] = [];
        if (content.length <= MAX_MESSAGE_LENGTH) {
            chunks.push(content);
        } else {
            for (let i = 0; i < content.length; i += MAX_MESSAGE_LENGTH) {
                chunks.push(content.slice(i, i + MAX_MESSAGE_LENGTH));
            }
        }

        for (const chunk of chunks) {
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
            }
        }
    }
}

import type { Database } from 'bun:sqlite';
import type { ProcessManager } from '../process/manager';
import type { SessionSource } from '../../shared/types';
import type {
    DiscordBridgeConfig,
    DiscordGatewayPayload,
    DiscordHelloData,
    DiscordReadyData,
    DiscordMessageData,
} from './types';
import { GatewayOp, GatewayIntent } from './types';
import { listAgents } from '../db/agents';
import { createSession, getSession } from '../db/sessions';
import { listProjects } from '../db/projects';
import { createLogger } from '../lib/logger';
import { scanForInjection } from '../lib/prompt-injection';
import { recordAudit } from '../db/audit';

const log = createLogger('DiscordBridge');

const GATEWAY_URL = 'wss://gateway.discord.gg/?v=10&encoding=json';
const MAX_MESSAGE_LENGTH = 2000;

/**
 * Bidirectional Discord bridge using raw WebSocket gateway.
 * No external Discord library dependencies.
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

    // Map Discord userId → active sessionId
    private userSessions: Map<string, string> = new Map();

    // Per-user rate limiting: userId → timestamps of recent messages
    private userMessageTimestamps: Map<string, number[]> = new Map();
    private readonly RATE_LIMIT_WINDOW_MS = 60_000;
    private readonly RATE_LIMIT_MAX_MESSAGES = 10;

    constructor(db: Database, processManager: ProcessManager, config: DiscordBridgeConfig) {
        this.db = db;
        this.processManager = processManager;
        this.config = config;
    }

    start(): void {
        if (this.running) return;
        this.running = true;
        log.info('Discord bridge starting', { channelId: this.config.channelId });
        this.connect();
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
            },
            s: null,
            t: null,
        });
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

        // Only respond in configured channel
        if (data.channel_id !== this.config.channelId) return;

        const text = data.content;
        if (!text) return;

        const userId = data.author.id;

        // Authorization check
        if (this.config.allowedUserIds.length > 0 && !this.config.allowedUserIds.includes(userId)) {
            log.warn('Unauthorized Discord user', { userId, username: data.author.username });
            await this.sendMessage(data.channel_id, 'Unauthorized.');
            return;
        }

        // Per-user rate limiting (10 messages per 60 seconds)
        if (!this.checkRateLimit(userId)) {
            await this.sendMessage(data.channel_id, 'Rate limit exceeded. Please wait before sending more messages.');
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
            await this.sendMessage(data.channel_id, 'Message blocked: content policy violation.');
            return;
        }

        // Handle /status command
        if (text === '/status') {
            const sessionId = this.userSessions.get(userId) ?? 'none';
            await this.sendMessage(data.channel_id, `Your session: ${sessionId}`);
            return;
        }

        // Handle /new command
        if (text === '/new') {
            this.userSessions.delete(userId);
            await this.sendMessage(data.channel_id, 'Session cleared. Your next message will start a new session.');
            return;
        }

        // Route to agent session
        await this.routeToAgent(data.channel_id, userId, text);
    }

    private async routeToAgent(channelId: string, userId: string, text: string): Promise<void> {
        let sessionId = this.userSessions.get(userId);
        const source: SessionSource = 'discord';

        // Check if session still exists and is active
        if (sessionId) {
            const session = getSession(this.db, sessionId);
            if (!session || session.status === 'stopped' || session.status === 'error') {
                this.userSessions.delete(userId);
                sessionId = undefined;
            }
        }

        // Find or create session
        if (!sessionId) {
            const agents = listAgents(this.db);
            const agent = agents[0];
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

            const session = createSession(this.db, {
                projectId: project.id,
                agentId: agent.id,
                name: `Discord (user ${userId})`,
                initialPrompt: text,
                source,
            });

            sessionId = session.id;
            this.userSessions.set(userId, sessionId);

            this.processManager.startProcess(session, text);
            this.subscribeForResponse(sessionId, channelId);
            return;
        }

        const sent = this.processManager.sendMessage(sessionId, text);
        if (!sent) {
            const session = getSession(this.db, sessionId);
            if (session) {
                this.processManager.startProcess(session, text);
                this.subscribeForResponse(sessionId, channelId);
            } else {
                this.userSessions.delete(userId);
                await this.sendMessage(channelId, 'Session expired. Send another message to start a new one.');
            }
            return;
        }

        this.subscribeForResponse(sessionId, channelId);
    }

    private subscribeForResponse(sessionId: string, channelId: string): void {
        let buffer = '';
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;

        const flush = async () => {
            if (!buffer) return;
            const text = buffer;
            buffer = '';
            await this.sendMessage(channelId, text);
        };

        this.processManager.subscribe(sessionId, (_sid, event) => {
            if (event.type === 'assistant' && event.message) {
                const content = typeof event.message === 'string'
                    ? event.message
                    : (event.message as { content?: string })?.content ?? '';

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

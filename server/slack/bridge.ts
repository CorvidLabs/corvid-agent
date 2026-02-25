import type { Database } from 'bun:sqlite';
import type { ProcessManager } from '../process/manager';
import type { SessionSource } from '../../shared/types';
import type {
    SlackBridgeConfig,
    SlackEventPayload,
    SlackMessageEvent,
} from './types';
import { listAgents } from '../db/agents';
import { createSession, getSession } from '../db/sessions';
import { listProjects } from '../db/projects';
import { createLogger } from '../lib/logger';
import { DedupService } from '../lib/dedup';

const log = createLogger('SlackBridge');

const MAX_MESSAGE_LENGTH = 4000; // Slack block text limit
const SLACK_DEDUP_NS = 'slack:events';

/**
 * Bidirectional Slack bridge using Events API (webhook-based).
 * Receives messages via POST /api/slack/events and responds via Slack Web API.
 */
export class SlackBridge {
    private db: Database;
    private processManager: ProcessManager;
    private config: SlackBridgeConfig;
    private running = false;

    // Map Slack userId -> active sessionId
    private userSessions: Map<string, string> = new Map();

    // Per-user rate limiting: userId -> timestamps of recent messages
    private userMessageTimestamps: Map<string, number[]> = new Map();
    private readonly RATE_LIMIT_WINDOW_MS = 60_000;
    private readonly RATE_LIMIT_MAX_MESSAGES = 10;

    private dedup = DedupService.global();

    constructor(db: Database, processManager: ProcessManager, config: SlackBridgeConfig) {
        this.db = db;
        this.processManager = processManager;
        this.config = config;
        this.dedup.register(SLACK_DEDUP_NS, { maxSize: 1000, ttlMs: 300_000 }); // 5 min TTL
    }

    start(): void {
        if (this.running) return;
        this.running = true;
        log.info('Slack bridge started', { channelId: this.config.channelId });
    }

    stop(): void {
        this.running = false;
        log.info('Slack bridge stopped');
    }

    /**
     * Handle an incoming Slack Events API request.
     * Called from the HTTP route handler.
     */
    async handleEventRequest(req: Request): Promise<Response> {
        // Verify the request signature
        const isValid = await this.verifySignature(req.clone());
        if (!isValid) {
            return new Response(JSON.stringify({ error: 'Invalid signature' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        let body: SlackEventPayload;
        try {
            body = await req.json() as SlackEventPayload;
        } catch {
            return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // Handle URL verification challenge
        if (body.type === 'url_verification') {
            return new Response(JSON.stringify({ challenge: body.challenge }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // Handle event callbacks
        if (body.type === 'event_callback' && body.event) {
            // Process async to respond quickly (Slack requires response within 3s)
            this.handleEvent(body.event as SlackMessageEvent).catch(err => {
                log.error('Error handling Slack event', {
                    error: err instanceof Error ? err.message : String(err),
                });
            });
        }

        return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    private async verifySignature(req: Request): Promise<boolean> {
        const timestamp = req.headers.get('x-slack-request-timestamp');
        const signature = req.headers.get('x-slack-signature');

        if (!timestamp || !signature) return false;

        // Reject requests older than 5 minutes to prevent replay attacks
        const now = Math.floor(Date.now() / 1000);
        if (Math.abs(now - parseInt(timestamp, 10)) > 300) return false;

        const rawBody = await req.text();
        const sigBasestring = `v0:${timestamp}:${rawBody}`;

        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
            'raw',
            encoder.encode(this.config.signingSecret),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign'],
        );
        const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(sigBasestring));
        const hexSig = 'v0=' + Array.from(new Uint8Array(sig))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');

        // Timing-safe comparison
        if (hexSig.length !== signature.length) return false;
        let mismatch = 0;
        for (let i = 0; i < hexSig.length; i++) {
            mismatch |= hexSig.charCodeAt(i) ^ signature.charCodeAt(i);
        }
        return mismatch === 0;
    }

    private async handleEvent(event: SlackMessageEvent): Promise<void> {
        if (!this.running) return;

        // Only handle message and app_mention events
        if (event.type !== 'message' && event.type !== 'app_mention') return;

        // Filter bot messages to avoid echo loops
        if (event.bot_id || event.subtype) return;

        // Deduplicate events (Slack may retry)
        const eventKey = `${event.channel}:${event.ts}`;
        if (this.dedup.isDuplicate(SLACK_DEDUP_NS, eventKey)) return;

        const userId = event.user;
        const text = event.text;
        const channelId = event.channel;

        if (!userId || !text || !channelId) return;

        // Only respond in configured channel (if set)
        if (this.config.channelId && channelId !== this.config.channelId) return;

        // Authorization check
        if (this.config.allowedUserIds.length > 0 && !this.config.allowedUserIds.includes(userId)) {
            log.warn('Unauthorized Slack user', { userId });
            await this.sendMessage(channelId, 'Unauthorized.', event.thread_ts ?? event.ts);
            return;
        }

        // Per-user rate limiting (10 messages per 60 seconds)
        if (!this.checkRateLimit(userId)) {
            await this.sendMessage(
                channelId,
                'Rate limit exceeded. Please wait before sending more messages.',
                event.thread_ts ?? event.ts,
            );
            return;
        }

        // Handle /status command
        if (text.trim() === '/status') {
            const sessionId = this.userSessions.get(userId) ?? 'none';
            await this.sendMessage(channelId, `Your session: ${sessionId}`, event.thread_ts ?? event.ts);
            return;
        }

        // Handle /new command
        if (text.trim() === '/new') {
            this.userSessions.delete(userId);
            await this.sendMessage(
                channelId,
                'Session cleared. Your next message will start a new session.',
                event.thread_ts ?? event.ts,
            );
            return;
        }

        // Route to agent session, using thread_ts for conversation tracking
        await this.routeToAgent(channelId, userId, text, event.thread_ts ?? event.ts);
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

    private async routeToAgent(channelId: string, userId: string, text: string, threadTs: string): Promise<void> {
        let sessionId = this.userSessions.get(userId);
        const source: SessionSource = 'slack';

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
                await this.sendMessage(channelId, 'No agents configured. Create an agent first.', threadTs);
                return;
            }

            const projects = listProjects(this.db);
            const project = agent.defaultProjectId
                ? projects.find(p => p.id === agent.defaultProjectId) ?? projects[0]
                : projects[0];

            if (!project) {
                await this.sendMessage(channelId, 'No projects configured.', threadTs);
                return;
            }

            const session = createSession(this.db, {
                projectId: project.id,
                agentId: agent.id,
                name: `Slack (user ${userId})`,
                initialPrompt: text,
                source,
            });

            sessionId = session.id;
            this.userSessions.set(userId, sessionId);

            this.processManager.startProcess(session, text);
            this.subscribeForResponse(sessionId, channelId, threadTs);
            return;
        }

        const sent = this.processManager.sendMessage(sessionId, text);
        if (!sent) {
            const session = getSession(this.db, sessionId);
            if (session) {
                this.processManager.startProcess(session, text);
                this.subscribeForResponse(sessionId, channelId, threadTs);
            } else {
                this.userSessions.delete(userId);
                await this.sendMessage(channelId, 'Session expired. Send another message to start a new one.', threadTs);
            }
            return;
        }

        this.subscribeForResponse(sessionId, channelId, threadTs);
    }

    private subscribeForResponse(sessionId: string, channelId: string, threadTs: string): void {
        let buffer = '';
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;

        const flush = async () => {
            if (!buffer) return;
            const text = buffer;
            buffer = '';
            await this.sendMessage(channelId, text, threadTs);
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

    async sendMessage(channelId: string, content: string, threadTs?: string): Promise<void> {
        // Split messages that exceed Slack's limit
        const chunks: string[] = [];
        if (content.length <= MAX_MESSAGE_LENGTH) {
            chunks.push(content);
        } else {
            for (let i = 0; i < content.length; i += MAX_MESSAGE_LENGTH) {
                chunks.push(content.slice(i, i + MAX_MESSAGE_LENGTH));
            }
        }

        for (const chunk of chunks) {
            const body: Record<string, unknown> = {
                channel: channelId,
                text: chunk,
            };
            if (threadTs) {
                body.thread_ts = threadTs;
            }

            const response = await fetch('https://slack.com/api/chat.postMessage', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.config.botToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                const error = await response.text();
                log.error('Failed to send Slack message', { status: response.status, error: error.slice(0, 200) });
            } else {
                const data = await response.json() as { ok: boolean; error?: string };
                if (!data.ok) {
                    log.error('Slack API error', { error: data.error });
                }
            }
        }
    }
}

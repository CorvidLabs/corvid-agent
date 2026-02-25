import type { Database } from 'bun:sqlite';
import type { ProcessManager } from '../process/manager';
import type { TelegramBridgeConfig, TelegramUpdate, TelegramMessage, TelegramFile } from './types';
import type { SessionSource } from '../../shared/types';
import { getAgent, listAgents } from '../db/agents';
import { createSession, getSession } from '../db/sessions';
import { listProjects } from '../db/projects';
import { transcribe } from '../voice/stt';
import { synthesizeWithCache } from '../voice/tts';
import { createLogger } from '../lib/logger';
import { ExternalServiceError, NotFoundError } from '../lib/errors';

const log = createLogger('TelegramBridge');

const POLL_TIMEOUT = 30; // Long-polling timeout in seconds

/**
 * Bidirectional Telegram bridge.
 * Routes Telegram messages to agent sessions and sends responses back.
 */
export class TelegramBridge {
    private db: Database;
    private processManager: ProcessManager;
    private config: TelegramBridgeConfig;
    private offset = 0;
    private pollTimer: ReturnType<typeof setTimeout> | null = null;
    private running = false;

    // Map Telegram userId → active sessionId
    private userSessions: Map<number, string> = new Map();

    // Per-user rate limiting: userId → timestamps of recent messages
    private userMessageTimestamps: Map<number, number[]> = new Map();
    private readonly RATE_LIMIT_WINDOW_MS = 60_000;
    private readonly RATE_LIMIT_MAX_MESSAGES = 10;

    constructor(db: Database, processManager: ProcessManager, config: TelegramBridgeConfig) {
        this.db = db;
        this.processManager = processManager;
        this.config = config;
    }

    start(): void {
        if (this.running) return;
        this.running = true;
        log.info('Telegram bridge started', { chatId: this.config.chatId });
        this.poll();
    }

    stop(): void {
        this.running = false;
        if (this.pollTimer) {
            clearTimeout(this.pollTimer);
            this.pollTimer = null;
        }
        log.info('Telegram bridge stopped');
    }

    private async poll(): Promise<void> {
        if (!this.running) return;

        try {
            const updates = await this.getUpdates();
            for (const update of updates) {
                this.offset = update.update_id + 1;
                await this.handleUpdate(update);
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            log.error('Telegram poll error', { error: message });
        }

        // Schedule next poll
        if (this.running) {
            this.pollTimer = setTimeout(() => this.poll(), 500);
        }
    }

    private async getUpdates(): Promise<TelegramUpdate[]> {
        const response = await this.callTelegramApi('getUpdates', {
            offset: this.offset,
            timeout: POLL_TIMEOUT,
            allowed_updates: ['message', 'callback_query'],
        });

        return (response.result ?? []) as TelegramUpdate[];
    }

    private async handleUpdate(update: TelegramUpdate): Promise<void> {
        if (update.message) {
            await this.handleMessage(update.message);
        }
    }

    private checkRateLimit(userId: number): boolean {
        const now = Date.now();
        const timestamps = this.userMessageTimestamps.get(userId) ?? [];
        const recent = timestamps.filter(t => now - t < this.RATE_LIMIT_WINDOW_MS);
        if (recent.length >= this.RATE_LIMIT_MAX_MESSAGES) return false;
        recent.push(now);
        this.userMessageTimestamps.set(userId, recent);
        return true;
    }

    private async handleMessage(message: TelegramMessage): Promise<void> {
        const userId = message.from?.id;
        if (!userId) return;

        // Authorization check
        if (this.config.allowedUserIds.length > 0 && !this.config.allowedUserIds.includes(String(userId))) {
            log.warn('Unauthorized Telegram user', { userId });
            await this.sendText(message.chat.id, 'Unauthorized.');
            return;
        }

        // Per-user rate limiting
        if (!this.checkRateLimit(userId)) {
            await this.sendText(message.chat.id, 'Rate limit exceeded. Please wait before sending more messages.');
            return;
        }

        let text: string | undefined;

        // Handle voice messages via STT
        if (message.voice) {
            // Reject oversized voice files (max 10 MB)
            const MAX_VOICE_FILE_SIZE = 10 * 1024 * 1024;
            if (message.voice.file_size && message.voice.file_size > MAX_VOICE_FILE_SIZE) {
                await this.sendText(message.chat.id, 'Voice message too large (max 10 MB).');
                return;
            }

            try {
                const audioBuffer = await this.downloadFile(message.voice.file_id);
                const result = await transcribe({ audio: audioBuffer, format: 'ogg' });
                text = result.text;
                // Echo the transcription so user knows what was heard
                await this.sendText(message.chat.id, `🎤 _${text}_`, message.message_id);
            } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                log.error('STT transcription failed', { error: errMsg });
                await this.sendText(message.chat.id, 'Failed to transcribe voice message. Is OPENAI_API_KEY set?');
                return;
            }
        } else {
            text = message.text;
        }

        if (!text) return;

        // Handle /start command
        if (text === '/start') {
            await this.sendText(message.chat.id, 'Connected to corvid-agent. Send a message to talk to an agent.');
            return;
        }

        // Handle /status command
        if (text === '/status') {
            const sessionId = this.userSessions.get(userId) ?? 'none';
            await this.sendText(message.chat.id, `Your session: ${sessionId}`);
            return;
        }

        // Handle /new command — start a new session
        if (text === '/new') {
            this.userSessions.delete(userId);
            await this.sendText(message.chat.id, 'Session cleared. Your next message will start a new session.');
            return;
        }

        // Route to agent session
        await this.routeToAgent(message.chat.id, userId, text, message.message_id);
    }

    private async routeToAgent(chatId: number, userId: number, text: string, replyTo?: number): Promise<void> {
        let sessionId = this.userSessions.get(userId);
        const source: SessionSource = 'telegram';

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
            // Find the first available agent, or use the default
            const agents = listAgents(this.db);
            const agent = agents[0];
            if (!agent) {
                await this.sendText(chatId, 'No agents configured. Create an agent first.');
                return;
            }

            // Find a project
            const projects = listProjects(this.db);
            const project = agent.defaultProjectId
                ? projects.find(p => p.id === agent.defaultProjectId) ?? projects[0]
                : projects[0];

            if (!project) {
                await this.sendText(chatId, 'No projects configured.');
                return;
            }

            const session = createSession(this.db, {
                projectId: project.id,
                agentId: agent.id,
                name: `Telegram (user ${userId})`,
                initialPrompt: text,
                source,
            });

            sessionId = session.id;
            this.userSessions.set(userId, sessionId);

            // Start the process
            this.processManager.startProcess(session, text);

            // Subscribe for responses
            this.subscribeForResponse(sessionId, chatId, replyTo);
            return;
        }

        // Send message to existing session
        const sent = this.processManager.sendMessage(sessionId, text);
        if (!sent) {
            // Session process not running — restart it
            const session = getSession(this.db, sessionId);
            if (session) {
                this.processManager.startProcess(session, text);
                this.subscribeForResponse(sessionId, chatId, replyTo);
            } else {
                this.userSessions.delete(userId);
                await this.sendText(chatId, 'Session expired. Send another message to start a new one.');
            }
            return;
        }

        this.subscribeForResponse(sessionId, chatId, replyTo);
    }

    private subscribeForResponse(sessionId: string, chatId: number, replyTo?: number): void {
        let buffer = '';
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;

        const flush = async () => {
            if (!buffer) return;
            const text = buffer;
            buffer = '';

            // Check if the agent has voice enabled
            const session = getSession(this.db, sessionId);
            const agent = session?.agentId ? getAgent(this.db, session.agentId) : null;

            if (agent?.voiceEnabled && process.env.OPENAI_API_KEY) {
                try {
                    await this.sendVoice(chatId, text, agent.voicePreset, replyTo);
                } catch {
                    // Fall back to text if voice fails
                    await this.sendText(chatId, text, replyTo);
                }
            } else {
                await this.sendText(chatId, text, replyTo);
            }
        };

        this.processManager.subscribe(sessionId, (_sid, event) => {
            if (event.type === 'assistant' && event.message) {
                const content = typeof event.message === 'string'
                    ? event.message
                    : (event.message as { content?: string })?.content ?? '';

                if (content) {
                    buffer += content;
                    // Debounce: wait for stream to settle before sending
                    if (debounceTimer) clearTimeout(debounceTimer);
                    debounceTimer = setTimeout(() => flush(), 1500);
                }
            }

            // Process completed
            if (event.type === 'result') {
                if (debounceTimer) clearTimeout(debounceTimer);
                flush();
            }
        });
    }

    async sendText(chatId: number, text: string, replyTo?: number): Promise<void> {
        // Telegram has a 4096 char limit per message
        const MAX_LENGTH = 4096;
        const chunks: string[] = [];

        if (text.length <= MAX_LENGTH) {
            chunks.push(text);
        } else {
            for (let i = 0; i < text.length; i += MAX_LENGTH) {
                chunks.push(text.slice(i, i + MAX_LENGTH));
            }
        }

        for (const chunk of chunks) {
            await this.callTelegramApi('sendMessage', {
                chat_id: chatId,
                text: chunk,
                parse_mode: 'Markdown',
                ...(replyTo ? { reply_to_message_id: replyTo } : {}),
            });
        }
    }

    private async sendVoice(chatId: number, text: string, voicePreset: string, replyTo?: number): Promise<void> {
        const result = await synthesizeWithCache(
            this.db,
            text,
            voicePreset as import('../../shared/types').VoicePreset,
        );

        const formData = new FormData();
        formData.append('chat_id', String(chatId));
        formData.append('voice', new Blob([new Uint8Array(result.audio)], { type: 'audio/mpeg' }), 'voice.mp3');
        if (replyTo) formData.append('reply_to_message_id', String(replyTo));

        const response = await fetch(
            `https://api.telegram.org/bot${this.config.botToken}/sendVoice`,
            { method: 'POST', body: formData },
        );

        if (!response.ok) {
            const error = await response.text();
            log.error('Failed to send Telegram voice', { error });
        }

        // Also send as text for accessibility
        await this.sendText(chatId, text, replyTo);
    }

    private async downloadFile(fileId: string): Promise<Buffer> {
        // Get file path
        const fileInfo = await this.callTelegramApi('getFile', { file_id: fileId }) as { result: TelegramFile };
        const filePath = fileInfo.result.file_path;
        if (!filePath) throw new NotFoundError('Telegram file path');

        // Download file
        const response = await fetch(
            `https://api.telegram.org/file/bot${this.config.botToken}/${filePath}`,
        );
        if (!response.ok) throw new ExternalServiceError("Telegram", `Failed to download file: ${response.status}`);

        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    }

    private async callTelegramApi(method: string, body: Record<string, unknown>): Promise<{ result: unknown }> {
        const response = await fetch(
            `https://api.telegram.org/bot${this.config.botToken}/${method}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            },
        );

        if (!response.ok) {
            // Log full error internally but don't expose token or full API response
            const error = await response.text();
            log.error('Telegram API error', { method, status: response.status, error });
            throw new ExternalServiceError("Telegram", `API error (${method}): status ${response.status}`);
        }

        return response.json() as Promise<{ result: unknown }>;
    }
}

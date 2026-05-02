import type { Database } from 'bun:sqlite';
import type { SessionSource } from '../../shared/types';
import type { WorkTask } from '../../shared/types/work-tasks';
import { getAgent, listAgents } from '../db/agents';
import { recordAudit } from '../db/audit';
import { recordObservation } from '../db/observations';
import { listProjects } from '../db/projects';
import { createSession, getSession } from '../db/sessions';
import { DedupService } from '../lib/dedup';
import { type DeliveryTracker, getDeliveryTracker } from '../lib/delivery-tracker';
import { ExternalServiceError, NotFoundError } from '../lib/errors';
import { createLogger } from '../lib/logger';
import { scanForInjection } from '../lib/prompt-injection';
import type { EventCallback } from '../process/interfaces';
import type { ProcessManager } from '../process/manager';
import { transcribe } from '../voice/stt';
import { synthesizeWithCache } from '../voice/tts';
import type { WorkTaskService } from '../work/service';
import type { TelegramBridgeConfig, TelegramFile, TelegramMessage, TelegramUpdate } from './types';

const log = createLogger('TelegramBridge');

const POLL_TIMEOUT = 30; // Long-polling timeout in seconds
const TELEGRAM_DEDUP_NS = 'telegram:updates';
const BASE_POLL_DELAY_MS = 500;
const MAX_POLL_DELAY_MS = 30_000;

/**
 * Bidirectional Telegram bridge.
 * Routes Telegram messages to agent sessions and sends responses back.
 */
export class TelegramBridge {
  private db: Database;
  private processManager: ProcessManager;
  private workTaskService: WorkTaskService | null;
  private config: TelegramBridgeConfig;
  private offset = 0;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private consecutiveErrors = 0;
  private dedup = DedupService.global();
  private delivery: DeliveryTracker = getDeliveryTracker();

  // Map Telegram userId → active sessionId
  private userSessions: Map<number, string> = new Map();

  // Per-user rate limiting: userId → timestamps of recent messages
  private userMessageTimestamps: Map<number, number[]> = new Map();
  private readonly RATE_LIMIT_WINDOW_MS = 60_000;
  private readonly RATE_LIMIT_MAX_MESSAGES = 10;

  constructor(
    db: Database,
    processManager: ProcessManager,
    config: TelegramBridgeConfig,
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
    this.dedup.register(TELEGRAM_DEDUP_NS, { maxSize: 1000, ttlMs: 300_000 }); // 5 min TTL
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

    let delay = BASE_POLL_DELAY_MS;
    try {
      const updates = await this.getUpdates();
      this.consecutiveErrors = 0;
      for (const update of updates) {
        this.offset = update.update_id + 1;
        await this.handleUpdate(update);
      }
    } catch (err) {
      this.consecutiveErrors++;
      delay = Math.min(BASE_POLL_DELAY_MS * 2 ** this.consecutiveErrors, MAX_POLL_DELAY_MS);
      const message = err instanceof Error ? err.message : String(err);
      log.error('Telegram poll error', { error: message, attempt: this.consecutiveErrors, retryMs: delay });
    }

    // Schedule next poll
    if (this.running) {
      this.pollTimer = setTimeout(() => this.poll(), delay);
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
    const dedupKey = String(update.update_id);
    if (this.dedup.isDuplicate(TELEGRAM_DEDUP_NS, dedupKey)) {
      log.debug('Skipping duplicate Telegram update', { updateId: update.update_id });
      return;
    }

    if (update.message) {
      await this.handleMessage(update.message);
    }
  }

  private checkRateLimit(userId: number): boolean {
    const now = Date.now();
    const timestamps = this.userMessageTimestamps.get(userId) ?? [];
    const recent = timestamps.filter((t) => now - t < this.RATE_LIMIT_WINDOW_MS);
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
        const result = await transcribe({
          audio: audioBuffer,
          format: 'ogg',
          prompt: 'This is a conversation in English.',
        });
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

    // Prompt injection scan
    const injectionResult = scanForInjection(text);
    if (injectionResult.blocked) {
      log.warn('Blocked message: prompt injection detected', {
        userId,
        confidence: injectionResult.confidence,
        patterns: injectionResult.matches.map((m) => m.pattern),
        contentPreview: text.slice(0, 100),
      });
      recordAudit(
        this.db,
        'injection_blocked',
        String(userId),
        'telegram_message',
        null,
        JSON.stringify({
          channel: 'telegram',
          confidence: injectionResult.confidence,
          patterns: injectionResult.matches.map((m) => m.pattern),
          contentPreview: text.slice(0, 200),
        }),
      );
      await this.sendText(message.chat.id, 'Message blocked: content policy violation.');
      return;
    }

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

    // Handle /compact command — compact context for current session
    if (text === '/compact') {
      const sessionId = this.userSessions.get(userId);
      if (!sessionId) {
        await this.sendText(message.chat.id, 'No active session. Send a message to start one.');
        return;
      }
      const compacted = this.processManager.compactSession(sessionId);
      if (compacted) {
        this.userSessions.delete(userId);
        await this.sendText(
          message.chat.id,
          'Context compacted. The session will restart with condensed context on your next message.',
        );
      } else {
        await this.sendText(message.chat.id, 'No active session process — it may have already ended.');
      }
      return;
    }

    // Route based on mode
    if (this.mode === 'work_intake') {
      await this.handleWorkIntake(message.chat.id, userId, text, message.message_id);
    } else {
      await this.routeToAgent(message.chat.id, userId, text, message.message_id);
    }
  }

  // ── Work Intake Mode ─────────────────────────────────────────────────

  private async handleWorkIntake(chatId: number, userId: number, text: string, replyTo?: number): Promise<void> {
    if (!this.workTaskService) {
      await this.sendText(chatId, 'Work intake mode requires WorkTaskService. Check server configuration.');
      return;
    }

    const description = text.trim();
    if (!description) {
      await this.sendText(chatId, 'Please provide a task description.');
      return;
    }

    // Resolve agent
    const agents = listAgents(this.db);
    const agent = agents[0];
    if (!agent) {
      await this.sendText(chatId, 'No agents configured. Create an agent first.');
      return;
    }

    try {
      const task = await this.workTaskService.create({
        agentId: agent.id,
        description,
        source: 'telegram',
        sourceId: String(replyTo ?? ''),
        requesterInfo: { telegramUserId: userId, chatId, messageId: replyTo },
      });

      log.info('Work task created from Telegram', { taskId: task.id, userId });

      // Send acknowledgment
      await this.sendText(chatId, `Task queued: ${task.id}`, replyTo);

      // Subscribe for completion
      this.workTaskService.onComplete(task.id, (completedTask) => {
        this.sendTaskResult(chatId, completedTask, replyTo).catch((err) => {
          log.error('Failed to send task result to Telegram', {
            taskId: completedTask.id,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Failed to create work task from Telegram', { error: message, userId });
      await this.sendText(chatId, `Task failed: ${message.slice(0, 500)}`, replyTo);
    }
  }

  private async sendTaskResult(chatId: number, task: WorkTask, replyTo?: number): Promise<void> {
    if (task.status === 'completed') {
      const parts = ['Task completed!'];
      if (task.prUrl) parts.push(`PR: ${task.prUrl}`);
      if (task.summary) parts.push(task.summary.slice(0, 3000));
      await this.sendText(chatId, parts.join('\n'), replyTo);
    } else {
      await this.sendText(chatId, `Task failed: ${(task.error ?? 'Unknown error').slice(0, 1000)}`, replyTo);
    }
  }

  // ── Chat Mode ────────────────────────────────────────────────────────

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
        ? (projects.find((p) => p.id === agent.defaultProjectId) ?? projects[0])
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

      // Record inbound Telegram message as a short-term observation
      recordObservation(this.db, {
        agentId: agent.id,
        source: 'telegram',
        sourceId: session.id,
        content: `[telegram] user ${userId}: ${text.slice(0, 200)}`,
        suggestedKey: `telegram:${session.id}`,
        relevanceScore: 1.5,
      });

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

    const cleanup = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      this.processManager.unsubscribe(sessionId, callback);
    };

    const callback: EventCallback = (_sid, event) => {
      if (event.type === 'assistant' && event.message) {
        const content =
          typeof event.message === 'string' ? event.message : ((event.message as { content?: string })?.content ?? '');

        if (content) {
          buffer += content;
          // Debounce: wait for stream to settle before sending
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => flush(), 1500);
        }
      }

      if (event.type === 'result') {
        cleanup();
        flush();
      }

      if (event.type === 'session_error') {
        cleanup();
        flush();
        const errEvent = event as { error?: { errorType?: string; message?: string } };
        const errorType = errEvent.error?.errorType;
        const userMessage = this.sessionErrorToText(errorType, errEvent.error?.message);
        this.sendText(chatId, userMessage, replyTo);
      }

      if (event.type === 'session_exited') {
        cleanup();
        flush();
      }
    };

    this.processManager.subscribe(sessionId, callback);
  }

  private sessionErrorToText(errorType?: string, fallbackMessage?: string): string {
    switch (errorType) {
      case 'context_exhausted':
        return 'Context limit reached. Send a message to continue with fresh context — the agent will pick up where it left off.';
      case 'context_compacted':
        return 'Context compacted — the session will restart with condensed context on your next message.';
      case 'credits_exhausted':
        return 'Credits exhausted. Top up credits in the dashboard, then send a message to resume.';
      case 'timeout':
        return 'Session timed out. Send a message to restart — try breaking your request into smaller steps.';
      case 'crash':
        return 'Session crashed unexpectedly. Send a new message to restart.';
      case 'spawn_error':
        return 'Failed to start agent session. Check that the agent provider and API key are configured correctly.';
      default:
        return `Session error: ${(fallbackMessage ?? 'Unknown error').slice(0, 500)}`;
    }
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
      try {
        await this.delivery.sendWithReceipt('telegram', () =>
          this.callTelegramApi('sendMessage', {
            chat_id: chatId,
            text: chunk,
            parse_mode: 'Markdown',
            ...(replyTo ? { reply_to_message_id: replyTo } : {}),
          }),
        );
      } catch {
        // Error already logged by DeliveryTracker and callTelegramApi
      }
    }
  }

  private async sendVoice(chatId: number, text: string, voicePreset: string, replyTo?: number): Promise<void> {
    const result = await synthesizeWithCache(this.db, text, voicePreset as import('../../shared/types').VoicePreset);

    const formData = new FormData();
    formData.append('chat_id', String(chatId));
    formData.append('voice', new Blob([new Uint8Array(result.audio)], { type: 'audio/mpeg' }), 'voice.mp3');
    if (replyTo) formData.append('reply_to_message_id', String(replyTo));

    await this.delivery.sendWithReceipt('telegram', async () => {
      const response = await fetch(`https://api.telegram.org/bot${this.config.botToken}/sendVoice`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.text();
        log.error('Failed to send Telegram voice', { error });
        throw new Error(`Telegram sendVoice failed: ${response.status}`);
      }
    });

    // Also send as text for accessibility
    await this.sendText(chatId, text, replyTo);
  }

  private async downloadFile(fileId: string): Promise<Buffer> {
    // Get file path
    const fileInfo = (await this.callTelegramApi('getFile', { file_id: fileId })) as { result: TelegramFile };
    const filePath = fileInfo.result.file_path;
    if (!filePath) throw new NotFoundError('Telegram file path');

    // Download file
    const response = await fetch(`https://api.telegram.org/file/bot${this.config.botToken}/${filePath}`);
    if (!response.ok) throw new ExternalServiceError('Telegram', `Failed to download file: ${response.status}`);

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  private async callTelegramApi(method: string, body: Record<string, unknown>): Promise<{ result: unknown }> {
    const response = await fetch(`https://api.telegram.org/bot${this.config.botToken}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      // Log full error internally but don't expose token or full API response
      const error = await response.text();
      log.error('Telegram API error', { method, status: response.status, error });
      throw new ExternalServiceError('Telegram', `API error (${method}): status ${response.status}`);
    }

    return response.json() as Promise<{ result: unknown }>;
  }
}

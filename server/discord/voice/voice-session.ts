/**
 * Voice conversation loop — routes STT transcriptions through an agent session
 * and plays the response back via TTS.
 *
 * Flow: User speaks → Whisper STT → Agent session → Response text → OpenAI TTS → Voice channel
 */

import type { Database } from 'bun:sqlite';
import type { SessionSource } from '../../../shared/types';
import { listProjects } from '../../db/projects';
import { createSession, getSession } from '../../db/sessions';
import { createLogger } from '../../lib/logger';
import { resolveAndCreateWorktree } from '../../lib/worktree';
import type { EventCallback } from '../../process/interfaces';
import type { ProcessManager } from '../../process/manager';
import { type ClaudeStreamEvent, extractContentText } from '../../process/types';
import { resolveDefaultAgent } from '../thread-response/recovery';
import type { DiscordBridgeConfig } from '../types';
import type { TranscriptionResult } from './audio-receiver';
import type { VoiceConnectionManager } from './connection-manager';

const log = createLogger('VoiceSession');

/** Max length of text to send to TTS (longer gets truncated). */
const MAX_TTS_LENGTH = 4000;

/** How long to wait after the last content event before considering the response complete (ms). */
const RESPONSE_DEBOUNCE_MS = 2000;

/** Per-guild voice session state. */
interface GuildVoiceSession {
  /** SDK session ID for this guild's voice conversation. */
  sessionId: string;
  /** Whether a response is currently being generated. */
  responding: boolean;
  /** Buffered response text from the current turn. */
  responseBuffer: string;
  /** Debounce timer for flushing response to TTS. */
  debounceTimer: ReturnType<typeof setTimeout> | null;
  /** Event callback reference for cleanup. */
  callback: EventCallback;
  /** Queued transcriptions received while TTS was playing. */
  pendingTranscriptions: { userId: string; text: string }[];
}

/**
 * Manages the voice conversation loop — one persistent agent session per guild.
 *
 * When a transcription arrives:
 * 1. Creates or reuses a session for the guild
 * 2. Sends the transcription as a user message
 * 3. Subscribes for the response
 * 4. On response complete, sends text to TTS for voice playback
 */
export class VoiceSessionRouter {
  private sessions: Map<string, GuildVoiceSession> = new Map();

  constructor(
    private db: Database,
    private processManager: ProcessManager,
    private voiceManager: VoiceConnectionManager,
    private config: DiscordBridgeConfig,
    private sendTextMessage?: (channelId: string, content: string) => Promise<void>,
  ) {}

  /**
   * Handle a transcription from a voice channel user.
   * Routes through the agent and plays back the response via TTS.
   */
  async handleTranscription(result: TranscriptionResult): Promise<void> {
    const { guildId, userId, text } = result;

    if (!text.trim()) return;

    // Queue transcription if we're currently speaking (process after TTS finishes)
    if (this.voiceManager.isSpeaking(guildId)) {
      const existing = this.sessions.get(guildId);
      if (existing) {
        existing.pendingTranscriptions.push({ userId, text });
        log.debug('Queued transcription while speaking', {
          guildId,
          userId,
          queueLength: existing.pendingTranscriptions.length,
        });
      }
      return;
    }

    // Skip if already responding to a previous transcription
    const existing = this.sessions.get(guildId);
    if (existing?.responding) {
      log.debug('Queuing transcription — still responding to previous', { guildId, userId });
      // Send to existing session anyway — it queues
      this.processManager.sendMessage(existing.sessionId, `[Voice from <@${userId}>]: ${text}`);
      return;
    }

    log.info('Voice transcription → agent', { guildId, userId, textLength: text.length });

    const session = await this.ensureSession(guildId);
    if (!session) {
      log.warn('No voice session available — cannot route transcription', { guildId });
      return;
    }

    session.responding = true;
    session.responseBuffer = '';

    const sent = this.processManager.sendMessage(session.sessionId, `[Voice from <@${userId}>]: ${text}`);
    if (!sent) {
      // Session may have stopped — try resuming
      const dbSession = getSession(this.db, session.sessionId);
      if (dbSession) {
        // Re-subscribe: cleanupSessionState removes all subscribers when process exits
        this.processManager.subscribe(session.sessionId, session.callback);
        this.processManager.resumeProcess(dbSession, `[Voice from <@${userId}>]: ${text}`);
      } else {
        // Session is gone — create a new one
        log.info('Voice session expired, creating new one', { guildId });
        this.sessions.delete(guildId);
        const newSession = await this.ensureSession(guildId);
        if (newSession) {
          newSession.responding = true;
          this.processManager.sendMessage(newSession.sessionId, `[Voice from <@${userId}>]: ${text}`);
        }
      }
    }
  }

  /** Get or create a persistent agent session for voice in a guild. */
  private async ensureSession(guildId: string): Promise<GuildVoiceSession | null> {
    const existing = this.sessions.get(guildId);
    if (existing) {
      // Verify session still exists in DB
      const dbSession = getSession(this.db, existing.sessionId);
      if (dbSession) {
        // If the process exited, re-subscribe since cleanupSessionState removes subscribers
        if (!this.processManager.isRunning(existing.sessionId)) {
          this.processManager.subscribe(existing.sessionId, existing.callback);
        }
        return existing;
      }
      // Session was cleaned up — remove and recreate
      this.cleanup(guildId);
    }

    const agent = resolveDefaultAgent(this.db, this.config);
    if (!agent) {
      log.warn('No agent configured for voice session', { guildId });
      return null;
    }

    const projects = listProjects(this.db);
    const project = agent.defaultProjectId
      ? (projects.find((p) => p.id === agent.defaultProjectId) ?? projects[0])
      : projects[0];

    if (!project) {
      log.warn('No project configured for voice session', { guildId });
      return null;
    }

    // Create worktree for isolation
    let workDir: string | undefined;
    if (project.workingDir || project.gitUrl) {
      const result = await resolveAndCreateWorktree(project, agent.name, crypto.randomUUID());
      if (result.success) {
        workDir = result.workDir;
      } else {
        log.error('Failed to create worktree for voice session', { guildId, error: result.error });
      }
    }

    const session = createSession(this.db, {
      projectId: project.id,
      agentId: agent.id,
      name: `Discord voice:${guildId}`,
      initialPrompt:
        'You are in a live voice conversation on Discord. Your responses will be spoken aloud via TTS.\n\n' +
        'VOICE RULES — follow these strictly:\n' +
        '- Keep responses to 1-3 SHORT sentences while working. Save detailed summaries for when the task is complete.\n' +
        '- Talk like a human colleague — casual, direct, no filler. Say "on it" not "I will now proceed to investigate".\n' +
        '- NEVER use markdown, code blocks, bullet lists, URLs, or formatting of any kind.\n' +
        '- NEVER use emojis or special characters.\n' +
        '- If doing a task, give a brief status ("checking that now") and save the full explanation for when you are done.\n' +
        '- When finished, give a clear summary of what you did and the result.',
      source: 'discord' as SessionSource,
      workDir,
    });

    this.processManager.startProcess(session, session.initialPrompt);

    // Subscribe for responses
    const voiceSession: GuildVoiceSession = {
      sessionId: session.id,
      responding: false,
      responseBuffer: '',
      debounceTimer: null,
      callback: (_sid, event) => this.handleSessionEvent(guildId, event),
      pendingTranscriptions: [],
    };

    this.processManager.subscribe(session.id, voiceSession.callback);
    this.sessions.set(guildId, voiceSession);

    log.info('Created voice session', { guildId, sessionId: session.id, agentName: agent.name });
    return voiceSession;
  }

  /** Handle events from the agent session — buffer content and flush to TTS on completion. */
  private handleSessionEvent(guildId: string, event: ClaudeStreamEvent): void {
    const session = this.sessions.get(guildId);
    if (!session) return;

    if (event.type === 'assistant') {
      const text = extractContentText(event.message?.content);
      if (text) {
        session.responseBuffer += text;
      }

      // Debounce: wait for more content chunks before flushing
      if (session.debounceTimer) clearTimeout(session.debounceTimer);
      session.debounceTimer = setTimeout(() => {
        this.flushResponse(guildId);
      }, RESPONSE_DEBOUNCE_MS);
    }

    // Send text-only status updates for tool use so the user knows we're working
    if (event.type === 'tool_status' && this.sendTextMessage) {
      const info = this.voiceManager.getConnection(guildId);
      const textChannelId = info?.transcriptionChannelId;
      if (textChannelId && event.statusMessage) {
        this.sendTextMessage(textChannelId, `*${event.statusMessage}*`).catch((err) => {
          log.error('Failed to send tool status to text channel', { guildId, error: String(err) });
        });
      }
    }

    if (event.type === 'result') {
      // Agent finished — flush any remaining buffer
      if (session.debounceTimer) clearTimeout(session.debounceTimer);
      this.flushResponse(guildId);
    }

    if (event.type === 'session_error' || event.type === 'session_exited') {
      session.responding = false;
      if (session.debounceTimer) {
        clearTimeout(session.debounceTimer);
        session.debounceTimer = null;
      }
    }
  }

  /** Send the buffered response to TTS. */
  private flushResponse(guildId: string): void {
    const session = this.sessions.get(guildId);
    if (!session) return;

    session.debounceTimer = null;
    session.responding = false;

    let text = session.responseBuffer.trim();
    session.responseBuffer = '';

    if (!text) return;

    // Clean up text for TTS: strip markdown, code blocks, etc.
    text = cleanForTts(text);
    if (!text) return;

    // Truncate at a sentence boundary if too long
    if (text.length > MAX_TTS_LENGTH) {
      text = truncateAtSentence(text, MAX_TTS_LENGTH);
    }

    log.info('Voice response → TTS', { guildId, textLength: text.length });

    // Post agent response to the text channel for visibility
    if (this.sendTextMessage) {
      const info = this.voiceManager.getConnection(guildId);
      const textChannelId = info?.transcriptionChannelId;
      if (textChannelId) {
        this.sendTextMessage(textChannelId, `**Voice Response**: ${text}`).catch((err) => {
          log.error('Failed to post voice response to text channel', { guildId, error: String(err) });
        });
      }
    }

    this.voiceManager
      .speak(guildId, text)
      .then(() => this.drainPendingTranscriptions(guildId))
      .catch((err) => {
        log.error('TTS playback failed', { guildId, error: String(err) });
        // Still drain the queue so queued messages aren't lost
        this.drainPendingTranscriptions(guildId);
      });
  }

  /** Process any transcriptions that were queued while TTS was playing. */
  private drainPendingTranscriptions(guildId: string): void {
    const session = this.sessions.get(guildId);
    if (!session || session.pendingTranscriptions.length === 0) return;

    // Take all pending and clear the queue
    const pending = session.pendingTranscriptions.splice(0);
    log.info('Draining queued transcriptions', { guildId, count: pending.length });

    const info = this.voiceManager.getConnection(guildId);
    const channelId = info?.channelId ?? '';

    for (const { userId, text } of pending) {
      this.handleTranscription({ guildId, userId, text, channelId, durationMs: 0 });
    }
  }

  /** Clean up a guild's voice session (called on /voice leave). */
  cleanup(guildId: string): void {
    const session = this.sessions.get(guildId);
    if (!session) return;

    if (session.debounceTimer) clearTimeout(session.debounceTimer);
    this.processManager.unsubscribe(session.sessionId, session.callback);
    this.sessions.delete(guildId);
    log.info('Cleaned up voice session', { guildId, sessionId: session.sessionId });
  }

  /** Clean up all voice sessions. */
  cleanupAll(): void {
    for (const guildId of this.sessions.keys()) {
      this.cleanup(guildId);
    }
  }

  /** Check if a guild has an active voice session. */
  hasSession(guildId: string): boolean {
    return this.sessions.has(guildId);
  }
}

/**
 * Truncate text at the last sentence boundary within maxLength.
 * Falls back to word boundary if no sentence end is found.
 */
function truncateAtSentence(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;

  const truncated = text.slice(0, maxLength);

  // Find the last sentence-ending punctuation followed by a space or end
  const sentenceEnd = truncated.search(/[.!?][^.!?]*$/);
  if (sentenceEnd > maxLength * 0.5) {
    return truncated.slice(0, sentenceEnd + 1).trim();
  }

  // Fall back to last word boundary
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxLength * 0.5) {
    return `${truncated.slice(0, lastSpace).trim()}...`;
  }

  return `${truncated.trim()}...`;
}

/** Strip markdown formatting and code blocks for TTS-friendly output. */
function cleanForTts(text: string): string {
  return (
    text
      // Remove code blocks (```...```)
      .replace(/```[\s\S]*?```/g, '(code block omitted)')
      // Remove inline code
      .replace(/`([^`]+)`/g, '$1')
      // Remove bold/italic markers
      .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
      .replace(/_{1,3}([^_]+)_{1,3}/g, '$1')
      // Remove links — keep the text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Remove image embeds
      .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
      // Remove Discord user mentions — replace with "someone"
      .replace(/<@!?\d+>/g, 'someone')
      // Remove Discord channel mentions
      .replace(/<#\d+>/g, 'a channel')
      // Remove headers
      .replace(/^#{1,6}\s+/gm, '')
      // Collapse multiple newlines
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

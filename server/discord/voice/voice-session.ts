/**
 * Voice conversation loop — routes STT transcriptions through an agent session
 * and plays the response back via TTS.
 *
 * Flow: User speaks → Whisper STT → Agent session → Response text → OpenAI TTS → Voice channel
 */

import type { Database } from 'bun:sqlite';
import type { SessionSource } from '../../../shared/types';
import { findContactByPlatformId } from '../../db/contacts';
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
const RESPONSE_DEBOUNCE_MS = 1500;

/**
 * How long to wait after the last transcription before sending the batch to the agent (ms).
 * This lets multiple speakers (or continued speech) accumulate into a single prompt,
 * avoiding interrupting people mid-conversation.
 */
const TRANSCRIPTION_BUFFER_MS = 2000;

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
  /** Buffered transcriptions waiting to be sent as a batch. */
  transcriptionBuffer: { userId: string; text: string; voicePrefix: string }[];
  /** Timer for flushing the transcription buffer. */
  transcriptionBufferTimer: ReturnType<typeof setTimeout> | null;
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
   * Buffers transcriptions for TRANSCRIPTION_BUFFER_MS before sending to the agent,
   * so multiple speakers (or continued speech) get combined into one prompt.
   */
  async handleTranscription(result: TranscriptionResult): Promise<void> {
    const { guildId, userId, text } = result;

    if (!text.trim()) return;

    // Resolve text channel ID so voice messages include channel context
    const connectionInfo = this.voiceManager.getConnection(guildId);
    const textChannelId = connectionInfo?.transcriptionChannelId;
    const channelSuffix = textChannelId ? ` in channel ${textChannelId}` : '';
    // Resolve Discord ID to display name so the agent knows who's speaking
    // without relying on Whisper's (often garbled) name recognition
    const contact = findContactByPlatformId(this.db, 'default', 'discord', userId);
    const speakerLabel = contact?.displayName ? `${contact.displayName} (<@${userId}>)` : `<@${userId}>`;
    const voicePrefix = `[Voice from ${speakerLabel}${channelSuffix}]`;

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

    // If already responding, add to the transcription buffer (will flush after current response)
    const existing = this.sessions.get(guildId);
    if (existing?.responding) {
      log.debug('Queuing transcription — still responding to previous', { guildId, userId });
      this.processManager.sendMessage(existing.sessionId, `${voicePrefix}: ${text}`);
      return;
    }

    // Buffer the transcription — wait for more before sending to agent
    const session = await this.ensureSession(guildId);
    if (!session) {
      log.warn('No voice session available — cannot route transcription', { guildId });
      return;
    }

    session.transcriptionBuffer.push({ userId, text, voicePrefix });
    log.debug('Buffered transcription', {
      guildId,
      userId,
      bufferSize: session.transcriptionBuffer.length,
    });

    // Reset the buffer timer — wait for more transcriptions
    if (session.transcriptionBufferTimer) clearTimeout(session.transcriptionBufferTimer);
    session.transcriptionBufferTimer = setTimeout(() => {
      this.flushTranscriptionBuffer(guildId);
    }, TRANSCRIPTION_BUFFER_MS);
  }

  /** Flush all buffered transcriptions as a single combined message to the agent. */
  private flushTranscriptionBuffer(guildId: string): void {
    const session = this.sessions.get(guildId);
    if (!session) return;

    session.transcriptionBufferTimer = null;
    const buffered = session.transcriptionBuffer.splice(0);
    if (buffered.length === 0) return;

    // Combine all buffered transcriptions into a single message
    const combinedMessage = buffered.map((t) => `${t.voicePrefix}: ${t.text}`).join('\n');

    log.info('Flushing transcription buffer → agent', {
      guildId,
      messageCount: buffered.length,
      textLength: combinedMessage.length,
    });

    session.responding = true;
    session.responseBuffer = '';

    const sent = this.processManager.sendMessage(session.sessionId, combinedMessage);
    if (!sent) {
      // Session may have stopped — try resuming
      const dbSession = getSession(this.db, session.sessionId);
      if (dbSession) {
        this.processManager.subscribe(session.sessionId, session.callback);
        this.processManager.resumeProcess(dbSession, combinedMessage);
      } else {
        // Session is gone — create a new one
        log.info('Voice session expired, creating new one', { guildId });
        this.sessions.delete(guildId);
        this.ensureSession(guildId)
          .then((newSession) => {
            if (newSession) {
              newSession.responding = true;
              this.processManager.sendMessage(newSession.sessionId, combinedMessage);
            }
          })
          .catch((err) => {
            log.error('Failed to create voice session', {
              guildId,
              error: err instanceof Error ? err.message : String(err),
            });
          });
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

    // Resolve the text channel ID for hybrid voice+text output
    const connectionInfo = this.voiceManager.getConnection(guildId);
    const textChannelId = connectionInfo?.transcriptionChannelId;

    let voicePrompt =
      'You are in a live voice conversation on Discord. Your responses will be spoken aloud via TTS.\n\n' +
      'SPEAKER IDENTIFICATION:\n' +
      "- Each voice message includes the speaker's Discord ID in the prefix: [Voice from <@DISCORD_ID>]\n" +
      '- ALWAYS use this ID to identify who is speaking. Never guess based on voice or context.\n' +
      '- When referring to someone by name in the text channel, use the proper Discord mention format: <@DISCORD_ID>\n' +
      '- If you are unsure who someone is, use corvid_lookup_contact with their Discord ID to resolve their name.\n\n' +
      'CONVERSATION STYLE:\n' +
      '- You are a conversational participant, not just a code assistant. Engage naturally with whatever topic is being discussed.\n' +
      '- If someone wants to talk about games, hobbies, or anything else — participate fully and helpfully.\n' +
      '- Never deflect with "I\'m just a code agent" or similar. You are part of the conversation.\n\n' +
      'VOICE RULES — follow these strictly:\n' +
      '- Talk like a real person on a call. Match your response length to what the situation actually needs:\n' +
      '  * Quick acknowledgments: one sentence. ("On it." / "Yeah, that is in the voice module." / "Done, PR is up.")\n' +
      '  * Status updates: one to two sentences max.\n' +
      '  * Explanations or completed task summaries: can be longer, but still conversational — not a written report.\n' +
      '- Be casual and direct. Say "on it" not "I will now proceed to investigate".\n' +
      '- NEVER use markdown, code blocks, bullet lists, URLs, or formatting of any kind in your spoken response.\n' +
      '- NEVER use emojis or special characters.\n' +
      '- If doing a task, give a brief verbal status and save the full explanation for when you are done.\n' +
      '- Push anything visual (links, code, diffs, tables) to the text channel instead of reading it out loud.\n' +
      '- Do not pad short answers. If "yes" or "done" is the right answer, just say that.\n';

    if (textChannelId) {
      voicePrompt +=
        '\nTEXT CHANNEL OUTPUT:\n' +
        `Your companion text channel is ${textChannelId}. Use corvid_discord_send_message to post there when you need to share:\n` +
        '- URLs, PR links, or any links\n' +
        '- Code snippets or diffs\n' +
        '- Images (use corvid_discord_send_image)\n' +
        '- Long detailed output, tables, or formatted content\n' +
        'Speak a brief summary in voice ("PR is up, posted the link in chat") and put the actual content in the text channel.\n' +
        'This way users get the conversational voice AND the rich content in text.';
    }

    const session = createSession(this.db, {
      projectId: project.id,
      agentId: agent.id,
      name: `Discord voice:${guildId}`,
      initialPrompt: voicePrompt,
      source: 'discord' as SessionSource,
      workDir,
      keepAlive: true,
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
      transcriptionBuffer: [],
      transcriptionBufferTimer: null,
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

    // Resolve Discord mentions (<@123456>) to display names before TTS cleanup
    text = this.resolveMentionsForTts(text);

    // Extract rich content (URLs, code blocks) before cleaning for TTS
    const richContent = extractRichContent(text);

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

        // Post extracted rich content (URLs, code blocks) separately so they're clickable
        if (richContent.length > 0) {
          const richText = richContent.join('\n');
          this.sendTextMessage(textChannelId, richText).catch((err) => {
            log.error('Failed to post rich content to text channel', { guildId, error: String(err) });
          });
        }
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

  /**
   * Replace Discord mention tags (<@123456>) with the contact's display name
   * so TTS says "Leif" instead of "someone".
   */
  private resolveMentionsForTts(text: string): string {
    return text.replace(/<@!?(\d+)>/g, (_match, discordId: string) => {
      const contact = findContactByPlatformId(this.db, 'default', 'discord', discordId);
      return contact?.displayName ?? 'someone';
    });
  }

  /** Clean up a guild's voice session (called on /voice leave). */
  cleanup(guildId: string): void {
    const session = this.sessions.get(guildId);
    if (!session) return;

    if (session.debounceTimer) clearTimeout(session.debounceTimer);
    if (session.transcriptionBufferTimer) clearTimeout(session.transcriptionBufferTimer);
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

/**
 * Extract rich content (URLs, code blocks) from response text.
 * These get posted to the text channel separately so they're clickable/readable.
 */
function extractRichContent(text: string): string[] {
  const items: string[] = [];

  // Extract code blocks
  const codeBlocks = text.match(/```[\s\S]*?```/g);
  if (codeBlocks) {
    for (const block of codeBlocks) {
      items.push(block);
    }
  }

  // Extract standalone URLs (not already in markdown links)
  const urlPattern = /(?<!\()\bhttps?:\/\/[^\s)<>]+/g;
  const urls = text.match(urlPattern);
  if (urls) {
    // Deduplicate
    const unique = [...new Set(urls)];
    for (const url of unique) {
      items.push(`🔗 ${url}`);
    }
  }

  // Extract markdown links [text](url)
  const mdLinks = text.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g);
  for (const match of mdLinks) {
    items.push(`🔗 [${match[1]}](${match[2]})`);
  }

  return items;
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

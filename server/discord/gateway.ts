import { createLogger } from '../lib/logger';
import type {
  DiscordBridgeConfig,
  DiscordGatewayPayload,
  DiscordHelloData,
  DiscordInteractionData,
  DiscordMessageData,
  DiscordReactionData,
  DiscordReadyData,
} from './types';
import { GatewayIntent, GatewayOp } from './types';

const log = createLogger('DiscordGateway');

const GATEWAY_URL = 'wss://gateway.discord.gg/?v=10&encoding=json';

/**
 * Callbacks the gateway fires when it receives dispatch events
 * that the bridge layer needs to handle.
 */
export interface GatewayDispatchHandlers {
  onMessage(data: DiscordMessageData): void;
  onInteraction(data: DiscordInteractionData): void;
  onReady(sessionId: string, botUserId: string | null): void;
  onReactionAdd?(data: DiscordReactionData): void;
}

/**
 * Manages the Discord Gateway WebSocket connection, heartbeat,
 * identify/resume lifecycle, and reconnection logic.
 *
 * Dispatch events (MESSAGE_CREATE, INTERACTION_CREATE, READY) are
 * forwarded to the bridge via the {@link GatewayDispatchHandlers} callbacks.
 */
export class DiscordGateway {
  private config: DiscordBridgeConfig;
  private handlers: GatewayDispatchHandlers;

  private ws: WebSocket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatAcked = true;
  private sequence: number | null = null;
  private sessionId: string | null = null;
  // Note: resume_gateway_url from Discord READY is intentionally not stored
  // to avoid SSRF risk. We always reconnect via the hardcoded gateway URL.
  private _running = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;

  constructor(config: DiscordBridgeConfig, handlers: GatewayDispatchHandlers) {
    this.config = config;
    this.handlers = handlers;
  }

  get running(): boolean {
    return this._running;
  }

  /** Open the gateway connection. No-op if already running. */
  start(): void {
    if (this._running) return;
    this._running = true;
    this.connect();
  }

  /** Close the gateway connection and stop heartbeat. */
  stop(): void {
    this._running = false;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.ws) {
      this.ws.close(1000, 'Shutting down');
      this.ws = null;
    }
  }

  /** Expose the bot token for REST API calls made by the bridge. */
  get botToken(): string {
    return this.config.botToken;
  }

  /** Send a PRESENCE_UPDATE over the live gateway connection. */
  updatePresence(statusText?: string, activityType?: number): void {
    this.send({
      op: GatewayOp.PRESENCE_UPDATE,
      d: {
        status: 'online',
        activities: [
          {
            name: statusText ?? process.env.DISCORD_STATUS ?? 'corvid-agent',
            type: activityType ?? parseInt(process.env.DISCORD_ACTIVITY_TYPE ?? '3', 10),
          },
        ],
        since: null,
        afk: false,
      },
      s: null,
      t: null,
    });
  }

  // ── Connection ────────────────────────────────────────────────────────

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

      // 4003/4007/4009: session is invalid — clear it so we IDENTIFY fresh
      // 4004/4010-4014: fatal config errors — stop reconnecting
      const code = event.code;
      if (code === 4003 || code === 4007 || code === 4009) {
        this.sessionId = null;
        this.sequence = null;
      } else if (code === 4004 || (code >= 4010 && code <= 4014)) {
        log.error('Discord gateway fatal close code, not reconnecting', { code });
        this._running = false;
        return;
      }

      if (this._running) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (event) => {
      log.error('Discord gateway error', { error: String(event) });
    };
  }

  // ── Gateway Message Handling ──────────────────────────────────────────

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
        log.debug('Heartbeat ACK received');
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
        setTimeout(
          () => {
            if (this.sessionId) {
              this.resume();
            } else {
              this.identify();
            }
          },
          1000 + Math.random() * 4000,
        );
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
        const botUserId = data.user?.id ?? null;
        log.info('Discord gateway ready', { sessionId: this.sessionId, botUserId });
        this.handlers.onReady(this.sessionId, botUserId);
        break;
      }

      case 'RESUMED':
        log.info('Discord session resumed');
        break;

      case 'MESSAGE_CREATE': {
        const data = payload.d as DiscordMessageData;
        log.debug('MESSAGE_CREATE dispatch', {
          channelId: data.channel_id,
          username: data.author?.username,
          isBot: data.author?.bot,
          mentionCount: data.mentions?.length ?? 0,
          mentionRoleCount: data.mention_roles?.length ?? 0,
          attachmentCount: data.attachments?.length ?? 0,
          attachments: data.attachments?.map((a) => ({
            filename: a.filename,
            content_type: a.content_type,
            size: a.size,
            hasUrl: !!a.url,
            hasProxyUrl: !!a.proxy_url,
          })),
        });
        this.handlers.onMessage(data);
        break;
      }

      case 'INTERACTION_CREATE': {
        const data = payload.d as DiscordInteractionData;
        this.handlers.onInteraction(data);
        break;
      }

      case 'MESSAGE_REACTION_ADD': {
        const data = payload.d as DiscordReactionData;
        this.handlers.onReactionAdd?.(data);
        break;
      }
    }
  }

  // ── Identify / Resume ─────────────────────────────────────────────────

  private identify(): void {
    // GUILDS is always needed for the bot to receive guild dispatch events.
    // GUILD_MEMBERS is added when public mode is enabled (for role data).
    let intents =
      GatewayIntent.GUILDS |
      GatewayIntent.GUILD_MESSAGES |
      GatewayIntent.GUILD_MESSAGE_REACTIONS |
      GatewayIntent.MESSAGE_CONTENT;
    if (this.config.publicMode) {
      intents |= GatewayIntent.GUILD_MEMBERS;
    }
    this.send({
      op: GatewayOp.IDENTIFY,
      d: {
        token: this.config.botToken,
        intents,
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
      activities: [
        {
          name: statusText,
          type: activityType,
        },
      ],
      since: null,
      afk: false,
    };
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

  // ── Heartbeat ─────────────────────────────────────────────────────────

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

  // ── Send / Reconnect ──────────────────────────────────────────────────

  private send(payload: DiscordGatewayPayload): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      log.error('Max Discord reconnect attempts reached, giving up');
      this._running = false;
      return;
    }

    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 60000);
    this.reconnectAttempts++;
    log.info(`Reconnecting to Discord in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      if (this._running) {
        this.connect();
      }
    }, delay);
  }
}

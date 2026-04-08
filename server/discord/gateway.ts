/**
 * Discord Gateway — Discord.js Client wrapper.
 *
 * Uses discord.js Client for the WebSocket lifecycle, heartbeat, identify/resume,
 * and reconnection. Exposes a thin dispatch interface (GatewayDispatchHandlers)
 * that the bridge layer consumes.
 *
 * Part of the discord.js migration (#1800). REST layer lives in rest-client.ts.
 */

import {
  type ActivityType,
  type BaseInteraction,
  Client,
  GatewayIntentBits,
  type Message,
  type MessageReaction,
  type PartialMessageReaction,
  type PartialUser,
  PresenceUpdateStatus,
  type User,
} from 'discord.js';
import { createLogger } from '../lib/logger';
import type {
  DiscordAttachment,
  DiscordAuthor,
  DiscordBridgeConfig,
  DiscordMessageData,
  DiscordReactionData,
} from './types';

const log = createLogger('DiscordGateway');

/**
 * Callbacks the gateway fires when it receives dispatch events
 * that the bridge layer needs to handle.
 */
export interface GatewayDispatchHandlers {
  onMessage(data: DiscordMessageData): void;
  onInteraction(interaction: BaseInteraction): void;
  onReady(sessionId: string, botUserId: string | null): void;
  onReactionAdd?(data: DiscordReactionData): void;
}

/**
 * Discord.js Client wrapper providing the dispatch interface consumed by bridge.ts.
 *
 * Discord.js handles WebSocket lifecycle, heartbeat, identify/resume,
 * session management, and exponential-backoff reconnection automatically.
 */
export class DiscordGateway {
  private config: DiscordBridgeConfig;
  private handlers: GatewayDispatchHandlers;
  private client: Client | null = null;
  private _running = false;

  constructor(config: DiscordBridgeConfig, handlers: GatewayDispatchHandlers) {
    this.config = config;
    this.handlers = handlers;
  }

  get running(): boolean {
    return this._running;
  }

  /** Expose the bot token for REST API calls made by the bridge. */
  get botToken(): string {
    return this.config.botToken;
  }

  /** Expose the underlying discord.js Client (needed by @discordjs/voice). */
  get discordClient(): Client | null {
    return this.client;
  }

  /** Open the gateway connection. No-op if already running. */
  start(): void {
    if (this._running) return;
    this._running = true;

    const intents: GatewayIntentBits[] = [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildVoiceStates,
    ];
    if (this.config.publicMode) {
      intents.push(GatewayIntentBits.GuildMembers);
    }

    this.client = new Client({ intents });

    this.client.on('ready', (readyClient) => {
      // Discord.js manages session state internally; we surface the
      // bot user ID which is what bridge.ts actually uses.
      const botUserId = readyClient.user.id;
      log.info('Discord gateway ready', { botUserId });
      this.handlers.onReady(botUserId, botUserId);
    });

    // Log raw voice gateway events for diagnostics
    this.client.on('raw', (packet: { t: string; d: Record<string, unknown> }) => {
      if (packet.t === 'VOICE_STATE_UPDATE' || packet.t === 'VOICE_SERVER_UPDATE') {
        log.info('Voice gateway event', {
          type: packet.t,
          guildId: packet.d?.guild_id,
          channelId: packet.d?.channel_id,
          hasEndpoint: packet.t === 'VOICE_SERVER_UPDATE' ? !!packet.d?.endpoint : undefined,
        });
      }
    });

    this.client.on('messageCreate', (message: Message) => {
      if (!this._running) return;
      log.debug('MESSAGE_CREATE dispatch', {
        channelId: message.channelId,
        username: message.author.username,
        isBot: message.author.bot,
        mentionCount: message.mentions.users.size,
        mentionRoleCount: message.mentions.roles.size,
        attachmentCount: message.attachments.size,
        attachments: [...message.attachments.values()].map((a) => ({
          filename: a.name,
          content_type: a.contentType,
          size: a.size,
          hasUrl: !!a.url,
          hasProxyUrl: !!a.proxyURL,
        })),
      });
      this.handlers.onMessage(mapMessage(message));
    });

    this.client.on('interactionCreate', (interaction: BaseInteraction) => {
      if (!this._running) return;
      this.handlers.onInteraction(interaction);
    });

    this.client.on(
      'messageReactionAdd',
      (reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) => {
        if (!this._running || !this.handlers.onReactionAdd) return;
        const data = mapReaction(reaction, user);
        if (data) this.handlers.onReactionAdd(data);
      },
    );

    this.client.on('error', (err) => {
      log.error('Discord gateway error', { error: err.message });
    });

    this.client.login(this.config.botToken).catch((err: unknown) => {
      log.error('Discord gateway login failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      this._running = false;
    });

    // Set initial presence from env after login
    const statusText = process.env.DISCORD_STATUS ?? 'corvid-agent';
    const activityType = parseInt(process.env.DISCORD_ACTIVITY_TYPE ?? '3', 10);
    this.client.once('ready', () => {
      this.updatePresence(statusText, activityType);
    });
  }

  /** Close the gateway connection. */
  stop(): void {
    this._running = false;
    if (this.client) {
      this.client.destroy();
      this.client = null;
    }
  }

  /** Update the bot's presence via the live Discord.js client. */
  updatePresence(statusText?: string, activityType?: number): void {
    if (!this.client?.isReady()) return;
    this.client.user.setPresence({
      status: PresenceUpdateStatus.Online,
      activities: [
        {
          name: statusText ?? process.env.DISCORD_STATUS ?? 'corvid-agent',
          type: (activityType ?? parseInt(process.env.DISCORD_ACTIVITY_TYPE ?? '3', 10)) as ActivityType,
        },
      ],
    });
  }
}

// ─── Type mapping helpers ─────────────────────────────────────────────────────

function mapAuthor(user: { id: string; username: string; bot?: boolean }): DiscordAuthor {
  return {
    id: user.id,
    username: user.username,
    bot: user.bot ?? false,
  };
}

function mapAttachment(a: {
  id: string;
  name: string;
  contentType: string | null;
  size: number;
  url: string;
  proxyURL: string;
  width: number | null;
  height: number | null;
}): DiscordAttachment {
  return {
    id: a.id,
    filename: a.name,
    content_type: a.contentType ?? undefined,
    size: a.size,
    url: a.url,
    proxy_url: a.proxyURL,
    width: a.width ?? undefined,
    height: a.height ?? undefined,
  };
}

function mapMessage(message: Message): DiscordMessageData {
  // Resolve referenced message from the client cache when available.
  // Discord.js does not embed it automatically (unlike the raw gateway),
  // so we use the cache for best-effort mapping.
  let referencedMessage: DiscordMessageData['referenced_message'] = null;
  if (message.reference?.messageId) {
    const cached = message.channel.messages?.cache.get(message.reference.messageId);
    if (cached) {
      referencedMessage = {
        id: cached.id,
        content: cached.content,
        author: mapAuthor(cached.author),
      };
    }
  }

  return {
    id: message.id,
    channel_id: message.channelId,
    author: mapAuthor(message.author),
    content: message.content,
    timestamp: message.createdAt.toISOString(),
    thread: message.channel.isThread() ? { id: message.channelId } : undefined,
    mentions: [...message.mentions.users.values()].map(mapAuthor),
    mention_roles: [...message.mentions.roles.keys()],
    member: message.member ? { roles: [...message.member.roles.cache.keys()] } : undefined,
    message_reference: message.reference?.messageId
      ? {
          message_id: message.reference.messageId,
          channel_id: message.reference.channelId ?? undefined,
          guild_id: message.reference.guildId ?? undefined,
        }
      : undefined,
    referenced_message: referencedMessage,
    attachments: [...message.attachments.values()].map(mapAttachment),
  };
}

function mapReaction(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
): DiscordReactionData | null {
  if (!user.id) return null;
  return {
    user_id: user.id,
    channel_id: reaction.message.channelId,
    message_id: reaction.message.id,
    guild_id: reaction.message.guildId ?? undefined,
    emoji: {
      id: reaction.emoji.id,
      name: reaction.emoji.name ?? '',
    },
  };
}

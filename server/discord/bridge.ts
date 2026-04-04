/**
 * Bidirectional Discord bridge backed by discord.js Client (Phase 2).
 *
 * Supports two modes:
 * - `chat` (default): Messages route to persistent agent sessions.
 * - `work_intake`: Messages create async work tasks via WorkTaskService.
 *
 * This file is a thin orchestration layer. Domain logic is in:
 * - commands.ts — slash command registration & handling
 * - admin-commands.ts — /admin subcommand handlers
 * - embeds.ts — embed builders & Discord API helpers
 * - message-handler.ts — message routing & dispatch
 * - permissions.ts — role-based access control
 * - thread-manager.ts — thread lifecycle & streaming
 * - gateway.ts — discord.js Client wrapper (WebSocket, heartbeat, reconnect)
 * - rest-client.ts — discord.js REST adapter (Phase 1)
 */

import type { Database } from 'bun:sqlite';
import { getDiscordConfig } from '../db/discord-config';
import { pruneOldThreadSessions } from '../db/discord-thread-sessions';
import { type DeliveryTracker, getDeliveryTracker } from '../lib/delivery-tracker';
import { createLogger } from '../lib/logger';
import type { EventCallback } from '../process/interfaces';
import type { ProcessManager } from '../process/manager';
import type { ReputationScorer } from '../reputation/scorer';
import type { WorkTaskService } from '../work/service';
import type { InteractionContext } from './commands';
// Extracted modules
import { handleInteraction as handleInteractionImpl, registerSlashCommands } from './commands';
import { initializeRestClient } from './rest-client';
import {
  addReaction as addReactionImpl,
  removeReaction as removeReactionImpl,
  sendDiscordMessage,
  sendTypingIndicator as sendTypingIndicatorImpl,
} from './embeds';
import { DiscordGateway } from './gateway';
import { type GuildCache, loadGuildCache, syncGuildData } from './guild-api';
import type { MessageHandlerContext } from './message-handler';
import { handleMessage as handleMessageImpl, sendTaskResult as sendTaskResultImpl } from './message-handler';
import { muteUser as muteUserImpl, unmuteUser as unmuteUserImpl } from './permissions';
import { handleReaction as handleReactionImpl, type ReactionHandlerContext } from './reaction-handler';
import {
  archiveStaleThreads as archiveStaleThreadsImpl,
  createStandaloneThread as createStandaloneThreadImpl,
  subscribeForAdaptiveInlineResponse,
} from './thread-manager';
import { ThreadSessionManager } from './thread-session-manager';
import type { BaseInteraction } from 'discord.js';
import type { DiscordBridgeConfig, DiscordMessageData, DiscordReactionData } from './types';

const log = createLogger('DiscordBridge');

export class DiscordBridge {
  private db: Database;
  private processManager: ProcessManager;
  private workTaskService: WorkTaskService | null;
  private buddyService: import('../buddy/service').BuddyService | null;
  private config: DiscordBridgeConfig;
  private gateway: DiscordGateway;

  private botUserId: string | null = null;
  private running = false;

  /** Owns thread/session/mention Maps and lifecycle (subscribe, recover, auto-detect). */
  private tsm: ThreadSessionManager;
  private tsmCleanup: (() => void) | null = null;

  // Per-user rate limiting: userId → timestamps of recent messages
  private userMessageTimestamps: Map<string, number[]> = new Map();
  private readonly RATE_LIMIT_WINDOW_MS = 60_000;
  private readonly RATE_LIMIT_MAX_MESSAGES = 10;
  private delivery: DeliveryTracker = getDeliveryTracker();

  private staleCheckTimer: ReturnType<typeof setInterval> | null = null;
  /** Stale thread auto-archive after 2 hours of inactivity */
  private readonly STALE_THREAD_MS = 2 * 60 * 60 * 1000;

  /** Users muted from bot interactions (admin-managed). */
  private mutedUsers: Set<string> = new Set();

  /** Users who have interacted at least once — used for first-interaction welcome tips. */
  private interactedUsers: Set<string> = new Set();

  /** Reputation scorer for reaction feedback. Set via setReputationScorer(). */
  private reputationScorer: ReputationScorer | null = null;

  /** Debounce timer for updateSlashCommands — coalesces rapid agent changes. */
  private slashCommandDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly SLASH_COMMAND_DEBOUNCE_MS = 2_000;

  /** Periodic config reload timer — picks up DB changes without restart */
  private configReloadTimer: ReturnType<typeof setInterval> | null = null;
  private static readonly CONFIG_RELOAD_INTERVAL_MS = 30_000;

  /** Periodic guild data sync timer — refreshes role/channel cache */
  private guildSyncTimer: ReturnType<typeof setInterval> | null = null;
  /** Guild roles/channels/info cache — auto-synced from Discord API */
  private guildCache: GuildCache = { info: null, roles: [], channels: [] };
  /** Sync guild data every 5 minutes */
  private static readonly GUILD_SYNC_INTERVAL_MS = 5 * 60 * 1000;

  /** Global event subscriber for auto-recovering Discord thread subscriptions */
  private globalEventCallback: EventCallback | null = null;

  constructor(
    db: Database,
    processManager: ProcessManager,
    config: DiscordBridgeConfig,
    workTaskService?: WorkTaskService,
    buddyService?: import('../buddy/service').BuddyService,
  ) {
    this.db = db;
    this.processManager = processManager;
    this.config = config;
    this.workTaskService = workTaskService ?? null;
    this.buddyService = buddyService ?? null;
    // Initialize discord.js REST client for API calls
    initializeRestClient(config.botToken);
    this.tsm = new ThreadSessionManager(db, processManager, this.delivery, config.botToken);
    this.gateway = new DiscordGateway(config, {
      onMessage: (data) => {
        this.handleMessage(data).catch((err) => {
          log.error('Error handling Discord message', { error: err instanceof Error ? err.message : String(err) });
        });
      },
      onInteraction: (data) => {
        this.handleInteraction(data).catch((err) => {
          log.error('Error handling Discord interaction', { error: err instanceof Error ? err.message : String(err) });
        });
      },
      onReactionAdd: (data) => {
        this.handleReaction(data);
      },
      onReady: (sessionId, botUserId) => {
        if (botUserId) {
          this.botUserId = botUserId;
        }
        log.info('Discord bridge received gateway ready', { sessionId, botUserId });
        this.tsm.recoverSessions();
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

    // Load persisted muted users from DB
    try {
      const rows = this.db.query('SELECT user_id FROM discord_muted_users').all() as { user_id: string }[];
      for (const row of rows) this.mutedUsers.add(row.user_id);
      if (rows.length > 0) {
        log.info('Loaded persisted muted users', { count: rows.length });
      }
    } catch (err) {
      log.error('Failed to load muted users from DB', { error: err instanceof Error ? err.message : String(err) });
    }

    this.tsmCleanup = this.tsm.startTtlCleanup();
    this.gateway.start();

    if (this.config.appId) {
      registerSlashCommands(this.db, this.config).catch((err) => {
        log.error('Failed to register Discord slash commands', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    // Start periodic stale thread check (every 10 minutes)
    this.staleCheckTimer = setInterval(
      () => {
        archiveStaleThreadsImpl(
          this.processManager,
          this.delivery,
          this.config.botToken,
          this.tsm.threadLastActivity,
          this.tsm.threadSessions,
          this.tsm.threadCallbacks,
          this.STALE_THREAD_MS,
          this.db,
        ).catch((err) => {
          log.warn('Stale thread check failed', { error: err instanceof Error ? err.message : String(err) });
        });
        // Prune old thread session DB entries (>14 days)
        try { pruneOldThreadSessions(this.db); } catch { /* non-critical */ }
      },
      10 * 60 * 1000,
    );

    // Start periodic config reload from DB (every 30 seconds)
    this.reloadConfigFromDb();
    this.configReloadTimer = setInterval(() => {
      this.reloadConfigFromDb();
    }, DiscordBridge.CONFIG_RELOAD_INTERVAL_MS);

    // Load guild cache from DB immediately, then sync from Discord API
    this.guildCache = loadGuildCache(this.db);
    this.syncGuildDataAsync();
    this.guildSyncTimer = setInterval(() => {
      this.syncGuildDataAsync();
    }, DiscordBridge.GUILD_SYNC_INTERVAL_MS);

    // Watch for Discord sessions that start producing events without a thread subscription.
    this.globalEventCallback = (sessionId, event) => {
      if (event.type !== 'assistant') return;
      if (this.tsm.autoSubscribeSession(sessionId)) {
        log.info('Auto-subscribed Discord thread for resumed session', { sessionId });
      }
    };
    this.processManager.subscribeAll(this.globalEventCallback);
  }

  stop(): void {
    this.running = false;
    this.gateway.stop();
    if (this.tsmCleanup) {
      this.tsmCleanup();
      this.tsmCleanup = null;
    }
    if (this.staleCheckTimer) {
      clearInterval(this.staleCheckTimer);
      this.staleCheckTimer = null;
    }
    if (this.configReloadTimer) {
      clearInterval(this.configReloadTimer);
      this.configReloadTimer = null;
    }
    if (this.guildSyncTimer) {
      clearInterval(this.guildSyncTimer);
      this.guildSyncTimer = null;
    }
    if (this.slashCommandDebounceTimer) {
      clearTimeout(this.slashCommandDebounceTimer);
      this.slashCommandDebounceTimer = null;
    }
    if (this.globalEventCallback) {
      this.processManager.unsubscribeAll(this.globalEventCallback);
      this.globalEventCallback = null;
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

      this.config.additionalChannelIds = dbConfig.additionalChannelIds;
      this.config.allowedUserIds = dbConfig.allowedUserIds;
      this.config.mode = dbConfig.mode;
      this.config.defaultAgentId = dbConfig.defaultAgentId ?? undefined;
      this.config.publicMode = dbConfig.publicMode;
      this.config.rolePermissions = dbConfig.rolePermissions;
      this.config.defaultPermissionLevel = dbConfig.defaultPermissionLevel;
      this.config.rateLimitByLevel = dbConfig.rateLimitByLevel;
      this.config.channelPermissions = dbConfig.channelPermissions;
      this.config.messageFullToolChannelIds = dbConfig.messageFullToolChannelIds;

      this.gateway.updatePresence(dbConfig.statusText, dbConfig.activityType);

      if (dbConfig.interactedUsers.length > 0) {
        for (const uid of dbConfig.interactedUsers) {
          this.interactedUsers.add(uid);
        }
      }
    } catch (err) {
      log.warn('Failed to reload Discord config from DB', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

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
      registerSlashCommands(this.db, this.config).catch((err) => {
        log.error('Failed to refresh Discord slash commands', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, DiscordBridge.SLASH_COMMAND_DEBOUNCE_MS);
  }

  /** Wire up the reputation scorer for reaction-based feedback. */
  setReputationScorer(scorer: ReputationScorer): void {
    this.reputationScorer = scorer;
  }

  /** Async guild data sync — fires and forgets, logs errors. */
  private syncGuildDataAsync(): void {
    syncGuildData(this.db, this.config.botToken, this.config.guildId)
      .then((cache) => {
        if (cache) this.guildCache = cache;
      })
      .catch((err) => {
        log.warn('Guild data sync failed', { error: err instanceof Error ? err.message : String(err) });
      });
  }

  /** Get the current guild cache (roles, channels, info). */
  getGuildCache(): GuildCache {
    return this.guildCache;
  }

  // ── Delegation methods ──────────────────────────────────────────────

  private handleReaction(data: DiscordReactionData): void {
    const ctx: ReactionHandlerContext = {
      db: this.db,
      botUserId: this.botUserId,
      scorer: this.reputationScorer,
      mentionSessions: this.tsm.mentionSessions,
      threadSessions: this.tsm.threadSessions,
    };
    handleReactionImpl(ctx, data);
  }

  private async handleInteraction(interaction: BaseInteraction): Promise<void> {
    const ctx: InteractionContext = {
      db: this.db,
      config: this.config,
      processManager: this.processManager,
      workTaskService: this.workTaskService,
      delivery: this.delivery,
      mutedUsers: this.mutedUsers,
      threadSessions: this.tsm.threadSessions,
      threadCallbacks: this.tsm.threadCallbacks,
      threadLastActivity: this.tsm.threadLastActivity,
      guildCache: this.guildCache,
      createStandaloneThread: (channelId, name) => createStandaloneThreadImpl(this.config.botToken, channelId, name),
      subscribeForResponseWithEmbed: (sid, tid, an, am, pn, dc, di, au) =>
        this.tsm.subscribeThread(sid, tid, an, am, pn, dc, di, au),
      sendTaskResult: (cid, task, uid) => this.sendTaskResult(cid, task, uid),
      muteUser: (uid) => this.muteUser(uid),
      unmuteUser: (uid) => this.unmuteUser(uid),
      mentionSessions: this.tsm.mentionSessions,
      subscribeForInlineResponse: (sid, cid, rid, an, am, onBot, pn, dc, di, au) =>
        subscribeForAdaptiveInlineResponse(
          this.processManager,
          this.delivery,
          this.config.botToken,
          sid,
          cid,
          rid,
          an,
          am,
          onBot,
          pn,
          dc,
          di,
          au,
        ),
      syncGuildData: () => this.syncGuildDataAsync(),
      buddyService: this.buddyService,
      userMessageTimestamps: this.userMessageTimestamps,
      rateLimitWindowMs: this.RATE_LIMIT_WINDOW_MS,
      rateLimitMaxMessages: this.RATE_LIMIT_MAX_MESSAGES,
    };
    await handleInteractionImpl(ctx, interaction);
  }

  private async handleMessage(data: DiscordMessageData): Promise<void> {
    const ctx: MessageHandlerContext = {
      db: this.db,
      config: this.config,
      processManager: this.processManager,
      workTaskService: this.workTaskService,
      delivery: this.delivery,
      botUserId: this.botUserId,
      botRoleId: this.config.botRoleId ?? null,
      mutedUsers: this.mutedUsers,
      interactedUsers: this.interactedUsers,
      userMessageTimestamps: this.userMessageTimestamps,
      rateLimitWindowMs: this.RATE_LIMIT_WINDOW_MS,
      rateLimitMaxMessages: this.RATE_LIMIT_MAX_MESSAGES,
      threadSessions: this.tsm.threadSessions,
      threadCallbacks: this.tsm.threadCallbacks,
      threadLastActivity: this.tsm.threadLastActivity,
      mentionSessions: this.tsm.mentionSessions,
      processedMessageIds: this.tsm.processedMessageIds,
    };
    await handleMessageImpl(ctx, data);
  }

  private async sendTaskResult(
    channelId: string,
    task: import('../../shared/types/work-tasks').WorkTask,
    mentionUserId?: string,
  ): Promise<void> {
    const ctx: MessageHandlerContext = {
      db: this.db,
      config: this.config,
      processManager: this.processManager,
      workTaskService: this.workTaskService,
      delivery: this.delivery,
      botUserId: this.botUserId,
      botRoleId: this.config.botRoleId ?? null,
      mutedUsers: this.mutedUsers,
      interactedUsers: this.interactedUsers,
      userMessageTimestamps: this.userMessageTimestamps,
      rateLimitWindowMs: this.RATE_LIMIT_WINDOW_MS,
      rateLimitMaxMessages: this.RATE_LIMIT_MAX_MESSAGES,
      threadSessions: this.tsm.threadSessions,
      threadCallbacks: this.tsm.threadCallbacks,
      threadLastActivity: this.tsm.threadLastActivity,
      mentionSessions: this.tsm.mentionSessions,
      processedMessageIds: this.tsm.processedMessageIds,
    };
    await sendTaskResultImpl(ctx, channelId, task, mentionUserId);
  }

  // ── Public API (kept for backward compatibility) ────────────────────

  muteUser(userId: string): void {
    muteUserImpl(this.mutedUsers, userId);
    try {
      this.db.run('INSERT OR IGNORE INTO discord_muted_users (user_id) VALUES (?)', [userId]);
    } catch (err) {
      log.error('Failed to persist mute', { userId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  unmuteUser(userId: string): void {
    unmuteUserImpl(this.mutedUsers, userId);
    try {
      this.db.run('DELETE FROM discord_muted_users WHERE user_id = ?', [userId]);
    } catch (err) {
      log.error('Failed to persist unmute', { userId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  async sendMessage(channelId: string, content: string): Promise<void> {
    await sendDiscordMessage(this.delivery, this.config.botToken, channelId, content);
  }

  async sendTypingIndicator(channelId: string): Promise<void> {
    await sendTypingIndicatorImpl(this.config.botToken, channelId);
  }

  async addReaction(channelId: string, messageId: string, emoji: string): Promise<void> {
    await addReactionImpl(this.config.botToken, channelId, messageId, emoji);
  }

  async removeReaction(channelId: string, messageId: string, emoji: string): Promise<void> {
    await removeReactionImpl(this.config.botToken, channelId, messageId, emoji);
  }
}

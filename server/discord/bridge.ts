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
 *
 * This file is a thin orchestration layer. Domain logic is in:
 * - commands.ts — slash command registration & handling
 * - admin-commands.ts — /admin subcommand handlers
 * - embeds.ts — embed builders & Discord API helpers
 * - message-handler.ts — message routing & dispatch
 * - permissions.ts — role-based access control
 * - thread-manager.ts — thread lifecycle & streaming
 */

import type { Database } from 'bun:sqlite';
import type { ProcessManager } from '../process/manager';
import type { WorkTaskService } from '../work/service';
import type { DiscordBridgeConfig, DiscordInteractionData, DiscordMessageData, DiscordReactionData } from './types';
import type { EventCallback } from '../process/interfaces';
import type { ReputationScorer } from '../reputation/scorer';
import { DiscordGateway } from './gateway';
import { getAgent } from '../db/agents';
import { getSession } from '../db/sessions';
import { createLogger } from '../lib/logger';
import { getDeliveryTracker, type DeliveryTracker } from '../lib/delivery-tracker';
import { getDiscordConfig } from '../db/discord-config';

// Extracted modules
import { registerSlashCommands, handleInteraction as handleInteractionImpl } from './commands';
import type { InteractionContext } from './commands';
import { handleMessage as handleMessageImpl, sendTaskResult as sendTaskResultImpl } from './message-handler';
import type { MessageHandlerContext } from './message-handler';
import {
    sendDiscordMessage,
    sendTypingIndicator as sendTypingIndicatorImpl,
    addReaction as addReactionImpl,
    removeReaction as removeReactionImpl,
} from './embeds';
import { muteUser as muteUserImpl, unmuteUser as unmuteUserImpl } from './permissions';
import { handleReaction as handleReactionImpl, type ReactionHandlerContext } from './reaction-handler';
import type { ThreadSessionInfo, ThreadCallbackInfo } from './thread-manager';
import {
    subscribeForResponseWithEmbed as subscribeImpl,
    recoverActiveThreadSubscriptions,
    archiveStaleThreads as archiveStaleThreadsImpl,
    createStandaloneThread as createStandaloneThreadImpl,
} from './thread-manager';

const log = createLogger('DiscordBridge');

export class DiscordBridge {
    private db: Database;
    private processManager: ProcessManager;
    private workTaskService: WorkTaskService | null;
    private config: DiscordBridgeConfig;
    private gateway: DiscordGateway;

    private botUserId: string | null = null;
    private running = false;

    // Map Discord threadId → session info (for thread-based conversations)
    private threadSessions: Map<string, ThreadSessionInfo> = new Map();
    /** Active subscription callbacks per thread — used to unsubscribe before re-subscribing. */
    private threadCallbacks: Map<string, ThreadCallbackInfo> = new Map();

    // Per-user rate limiting: userId → timestamps of recent messages
    private userMessageTimestamps: Map<string, number[]> = new Map();
    private readonly RATE_LIMIT_WINDOW_MS = 60_000;
    private readonly RATE_LIMIT_MAX_MESSAGES = 10;
    private delivery: DeliveryTracker = getDeliveryTracker();

    /** Track last activity per thread for stale detection */
    private threadLastActivity: Map<string, number> = new Map();
    /** Maps bot reply message IDs → session info for mention-reply context in channels. */
    private mentionSessions: Map<string, import('./message-handler').MentionSessionInfo> = new Map();
    /** Recently processed Discord message IDs — prevents duplicate handling across overlapping gateway connections. */
    private processedMessageIds: Set<string> = new Set();
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

    /** Global event subscriber for auto-recovering Discord thread subscriptions */
    private globalEventCallback: EventCallback | null = null;

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
        this.gateway = new DiscordGateway(config, {
            onMessage: (data) => {
                this.handleMessage(data).catch(err => {
                    log.error('Error handling Discord message', { error: err instanceof Error ? err.message : String(err) });
                });
            },
            onInteraction: (data) => {
                this.handleInteraction(data).catch(err => {
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
                recoverActiveThreadSubscriptions(
                    this.db, this.processManager, this.delivery, this.config.botToken,
                    this.threadSessions, this.threadCallbacks,
                );
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
        this.gateway.start();

        if (this.config.appId) {
            registerSlashCommands(this.db, this.config).catch(err => {
                log.error('Failed to register Discord slash commands', {
                    error: err instanceof Error ? err.message : String(err),
                });
            });
        }

        // Start periodic stale thread check (every 10 minutes)
        this.staleCheckTimer = setInterval(() => {
            archiveStaleThreadsImpl(
                this.processManager, this.delivery, this.config.botToken,
                this.threadLastActivity, this.threadSessions, this.threadCallbacks,
                this.STALE_THREAD_MS,
            ).catch(err => {
                log.warn('Stale thread check failed', { error: err instanceof Error ? err.message : String(err) });
            });
        }, 10 * 60 * 1000);

        // Start periodic config reload from DB (every 30 seconds)
        this.reloadConfigFromDb();
        this.configReloadTimer = setInterval(() => {
            this.reloadConfigFromDb();
        }, DiscordBridge.CONFIG_RELOAD_INTERVAL_MS);

        // Watch for Discord sessions that start producing events without a thread subscription.
        this.globalEventCallback = (sessionId, event) => {
            if (event.type !== 'assistant') return;
            for (const [, cb] of this.threadCallbacks) {
                if (cb.sessionId === sessionId) return;
            }
            const session = getSession(this.db, sessionId);
            if (!session || session.source !== 'discord' || !session.name?.startsWith('Discord thread:')) return;
            const threadId = session.name.replace('Discord thread:', '');
            if (!threadId || this.threadCallbacks.has(threadId)) return;

            const agent = session.agentId ? getAgent(this.db, session.agentId) : null;
            const agentName = agent?.name || 'Agent';
            const agentModel = agent?.model || 'unknown';
            // Look up project name for footer metadata
            let projectName: string | undefined;
            if (session.projectId) {
                const projectRow = this.db.query<{ name: string }, [string]>(
                    'SELECT name FROM projects WHERE id = ?',
                ).get(session.projectId);
                projectName = projectRow?.name;
            }
            const displayColor = agent?.displayColor;
            this.threadSessions.set(threadId, { sessionId, agentName, agentModel, ownerUserId: '', projectName, displayColor });
            this.subscribeForResponseWithEmbed(sessionId, threadId, agentName, agentModel, projectName, displayColor);
            log.info('Auto-subscribed Discord thread for resumed session', { threadId, sessionId });
        };
        this.processManager.subscribeAll(this.globalEventCallback);
    }

    stop(): void {
        this.running = false;
        this.gateway.stop();
        if (this.staleCheckTimer) {
            clearInterval(this.staleCheckTimer);
            this.staleCheckTimer = null;
        }
        if (this.configReloadTimer) {
            clearInterval(this.configReloadTimer);
            this.configReloadTimer = null;
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
            registerSlashCommands(this.db, this.config).catch(err => {
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

    // ── Delegation methods ──────────────────────────────────────────────

    private handleReaction(data: DiscordReactionData): void {
        const ctx: ReactionHandlerContext = {
            db: this.db,
            botUserId: this.botUserId,
            scorer: this.reputationScorer,
            mentionSessions: this.mentionSessions,
            threadSessions: this.threadSessions,
        };
        handleReactionImpl(ctx, data);
    }

    private async handleInteraction(interaction: DiscordInteractionData): Promise<void> {
        const ctx: InteractionContext = {
            db: this.db,
            config: this.config,
            processManager: this.processManager,
            workTaskService: this.workTaskService,
            delivery: this.delivery,
            mutedUsers: this.mutedUsers,
            threadSessions: this.threadSessions,
            threadCallbacks: this.threadCallbacks,
            threadLastActivity: this.threadLastActivity,
            createStandaloneThread: (channelId, name) =>
                createStandaloneThreadImpl(this.config.botToken, channelId, name),
            subscribeForResponseWithEmbed: (sid, tid, an, am, pn, dc) =>
                this.subscribeForResponseWithEmbed(sid, tid, an, am, pn, dc),
            sendTaskResult: (cid, task, uid) =>
                this.sendTaskResult(cid, task, uid),
            muteUser: (uid) => this.muteUser(uid),
            unmuteUser: (uid) => this.unmuteUser(uid),
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
            threadSessions: this.threadSessions,
            threadCallbacks: this.threadCallbacks,
            threadLastActivity: this.threadLastActivity,
            mentionSessions: this.mentionSessions,
            processedMessageIds: this.processedMessageIds,
        };
        await handleMessageImpl(ctx, data);
    }

    private subscribeForResponseWithEmbed(sessionId: string, threadId: string, agentName: string, agentModel: string, projectName?: string, displayColor?: string | null): void {
        subscribeImpl(
            this.processManager, this.delivery, this.config.botToken,
            this.db, this.threadCallbacks, sessionId, threadId, agentName, agentModel,
            projectName, displayColor,
        );
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
            threadSessions: this.threadSessions,
            threadCallbacks: this.threadCallbacks,
            threadLastActivity: this.threadLastActivity,
            mentionSessions: this.mentionSessions,
            processedMessageIds: this.processedMessageIds,
        };
        await sendTaskResultImpl(ctx, channelId, task, mentionUserId);
    }

    // ── Public API (kept for backward compatibility) ────────────────────

    muteUser(userId: string): void {
        muteUserImpl(this.mutedUsers, userId);
    }

    unmuteUser(userId: string): void {
        unmuteUserImpl(this.mutedUsers, userId);
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

import type { Database } from 'bun:sqlite';
import type { AgentMessenger } from '../algochat/agent-messenger';
import type { NotificationPayload, ChannelSendResult } from './types';
import {
    createNotification,
    createDelivery,
    updateDeliveryStatus,
    listChannelsForAgent,
    listFailedDeliveries,
} from '../db/notifications';
import { sendWebSocket } from './channels/websocket';
import { sendDiscord } from './channels/discord';
import { sendTelegram } from './channels/telegram';
import { sendGitHub } from './channels/github';
import { sendAlgoChat } from './channels/algochat';
import { sendWhatsApp } from './channels/whatsapp';
import { sendSignal } from './channels/signal';
import { createLogger } from '../lib/logger';

const log = createLogger('NotificationService');

const RETRY_INTERVAL_MS = 60_000; // 1 minute
const MAX_RETRY_ATTEMPTS = 3;

export class NotificationService {
    private db: Database;
    private agentMessenger: AgentMessenger | null = null;
    private broadcastFn: ((msg: unknown) => void) | null = null;
    private retryTimer: ReturnType<typeof setInterval> | null = null;

    constructor(db: Database) {
        this.db = db;
    }

    setAgentMessenger(messenger: AgentMessenger): void {
        this.agentMessenger = messenger;
    }

    setBroadcast(fn: (message: unknown) => void): void {
        this.broadcastFn = fn;
    }

    start(): void {
        if (this.retryTimer) return;
        this.retryTimer = setInterval(() => this.retryFailed(), RETRY_INTERVAL_MS);
        log.info('NotificationService started (retry interval: 60s)');
    }

    stop(): void {
        if (this.retryTimer) {
            clearInterval(this.retryTimer);
            this.retryTimer = null;
        }
        log.info('NotificationService stopped');
    }

    async notify(params: {
        agentId: string;
        sessionId?: string;
        title?: string;
        message: string;
        level: string;
    }): Promise<{ notificationId: string; channels: string[] }> {
        // 1. Persist notification (never lost)
        const notification = createNotification(this.db, {
            agentId: params.agentId,
            sessionId: params.sessionId,
            title: params.title,
            message: params.message,
            level: params.level,
        });

        const payload: NotificationPayload = {
            notificationId: notification.id,
            agentId: params.agentId,
            sessionId: params.sessionId ?? null,
            title: params.title ?? null,
            message: params.message,
            level: params.level,
            timestamp: notification.createdAt,
        };

        const dispatched: string[] = [];

        // 2. Always dispatch via WebSocket (no config needed)
        if (this.broadcastFn) {
            await sendWebSocket(this.broadcastFn, payload);
            dispatched.push('websocket');
        }

        // 3. Fan out to configured channels
        const channels = listChannelsForAgent(this.db, params.agentId);

        for (const channel of channels) {
            if (!channel.enabled) continue;

            const delivery = createDelivery(this.db, notification.id, channel.channelType);

            // Dispatch async — don't block on channel failures
            this.dispatchToChannel(channel.channelType, channel.config, payload, delivery.id)
                .then((result) => {
                    if (result.success) {
                        dispatched.push(channel.channelType);
                    }
                })
                .catch(() => {
                    // Errors already handled in dispatchToChannel
                });
        }

        log.info('Notification dispatched', {
            notificationId: notification.id,
            agentId: params.agentId,
            level: params.level,
            channels: dispatched,
        });

        return { notificationId: notification.id, channels: dispatched };
    }

    private async dispatchToChannel(
        channelType: string,
        config: Record<string, unknown>,
        payload: NotificationPayload,
        deliveryId: number,
    ): Promise<ChannelSendResult> {
        let result: ChannelSendResult;

        try {
            switch (channelType) {
                case 'discord': {
                    const webhookUrl = (config.webhookUrl as string) || process.env.DISCORD_WEBHOOK_URL;
                    if (!webhookUrl) {
                        result = { success: false, error: 'No Discord webhook URL configured' };
                        break;
                    }
                    result = await sendDiscord(webhookUrl, payload);
                    break;
                }
                case 'telegram': {
                    const botToken = (config.botToken as string) || process.env.TELEGRAM_BOT_TOKEN;
                    const chatId = (config.chatId as string) || process.env.TELEGRAM_CHAT_ID;
                    if (!botToken || !chatId) {
                        result = { success: false, error: 'Telegram botToken and chatId required' };
                        break;
                    }
                    result = await sendTelegram(botToken, chatId, payload);
                    break;
                }
                case 'github': {
                    const repo = (config.repo as string) || process.env.NOTIFICATION_GITHUB_REPO;
                    if (!repo) {
                        result = { success: false, error: 'No GitHub repo configured' };
                        break;
                    }
                    const labels = config.labels as string[] | undefined;
                    result = await sendGitHub(repo, payload, labels);
                    break;
                }
                case 'algochat': {
                    const toAddress = config.toAddress as string;
                    if (!toAddress) {
                        result = { success: false, error: 'No AlgoChat toAddress configured' };
                        break;
                    }
                    if (!this.agentMessenger) {
                        result = { success: false, error: 'AgentMessenger not available' };
                        break;
                    }
                    result = await sendAlgoChat(this.agentMessenger, toAddress, payload);
                    break;
                }
                case 'whatsapp': {
                    const phoneId = config.phoneNumberId as string;
                    const accessToken = (config.accessToken as string) || process.env.WHATSAPP_ACCESS_TOKEN;
                    const recipientPhone = config.recipientPhone as string;
                    if (!phoneId || !accessToken) {
                        result = { success: false, error: 'WhatsApp phoneNumberId and accessToken required' };
                        break;
                    }
                    if (!recipientPhone) {
                        result = { success: false, error: 'WhatsApp recipientPhone required' };
                        break;
                    }
                    result = await sendWhatsApp(phoneId, accessToken, recipientPhone, payload);
                    break;
                }
                case 'signal': {
                    const signalApiUrl = (config.apiUrl as string) || process.env.SIGNAL_API_URL || 'http://localhost:8080';
                    const senderNumber = (config.senderNumber as string) || process.env.SIGNAL_SENDER_NUMBER;
                    const recipientNumber = config.recipientNumber as string;
                    if (!senderNumber || !recipientNumber) {
                        result = { success: false, error: 'Signal senderNumber and recipientNumber required' };
                        break;
                    }
                    result = await sendSignal(signalApiUrl, senderNumber, recipientNumber, payload);
                    break;
                }
                default:
                    result = { success: false, error: `Unknown channel type: ${channelType}` };
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            result = { success: false, error: message };
        }

        // Update delivery status
        updateDeliveryStatus(
            this.db,
            deliveryId,
            result.success ? 'sent' : 'failed',
            result.error,
            result.externalRef,
        );

        if (!result.success) {
            log.warn('Channel dispatch failed', {
                channelType,
                deliveryId,
                error: result.error,
            });
        }

        return result;
    }

    private async retryFailed(): Promise<void> {
        const failed = listFailedDeliveries(this.db, MAX_RETRY_ATTEMPTS);
        if (failed.length === 0) return;

        log.info(`Retrying ${failed.length} failed notification deliveries`);

        for (const delivery of failed) {
            const payload: NotificationPayload = {
                notificationId: delivery.notification.id,
                agentId: delivery.notification.agentId,
                sessionId: delivery.notification.sessionId,
                title: delivery.notification.title,
                message: delivery.notification.message,
                level: delivery.notification.level,
                timestamp: delivery.notification.createdAt,
            };

            await this.dispatchToChannel(
                delivery.channelType,
                delivery.channelConfig,
                payload,
                delivery.id,
            );
        }
    }
}

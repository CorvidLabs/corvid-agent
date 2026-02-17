import type { Database } from 'bun:sqlite';
import type { AgentMessenger } from '../algochat/agent-messenger';
import type { OwnerQuestion } from '../process/owner-question-manager';
import { listChannelsForAgent, createQuestionDispatch } from '../db/notifications';
import { sendGitHubQuestion } from './channels/github-question';
import { sendTelegramQuestion } from './channels/telegram-question';
import { sendAlgoChatQuestion } from './channels/algochat-question';
import { createLogger } from '../lib/logger';

const log = createLogger('QuestionDispatcher');

export class QuestionDispatcher {
    private db: Database;
    private agentMessenger: AgentMessenger | null = null;

    constructor(db: Database) {
        this.db = db;
    }

    setAgentMessenger(messenger: AgentMessenger): void {
        this.agentMessenger = messenger;
    }

    async dispatch(question: OwnerQuestion): Promise<string[]> {
        const channels = listChannelsForAgent(this.db, question.agentId);
        const dispatched: string[] = [];

        for (const channel of channels) {
            if (!channel.enabled) continue;

            try {
                const result = await this.dispatchToChannel(
                    channel.channelType,
                    channel.config,
                    question,
                );

                if (result.success) {
                    createQuestionDispatch(
                        this.db,
                        question.id,
                        channel.channelType,
                        result.externalRef ?? null,
                    );
                    dispatched.push(channel.channelType);
                    log.info('Dispatched question to channel', {
                        questionId: question.id,
                        channel: channel.channelType,
                        externalRef: result.externalRef,
                    });
                } else {
                    log.warn('Question dispatch failed', {
                        questionId: question.id,
                        channel: channel.channelType,
                        error: result.error,
                    });
                }
            } catch (err) {
                log.warn('Question dispatch error', {
                    questionId: question.id,
                    channel: channel.channelType,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }

        if (dispatched.length > 0) {
            log.info('Question dispatched to channels', {
                questionId: question.id,
                channels: dispatched,
            });
        }

        return dispatched;
    }

    private async dispatchToChannel(
        channelType: string,
        config: Record<string, unknown>,
        question: OwnerQuestion,
    ): Promise<{ success: boolean; externalRef?: string; error?: string }> {
        switch (channelType) {
            case 'github': {
                const repo = (config.repo as string) || process.env.NOTIFICATION_GITHUB_REPO;
                if (!repo) return { success: false, error: 'No GitHub repo configured' };
                return sendGitHubQuestion(
                    repo,
                    question.id,
                    question.question,
                    question.options,
                    question.context,
                    question.agentId,
                );
            }
            case 'telegram': {
                const botToken = (config.botToken as string) || process.env.TELEGRAM_BOT_TOKEN;
                const chatId = (config.chatId as string) || process.env.TELEGRAM_CHAT_ID;
                if (!botToken || !chatId) return { success: false, error: 'Telegram botToken and chatId required' };
                return sendTelegramQuestion(
                    botToken,
                    chatId,
                    question.id,
                    question.question,
                    question.options,
                    question.context,
                    question.agentId,
                );
            }
            case 'algochat': {
                const toAddress = config.toAddress as string;
                if (!toAddress) return { success: false, error: 'No AlgoChat toAddress configured' };
                if (!this.agentMessenger) return { success: false, error: 'AgentMessenger not available' };
                return sendAlgoChatQuestion(
                    this.agentMessenger,
                    toAddress,
                    question.id,
                    question.question,
                    question.options,
                    question.agentId,
                );
            }
            case 'discord':
                // Discord is notification-only (webhooks can't receive replies)
                return { success: false, error: 'Discord does not support question responses' };
            default:
                return { success: false, error: `Unknown channel type: ${channelType}` };
        }
    }
}

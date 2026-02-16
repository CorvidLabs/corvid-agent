import type { Database } from 'bun:sqlite';
import type { OwnerQuestionManager } from '../process/owner-question-manager';
import {
    listActiveQuestionDispatches,
    updateQuestionDispatchStatus,
    getQuestionDispatchesByQuestionId,
    listChannelsForAgent,
} from '../db/notifications';
import * as github from '../github/operations';
import { createLogger } from '../lib/logger';

const log = createLogger('ResponsePoller');

const POLL_INTERVAL_MS = 15_000; // 15 seconds
const TELEGRAM_POLL_TIMEOUT = 5; // seconds for long polling

export class ResponsePollingService {
    private db: Database;
    private ownerQuestionManager: OwnerQuestionManager;
    private pollTimer: ReturnType<typeof setInterval> | null = null;
    private telegramOffset: number = 0;
    private polling = false;

    constructor(db: Database, ownerQuestionManager: OwnerQuestionManager) {
        this.db = db;
        this.ownerQuestionManager = ownerQuestionManager;
    }

    start(): void {
        if (this.pollTimer) return;
        this.pollTimer = setInterval(() => this.poll(), POLL_INTERVAL_MS);
        log.info('ResponsePollingService started (interval: 15s)');
    }

    stop(): void {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
        log.info('ResponsePollingService stopped');
    }

    private async poll(): Promise<void> {
        if (this.polling) return; // skip if previous poll still running
        this.polling = true;

        try {
            const dispatches = listActiveQuestionDispatches(this.db);
            if (dispatches.length === 0) return;

            // Group by channel type
            const byChannel = new Map<string, typeof dispatches>();
            for (const d of dispatches) {
                const list = byChannel.get(d.channelType) ?? [];
                list.push(d);
                byChannel.set(d.channelType, list);
            }

            // Poll each channel type
            const promises: Promise<void>[] = [];
            if (byChannel.has('github')) {
                promises.push(this.pollGitHub(byChannel.get('github')!));
            }
            if (byChannel.has('telegram')) {
                promises.push(this.pollTelegram(byChannel.get('telegram')!));
            }
            // AlgoChat is handled by bridge inbound routing — no polling needed

            await Promise.allSettled(promises);
        } catch (err) {
            log.warn('Poll cycle error', { error: err instanceof Error ? err.message : String(err) });
        } finally {
            this.polling = false;
        }
    }

    private async pollGitHub(dispatches: Array<{ id: number; questionId: string; externalRef: string | null; createdAt: string }>): Promise<void> {
        for (const dispatch of dispatches) {
            if (!dispatch.externalRef) continue;

            // Extract repo and issue number from URL: https://github.com/owner/repo/issues/123
            const match = dispatch.externalRef.match(/github\.com\/([^/]+\/[^/]+)\/issues\/(\d+)/);
            if (!match) continue;

            const [, repo, issueNumStr] = match;
            const issueNumber = parseInt(issueNumStr, 10);

            try {
                const result = await github.listIssueComments(repo, issueNumber, dispatch.createdAt);
                if (!result.ok || result.comments.length === 0) continue;

                // Take the first comment as the response
                const comment = result.comments[0];
                const parsed = this.parseResponse(comment.body, dispatch.questionId);

                const resolved = this.ownerQuestionManager.resolveQuestion(dispatch.questionId, {
                    questionId: dispatch.questionId,
                    answer: parsed.answer,
                    selectedOption: parsed.selectedOption,
                });

                if (resolved) {
                    log.info('Resolved question via GitHub', {
                        questionId: dispatch.questionId,
                        issueNumber,
                    });

                    // Mark all dispatches for this question as answered
                    this.markAllAnswered(dispatch.questionId);

                    // Close the issue and add acknowledgment
                    github.addIssueComment(repo, issueNumber, 'Answer received. Thank you!').catch(() => {});
                    github.closeIssue(repo, issueNumber).catch(() => {});
                }
            } catch (err) {
                log.warn('GitHub poll error', {
                    questionId: dispatch.questionId,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }
    }

    private async pollTelegram(dispatches: Array<{ id: number; questionId: string; externalRef: string | null }>): Promise<void> {
        // Find telegram config from any question's agent
        // We need a bot token — look up from the agent's channel config
        const questionIds = new Set(dispatches.map((d) => d.questionId));
        const agentIds = new Set<string>();
        for (const qId of questionIds) {
            // Look up the agent from owner_questions table
            const row = this.db.query(
                `SELECT agent_id FROM owner_questions WHERE id = ?`
            ).get(qId) as { agent_id: string } | null;
            if (row) agentIds.add(row.agent_id);
        }

        let botToken: string | null = null;
        for (const agentId of agentIds) {
            const channels = listChannelsForAgent(this.db, agentId);
            const tgChannel = channels.find((c) => c.channelType === 'telegram' && c.enabled);
            if (tgChannel) {
                botToken = (tgChannel.config.botToken as string) || process.env.TELEGRAM_BOT_TOKEN || null;
                if (botToken) break;
            }
        }

        if (!botToken) {
            botToken = process.env.TELEGRAM_BOT_TOKEN || null;
        }
        if (!botToken) return;

        try {
            const url = `https://api.telegram.org/bot${botToken}/getUpdates?offset=${this.telegramOffset}&timeout=${TELEGRAM_POLL_TIMEOUT}`;
            const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
            const data = await response.json() as {
                ok: boolean;
                result?: Array<{
                    update_id: number;
                    callback_query?: {
                        id: string;
                        data: string;
                        message?: { message_id: number; chat: { id: number } };
                    };
                    message?: {
                        message_id: number;
                        reply_to_message?: { message_id: number };
                        text: string;
                        chat: { id: number };
                    };
                }>;
            };

            if (!data.ok || !data.result?.length) return;

            // Build lookup: externalRef (message_id) → dispatch
            const byMsgId = new Map<string, typeof dispatches[0]>();
            for (const d of dispatches) {
                if (d.externalRef) byMsgId.set(d.externalRef, d);
            }

            // Build lookup: questionId short → dispatch
            const byShortId = new Map<string, typeof dispatches[0]>();
            for (const d of dispatches) {
                byShortId.set(d.questionId.slice(0, 8), d);
            }

            for (const update of data.result) {
                this.telegramOffset = update.update_id + 1;

                // Handle callback queries (inline keyboard button presses)
                if (update.callback_query?.data) {
                    const cbMatch = update.callback_query.data.match(/^q:([^:]+):(.+)$/);
                    if (cbMatch) {
                        const [, shortId, optionStr] = cbMatch;
                        const dispatch = byShortId.get(shortId);
                        if (dispatch) {
                            const parsed = optionStr === 'other'
                                ? { answer: '(freeform — reply to the message)', selectedOption: null }
                                : this.parseResponse(optionStr, dispatch.questionId);

                            if (optionStr !== 'other') {
                                const resolved = this.ownerQuestionManager.resolveQuestion(dispatch.questionId, {
                                    questionId: dispatch.questionId,
                                    answer: parsed.answer,
                                    selectedOption: parsed.selectedOption,
                                });

                                if (resolved) {
                                    log.info('Resolved question via Telegram callback', {
                                        questionId: dispatch.questionId,
                                    });
                                    this.markAllAnswered(dispatch.questionId);

                                    // Answer the callback query
                                    fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            callback_query_id: update.callback_query.id,
                                            text: 'Answer received!',
                                        }),
                                    }).catch(() => {});
                                }
                            }
                        }
                    }
                }

                // Handle reply messages (freeform text responses)
                if (update.message?.reply_to_message && update.message.text) {
                    const replyToId = String(update.message.reply_to_message.message_id);
                    const dispatch = byMsgId.get(replyToId);
                    if (dispatch) {
                        const parsed = this.parseResponse(update.message.text, dispatch.questionId);
                        const resolved = this.ownerQuestionManager.resolveQuestion(dispatch.questionId, {
                            questionId: dispatch.questionId,
                            answer: parsed.answer,
                            selectedOption: parsed.selectedOption,
                        });

                        if (resolved) {
                            log.info('Resolved question via Telegram reply', {
                                questionId: dispatch.questionId,
                            });
                            this.markAllAnswered(dispatch.questionId);

                            // Send confirmation
                            fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    chat_id: update.message.chat.id,
                                    text: 'Answer received!',
                                    reply_to_message_id: update.message.message_id,
                                }),
                            }).catch(() => {});
                        }
                    }
                }
            }
        } catch (err) {
            log.warn('Telegram poll error', {
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    /** Parse a response string, mapping numbers to option indices. */
    private parseResponse(
        text: string,
        questionId: string,
    ): { answer: string; selectedOption: number | null } {
        const trimmed = text.trim();

        // Look up the question's options from the DB
        const row = this.db.query(
            `SELECT options FROM owner_questions WHERE id = ?`
        ).get(questionId) as { options: string | null } | null;

        const options: string[] = row?.options ? JSON.parse(row.options) : [];

        // Check if the response is just a number
        const numMatch = trimmed.match(/^(\d+)$/);
        if (numMatch && options.length > 0) {
            const idx = parseInt(numMatch[1], 10) - 1; // 1-based → 0-based
            if (idx >= 0 && idx < options.length) {
                return { answer: options[idx], selectedOption: idx };
            }
        }

        // Check if response matches an option text (case-insensitive)
        if (options.length > 0) {
            const lowerTrimmed = trimmed.toLowerCase();
            const matchIdx = options.findIndex((opt) => opt.toLowerCase() === lowerTrimmed);
            if (matchIdx >= 0) {
                return { answer: options[matchIdx], selectedOption: matchIdx };
            }
        }

        // Freeform text
        return { answer: trimmed, selectedOption: null };
    }

    /** Mark all dispatches for a question as answered. */
    private markAllAnswered(questionId: string): void {
        const dispatches = getQuestionDispatchesByQuestionId(this.db, questionId);
        for (const d of dispatches) {
            if (d.status === 'sent') {
                updateQuestionDispatchStatus(this.db, d.id, 'answered');
            }
        }
    }
}

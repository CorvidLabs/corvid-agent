import type { Database } from 'bun:sqlite';
import type { AlgoChatConfig } from './config';
import type { AlgoChatService } from './service';
import type { AgentWalletService } from './agent-wallet';
import type { AgentDirectory } from './agent-directory';
import type { ProcessManager } from '../process/manager';
import type { AgentMessage } from '../../shared/types';
import type { ClaudeStreamEvent } from '../process/types';
import { extractContentText } from '../process/types';
import { getAgent } from '../db/agents';
import { createSession } from '../db/sessions';
import {
    createAgentMessage,
    updateAgentMessageStatus,
    getAgentMessage,
    getThreadMessages,
} from '../db/agent-messages';
import type { WorkTaskService } from '../work/service';
import { checkAlgoLimit, recordAlgoSpend } from '../db/spending';
import { updateSessionAlgoSpent } from '../db/sessions';
import { createLogger } from '../lib/logger';

const log = createLogger('AgentMessenger');

const DEFAULT_PAYMENT_MICRO = 1000; // 0.001 ALGO

export interface AgentInvokeRequest {
    fromAgentId: string;
    toAgentId: string;
    content: string;
    paymentMicro?: number;
    projectId?: string;
    threadId?: string;
    /** Invocation depth for preventing infinite agent-to-agent chains. */
    depth?: number;
}

export interface AgentInvokeResult {
    message: AgentMessage;
    sessionId: string | null;
}

type MessageUpdateCallback = (message: AgentMessage) => void;
export class AgentMessenger {
    readonly db: Database;
    private service: AlgoChatService | null;
    private agentWalletService: AgentWalletService;
    private agentDirectory: AgentDirectory;
    private processManager: ProcessManager;
    private workTaskService: WorkTaskService | null = null;
    private messageUpdateListeners = new Set<MessageUpdateCallback>();

    constructor(
        db: Database,
        _config: AlgoChatConfig,
        service: AlgoChatService | null,
        agentWalletService: AgentWalletService,
        agentDirectory: AgentDirectory,
        processManager: ProcessManager,
    ) {
        this.db = db;
        this.service = service;
        this.agentWalletService = agentWalletService;
        this.agentDirectory = agentDirectory;
        this.processManager = processManager;
    }

    setWorkTaskService(service: WorkTaskService): void {
        this.workTaskService = service;
    }

    /** Register a callback for agent message status changes (for WS broadcast). */
    onMessageUpdate(cb: MessageUpdateCallback): () => void {
        this.messageUpdateListeners.add(cb);
        return () => { this.messageUpdateListeners.delete(cb); };
    }

    private emitMessageUpdate(messageId: string): void {
        const updated = getAgentMessage(this.db, messageId);
        if (!updated) return;
        for (const cb of this.messageUpdateListeners) {
            try { cb(updated); } catch { /* ignore */ }
        }
    }

    /**
     * Build a conversation history block from prior messages in a thread.
     * Excludes the current message (by ID). Caps at 10 exchanges or 8000 chars.
     */
    private buildThreadHistory(threadId: string, currentMessageId: string): string | null {
        const priorMessages = getThreadMessages(this.db, threadId)
            .filter((m) => m.id !== currentMessageId);

        if (priorMessages.length === 0) return null;

        const MAX_EXCHANGES = 10;
        const MAX_CHARS = 8000;
        const lines: string[] = [];
        let totalChars = 0;

        // Each message is an exchange: content + optional response
        const recent = priorMessages.slice(-MAX_EXCHANGES);
        for (const msg of recent) {
            const fromName = getAgent(this.db, msg.fromAgentId)?.name ?? msg.fromAgentId.slice(0, 8);
            const toName = getAgent(this.db, msg.toAgentId)?.name ?? msg.toAgentId.slice(0, 8);

            const contentLine = `[${fromName}]: ${msg.content}`;
            if (totalChars + contentLine.length > MAX_CHARS) break;
            lines.push(contentLine);
            totalChars += contentLine.length;

            if (msg.response) {
                const responseLine = `[${toName}]: ${msg.response}`;
                if (totalChars + responseLine.length > MAX_CHARS) break;
                lines.push(responseLine);
                totalChars += responseLine.length;
            }
        }

        if (lines.length === 0) return null;

        return `Previous messages in this conversation:\n\n${lines.join('\n\n')}`;
    }

    async invoke(request: AgentInvokeRequest): Promise<AgentInvokeResult> {
        const { fromAgentId, toAgentId, content, projectId } = request;
        const paymentMicro = request.paymentMicro ?? DEFAULT_PAYMENT_MICRO;
        const threadId = request.threadId ?? crypto.randomUUID();

        // Guards
        if (fromAgentId === toAgentId) {
            throw new Error('An agent cannot invoke itself');
        }

        const fromAgent = getAgent(this.db, fromAgentId);
        if (!fromAgent) throw new Error(`Source agent ${fromAgentId} not found`);

        const toAgent = getAgent(this.db, toAgentId);
        if (!toAgent) throw new Error(`Target agent ${toAgentId} not found`);

        // Route [WORK] prefix through WorkTaskService
        if (content.startsWith('[WORK]') && this.workTaskService) {
            const description = content.slice('[WORK]'.length).trim();
            if (!description) {
                throw new Error('[WORK] prefix requires a task description');
            }

            const agentMessage = createAgentMessage(this.db, {
                fromAgentId,
                toAgentId,
                content,
                paymentMicro,
                threadId,
            });

            try {
                const task = await this.workTaskService.create({
                    agentId: toAgentId,
                    description,
                    projectId,
                    source: 'agent',
                    sourceId: agentMessage.id,
                    requesterInfo: { fromAgentId, fromAgentName: fromAgent.name },
                });

                updateAgentMessageStatus(this.db, agentMessage.id, 'processing', { sessionId: task.sessionId ?? undefined });
                this.emitMessageUpdate(agentMessage.id);

                this.workTaskService.onComplete(task.id, (completed) => {
                    if (completed.status === 'completed' && completed.prUrl) {
                        updateAgentMessageStatus(this.db, agentMessage.id, 'completed', {
                            response: `PR created: ${completed.prUrl}`,
                        });
                    } else {
                        updateAgentMessageStatus(this.db, agentMessage.id, 'failed', {
                            response: completed.error ?? 'Work task failed',
                        });
                    }
                    this.emitMessageUpdate(agentMessage.id);
                });

                return {
                    message: getAgentMessage(this.db, agentMessage.id) ?? agentMessage,
                    sessionId: task.sessionId,
                };
            } catch (err) {
                updateAgentMessageStatus(this.db, agentMessage.id, 'failed', {
                    response: `Work task error: ${err instanceof Error ? err.message : String(err)}`,
                });
                this.emitMessageUpdate(agentMessage.id);
                throw err;
            }
        }

        // Create the agent_messages row
        const agentMessage = createAgentMessage(this.db, {
            fromAgentId,
            toAgentId,
            content,
            paymentMicro,
            threadId,
        });

        log.info(`Agent invoke: ${fromAgent.name} → ${toAgent.name}`, {
            messageId: agentMessage.id,
            threadId,
            paymentMicro,
        });

        // Send on-chain payment from Agent A → Agent B
        let txid: string | null = null;
        try {
            txid = await this.sendOnChainMessage(fromAgentId, toAgentId, content, paymentMicro, agentMessage.id);
        } catch (err) {
            log.warn('On-chain send failed, proceeding without txid', {
                error: err instanceof Error ? err.message : String(err),
            });
        }

        updateAgentMessageStatus(this.db, agentMessage.id, 'sent', { txid: txid ?? undefined });
        this.emitMessageUpdate(agentMessage.id);

        // Create a session for Agent B to process the message
        const resolvedProjectId = projectId ?? toAgent.defaultProjectId ?? this.getDefaultProjectId();

        // Build conversation history for threads with prior messages
        const historyBlock = this.buildThreadHistory(threadId, agentMessage.id);
        const prompt = historyBlock
            ? `${historyBlock}\n\n---\n\nAgent "${fromAgent.name}" sent you a message (${(paymentMicro / 1_000_000).toFixed(6)} ALGO):\n\n${content}`
            : `Agent "${fromAgent.name}" sent you a message (${(paymentMicro / 1_000_000).toFixed(6)} ALGO):\n\n${content}`;

        const session = createSession(this.db, {
            projectId: resolvedProjectId,
            agentId: toAgentId,
            name: `Agent Msg: ${fromAgent.name} → ${toAgent.name}`,
            initialPrompt: prompt,
            source: 'agent',
        });

        updateAgentMessageStatus(this.db, agentMessage.id, 'processing', { sessionId: session.id });
        // Note: don't emit here — 'sent' already emitted the initial update.
        // Emitting 'processing' would cause duplicate SEND entries in the feed.

        // Track initial on-chain send cost against the new session
        if (txid && paymentMicro > 0) {
            updateSessionAlgoSpent(this.db, session.id, paymentMicro);
        }

        // Subscribe to session events and buffer the response
        this.subscribeForAgentResponse(agentMessage.id, session.id, fromAgentId, toAgentId);

        // Start the session process (pass depth for invoke chain limiting)
        this.processManager.startProcess(session, prompt, { depth: request.depth });

        const updatedMessage = getAgentMessage(this.db, agentMessage.id);
        return {
            message: updatedMessage ?? agentMessage,
            sessionId: session.id,
        };
    }

    private subscribeForAgentResponse(
        messageId: string,
        sessionId: string,
        fromAgentId: string,
        toAgentId: string,
    ): void {
        let responseBuffer = '';
        let lastTurnResponse = '';
        let completed = false;

        const finish = () => {
            if (completed) return;
            completed = true;
            this.processManager.unsubscribe(sessionId, callback);

            const response = (responseBuffer.trim() || lastTurnResponse.trim());
            if (!response) {
                updateAgentMessageStatus(this.db, messageId, 'failed');
                this.emitMessageUpdate(messageId);
                return;
            }

            // Send the response back on-chain from B → A
            this.sendOnChainMessage(toAgentId, fromAgentId, response, 0, messageId, sessionId)
                .then((responseTxid) => {
                    updateAgentMessageStatus(this.db, messageId, 'completed', {
                        response,
                        responseTxid: responseTxid ?? undefined,
                    });
                    this.emitMessageUpdate(messageId);
                    log.info(`Agent message completed`, { messageId, responseTxid });
                })
                .catch((err) => {
                    // Still mark completed even if on-chain response fails
                    updateAgentMessageStatus(this.db, messageId, 'completed', { response });
                    this.emitMessageUpdate(messageId);
                    log.warn('On-chain response send failed', {
                        messageId,
                        error: err instanceof Error ? err.message : String(err),
                    });
                });
        };

        const callback = (sid: string, event: ClaudeStreamEvent) => {
            if (sid !== sessionId) return;

            if (event.type === 'assistant' && event.message?.content) {
                responseBuffer += extractContentText(event.message.content);
            }

            // Each 'result' marks end of a turn — save and reset
            if (event.type === 'result') {
                lastTurnResponse = responseBuffer;
                responseBuffer = '';
            }

            // Only finalize when the session fully exits
            if (event.type === 'session_exited') {
                finish();
            }
        };

        this.processManager.subscribe(sessionId, callback);
    }

    private async sendOnChainMessage(
        fromAgentId: string,
        toAgentId: string,
        content: string,
        paymentMicro: number,
        messageId?: string,
        sessionId?: string,
    ): Promise<string | null> {
        if (!this.service) return null;

        // Check daily ALGO spending limit before sending
        if (paymentMicro > 0) {
            try {
                checkAlgoLimit(this.db, paymentMicro);
            } catch (err) {
                log.warn(`On-chain send blocked by spending limit`, {
                    fromAgentId,
                    toAgentId,
                    paymentMicro,
                    error: err instanceof Error ? err.message : String(err),
                });
                if (messageId) {
                    updateAgentMessageStatus(this.db, messageId, 'failed', {
                        response: `Spending limit: ${err instanceof Error ? err.message : String(err)}`,
                    });
                    this.emitMessageUpdate(messageId);
                }
                return null;
            }
        }

        const fromAccount = await this.agentWalletService.getAgentChatAccount(fromAgentId);
        if (!fromAccount) {
            log.debug(`No wallet for agent ${fromAgentId}, skipping on-chain send`);
            return null;
        }

        const toEntry = await this.agentDirectory.resolve(toAgentId);
        if (!toEntry?.walletAddress) {
            log.debug(`No wallet address for agent ${toAgentId}, skipping on-chain send`);
            return null;
        }

        // Discover the target's public key for encryption
        let toPubKey: Uint8Array;
        try {
            toPubKey = await this.service.algorandService.discoverPublicKey(toEntry.walletAddress);
        } catch {
            log.debug(`Could not discover public key for ${toEntry.walletAddress}`);
            return null;
        }

        // Use group transactions for large messages; fall back to condense on failure
        try {
            const { sendGroupMessage } = await import('./group-sender');
            const result = await sendGroupMessage(
                this.service,
                fromAccount.account,
                toEntry.walletAddress,
                toPubKey,
                content,
                paymentMicro,
            );

            log.info(`On-chain message sent`, {
                from: fromAccount.address,
                to: toEntry.walletAddress,
                txid: result.primaryTxid,
                txids: result.txids.length,
                paymentMicro,
            });

            if (paymentMicro > 0) recordAlgoSpend(this.db, paymentMicro);
            const fee = result.fee ?? paymentMicro;
            if (fee > 0 && sessionId) updateSessionAlgoSpent(this.db, sessionId, fee);
            return result.primaryTxid;
        } catch (groupErr) {
            log.warn('Group send failed, falling back to condense+send', {
                error: groupErr instanceof Error ? groupErr.message : String(groupErr),
            });

            const { condenseMessage } = await import('./condenser');
            const { content: sendContent } = await condenseMessage(content, 800, messageId);

            const sendOptions = paymentMicro > 0 ? { amount: paymentMicro } : undefined;
            const result = await this.service.algorandService.sendMessage(
                fromAccount.account,
                toEntry.walletAddress,
                toPubKey,
                sendContent,
                sendOptions,
            );

            log.info(`On-chain message sent (condensed fallback)`, {
                from: fromAccount.address,
                to: toEntry.walletAddress,
                txid: result.txid,
                paymentMicro,
            });

            if (paymentMicro > 0) recordAlgoSpend(this.db, paymentMicro);
            const fallbackFee = (result as unknown as { fee?: number }).fee ?? paymentMicro;
            if (fallbackFee > 0 && sessionId) updateSessionAlgoSpent(this.db, sessionId, fallbackFee);
            return result.txid;
        }
    }

    /**
     * Invoke an agent and wait for the full response text.
     * Calls invoke() then subscribes to the session's events, buffering assistant
     * content until the session completes. Returns the response text and thread ID.
     */
    async invokeAndWait(
        request: AgentInvokeRequest,
        timeoutMs: number = 5 * 60 * 1000,
    ): Promise<{ response: string; threadId: string }> {
        const result = await this.invoke(request);
        const sessionId = result.sessionId;
        if (!sessionId) {
            throw new Error('No session created for agent invoke');
        }

        // Retrieve the threadId from the created message
        const threadId = result.message.threadId ?? request.threadId ?? crypto.randomUUID();

        return new Promise<{ response: string; threadId: string }>((resolve, reject) => {
            let responseBuffer = '';
            let lastTurnResponse = '';
            let settled = false;

            const settle = (response: string | null, error?: string) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                this.processManager.unsubscribe(sessionId, callback);
                if (response) {
                    resolve({ response, threadId });
                } else {
                    reject(new Error(error ?? 'Agent returned empty response'));
                }
            };

            const timer = setTimeout(() => {
                const response = (responseBuffer.trim() || lastTurnResponse.trim());
                settle(response || null, `Agent invoke timed out after ${timeoutMs}ms`);
            }, timeoutMs);

            const callback = (sid: string, event: ClaudeStreamEvent) => {
                if (sid !== sessionId || settled) return;

                if (event.type === 'assistant' && event.message?.content) {
                    responseBuffer += extractContentText(event.message.content);
                }

                // Each 'result' marks end of a turn — save and reset
                if (event.type === 'result') {
                    lastTurnResponse = responseBuffer;
                    responseBuffer = '';
                }

                // Only resolve when the session fully exits
                if (event.type === 'session_exited') {
                    const response = (responseBuffer.trim() || lastTurnResponse.trim());
                    settle(response || null);
                }
            };

            this.processManager.subscribe(sessionId, callback);

            // Check if the process already finished before we subscribed
            if (!this.processManager.isRunning(sessionId)) {
                // Give a brief grace period for final events
                setTimeout(() => {
                    const response = (responseBuffer.trim() || lastTurnResponse.trim());
                    settle(response || null, 'Agent session already exited with no response');
                }, 500);
            }
        });
    }

    /**
     * Send an on-chain message from an agent to itself (for memory/audit storage).
     * Bypasses the self-invoke guard since this is not a conversation.
     */
    async sendOnChainToSelf(agentId: string, content: string): Promise<string | null> {
        if (!this.service) return null;

        const account = await this.agentWalletService.getAgentChatAccount(agentId);
        if (!account) {
            log.debug(`No wallet for agent ${agentId}, skipping on-chain self-send`);
            return null;
        }

        // For self-sends we already have the encryption keys — no need to discover
        // via the indexer (which may lag behind or be unavailable).
        const pubKey = account.account.encryptionKeys.publicKey;

        // Use group transactions for large messages; fall back to condense
        try {
            const { sendGroupMessage } = await import('./group-sender');
            const result = await sendGroupMessage(
                this.service,
                account.account,
                account.address,
                pubKey,
                content,
            );
            log.info('On-chain self-send (memory)', { agentId, txid: result.primaryTxid, txids: result.txids.length });
            return result.primaryTxid;
        } catch {
            const { condenseMessage } = await import('./condenser');
            const { content: sendContent } = await condenseMessage(content, 800);
            const result = await this.service.algorandService.sendMessage(
                account.account,
                account.address,
                pubKey,
                sendContent,
            );
            log.info('On-chain self-send (memory, condensed fallback)', { agentId, txid: result.txid });
            return result.txid;
        }
    }

    /** Best-effort on-chain message send. Returns txid or null. Never throws. */
    async sendOnChainBestEffort(
        fromAgentId: string,
        toAgentId: string,
        content: string,
        messageId?: string,
    ): Promise<string | null> {
        try {
            return await this.sendOnChainMessage(fromAgentId, toAgentId, content, 0, messageId);
        } catch {
            return null;
        }
    }

    private getDefaultProjectId(): string {
        const { listProjects, createProject } = require('../db/projects');
        const projects = listProjects(this.db);
        if (projects.length > 0) return projects[0].id;

        const project = createProject(this.db, {
            name: 'Agent Messages',
            workingDir: process.cwd(),
        });
        return project.id;
    }
}

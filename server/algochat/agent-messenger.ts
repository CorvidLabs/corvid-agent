import type { Database } from 'bun:sqlite';
import type { AlgoChatConfig } from './config';
import type { ProcessManager } from '../process/manager';
import type { AgentMessage } from '../../shared/types';
import type { ClaudeStreamEvent } from '../process/types';
import type { OnChainTransactor } from './on-chain-transactor';
import { extractContentText } from '../process/types';
import { getAgent } from '../db/agents';
import { createSession } from '../db/sessions';
import {
    createAgentMessage,
    updateAgentMessageStatus,
    getAgentMessage,
    getThreadMessages,
} from '../db/agent-messages';
import type { WorkCommandRouter } from './work-command-router';
import { updateSessionAlgoSpent } from '../db/sessions';
import { createLogger } from '../lib/logger';
import { createEventContext, runWithEventContext } from '../observability/event-context';
import { agentMessagesTotal } from '../observability/metrics';
import { recordAudit } from '../db/audit';

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
    /**
     * When true, return immediately after message dispatch without waiting
     * for a response. The message is still tracked for delivery confirmation
     * but no session is created for the receiving agent to respond.
     */
    fireAndForget?: boolean;
}

export interface AgentInvokeResult {
    message: AgentMessage;
    sessionId: string | null;
}

type MessageUpdateCallback = (message: AgentMessage) => void;
export class AgentMessenger {
    readonly db: Database;
    private transactor: OnChainTransactor | null;
    private processManager: ProcessManager;
    private workCommandRouter: WorkCommandRouter | null = null;
    private messageUpdateListeners = new Set<MessageUpdateCallback>();

    constructor(
        db: Database,
        _config: AlgoChatConfig,
        transactor: OnChainTransactor | null,
        processManager: ProcessManager,
    ) {
        this.db = db;
        this.transactor = transactor;
        this.processManager = processManager;
    }

    setWorkCommandRouter(router: WorkCommandRouter): void {
        this.workCommandRouter = router;
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
        const fireAndForget = request.fireAndForget ?? false;

        // Generate or inherit trace context for this invocation chain
        const eventCtx = createEventContext('agent');
        const traceId = eventCtx.traceId;

        // Guards
        if (fromAgentId === toAgentId) {
            throw new Error('An agent cannot invoke itself');
        }

        const fromAgent = getAgent(this.db, fromAgentId);
        if (!fromAgent) throw new Error(`Source agent ${fromAgentId} not found`);

        const toAgent = getAgent(this.db, toAgentId);
        if (!toAgent) throw new Error(`Target agent ${toAgentId} not found`);

        // Route [WORK] prefix through WorkCommandRouter
        if (content.startsWith('[WORK]') && this.workCommandRouter?.hasService) {
            return this.workCommandRouter.handleAgentWorkRequest({
                fromAgentId,
                fromAgentName: fromAgent.name,
                toAgentId,
                content,
                paymentMicro,
                threadId,
                projectId,
                emitMessageUpdate: (messageId) => this.emitMessageUpdate(messageId),
            });
        }

        // Create the agent_messages row
        const agentMessage = createAgentMessage(this.db, {
            fromAgentId,
            toAgentId,
            content,
            paymentMicro,
            threadId,
            fireAndForget,
        });

        log.info(`Agent invoke: ${fromAgent.name} → ${toAgent.name}`, {
            messageId: agentMessage.id,
            threadId,
            traceId,
            paymentMicro,
            fireAndForget,
        });

        // Record audit and metrics for agent message send
        agentMessagesTotal.inc({ direction: 'outbound', status: 'sent' });
        recordAudit(
            this.db,
            'agent_message_send',
            fromAgent.name,
            'agent_message',
            agentMessage.id,
            `${fromAgent.name} → ${toAgent.name}${fireAndForget ? ' [F&F]' : ''}: ${content.slice(0, 200)}`,
            traceId,
        );

        // Send on-chain payment from Agent A → Agent B via OnChainTransactor
        let txid: string | null = null;
        try {
            if (this.transactor) {
                const result = await this.transactor.sendMessage({
                    fromAgentId,
                    toAgentId,
                    content,
                    paymentMicro,
                    messageId: agentMessage.id,
                });
                if (result.blockedByLimit && result.limitError) {
                    updateAgentMessageStatus(this.db, agentMessage.id, 'failed', {
                        response: `Spending limit: ${result.limitError}`,
                        errorCode: 'SPENDING_LIMIT',
                    });
                    this.emitMessageUpdate(agentMessage.id);
                    // Return early for fire-and-forget; throw for sync
                    const failedMessage = getAgentMessage(this.db, agentMessage.id);
                    return { message: failedMessage ?? agentMessage, sessionId: null };
                }
                txid = result.txid;
            }
        } catch (err) {
            log.warn('On-chain send failed, proceeding without txid', {
                error: err instanceof Error ? err.message : String(err),
            });
        }

        updateAgentMessageStatus(this.db, agentMessage.id, 'sent', { txid: txid ?? undefined });
        this.emitMessageUpdate(agentMessage.id);

        // Fire-and-forget: mark as completed after delivery, don't create a session
        if (fireAndForget) {
            updateAgentMessageStatus(this.db, agentMessage.id, 'completed');
            this.emitMessageUpdate(agentMessage.id);

            log.info(`Fire-and-forget message delivered`, {
                messageId: agentMessage.id,
                txid,
            });

            const updatedMessage = getAgentMessage(this.db, agentMessage.id);
            return {
                message: updatedMessage ?? agentMessage,
                sessionId: null,
            };
        }

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

        // Start the session process within trace context (pass depth for invoke chain limiting)
        runWithEventContext(eventCtx, () => {
            this.processManager.startProcess(session, prompt, { depth: request.depth });
        });

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
                updateAgentMessageStatus(this.db, messageId, 'failed', {
                    errorCode: 'EMPTY_RESPONSE',
                });
                this.emitMessageUpdate(messageId);
                return;
            }

            // Send the response back on-chain from B → A via OnChainTransactor
            const sendResponse = this.transactor
                ? this.transactor.sendMessage({
                    fromAgentId: toAgentId,
                    toAgentId: fromAgentId,
                    content: response,
                    paymentMicro: 0,
                    messageId,
                    sessionId,
                }).then((r) => r.txid)
                : Promise.resolve(null);

            sendResponse
                .then((responseTxid) => {
                    updateAgentMessageStatus(this.db, messageId, 'completed', {
                        response,
                        responseTxid: responseTxid ?? undefined,
                    });
                    this.emitMessageUpdate(messageId);
                    log.info(`Agent message completed`, { messageId, responseTxid });
                })
                .catch((err) => {
                    // Mark failed — response was generated but on-chain send didn't succeed
                    updateAgentMessageStatus(this.db, messageId, 'failed', {
                        response,
                        errorCode: 'RESPONSE_SEND_FAILED',
                    });
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
     * Delegates to OnChainTransactor.
     */
    async sendOnChainToSelf(agentId: string, content: string): Promise<string | null> {
        if (!this.transactor) return null;
        return this.transactor.sendToSelf(agentId, content);
    }

    /**
     * Send a notification to an arbitrary Algorand address from an agent.
     * Best-effort — returns txid or null, never throws.
     */
    async sendNotificationToAddress(
        fromAgentId: string,
        toAddress: string,
        content: string,
    ): Promise<string | null> {
        if (!this.transactor) return null;
        return this.transactor.sendNotificationToAddress(fromAgentId, toAddress, content);
    }

    /** Best-effort on-chain message send. Returns txid or null. Never throws. */
    async sendOnChainBestEffort(
        fromAgentId: string,
        toAgentId: string,
        content: string,
        messageId?: string,
    ): Promise<string | null> {
        if (!this.transactor) return null;
        return this.transactor.sendBestEffort(fromAgentId, toAgentId, content, messageId);
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

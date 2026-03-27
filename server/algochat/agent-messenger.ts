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
import { MessagingGuard, type MessagingGuardConfig } from './messaging-guard';
import { ValidationError, NotFoundError, ExternalServiceError } from '../lib/errors';

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
    readonly guard: MessagingGuard;

    constructor(
        db: Database,
        _config: AlgoChatConfig,
        transactor: OnChainTransactor | null,
        processManager: ProcessManager,
        guardConfig?: Partial<MessagingGuardConfig>,
    ) {
        this.db = db;
        this.transactor = transactor;
        this.processManager = processManager;
        this.guard = new MessagingGuard(guardConfig);
        this.guard.setDb(db);
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
            try {
                cb(updated);
            } catch (e) {
                log.warn('messageUpdate listener threw', { error: e });
            }
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
            throw new ValidationError('An agent cannot invoke itself', { fromAgentId, toAgentId });
        }

        const fromAgent = getAgent(this.db, fromAgentId);
        if (!fromAgent) throw new NotFoundError('Source agent', fromAgentId);

        const toAgent = getAgent(this.db, toAgentId);
        if (!toAgent) throw new NotFoundError('Target agent', toAgentId);

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

        // Circuit breaker + per-agent rate limit + blocklist + drift check
        const guardResult = this.guard.check(fromAgentId, toAgentId, content.length);
        if (!guardResult.allowed) {
            const errorCode = (guardResult.reason ?? 'RATE_LIMITED') as 'CIRCUIT_OPEN' | 'RATE_LIMITED' | 'AGENT_BLOCKED' | 'BEHAVIORAL_DRIFT';
            const errorMessages: Record<string, string> = {
                CIRCUIT_OPEN: `Circuit breaker open for agent ${toAgent.name} — calls temporarily blocked`,
                RATE_LIMITED: `Rate limit exceeded: ${fromAgent.name} is sending too many messages (retry after ${Math.ceil((guardResult.retryAfterMs ?? 0) / 1000)}s)`,
                AGENT_BLOCKED: `Agent ${fromAgent.name} is blacklisted and cannot send messages`,
                BEHAVIORAL_DRIFT: `Behavioral anomaly detected for ${fromAgent.name} — messaging pattern flagged for review`,
            };
            const errorMsg = errorMessages[errorCode] ?? 'Message rejected by guard';

            // Create the message row in failed state so it's visible in history
            const failedMessage = createAgentMessage(this.db, {
                fromAgentId,
                toAgentId,
                content,
                paymentMicro,
                threadId,
                fireAndForget,
            });
            updateAgentMessageStatus(this.db, failedMessage.id, 'failed', {
                response: errorMsg,
                errorCode,
            });
            this.emitMessageUpdate(failedMessage.id);
            agentMessagesTotal.inc({ direction: 'outbound', status: 'rejected' });

            log.warn(`Messaging guard rejected: ${guardResult.reason}`, {
                fromAgentId,
                toAgentId,
                errorCode,
                retryAfterMs: guardResult.retryAfterMs,
            });

            const updated = getAgentMessage(this.db, failedMessage.id);
            return { message: updated ?? failedMessage, sessionId: null };
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
                    this.guard.recordFailure(toAgentId);
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
            this.guard.recordSuccess(toAgentId);

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
                this.guard.recordFailure(toAgentId);
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
                    this.guard.recordSuccess(toAgentId);
                    log.info(`Agent message completed`, { messageId, responseTxid });
                })
                .catch((err) => {
                    // Mark failed — response was generated but on-chain send didn't succeed
                    updateAgentMessageStatus(this.db, messageId, 'failed', {
                        response,
                        errorCode: 'RESPONSE_SEND_FAILED',
                    });
                    this.emitMessageUpdate(messageId);
                    this.guard.recordFailure(toAgentId);
                    log.warn('On-chain response send failed', {
                        messageId,
                        error: err instanceof Error ? err.message : String(err),
                    });
                });
        };

        const callback = (sid: string, event: ClaudeStreamEvent) => {
            if (sid !== sessionId) return;

            // SDK-style assistant events (Claude SDK provider)
            if (event.type === 'assistant' && event.message?.content) {
                responseBuffer += extractContentText(event.message.content);
            }

            // Cursor-style streamed text (content_block_delta from cursor-agent CLI)
            if (event.type === 'content_block_delta') {
                const delta = (event as unknown as Record<string, unknown>).delta as Record<string, unknown> | undefined;
                if (delta && typeof delta.text === 'string') {
                    responseBuffer += delta.text;
                }
            }

            // Cursor-style assistant_message / text events (not in ClaudeStreamEvent union)
            {
                const rawType = (event as unknown as Record<string, unknown>).type as string;
                if (rawType === 'assistant_message' || rawType === 'text') {
                    const raw = event as unknown as Record<string, unknown>;
                    const text = raw.content ?? raw.text;
                    if (typeof text === 'string') {
                        responseBuffer += text;
                    }
                }
            }

            // Each 'result' or 'message_stop' marks end of a turn — save and reset
            if (event.type === 'result' || event.type === 'message_stop') {
                lastTurnResponse = responseBuffer;
                responseBuffer = '';
            }

            // Finalize when the session exits or is stopped
            if (event.type === 'session_exited' || event.type === 'session_stopped') {
                finish();
            }
        };

        this.processManager.subscribe(sessionId, callback);

        // Safety timeout: clean up the subscription if the session never exits.
        // This prevents indefinite orphaned subscriptions (e.g., target agent hangs).
        const SUBSCRIBE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
        setTimeout(() => {
            if (!completed) {
                log.warn('Agent response subscription timed out', { messageId, sessionId });
                // Stop the process if still running
                if (this.processManager.isRunning(sessionId)) {
                    this.processManager.stopProcess(sessionId);
                } else {
                    // Process already gone but we never got the exit event — clean up manually
                    finish();
                }
            }
        }, SUBSCRIBE_TIMEOUT_MS);
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
            throw new ExternalServiceError('AgentMessenger', 'No session created for agent invoke');
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
                // Stop the orphaned session so it doesn't run indefinitely
                if (this.processManager.isRunning(sessionId)) {
                    log.warn('Stopping orphaned agent session on timeout', { sessionId, timeoutMs });
                    this.processManager.stopProcess(sessionId);
                }
                settle(response || null, `Agent invoke timed out after ${timeoutMs}ms`);
            }, timeoutMs);

            const callback = (sid: string, event: ClaudeStreamEvent) => {
                if (sid !== sessionId || settled) return;

                // SDK-style assistant events (Claude SDK provider)
                if (event.type === 'assistant' && event.message?.content) {
                    responseBuffer += extractContentText(event.message.content);
                }

                // Cursor-style streamed text (content_block_delta from cursor-agent CLI)
                if (event.type === 'content_block_delta') {
                    const delta = (event as unknown as Record<string, unknown>).delta as Record<string, unknown> | undefined;
                    if (delta && typeof delta.text === 'string') {
                        responseBuffer += delta.text;
                    }
                }

                // Cursor-style assistant_message / text events (not in ClaudeStreamEvent union)
                {
                    const rawType = (event as unknown as Record<string, unknown>).type as string;
                    if (rawType === 'assistant_message' || rawType === 'text') {
                        const raw = event as unknown as Record<string, unknown>;
                        const text = raw.content ?? raw.text;
                        if (typeof text === 'string') {
                            responseBuffer += text;
                        }
                    }
                }

                // Each 'result' or 'message_stop' marks end of a turn — save and reset
                if (event.type === 'result' || event.type === 'message_stop') {
                    lastTurnResponse = responseBuffer;
                    responseBuffer = '';
                }

                // Resolve when the session exits or is stopped
                if (event.type === 'session_exited' || event.type === 'session_stopped') {
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
     * Read on-chain memories for an agent. Delegates to OnChainTransactor.
     */
    async readOnChainMemories(
        agentId: string,
        serverMnemonic: string | null | undefined,
        network: string | undefined,
        options?: { limit?: number; afterRound?: number; search?: string },
    ): Promise<import('./on-chain-transactor').OnChainMemory[]> {
        if (!this.transactor) return [];
        return this.transactor.readOnChainMemories(agentId, serverMnemonic, network, options);
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

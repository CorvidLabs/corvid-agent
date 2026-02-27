/**
 * MessageRouter — Incoming message routing, group reassembly, and session management.
 *
 * Extracted from AlgoChatBridge. Handles:
 * - SyncManager message handler (dedup, group chunk separation)
 * - Group message reassembly buffering
 * - Approval/question response routing
 * - Agent-to-agent message filtering
 * - Owner authorization
 * - Session creation/resumption
 * - Session notification forwarding (approval requests, errors)
 * - Local chat message handling
 *
 * @module
 */
import type { Database } from 'bun:sqlite';
import type { ProcessManager } from '../process/manager';
import type { AlgoChatConfig } from './config';
import type { AlgoChatService } from './service';
import type { ResponseFormatter } from './response-formatter';
import type { CommandHandler } from './command-handler';
import type { SubscriptionManager, LocalChatSendFn, LocalChatEventFn } from './subscription-manager';
import type { DiscoveryService } from './discovery-service';
import type { PSKContactManager } from './psk-contact-manager';
import type { AgentWalletService } from './agent-wallet';
import type { AgentDirectory } from './agent-directory';
import type { ApprovalManager } from '../process/approval-manager';
import type { ApprovalRequestWire } from '../process/approval-types';
import type { OwnerQuestionManager } from '../process/owner-question-manager';
import type { ClaudeStreamEvent } from '../process/types';
import type { SessionMessage } from '../channels/types';
import {
    getConversationByParticipant,
    createConversation,
    updateConversationRound,
    listConversations,
    createSession,
} from '../db/sessions';
import { getAgent } from '../db/agents';
import { formatApprovalForChain, parseApprovalResponse } from './approval-format';
import { parseGroupPrefix, reassembleGroupMessage } from './group-sender';
import { createLogger } from '../lib/logger';
import { DedupService } from '../lib/dedup';
import { createEventContext, runWithEventContext } from '../observability/event-context';
import { scanForInjection } from '../lib/prompt-injection';
import { recordAudit } from '../db/audit';

const log = createLogger('MessageRouter');

/** Maximum reassembled group message size (16 KB). Prevents memory exhaustion. */
const MAX_GROUP_MESSAGE_BYTES = 16 * 1024;

// On-chain txid dedup namespace (10 min TTL, bounded at 500 entries)
const ALGOCHAT_TXID_DEDUP_NS = 'algochat:txids';
DedupService.global().register(ALGOCHAT_TXID_DEDUP_NS, { maxSize: 500, ttlMs: 600_000 });

export class MessageRouter {
    readonly channelType = 'algochat' as const;

    private db: Database;
    private processManager: ProcessManager;
    private config: AlgoChatConfig;
    private service: AlgoChatService;
    private responseFormatter: ResponseFormatter;
    private commandHandler: CommandHandler;
    private subscriptionManager: SubscriptionManager;
    private discoveryService: DiscoveryService;
    private contactManager: PSKContactManager;

    // Optional dependencies (late-injected)
    private agentWalletService: AgentWalletService | null = null;
    private agentDirectory: AgentDirectory | null = null;
    private approvalManager: ApprovalManager | null = null;
    private ownerQuestionManager: OwnerQuestionManager | null = null;
    private sessionNotificationCallback: ((sid: string, event: ClaudeStreamEvent) => void) | null = null;

    // Local chat state
    private localAgentSessions: Map<string, string> = new Map();

    // ChannelAdapter inbound message handlers
    private messageHandlers: Set<(msg: SessionMessage) => void> = new Set();

    // On-chain message dedup (centralized DedupService)
    private dedup = DedupService.global();

    // Group message reassembly buffer
    private pendingGroupChunks: Map<string, { chunks: unknown[]; firstSeen: number }> = new Map();

    constructor(
        db: Database,
        processManager: ProcessManager,
        config: AlgoChatConfig,
        service: AlgoChatService,
        responseFormatter: ResponseFormatter,
        commandHandler: CommandHandler,
        subscriptionManager: SubscriptionManager,
        discoveryService: DiscoveryService,
        contactManager: PSKContactManager,
    ) {
        this.db = db;
        this.processManager = processManager;
        this.config = config;
        this.service = service;
        this.responseFormatter = responseFormatter;
        this.commandHandler = commandHandler;
        this.subscriptionManager = subscriptionManager;
        this.discoveryService = discoveryService;
        this.contactManager = contactManager;
    }

    // ── Dependency injection ──────────────────────────────────────────

    setAgentWalletService(service: AgentWalletService): void {
        this.agentWalletService = service;
    }

    setAgentDirectory(directory: AgentDirectory): void {
        this.agentDirectory = directory;
    }

    setApprovalManager(manager: ApprovalManager): void {
        this.approvalManager = manager;
    }

    setOwnerQuestionManager(manager: OwnerQuestionManager): void {
        this.ownerQuestionManager = manager;
    }

    // ── Setup (called once from bridge constructor) ───────────────────

    /** Wire the SyncManager's onMessagesReceived to the dedup/group/routing pipeline. */
    setupMessageHandler(): void {
        this.service.syncManager.on('onMessagesReceived', (participant, messages) => {
            // Separate group chunks from regular messages, dedup by txid
            const groupChunks: Map<number, typeof messages> = new Map();
            const regularMessages: typeof messages = [];

            // Collect known agent wallet addresses to filter outbound messages
            const agentWalletAddresses = this.discoveryService.getAgentWalletAddresses();

            for (const msg of messages) {
                if (msg.direction === 'sent') continue;

                // Skip messages sent by our agent wallets
                const sender = (msg as unknown as { sender?: string }).sender;
                if (sender && agentWalletAddresses.has(sender)) continue;

                // Dedup by transaction ID
                const txid = (msg as unknown as { id?: string }).id;
                if (txid) {
                    if (this.dedup.isDuplicate(ALGOCHAT_TXID_DEDUP_NS, txid)) {
                        log.debug('Skipping already-processed txid', { txid });
                        continue;
                    }
                }

                const grp = parseGroupPrefix(msg.content);
                if (grp) {
                    const round = Number(msg.confirmedRound);
                    if (!groupChunks.has(round)) groupChunks.set(round, []);
                    groupChunks.get(round)!.push(msg);
                } else {
                    regularMessages.push(msg);
                }
            }

            // Reassemble group messages
            for (const [round, chunks] of groupChunks) {
                const contents = chunks.map((c) => c.content);
                const reassembled = reassembleGroupMessage(contents);
                if (reassembled) {
                    // Enforce 16KB max for reassembled group messages
                    const reassembledBytes = new TextEncoder().encode(reassembled).byteLength;
                    if (reassembledBytes > MAX_GROUP_MESSAGE_BYTES) {
                        log.warn('Rejected oversized group message', {
                            round,
                            bytes: reassembledBytes,
                            limit: MAX_GROUP_MESSAGE_BYTES,
                            chunks: chunks.length,
                            participant: participant.slice(0, 8) + '...',
                        });
                        recordAudit(
                            this.db,
                            'injection_blocked',
                            participant,
                            'group_message',
                            String(round),
                            JSON.stringify({ reason: 'oversized', bytes: reassembledBytes, limit: MAX_GROUP_MESSAGE_BYTES }),
                        );
                        continue;
                    }

                    const totalAmount = chunks.reduce((sum, c) => {
                        const a = (c as unknown as Record<string, unknown>).amount;
                        return sum + (a != null ? Number(a) : 0);
                    }, 0);
                    log.info(`Reassembled group message (${chunks.length} chunks)`, { round });
                    this.handleIncomingMessage(participant, reassembled, round, totalAmount || undefined).catch((err) => {
                        log.error('Error handling group message', { error: err instanceof Error ? err.message : String(err) });
                    });
                } else {
                    log.warn(`Incomplete group message (${chunks.length} chunks), buffering`, { round });
                    for (const msg of chunks) {
                        this.bufferGroupChunk(participant, msg);
                    }
                }
            }

            // Process regular messages
            for (const msg of regularMessages) {
                const amount = (msg as unknown as Record<string, unknown>).amount;
                this.handleIncomingMessage(participant, msg.content, Number(msg.confirmedRound), amount != null ? Number(amount) : undefined).catch((err) => {
                    log.error('Error handling message', { error: err instanceof Error ? err.message : String(err) });
                });
            }
        });
    }

    /** Subscribe to session events for AlgoChat-sourced sessions. */
    setupSessionNotifications(): void {
        const callback = (sessionId: string, event: ClaudeStreamEvent) => {
            // Forward approval requests for AlgoChat sessions on-chain
            if (event.type === 'approval_request') {
                const conversations = listConversations(this.db);
                const conversation = conversations.find((c) => c.sessionId === sessionId);
                if (conversation) {
                    // Register the expected responder so resolveByShortId can verify sender
                    this.approvalManager?.setSenderAddress(event.id!, conversation.participantAddr);

                    this.sendApprovalRequest(conversation.participantAddr, {
                        id: event.id!,
                        sessionId: event.sessionId!,
                        toolName: event.toolName!,
                        description: event.description!,
                        createdAt: event.createdAt!,
                        timeoutMs: event.timeoutMs!,
                    }).catch((err) => {
                        log.error('Failed to send approval request on-chain', {
                            error: err instanceof Error ? err.message : String(err),
                        });
                    });
                }
                return;
            }

            // Find the conversation for this session
            if (event.type !== 'session_exited' && event.type !== 'error') return;

            const conversations = listConversations(this.db);
            const conversation = conversations.find((c) => c.sessionId === sessionId);
            if (!conversation) return;

            if (event.type === 'session_exited') {
                log.info(`AlgoChat session completed`, { sessionId, participant: conversation.participantAddr });
            }

            if (event.type === 'error' && event.error?.message) {
                log.warn(`AlgoChat session error, notifying participant`, {
                    sessionId,
                    participant: conversation.participantAddr,
                    error: event.error.message,
                });
                this.responseFormatter.sendResponse(conversation.participantAddr, `[Error: ${event.error.message}]`);
            }
        };
        this.sessionNotificationCallback = callback;
        this.processManager.subscribeAll(callback);
    }

    /** Unsubscribe session notification handler. */
    cleanupSessionNotifications(): void {
        if (this.sessionNotificationCallback) {
            this.processManager.unsubscribeAll(this.sessionNotificationCallback);
            this.sessionNotificationCallback = null;
        }
    }

    // ── ChannelAdapter message handler ────────────────────────────────

    /** Register a handler for inbound messages (ChannelAdapter). */
    onMessage(handler: (msg: SessionMessage) => void): void {
        this.messageHandlers.add(handler);
    }

    // ── Approval request sending ──────────────────────────────────────

    async sendApprovalRequest(participant: string, request: ApprovalRequestWire): Promise<void> {
        const formatted = formatApprovalForChain({
            ...request,
            toolInput: {},
            source: 'algochat',
        });
        await this.responseFormatter.sendResponse(participant, formatted);
        this.discoveryService.startFastPolling();
    }

    // ── Local chat ────────────────────────────────────────────────────

    async handleLocalMessage(
        agentId: string,
        content: string,
        sendFn: LocalChatSendFn,
        projectId?: string,
        eventFn?: LocalChatEventFn,
    ): Promise<void> {
        log.debug('handleLocalMessage', { agentId, content: content.slice(0, 50) });
        const agent = getAgent(this.db, agentId);
        if (!agent) {
            log.error(`Agent ${agentId} not found`);
            return;
        }

        // Route slash commands through CommandHandler before creating sessions.
        if (content.trim().startsWith('/')) {
            const handled = this.commandHandler.handleCommand('local', content, (text) => {
                sendFn('local', text, 'outbound');
                eventFn?.({ type: 'message', content: text, direction: 'outbound' });
            });
            if (handled) {
                log.debug('Local message handled as command', { content: content.slice(0, 50) });
                return;
            }
        }

        log.debug(`Agent found: ${agent.name}, echoing inbound message`);
        sendFn('local', content, 'inbound');
        eventFn?.({ type: 'message', content, direction: 'inbound' });

        // Auto micro-fund agent wallet on localnet (fire-and-forget)
        if (this.config.network === 'localnet' && agent.walletAddress && this.agentWalletService) {
            this.agentWalletService.fundAgent(agentId, 10_000).catch((err) => {
                log.warn('Failed to micro-fund agent wallet (local message)', {
                    agentId,
                    error: err instanceof Error ? err.message : String(err),
                });
            });
        }

        // Update the sendFn so responses go to the current WS connection
        const existingSessionId = this.localAgentSessions.get(agentId);
        if (existingSessionId) {
            this.subscriptionManager.updateLocalSendFn(existingSessionId, sendFn);
            if (eventFn) {
                this.subscriptionManager.updateLocalEventFn(existingSessionId, eventFn);
            }
        }

        if (existingSessionId) {
            // If the process is still running, send the message to it
            const sent = this.processManager.sendMessage(existingSessionId, content);
            if (sent) {
                log.debug(`Sent message to running session ${existingSessionId}`);
                eventFn?.({ type: 'session_info', sessionId: existingSessionId });
                this.subscriptionManager.subscribeForLocalResponse(existingSessionId, sendFn);
                return;
            }

            // Process not running — clear stale entry and create a fresh session below
            log.debug(`Stale session ${existingSessionId}, creating new one`);
            this.localAgentSessions.delete(agentId);
            this.subscriptionManager.cleanupLocalSession(existingSessionId);
        }

        // Create a new session
        const resolvedProjectId = projectId ?? agent.defaultProjectId ?? this.discoveryService.getDefaultProjectId();
        log.debug(`Creating new session`, { projectId: resolvedProjectId, agentId });
        const session = createSession(this.db, {
            projectId: resolvedProjectId,
            agentId,
            name: `Chat: ${agent.name}`,
            initialPrompt: content,
            source: 'web',
        });

        log.debug(`Session created: ${session.id}, starting process`);
        this.localAgentSessions.set(agentId, session.id);
        this.subscriptionManager.updateLocalSendFn(session.id, sendFn);
        if (eventFn) {
            this.subscriptionManager.updateLocalEventFn(session.id, eventFn);
        }
        eventFn?.({ type: 'session_info', sessionId: session.id });
        this.subscriptionManager.subscribeForLocalResponse(session.id, sendFn);
        this.processManager.startProcess(session, content);
    }

    // ── Core incoming message handler ─────────────────────────────────

    /**
     * Core incoming message handler — routes messages through the pipeline:
     * 1. Safety guards (raw group chunks, approval responses, agent-to-agent)
     * 2. Owner authorization
     * 3. Command dispatch (via CommandHandler)
     * 4. Session creation/resumption (via SubscriptionManager)
     */
    async handleIncomingMessage(
        participant: string,
        content: string,
        confirmedRound: number,
        amount?: number,
    ): Promise<void> {
        // Extract traceId from on-chain message metadata if present
        let incomingTraceId: string | undefined;
        let messageBody = content;
        const traceMatch = content.match(/^\[trace:([a-f0-9]{32})\]\n/);
        if (traceMatch) {
            incomingTraceId = traceMatch[1];
            messageBody = content.slice(traceMatch[0].length);
        }

        const ctx = createEventContext('algochat', incomingTraceId);
        return runWithEventContext(ctx, async () => {
        const content = messageBody; // shadow outer content with trace-stripped body
        log.info(`Message from ${participant}`, { content: content.slice(0, 100), amount });

        // Parse device name envelope (multi-device PSK chat)
        let deviceName: string | undefined;
        let messageContent = content;
        if (content.startsWith('{')) {
            try {
                const parsed = JSON.parse(content);
                if (parsed && typeof parsed === 'object' && typeof parsed.m === 'string') {
                    messageContent = parsed.m;
                    deviceName = typeof parsed.d === 'string' ? parsed.d : undefined;
                }
            } catch { /* plain text */ }
        }

        // ── Prompt injection scan ─────────────────────────────────────
        const injectionResult = scanForInjection(messageContent);
        if (injectionResult.blocked) {
            log.warn('Blocked message: prompt injection detected', {
                participant: participant.slice(0, 8) + '...',
                confidence: injectionResult.confidence,
                patterns: injectionResult.matches.map((m) => m.pattern),
                scanTimeMs: injectionResult.scanTimeMs,
                contentPreview: messageContent.slice(0, 100),
            });
            recordAudit(
                this.db,
                'injection_blocked',
                participant,
                'algochat_message',
                null,
                JSON.stringify({
                    channel: 'algochat',
                    confidence: injectionResult.confidence,
                    patterns: injectionResult.matches.map((m) => m.pattern),
                    contentPreview: messageContent.slice(0, 200),
                }),
            );
            this.responseFormatter.sendResponse(participant, '[Message blocked: content policy violation]');
            return;
        }

        // Safety guard: reject raw group chunks that weren't reassembled
        if (/^\[GRP:\d+\/\d+\]/.test(messageContent)) {
            log.debug('Skipping raw group chunk in handleIncomingMessage', { content: messageContent.slice(0, 40) });
            return;
        }

        // Check for approval responses before anything else
        if (this.approvalManager) {
            const approvalResponse = parseApprovalResponse(messageContent);
            if (approvalResponse) {
                const resolved = this.approvalManager.resolveByShortId(
                    approvalResponse.shortId,
                    { behavior: approvalResponse.behavior },
                    participant,
                );
                if (resolved) {
                    log.info(`Resolved approval via AlgoChat`, {
                        shortId: approvalResponse.shortId,
                        behavior: approvalResponse.behavior,
                    });
                    this.discoveryService.stopFastPolling();
                    return;
                }
            }
        }

        // Check for question responses (after approval check, before agent routing)
        if (this.ownerQuestionManager) {
            const questionResponse = parseQuestionResponseFromChat(messageContent);
            if (questionResponse) {
                // Parse option number if answer is a digit
                let selectedOption: number | null = null;
                let answer = questionResponse.answer;
                const question = this.ownerQuestionManager.findByShortId(questionResponse.shortId);
                if (question?.options) {
                    const numMatch = answer.match(/^(\d+)$/);
                    if (numMatch) {
                        const idx = parseInt(numMatch[1], 10) - 1;
                        if (idx >= 0 && idx < question.options.length) {
                            selectedOption = idx;
                            answer = question.options[idx];
                        }
                    }
                }

                const resolved = this.ownerQuestionManager.resolveByShortId(
                    questionResponse.shortId,
                    { answer, selectedOption },
                );
                if (resolved) {
                    log.info('Resolved owner question via AlgoChat', { shortId: questionResponse.shortId });
                    this.responseFormatter.sendResponse(participant, '[Question answered]');
                    return;
                }
            }
        }

        // Skip messages from known agents — handled by AgentMessenger
        if (this.agentDirectory) {
            const senderAgentId = this.agentDirectory.findAgentByAddress(participant);
            if (senderAgentId) {
                log.info('Agent-to-agent message — handled by AgentMessenger', { senderAgentId });
                return;
            }
        }

        // PSK contacts are implicitly authorized — the shared key is their credential
        const isPskContact = this.contactManager.isPskContact(participant);
        const isOwner = isPskContact || this.commandHandler.isOwner(participant);

        // Non-owners are blocked unless guest access is enabled in the future.
        if (!isOwner) {
            log.info('Ignoring message from non-owner address', { address: participant.slice(0, 8) + '...' });
            return;
        }

        // Emit feed event only for external (non-agent) messages
        this.responseFormatter.emitEvent(participant, messageContent, 'inbound', amount);

        // Notify ChannelAdapter message handlers
        if (this.messageHandlers.size > 0) {
            const sessionMessage: SessionMessage = {
                id: crypto.randomUUID(),
                channelType: this.channelType,
                participant,
                content: messageContent,
                direction: 'inbound',
                timestamp: new Date(),
                metadata: amount != null ? { amount } : undefined,
            };
            for (const handler of this.messageHandlers) {
                try {
                    handler(sessionMessage);
                } catch (err) {
                    log.error('Message handler threw', { error: err instanceof Error ? err.message : String(err) });
                }
            }
        }

        // Check for commands first (owners always have access)
        if (this.commandHandler.handleCommand(participant, messageContent)) return;

        // Auto micro-fund agent wallet on localnet for incoming messages
        if (this.config.network === 'localnet' && this.agentWalletService) {
            const conversation = getConversationByParticipant(this.db, participant);
            if (conversation?.agentId) {
                const agentForFund = getAgent(this.db, conversation.agentId);
                if (agentForFund?.walletAddress) {
                    this.agentWalletService.fundAgent(conversation.agentId, 10_000).catch((err) => {
                        log.warn('Failed to micro-fund agent wallet (incoming message)', {
                            agentId: conversation.agentId,
                            participant,
                            error: err instanceof Error ? err.message : String(err),
                        });
                    });
                }
            }
        }

        // Prepend device name for agent context
        const agentContent = deviceName ? `[From: ${deviceName}] ${messageContent}` : messageContent;

        let conversation = getConversationByParticipant(this.db, participant);

        if (!conversation) {
            const agentId = this.discoveryService.findAgentForNewConversation();
            if (!agentId) {
                log.info('No AlgoChat-enabled agent found, ignoring message');
                return;
            }

            const agent = getAgent(this.db, agentId);
            if (!agent) return;

            const session = createSession(this.db, {
                projectId: agent.defaultProjectId ?? this.discoveryService.getDefaultProjectId(),
                agentId,
                name: `AlgoChat: ${participant.slice(0, 8)}...`,
                initialPrompt: agentContent,
                source: 'algochat',
            });

            conversation = createConversation(this.db, participant, agentId, session.id);

            this.subscriptionManager.subscribeForResponse(session.id, participant);

            // Handle session start failure
            try {
                this.processManager.startProcess(session, agentContent);
            } catch (err) {
                log.error('Failed to start process for new conversation', {
                    sessionId: session.id,
                    error: err instanceof Error ? err.message : String(err),
                });
                this.responseFormatter.sendResponse(participant, `[Error: Failed to start agent session]`);
            }
        } else {
            if (conversation.sessionId) {
                // Always subscribe so the reply gets sent back on-chain
                this.subscriptionManager.subscribeForResponse(conversation.sessionId, participant);

                const sent = this.processManager.sendMessage(conversation.sessionId, agentContent);
                if (!sent) {
                    const { getSession } = await import('../db/sessions');
                    const session = getSession(this.db, conversation.sessionId);
                    if (session) {
                        this.processManager.resumeProcess(session, agentContent);
                    }
                }
            } else {
                // Conversation exists but has no active session — create a new one
                const agentId = conversation.agentId ?? this.discoveryService.findAgentForNewConversation();
                if (!agentId) {
                    log.info('No agent available for existing conversation, ignoring message');
                } else {
                    const agent = getAgent(this.db, agentId);
                    if (agent) {
                        const { updateConversationSession } = await import('../db/sessions');
                        const session = createSession(this.db, {
                            projectId: agent.defaultProjectId ?? this.discoveryService.getDefaultProjectId(),
                            agentId,
                            name: `AlgoChat: ${participant.slice(0, 8)}...`,
                            initialPrompt: agentContent,
                            source: 'algochat',
                        });
                        updateConversationSession(this.db, conversation.id, session.id);
                        conversation.sessionId = session.id;

                        this.subscriptionManager.subscribeForResponse(session.id, participant);
                        try {
                            this.processManager.startProcess(session, agentContent);
                        } catch (err) {
                            log.error('Failed to start process for existing conversation', {
                                sessionId: session.id,
                                error: err instanceof Error ? err.message : String(err),
                            });
                            this.responseFormatter.sendResponse(participant, `[Error: Failed to start agent session]`);
                        }
                    }
                }
            }
        }

        updateConversationRound(this.db, conversation.id, confirmedRound);
        }); // runWithEventContext
    }

    // ── Private helpers ───────────────────────────────────────────────

    private bufferGroupChunk(participant: string, msg: unknown): void {
        const message = msg as { content: string; confirmedRound: number | bigint; fee?: number };
        const round = Number(message.confirmedRound);
        const key = `${participant}:${round}`;

        if (!this.pendingGroupChunks.has(key)) {
            this.pendingGroupChunks.set(key, { chunks: [], firstSeen: Date.now() });
        }
        this.pendingGroupChunks.get(key)!.chunks.push(msg);

        // Try to reassemble
        const pending = this.pendingGroupChunks.get(key)!;
        const contents = pending.chunks.map((c) => (c as { content: string }).content);
        const reassembled = reassembleGroupMessage(contents);

        if (reassembled) {
            this.pendingGroupChunks.delete(key);
            const totalAmount = pending.chunks.reduce((sum: number, c) => {
                const a = (c as unknown as Record<string, number | undefined>).amount;
                return sum + (a != null ? Number(a) : 0);
            }, 0);
            log.info(`Reassembled buffered group message (${contents.length} chunks)`, { round });
            this.handleIncomingMessage(participant, reassembled, round, totalAmount || undefined).catch((err) => {
                log.error('Error handling buffered group message', { error: err instanceof Error ? err.message : String(err) });
            });
        }

        // Clean up stale buffers (older than 5 minutes)
        const now = Date.now();
        for (const [k, v] of this.pendingGroupChunks) {
            if (now - v.firstSeen > 5 * 60 * 1000) {
                this.pendingGroupChunks.delete(k);
            }
        }
    }
}

/**
 * Parse an AlgoChat message for a question response.
 * Matches: `[ANS:{shortId}] {answer}` or `[ANS:{shortId}] {optionNumber}`
 */
function parseQuestionResponseFromChat(content: string): { shortId: string; answer: string } | null {
    const match = content.match(/^\[ANS:([a-f0-9-]{8})\]\s*(.+)$/i);
    if (!match) return null;
    return { shortId: match[1].toLowerCase(), answer: match[2].trim() };
}

/**
 * AlgoChatBridge — Thin orchestration layer composing four focused services:
 *
 * - **ResponseFormatter** — Message sending, on-chain delivery, event emission
 * - **CommandHandler** — Slash command parsing, authorization, dispatch
 * - **SubscriptionManager** — Session event subscriptions and response lifecycle
 * - **DiscoveryService** — Agent/sender discovery, conversation seeding, polling
 *
 * This module wires the services together and handles incoming message routing.
 * All business logic lives in the extracted modules; this file is purely
 * orchestration and lifecycle management.
 *
 * @module
 */
import type { Database } from 'bun:sqlite';
import type { ProcessManager } from '../process/manager';
import type { AlgoChatConfig } from './config';
import type { AlgoChatService } from './service';
import type { AlgoChatStatus } from '../../shared/types';
import {
    getConversationByParticipant,
    createConversation,
    updateConversationRound,
    listConversations,
} from '../db/sessions';
import { getAgent } from '../db/agents';
import { createSession } from '../db/sessions';
import type { ClaudeStreamEvent } from '../process/types';
import { PSKManager } from './psk';
import type { AgentWalletService } from './agent-wallet';
import type { AgentDirectory } from './agent-directory';
import type { AgentMessenger } from './agent-messenger';
import type { ApprovalManager } from '../process/approval-manager';
import type { ApprovalRequestWire } from '../process/approval-types';
import type { WorkTaskService } from '../work/service';
import { formatApprovalForChain, parseApprovalResponse } from './approval-format';
// Credit functions — will be used when guest access is enabled
// import { getBalance, purchaseCredits, maybeGrantFirstTimeCredits, canStartSession, getCreditConfig } from '../db/credits';
import { parseGroupPrefix, reassembleGroupMessage } from './group-sender';
import { createLogger } from '../lib/logger';

// Composed services
import { ResponseFormatter } from './response-formatter';
import { CommandHandler } from './command-handler';
import { SubscriptionManager } from './subscription-manager';
import { DiscoveryService } from './discovery-service';

// Re-export types from extracted modules so callers don't need to change imports
export type { AlgoChatEventCallback } from './response-formatter';
export type { LocalChatSendFn, LocalChatEvent, LocalChatEventFn } from './subscription-manager';

const log = createLogger('AlgoChatBridge');

/**
 * Central orchestrator for the AlgoChat system.
 *
 * Bridges on-chain Algorand messaging with the agent session system.
 * Composes four focused services and handles message routing between them.
 *
 * Public API surface is preserved for backward compatibility — callers
 * (server/index.ts, ws/handler.ts, routes/index.ts) require no changes.
 */
export class AlgoChatBridge {
    private db: Database;
    private processManager: ProcessManager;
    private config: AlgoChatConfig;
    private service: AlgoChatService;

    // Composed services
    private responseFormatter: ResponseFormatter;
    private commandHandler: CommandHandler;
    private subscriptionManager: SubscriptionManager;
    private discoveryService: DiscoveryService;

    // Optional dependencies
    private agentWalletService: AgentWalletService | null = null;
    private agentDirectory: AgentDirectory | null = null;
    private approvalManager: ApprovalManager | null = null;
    private pskManager: PSKManager | null = null;
    private sessionNotificationCallback: ((sid: string, event: ClaudeStreamEvent) => void) | null = null;

    // Local chat state (kept here as it bridges WS handler → subscription manager)
    private localAgentSessions: Map<string, string> = new Map();

    // On-chain message dedup
    private processedTxids: Set<string> = new Set();

    // Group message reassembly buffer
    private pendingGroupChunks: Map<string, { chunks: unknown[]; firstSeen: number }> = new Map();

    constructor(
        db: Database,
        processManager: ProcessManager,
        config: AlgoChatConfig,
        service: AlgoChatService,
    ) {
        this.db = db;
        this.processManager = processManager;
        this.config = config;
        this.service = service;

        // Initialize composed services.
        // Note: isOwnerFn uses a lambda that closes over `this` so it's safe
        // to pass before commandHandler is assigned — the lambda is only
        // called later at runtime, never during construction.
        this.responseFormatter = new ResponseFormatter(db, config, service);
        this.discoveryService = new DiscoveryService(db, config, service, (p) => this.commandHandler.isOwner(p));
        this.subscriptionManager = new SubscriptionManager(processManager, this.responseFormatter);
        this.commandHandler = new CommandHandler(db, config, processManager, this.responseFormatter, {
            findAgentForNewConversation: () => this.discoveryService.findAgentForNewConversation(),
            getDefaultProjectId: () => this.discoveryService.getDefaultProjectId(),
            extendSession: (sessionId: string, minutes: number): boolean => {
                const extended = this.processManager.extendTimeout(sessionId, minutes * 60_000);
                if (extended) {
                    this.subscriptionManager.resetSubscriptionTimer(sessionId);
                }
                return extended;
            },
        });

        // Wire owner check into ProcessManager so credit deduction is skipped for owners
        this.processManager.setOwnerCheck((address) => this.commandHandler.isOwner(address));

        this.setupMessageHandler();
        this.setupPSKManager();
        this.setupSessionNotifications();
    }

    // ── Dependency injection (preserves existing API) ────────────────────

    /** Inject the agent wallet service for per-agent on-chain sends. */
    setAgentWalletService(service: AgentWalletService): void {
        this.agentWalletService = service;
        this.responseFormatter.setAgentWalletService(service);
    }

    /** Get the agent wallet service (used by WS handler for agent_reward). */
    getAgentWalletService(): AgentWalletService | null {
        return this.agentWalletService;
    }

    /** Inject the agent directory for agent-to-agent message filtering. */
    setAgentDirectory(directory: AgentDirectory): void {
        this.agentDirectory = directory;
    }

    /** Inject the approval manager for handling tool approval requests. */
    setApprovalManager(manager: ApprovalManager): void {
        this.approvalManager = manager;
        this.discoveryService.setApprovalManager(manager);
    }

    /** Inject the work task service for /work command support. */
    setWorkTaskService(service: WorkTaskService): void {
        this.commandHandler.setWorkTaskService(service);
    }

    /** Inject the agent messenger for council and inter-agent messaging. */
    setAgentMessenger(messenger: AgentMessenger): void {
        this.commandHandler.setAgentMessenger(messenger);
    }

    // ── Public API ───────────────────────────────────────────────────────

    /**
     * Send an approval request to a participant on-chain.
     * Also starts fast-polling so we pick up the reply quickly.
     */
    async sendApprovalRequest(participant: string, request: ApprovalRequestWire): Promise<void> {
        const formatted = formatApprovalForChain({
            ...request,
            toolInput: {},
            source: 'algochat',
        });
        await this.responseFormatter.sendResponse(participant, formatted);
        this.discoveryService.startFastPolling();
    }

    /** Start all AlgoChat services. */
    start(): void {
        this.discoveryService.seedConversations();
        this.service.syncManager.start();
        this.pskManager?.start(this.config.syncInterval);
        this.discoveryService.startDiscoveryPolling();
        log.info('Started listening for messages');
    }

    /** Stop all AlgoChat services and clean up resources. */
    stop(): void {
        this.service.syncManager.stop();
        this.pskManager?.stop();
        this.discoveryService.cleanup();
        // Unsubscribe session notification handler
        if (this.sessionNotificationCallback) {
            this.processManager.unsubscribeAll(this.sessionNotificationCallback);
            this.sessionNotificationCallback = null;
        }
        // Clean up subscription timers
        this.subscriptionManager.cleanup();
        log.info('Stopped');
    }

    /** Register a callback for AlgoChat feed events. */
    onEvent(callback: import('./response-formatter').AlgoChatEventCallback): void {
        this.responseFormatter.onEvent(callback);
    }

    /** Unregister a feed event callback. */
    offEvent(callback: import('./response-formatter').AlgoChatEventCallback): void {
        this.responseFormatter.offEvent(callback);
    }

    /** Get the current AlgoChat status. */
    getStatus(): AlgoChatStatus {
        const conversations = listConversations(this.db);
        return {
            enabled: true,
            address: this.service.chatAccount.address,
            network: this.config.network,
            syncInterval: this.config.syncInterval,
            activeConversations: conversations.length,
        };
    }

    /**
     * Handle a message from the browser dashboard chat UI.
     * Routes through the same agent→session→process flow, but sends the
     * response back via the provided callback instead of on-chain.
     */
    /** Expose the command handler for direct access (e.g., from WS handler). */
    getCommandHandler(): CommandHandler {
        return this.commandHandler;
    }

    async handleLocalMessage(
        agentId: string,
        content: string,
        sendFn: import('./subscription-manager').LocalChatSendFn,
        projectId?: string,
        eventFn?: import('./subscription-manager').LocalChatEventFn,
    ): Promise<void> {
        log.debug('handleLocalMessage', { agentId, content: content.slice(0, 50) });
        const agent = getAgent(this.db, agentId);
        if (!agent) {
            log.error(`Agent ${agentId} not found`);
            return;
        }

        // Route slash commands through CommandHandler before creating sessions.
        // The response callback sends command output directly to the WS client.
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

    // ── Message handling (private orchestration) ─────────────────────────

    private setupMessageHandler(): void {
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
                    if (this.processedTxids.has(txid)) {
                        log.debug('Skipping already-processed txid', { txid });
                        continue;
                    }
                    this.processedTxids.add(txid);
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

            // Prune old txids to prevent unbounded growth (keep last 500)
            if (this.processedTxids.size > 500) {
                const all = [...this.processedTxids];
                this.processedTxids = new Set(all.slice(all.length - 500));
            }

            // Reassemble group messages
            for (const [round, chunks] of groupChunks) {
                const contents = chunks.map((c) => c.content);
                const reassembled = reassembleGroupMessage(contents);
                if (reassembled) {
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

    private setupPSKManager(): void {
        if (!this.config.pskContact) return;

        this.pskManager = new PSKManager(this.db, this.service, this.config.pskContact, this.config.network);
        this.responseFormatter.setPskManager(this.pskManager);

        this.pskManager.onMessage((msg) => {
            this.handleIncomingMessage(msg.sender, msg.content, msg.confirmedRound, msg.amount).catch((err) => {
                log.error('Error handling PSK message', { error: err instanceof Error ? err.message : String(err) });
            });
        });

        log.info(`PSK manager initialized for ${this.config.pskContact.label ?? this.config.pskContact.address.slice(0, 8)}...`);
    }

    /**
     * Subscribe to session events for AlgoChat-sourced sessions and send
     * notifications back to the originating participant.
     */
    private setupSessionNotifications(): void {
        const callback = (sessionId: string, event: ClaudeStreamEvent) => {
            // Forward approval requests for AlgoChat sessions on-chain
            if (event.type === 'approval_request') {
                const conversations = listConversations(this.db);
                const conversation = conversations.find((c) => c.sessionId === sessionId);
                if (conversation) {
                    const approvalEvent = event as unknown as { id: string; sessionId: string; toolName: string; description: string; createdAt: number; timeoutMs: number };
                    // Register the expected responder so resolveByShortId can verify sender
                    this.approvalManager?.setSenderAddress(approvalEvent.id, conversation.participantAddr);

                    this.sendApprovalRequest(conversation.participantAddr, {
                        id: approvalEvent.id,
                        sessionId: approvalEvent.sessionId,
                        toolName: approvalEvent.toolName,
                        description: approvalEvent.description,
                        createdAt: approvalEvent.createdAt,
                        timeoutMs: approvalEvent.timeoutMs,
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
                if (!this.subscriptionManager.hasChainSubscription(sessionId)) {
                    this.responseFormatter.sendResponse(
                        conversation.participantAddr,
                        '[Session completed]'
                    );
                }
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

    /**
     * Core incoming message handler — routes messages through the pipeline:
     * 1. Safety guards (raw group chunks, approval responses, agent-to-agent)
     * 2. Owner authorization
     * 3. Credit system (payments, first-time grants)
     * 4. Command dispatch (via CommandHandler)
     * 5. Session creation/resumption (via SubscriptionManager)
     */
    private async handleIncomingMessage(
        participant: string,
        content: string,
        confirmedRound: number,
        amount?: number,
    ): Promise<void> {
        log.info(`Message from ${participant}`, { content: content.slice(0, 100), amount });

        // Safety guard: reject raw group chunks that weren't reassembled
        if (/^\[GRP:\d+\/\d+\]/.test(content)) {
            log.debug('Skipping raw group chunk in handleIncomingMessage', { content: content.slice(0, 40) });
            return;
        }

        // Check for approval responses before anything else
        if (this.approvalManager) {
            const approvalResponse = parseApprovalResponse(content);
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

        // Skip messages from known agents — handled by AgentMessenger
        if (this.agentDirectory) {
            const senderAgentId = this.agentDirectory.findAgentByAddress(participant);
            if (senderAgentId) {
                log.info('Agent-to-agent message — handled by AgentMessenger', { senderAgentId });
                return;
            }
        }

        const isOwner = this.commandHandler.isOwner(participant);

        // Non-owners are blocked unless guest access is enabled in the future.
        // For now, only owners can interact.
        if (!isOwner) {
            log.info('Ignoring message from non-owner address', { address: participant.slice(0, 8) + '...' });
            return;
        }

        // Emit feed event only for external (non-agent) messages
        this.responseFormatter.emitEvent(participant, content, 'inbound', amount);

        // Check for commands first (owners always have access)
        if (this.commandHandler.handleCommand(participant, content)) return;

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
                initialPrompt: content,
                source: 'algochat',
            });

            conversation = createConversation(this.db, participant, agentId, session.id);

            this.subscriptionManager.subscribeForResponse(session.id, participant);

            // Handle session start failure
            try {
                this.processManager.startProcess(session, content);
            } catch (err) {
                log.error('Failed to start process for new conversation', {
                    sessionId: session.id,
                    error: err instanceof Error ? err.message : String(err),
                });
                this.responseFormatter.sendResponse(participant, `[Error: Failed to start agent session]`);
            }
        } else {
            if (conversation.sessionId) {
                const sent = this.processManager.sendMessage(conversation.sessionId, content);
                if (!sent) {
                    const { getSession } = await import('../db/sessions');
                    const session = getSession(this.db, conversation.sessionId);
                    if (session) {
                        this.subscriptionManager.subscribeForResponse(session.id, participant);
                        this.processManager.resumeProcess(session, content);
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
                            initialPrompt: content,
                            source: 'algochat',
                        });
                        updateConversationSession(this.db, conversation.id, session.id);
                        conversation.sessionId = session.id;

                        this.subscriptionManager.subscribeForResponse(session.id, participant);
                        try {
                            this.processManager.startProcess(session, content);
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
    }
}

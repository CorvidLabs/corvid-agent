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
import { getAgent, getAlgochatEnabledAgents, listAgents } from '../db/agents';
import { createSession } from '../db/sessions';
import type { ClaudeStreamEvent } from '../process/types';
import { extractContentText } from '../process/types';
import { PSKManager } from './psk';
import type { AgentWalletService } from './agent-wallet';
import type { AgentDirectory } from './agent-directory';
import type { ApprovalManager } from '../process/approval-manager';
import type { ApprovalRequestWire } from '../process/approval-types';
import type { WorkTaskService } from '../work/service';
import { formatApprovalForChain, parseApprovalResponse } from './approval-format';
import { checkAlgoLimit, recordAlgoSpend } from '../db/spending';
import { updateSessionAlgoSpent } from '../db/sessions';
import { parseGroupPrefix, reassembleGroupMessage } from './group-sender';
import { saveAlgoChatMessage } from '../db/algochat-messages';
import { createLogger } from '../lib/logger';

const log = createLogger('AlgoChatBridge');

const SUBSCRIPTION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes (activity resets timer)
const PUBLIC_KEY_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export type AlgoChatEventCallback = (
    participant: string,
    content: string,
    direction: 'inbound' | 'outbound' | 'status',
    fee?: number,
) => void;

export type LocalChatSendFn = (
    participant: string,
    content: string,
    direction: 'inbound' | 'outbound',
) => void;

export type LocalChatEvent =
    | { type: 'message'; content: string; direction: 'inbound' | 'outbound' }
    | { type: 'stream'; chunk: string; done: boolean }
    | { type: 'tool_use'; toolName: string; input: string }
    | { type: 'thinking'; active: boolean }
    | { type: 'session_info'; sessionId: string };

export type LocalChatEventFn = (event: LocalChatEvent) => void;

interface CachedPublicKey {
    key: Uint8Array;
    cachedAt: number;
}

export class AlgoChatBridge {
    private db: Database;
    private processManager: ProcessManager;
    private config: AlgoChatConfig;
    private service: AlgoChatService;
    private agentWalletService: AgentWalletService | null = null;
    private agentDirectory: AgentDirectory | null = null;
    private eventCallbacks: Set<AlgoChatEventCallback> = new Set();
    private publicKeyCache: Map<string, CachedPublicKey> = new Map();
    private localAgentSessions: Map<string, string> = new Map();
    private localSubscriptions: Map<string, (sid: string, event: ClaudeStreamEvent) => void> = new Map();
    private localSendFns: Map<string, LocalChatSendFn> = new Map();
    private localEventFns: Map<string, LocalChatEventFn> = new Map();
    private chainSubscriptions: Set<string> = new Set();
    private processedTxids: Set<string> = new Set();
    private subscriptionTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
    private pskManager: PSKManager | null = null;
    private approvalManager: ApprovalManager | null = null;
    private workTaskService: WorkTaskService | null = null;
    private fastPollTimer: ReturnType<typeof setInterval> | null = null;
    private discoveryTimer: ReturnType<typeof setInterval> | null = null;
    private sessionNotificationCallback: ((sid: string, event: ClaudeStreamEvent) => void) | null = null;

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

        this.setupMessageHandler();
        this.setupPSKManager();
        this.setupSessionNotifications();
    }

    setAgentWalletService(service: AgentWalletService): void {
        this.agentWalletService = service;
    }

    getAgentWalletService(): AgentWalletService | null {
        return this.agentWalletService;
    }

    setAgentDirectory(directory: AgentDirectory): void {
        this.agentDirectory = directory;
    }

    setApprovalManager(manager: ApprovalManager): void {
        this.approvalManager = manager;
    }

    setWorkTaskService(service: WorkTaskService): void {
        this.workTaskService = service;
    }

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
        await this.sendResponse(participant, formatted);
        this.startFastPolling();
    }

    start(): void {
        this.seedConversations();
        this.service.syncManager.start();
        this.pskManager?.start(this.config.syncInterval);
        this.startDiscoveryPolling();
        log.info('Started listening for messages');
    }

    stop(): void {
        this.service.syncManager.stop();
        this.pskManager?.stop();
        this.stopFastPolling();
        this.stopDiscoveryPolling();
        // Unsubscribe session notification handler
        if (this.sessionNotificationCallback) {
            this.processManager.unsubscribeAll(this.sessionNotificationCallback);
            this.sessionNotificationCallback = null;
        }
        // Clear all subscription timers and chain subscriptions
        for (const timer of this.subscriptionTimers.values()) {
            clearTimeout(timer);
        }
        this.subscriptionTimers.clear();
        this.chainSubscriptions.clear();
        log.info('Stopped');
    }

    onEvent(callback: AlgoChatEventCallback): void {
        this.eventCallbacks.add(callback);
    }

    offEvent(callback: AlgoChatEventCallback): void {
        this.eventCallbacks.delete(callback);
    }

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
     * Routes through the same agent->session->process flow, but sends the
     * response back via the provided callback instead of on-chain.
     */
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

        log.debug(`Agent found: ${agent.name}, echoing inbound message`);
        sendFn('local', content, 'inbound');
        eventFn?.({ type: 'message', content, direction: 'inbound' });

        // Auto micro-fund agent wallet on localnet (fire-and-forget)
        if (this.config.network === 'localnet' && agent.walletAddress && this.agentWalletService) {
            this.agentWalletService.fundAgent(agentId, 10_000).catch(() => {});
        }

        // Update the sendFn so responses go to the current WS connection
        const existingSessionId = this.localAgentSessions.get(agentId);
        if (existingSessionId) {
            this.localSendFns.set(existingSessionId, sendFn);
            if (eventFn) {
                this.localEventFns.set(existingSessionId, eventFn);
            }
        }

        if (existingSessionId) {
            // If the process is still running, send the message to it
            const sent = this.processManager.sendMessage(existingSessionId, content);
            if (sent) {
                log.debug(`Sent message to running session ${existingSessionId}`);
                eventFn?.({ type: 'session_info', sessionId: existingSessionId });
                this.subscribeForLocalResponse(existingSessionId, sendFn);
                return;
            }

            // Process not running — clear stale entry and create a fresh session below
            log.debug(`Stale session ${existingSessionId}, creating new one`);
            this.localAgentSessions.delete(agentId);
            this.localSubscriptions.delete(existingSessionId);
            this.localSendFns.delete(existingSessionId);
            this.localEventFns.delete(existingSessionId);
        }

        // Create a new session
        const resolvedProjectId = projectId ?? agent.defaultProjectId ?? this.getDefaultProjectId();
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
        this.localSendFns.set(session.id, sendFn);
        if (eventFn) {
            this.localEventFns.set(session.id, eventFn);
        }
        eventFn?.({ type: 'session_info', sessionId: session.id });
        this.subscribeForLocalResponse(session.id, sendFn);
        this.processManager.startProcess(session, content);
    }

    /**
     * Handle commands from AlgoChat messages.
     * Returns true if the message was handled as a command.
     */
    private handleCommand(participant: string, content: string): boolean {
        const trimmed = content.trim();
        if (!trimmed.startsWith('/')) return false;

        const parts = trimmed.split(/\s+/);
        const command = parts[0].toLowerCase();

        switch (command) {
            case '/status': {
                const activeCount = this.processManager.getActiveSessionIds().length;
                const conversations = listConversations(this.db);
                this.sendResponse(participant, `Active sessions: ${activeCount}, conversations: ${conversations.length}`);
                return true;
            }

            case '/stop': {
                const sessionId = parts[1];
                if (!sessionId) {
                    this.sendResponse(participant, 'Usage: /stop <session-id>');
                    return true;
                }
                if (this.processManager.isRunning(sessionId)) {
                    this.processManager.stopProcess(sessionId);
                    this.sendResponse(participant, `Stopped session ${sessionId}`);
                } else {
                    this.sendResponse(participant, `Session ${sessionId} is not running`);
                }
                return true;
            }

            case '/agent': {
                const agentName = parts.slice(1).join(' ');
                if (!agentName) {
                    const agents = getAlgochatEnabledAgents(this.db);
                    const names = agents.map((a) => a.name).join(', ');
                    this.sendResponse(participant, `Available agents: ${names || 'none'}`);
                    return true;
                }
                // Route subsequent messages to the specified agent
                const agents = getAlgochatEnabledAgents(this.db);
                const matched = agents.find((a) => a.name.toLowerCase() === agentName.toLowerCase());
                if (matched) {
                    this.config.defaultAgentId = matched.id;
                    this.sendResponse(participant, `Routing to agent: ${matched.name}`);
                } else {
                    this.sendResponse(participant, `Agent "${agentName}" not found`);
                }
                return true;
            }

            case '/queue': {
                const queued = this.processManager.approvalManager.getQueuedRequests();
                if (queued.length === 0) {
                    this.sendResponse(participant, 'No pending escalation requests');
                } else {
                    const lines = queued.map((q) => `#${q.id}: [${q.toolName}] session=${q.sessionId.slice(0, 8)} (${q.createdAt})`);
                    this.sendResponse(participant, `Pending escalations:\n${lines.join('\n')}`);
                }
                return true;
            }

            case '/approve': {
                const queueId = parseInt(parts[1], 10);
                if (isNaN(queueId)) {
                    this.sendResponse(participant, 'Usage: /approve <queue-id>');
                    return true;
                }
                const resolved = this.processManager.approvalManager.resolveQueuedRequest(queueId, true);
                this.sendResponse(participant, resolved
                    ? `Escalation #${queueId} approved`
                    : `Escalation #${queueId} not found or already resolved`);
                return true;
            }

            case '/deny': {
                const queueId = parseInt(parts[1], 10);
                if (isNaN(queueId)) {
                    this.sendResponse(participant, 'Usage: /deny <queue-id>');
                    return true;
                }
                const resolved = this.processManager.approvalManager.resolveQueuedRequest(queueId, false);
                this.sendResponse(participant, resolved
                    ? `Escalation #${queueId} denied`
                    : `Escalation #${queueId} not found or already resolved`);
                return true;
            }

            case '/mode': {
                const newMode = parts[1]?.toLowerCase();
                if (!newMode) {
                    this.sendResponse(participant, `Current mode: ${this.processManager.approvalManager.operationalMode}`);
                    return true;
                }
                const validModes = ['normal', 'queued', 'paused'];
                if (!validModes.includes(newMode)) {
                    this.sendResponse(participant, `Invalid mode. Use: ${validModes.join(', ')}`);
                    return true;
                }
                this.processManager.approvalManager.operationalMode = newMode as 'normal' | 'queued' | 'paused';
                this.sendResponse(participant, `Mode set to: ${newMode}`);
                return true;
            }

            case '/work': {
                const description = parts.slice(1).join(' ');
                if (!description) {
                    this.sendResponse(participant, 'Usage: /work <task description>');
                    return true;
                }

                if (!this.workTaskService) {
                    this.sendResponse(participant, 'Work task service not available');
                    return true;
                }

                const agentId = this.findAgentForNewConversation();
                if (!agentId) {
                    this.sendResponse(participant, 'No agent available for work tasks');
                    return true;
                }

                this.workTaskService.create({
                    agentId,
                    description,
                    source: 'algochat',
                    requesterInfo: { participant },
                }).then((task) => {
                    this.sendResponse(participant, `Work task started: ${task.id}\nBranch: ${task.branchName ?? 'creating...'}\nStatus: ${task.status}`);

                    this.workTaskService?.onComplete(task.id, (completed) => {
                        if (completed.status === 'completed' && completed.prUrl) {
                            this.sendResponse(participant, `Work task completed!\nPR: ${completed.prUrl}`);
                        } else {
                            this.sendResponse(participant, `Work task failed: ${completed.error ?? 'Unknown error'}`);
                        }
                    });
                }).catch((err) => {
                    this.sendResponse(participant, `Work task error: ${err instanceof Error ? err.message : String(err)}`);
                });
                return true;
            }

            default:
                return false;
        }
    }

    private setupMessageHandler(): void {
        this.service.syncManager.on('onMessagesReceived', (participant, messages) => {
            // Separate group chunks from regular messages, dedup by txid
            const groupChunks: Map<number, typeof messages> = new Map();
            const regularMessages: typeof messages = [];

            // Collect known agent wallet addresses to filter outbound messages
            // sent from per-agent wallets (which the sync sees as 'received')
            const agentWalletAddresses = this.getAgentWalletAddresses();

            for (const msg of messages) {
                if (msg.direction === 'sent') continue;

                // Skip messages sent by our agent wallets (sync sees them as
                // 'received' because the sender doesn't match the main account)
                const sender = (msg as unknown as { sender?: string }).sender;
                if (sender && agentWalletAddresses.has(sender)) continue;

                // Dedup by transaction ID — skip messages we've already processed
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

            // Prune old txids to prevent unbounded growth (keep last 500).
            // JS Sets iterate in insertion order, so dropping from the front
            // removes the oldest entries.
            if (this.processedTxids.size > 500) {
                const all = [...this.processedTxids];
                this.processedTxids = new Set(all.slice(all.length - 500));
            }

            // Reassemble group messages
            for (const [round, chunks] of groupChunks) {
                const contents = chunks.map((c) => c.content);
                const reassembled = reassembleGroupMessage(contents);
                if (reassembled) {
                    const totalFee = chunks.reduce((sum, c) => {
                        const f = (c as unknown as Record<string, unknown>).fee;
                        return sum + (f != null ? Number(f) : 0);
                    }, 0);
                    log.info(`Reassembled group message (${chunks.length} chunks)`, { round });
                    this.handleIncomingMessage(participant, reassembled, round, totalFee || undefined).catch((err) => {
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
                const fee = (msg as unknown as Record<string, unknown>).fee;
                this.handleIncomingMessage(participant, msg.content, Number(msg.confirmedRound), fee != null ? Number(fee) : undefined).catch((err) => {
                    log.error('Error handling message', { error: err instanceof Error ? err.message : String(err) });
                });
            }
        });
    }

    /** Buffer for incomplete group chunks that span multiple sync batches. */
    private pendingGroupChunks: Map<string, { chunks: unknown[]; firstSeen: number }> = new Map();

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
            const totalFee = pending.chunks.reduce((sum: number, c) => {
                const f = (c as unknown as Record<string, number | undefined>).fee;
                return sum + (f != null ? Number(f) : 0);
            }, 0);
            log.info(`Reassembled buffered group message (${contents.length} chunks)`, { round });
            this.handleIncomingMessage(participant, reassembled, round, totalFee || undefined).catch((err) => {
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

        this.pskManager = new PSKManager(this.db, this.service, this.config.pskContact);

        this.pskManager.onMessage((msg) => {
            this.handleIncomingMessage(msg.sender, msg.content, msg.confirmedRound).catch((err) => {
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
                log.info(`AlgoChat session completed, notifying participant`, {
                    sessionId,
                    participant: conversation.participantAddr,
                });
            }

            if (event.type === 'error' && event.error?.message) {
                log.warn(`AlgoChat session error, notifying participant`, {
                    sessionId,
                    participant: conversation.participantAddr,
                    error: event.error.message,
                });
                this.sendResponse(conversation.participantAddr, `[Error: ${event.error.message}]`);
            }
        };
        this.sessionNotificationCallback = callback;
        this.processManager.subscribeAll(callback);
    }

    private async handleIncomingMessage(
        participant: string,
        content: string,
        confirmedRound: number,
        fee?: number,
    ): Promise<void> {
        log.info(`Message from ${participant}`, { content: content.slice(0, 100), fee });

        // Safety guard: reject raw group chunks that weren't reassembled
        if (/^\[GRP:\d+\/\d+\]/.test(content)) {
            log.debug('Skipping raw group chunk in handleIncomingMessage', { content: content.slice(0, 40) });
            return;
        }

        // Check for approval responses before anything else
        if (this.approvalManager) {
            const approvalResponse = parseApprovalResponse(content);
            if (approvalResponse) {
                const resolved = this.approvalManager.resolveByShortId(approvalResponse.shortId, {
                    behavior: approvalResponse.behavior,
                });
                if (resolved) {
                    log.info(`Resolved approval via AlgoChat`, {
                        shortId: approvalResponse.shortId,
                        behavior: approvalResponse.behavior,
                    });
                    this.stopFastPolling();
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

        // Emit feed event only for external (non-agent) messages
        this.emitEvent(participant, content, 'inbound', fee);

        // Check for commands first
        if (this.handleCommand(participant, content)) return;

        // Auto micro-fund agent wallet on localnet for incoming messages
        if (this.config.network === 'localnet' && this.agentWalletService) {
            const conversation = getConversationByParticipant(this.db, participant);
            if (conversation?.agentId) {
                const agentForFund = getAgent(this.db, conversation.agentId);
                if (agentForFund?.walletAddress) {
                    this.agentWalletService.fundAgent(conversation.agentId, 10_000).catch(() => {});
                }
            }
        }

        let conversation = getConversationByParticipant(this.db, participant);

        if (!conversation) {
            const agentId = this.findAgentForNewConversation();
            if (!agentId) {
                log.info('No AlgoChat-enabled agent found, ignoring message');
                return;
            }

            const agent = getAgent(this.db, agentId);
            if (!agent) return;

            const session = createSession(this.db, {
                projectId: agent.defaultProjectId ?? this.getDefaultProjectId(),
                agentId,
                name: `AlgoChat: ${participant.slice(0, 8)}...`,
                initialPrompt: content,
                source: 'algochat',
            });

            conversation = createConversation(this.db, participant, agentId, session.id);

            this.subscribeForResponse(session.id, participant);

            // Handle session start failure
            try {
                this.processManager.startProcess(session, content);
            } catch (err) {
                log.error('Failed to start process for new conversation', {
                    sessionId: session.id,
                    error: err instanceof Error ? err.message : String(err),
                });
                this.sendResponse(participant, `[Error: Failed to start agent session]`);
            }
        } else {
            if (conversation.sessionId) {
                const sent = this.processManager.sendMessage(conversation.sessionId, content);
                if (!sent) {
                    const { getSession } = await import('../db/sessions');
                    const session = getSession(this.db, conversation.sessionId);
                    if (session) {
                        this.subscribeForResponse(session.id, participant);
                        this.processManager.resumeProcess(session, content);
                    }
                }
            }
        }

        updateConversationRound(this.db, conversation.id, confirmedRound);
    }

    private subscribeForResponse(sessionId: string, participant: string): void {
        // Avoid duplicate subscriptions when multiple messages arrive for the same session
        if (this.chainSubscriptions.has(sessionId)) return;
        this.chainSubscriptions.add(sessionId);

        // We only send the LAST text block from the last turn. Earlier text
        // blocks are intermediate explanations (tool call reasoning, etc.)
        // and would clutter the on-chain response.
        let lastTextBlock = '';
        let lastTurnResponse = '';
        let sent = false;

        const sendOnce = () => {
            if (sent) return;
            sent = true;
            stopProgressTimer();
            this.processManager.unsubscribe(sessionId, callback);
            this.chainSubscriptions.delete(sessionId);
            this.clearSubscriptionTimer(sessionId);

            const finalText = (lastTextBlock.trim() || lastTurnResponse.trim());
            if (finalText) {
                this.sendResponse(participant, finalText);
            }
        };

        const resetTimer = () => {
            this.setSubscriptionTimer(sessionId, () => {
                log.warn(`Subscription timeout for session ${sessionId}`);
                sendOnce();
            });
        };

        let statusEmitted = false;
        let ackSent = false;
        let agentQueryCount = 0;
        let currentTextBlock = '';
        let inTextBlock = false;
        let progressTimer: ReturnType<typeof setInterval> | null = null;
        let ackDelayTimer: ReturnType<typeof setTimeout> | null = null;
        const startedAt = Date.now();

        // How long to wait before sending the on-chain ack. If the response
        // arrives within this window we skip the ack entirely.
        const ACK_DELAY_MS = 10_000; // 10 seconds
        const PROGRESS_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

        const cancelAckDelay = () => {
            if (ackDelayTimer) {
                clearTimeout(ackDelayTimer);
                ackDelayTimer = null;
            }
        };

        // Send periodic on-chain progress updates so the user's AlgoChat
        // client knows the agent is still working
        const startProgressTimer = () => {
            if (progressTimer) return;
            progressTimer = setInterval(() => {
                if (sent) { stopProgressTimer(); return; }
                const msg = agentQueryCount > 0
                    ? `Still working — queried ${agentQueryCount} agent${agentQueryCount > 1 ? 's' : ''} so far...`
                    : `Still processing your request...`;
                this.sendResponse(participant, `[Status] ${msg}`).catch(() => {});
                this.emitEvent(participant, msg, 'status');
            }, PROGRESS_INTERVAL_MS);
        };

        const stopProgressTimer = () => {
            if (progressTimer) {
                clearInterval(progressTimer);
                progressTimer = null;
            }
        };

        // Actually send the on-chain ack and start progress timer
        const sendAckNow = () => {
            if (ackSent || sent) return;
            ackSent = true;
            this.sendResponse(participant, '[Status] Received your message — working on it now.').catch(() => {});
            startProgressTimer();
        };

        const flushTextBlock = () => {
            const text = currentTextBlock.trim();
            if (text.length > 0) {
                // Keep track of the latest text block — this overwrites
                // previous ones so we only send the final one on-chain.
                lastTextBlock = text;

                // Show the agent's intermediate text as a status update
                // Truncate long blocks to a reasonable preview
                const preview = text.length > 300
                    ? text.slice(0, 300) + '...'
                    : text;
                this.emitEvent(participant, preview, 'status');
            }
            currentTextBlock = '';
            inTextBlock = false;
        };

        const callback = (sid: string, event: ClaudeStreamEvent) => {
            if (sid !== sessionId) return;

            // On first assistant event, show a local status and schedule
            // the on-chain ack after a delay (skip if we finish quickly)
            if (event.type === 'assistant' && !statusEmitted) {
                statusEmitted = true;
                this.emitEvent(participant, 'Agent is processing your message...', 'status');

                if (!ackSent && !ackDelayTimer) {
                    ackDelayTimer = setTimeout(sendAckNow, ACK_DELAY_MS);
                }
            }

            // Forward named status events from tool handlers (e.g. "Querying CorvidLabs...")
            if ((event as { type: string }).type === 'tool_status') {
                const message = (event as unknown as { message: string }).message;
                if (message) {
                    this.emitEvent(participant, message, 'status');
                    // Agent is calling other agents — this will take a while,
                    // send the ack immediately
                    if (!ackSent) {
                        cancelAckDelay();
                        sendAckNow();
                    }
                    resetTimer();
                }
                return;
            }

            // Track text content blocks — stream agent's intermediate text to the feed
            if (event.type === 'content_block_start') {
                const block = event.content_block;
                if (block?.type === 'text') {
                    inTextBlock = true;
                    currentTextBlock = '';
                } else if (block?.type === 'tool_use') {
                    // Flush any pending text before tool use starts
                    if (inTextBlock) flushTextBlock();
                    const toolName = (block as unknown as { name?: string }).name;
                    if (toolName === 'corvid_send_message') {
                        agentQueryCount++;
                        // Agent-to-agent call means longer processing — send ack now
                        if (!ackSent) {
                            cancelAckDelay();
                            sendAckNow();
                        }
                    }
                }
            }

            // Accumulate streaming text deltas
            if (event.type === 'content_block_delta' && event.delta?.text && inTextBlock) {
                currentTextBlock += event.delta.text;
                resetTimer();
            }

            // Text block finished — flush it as a status update
            if (event.type === 'content_block_stop' && inTextBlock) {
                flushTextBlock();
            }

            if (event.type === 'assistant') {
                resetTimer(); // Activity detected — reset timeout
            }

            // Each 'result' marks end of a turn — save last text block and reset
            if (event.type === 'result') {
                if (inTextBlock) flushTextBlock();
                // Only show synthesizing status if we've been working long enough
                const elapsed = Date.now() - startedAt;
                if (agentQueryCount > 0 && elapsed > ACK_DELAY_MS) {
                    this.emitEvent(participant, `Synthesizing response from ${agentQueryCount} agent${agentQueryCount > 1 ? 's' : ''}...`, 'status');
                }
                if (lastTextBlock.trim()) {
                    lastTurnResponse = lastTextBlock;
                }
                lastTextBlock = '';
                resetTimer(); // Turn completed — reset timeout
            }

            // Send only the last turn's response when the session fully exits
            if (event.type === 'session_exited') {
                if (inTextBlock) flushTextBlock();
                cancelAckDelay();
                stopProgressTimer();
                sendOnce();
            }
        };

        this.processManager.subscribe(sessionId, callback);
        resetTimer();
    }

    private subscribeForLocalResponse(sessionId: string, sendFn: LocalChatSendFn): void {
        // Store the sendFn so it can be updated if the WS connection changes
        this.localSendFns.set(sessionId, sendFn);

        // Check if already subscribed (avoid duplicate subscriptions on subsequent messages)
        if (this.localSubscriptions.has(sessionId)) return;

        let responseBuffer = '';
        let isThinking = false;

        const callback = (sid: string, event: ClaudeStreamEvent) => {
            if (sid !== sessionId) return;

            // Always use the latest sendFn and eventFn
            const currentSendFn = this.localSendFns.get(sessionId);
            if (!currentSendFn) return;
            const currentEventFn = this.localEventFns.get(sessionId);

            log.debug(`Local response event`, { sessionId, type: event.type, subtype: event.subtype });

            // Emit thinking events
            if (event.type === 'assistant' && !isThinking) {
                isThinking = true;
                currentEventFn?.({ type: 'thinking', active: true });
            }

            // Emit streaming chunks for content_block_delta
            if (event.type === 'content_block_delta' && event.delta?.text) {
                currentEventFn?.({ type: 'stream', chunk: event.delta.text, done: false });
            }

            // Emit tool_use events
            if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
                const toolName = (event.content_block as unknown as { name?: string }).name ?? 'unknown';
                const input = JSON.stringify((event.content_block as unknown as { input?: unknown }).input ?? {});
                currentEventFn?.({ type: 'tool_use', toolName, input });
            }

            if (event.type === 'assistant' && event.message?.content) {
                const text = extractContentText(event.message.content);
                log.debug(`Assistant content chunk`, { text: text.slice(0, 80) });
                responseBuffer += text;
            }

            // Turn completed — send accumulated response and reset buffer for next turn
            if (event.type === 'result') {
                log.debug(`Turn completed`, { bufferLength: responseBuffer.length });
                isThinking = false;
                currentEventFn?.({ type: 'thinking', active: false });
                currentEventFn?.({ type: 'stream', chunk: '', done: true });

                if (responseBuffer.trim()) {
                    log.debug(`Sending outbound response`, { text: responseBuffer.trim().slice(0, 80) });
                    currentSendFn('local', responseBuffer.trim(), 'outbound');
                    currentEventFn?.({ type: 'message', content: responseBuffer.trim(), direction: 'outbound' });
                }
                responseBuffer = '';
            }

            // Session exited — clean up subscription
            if (event.type === 'session_exited') {
                log.debug('Session exited, cleaning up subscription');
                this.processManager.unsubscribe(sessionId, callback);
                this.localSubscriptions.delete(sessionId);
                this.localSendFns.delete(sessionId);
                this.localEventFns.delete(sessionId);
                this.clearSubscriptionTimer(sessionId);

                isThinking = false;
                currentEventFn?.({ type: 'thinking', active: false });

                // Send any remaining buffered text
                if (responseBuffer.trim()) {
                    currentSendFn('local', responseBuffer.trim(), 'outbound');
                    currentEventFn?.({ type: 'message', content: responseBuffer.trim(), direction: 'outbound' });
                }
            }
        };

        this.localSubscriptions.set(sessionId, callback);
        this.processManager.subscribe(sessionId, callback);
        this.setSubscriptionTimer(sessionId, () => {
            log.warn(`Local subscription timeout for session ${sessionId}`);
            this.processManager.unsubscribe(sessionId, callback);
            this.localSubscriptions.delete(sessionId);
            const currentSendFn = this.localSendFns.get(sessionId);
            this.localSendFns.delete(sessionId);
            this.localEventFns.delete(sessionId);
            if (responseBuffer.trim() && currentSendFn) {
                currentSendFn('local', responseBuffer.trim(), 'outbound');
            }
        });
    }

    private setSubscriptionTimer(sessionId: string, onTimeout: () => void): void {
        // Clear any existing timer for this session
        this.clearSubscriptionTimer(sessionId);
        const timer = setTimeout(onTimeout, SUBSCRIPTION_TIMEOUT_MS);
        this.subscriptionTimers.set(sessionId, timer);
    }

    private clearSubscriptionTimer(sessionId: string): void {
        const timer = this.subscriptionTimers.get(sessionId);
        if (timer) {
            clearTimeout(timer);
            this.subscriptionTimers.delete(sessionId);
        }
    }

    private async sendResponse(participant: string, content: string): Promise<void> {
        // Check daily ALGO spending limit (estimate min fee of 1000 microAlgos per txn)
        try {
            checkAlgoLimit(this.db, 1000);
        } catch (err) {
            log.warn(`On-chain response blocked by spending limit`, {
                participant,
                error: err instanceof Error ? err.message : String(err),
            });
            return;
        }

        try {
            // Route PSK contacts through the PSK manager
            if (this.pskManager && participant === this.pskManager.contactAddress) {
                await this.pskManager.sendMessage(content);
                log.info(`Sent PSK response to ${participant}`, { content: content.slice(0, 100) });
                this.emitEvent(participant, content, 'outbound');
                return;
            }

            // Try to use per-agent wallet if available
            let senderAccount = this.service.chatAccount;
            if (this.agentWalletService) {
                const conversation = getConversationByParticipant(this.db, participant);
                if (conversation?.agentId) {
                    const agentAccount = await this.agentWalletService.getAgentChatAccount(conversation.agentId);
                    if (agentAccount) {
                        senderAccount = agentAccount.account;
                        log.debug(`Using agent wallet ${agentAccount.address} for response`);
                    }
                }
            }

            const pubKey = await this.getPublicKey(participant);

            // Use group transactions for all recipients. External AlgoChat
            // clients that support [GRP:] reassembly will show the full message;
            // for short messages that fit in a single txn, sendGroupMessage
            // automatically falls back to a standard single send.
            try {
                const { sendGroupMessage } = await import('./group-sender');
                const groupResult = await sendGroupMessage(
                    this.service,
                    senderAccount,
                    participant,
                    pubKey,
                    content,
                );

                log.info(`Sent response to ${participant}`, { content: content.slice(0, 100), fee: groupResult.fee, txids: groupResult.txids.length });
                if (groupResult.fee) {
                    recordAlgoSpend(this.db, groupResult.fee);
                    const conv = getConversationByParticipant(this.db, participant);
                    if (conv?.sessionId) updateSessionAlgoSpent(this.db, conv.sessionId, groupResult.fee);
                }
                this.emitEvent(participant, content, 'outbound', groupResult.fee);
                return;
            } catch (groupErr) {
                log.warn('Group send failed, falling back to single txn', {
                    error: groupErr instanceof Error ? groupErr.message : String(groupErr),
                });
            }

            // Fallback: single transaction (truncates if needed)
            let sendContent = content;
            const encoded = new TextEncoder().encode(content);
            if (encoded.byteLength > 850) {
                sendContent = new TextDecoder().decode(encoded.slice(0, 840)) + '...';
            }

            const result = await this.service.algorandService.sendMessage(
                senderAccount,
                participant,
                pubKey,
                sendContent,
            );

            const fee = (result as unknown as { fee?: number }).fee;
            log.info(`Sent response to ${participant}`, { content: content.slice(0, 100), fee });
            if (fee) {
                recordAlgoSpend(this.db, fee);
                const conv = getConversationByParticipant(this.db, participant);
                if (conv?.sessionId) updateSessionAlgoSpent(this.db, conv.sessionId, fee);
            }
            this.emitEvent(participant, content, 'outbound', fee);
        } catch (err) {
            log.error('Failed to send response', { error: err instanceof Error ? err.message : String(err) });
        }
    }

    private async getPublicKey(address: string): Promise<Uint8Array> {
        const cached = this.publicKeyCache.get(address);
        if (cached && (Date.now() - cached.cachedAt) < PUBLIC_KEY_CACHE_TTL_MS) {
            return cached.key;
        }

        const pubKey = await this.service.algorandService.discoverPublicKey(address);
        this.publicKeyCache.set(address, { key: pubKey, cachedAt: Date.now() });
        return pubKey;
    }

    private findAgentForNewConversation(): string | null {
        if (this.config.defaultAgentId) {
            return this.config.defaultAgentId;
        }

        const agents = getAlgochatEnabledAgents(this.db);
        const autoAgent = agents.find((a) => a.algochatAuto);
        return autoAgent?.id ?? agents[0]?.id ?? null;
    }

    private getDefaultProjectId(): string {
        const { listProjects, createProject } = require('../db/projects');
        const projects = listProjects(this.db);
        if (projects.length > 0) return projects[0].id;

        const project = createProject(this.db, {
            name: 'AlgoChat Default',
            workingDir: process.cwd(),
        });
        return project.id;
    }

    /** Cache of agent wallet addresses, refreshed lazily. */
    private cachedAgentWallets: Set<string> | null = null;
    private cachedAgentWalletsAt = 0;

    private getAgentWalletAddresses(): Set<string> {
        const now = Date.now();
        // Refresh cache every 60s
        if (this.cachedAgentWallets && now - this.cachedAgentWalletsAt < 60_000) {
            return this.cachedAgentWallets;
        }
        const agents = listAgents(this.db);
        const addrs = new Set<string>();
        for (const a of agents) {
            if (a.walletAddress) addrs.add(a.walletAddress);
        }
        // Also include the main chat account address
        addrs.add(this.service.chatAccount.address);
        this.cachedAgentWallets = addrs;
        this.cachedAgentWalletsAt = now;
        return addrs;
    }

    private emitEvent(
        participant: string,
        content: string,
        direction: 'inbound' | 'outbound' | 'status',
        fee?: number,
    ): void {
        // Persist to DB so messages survive page refresh
        try {
            saveAlgoChatMessage(this.db, { participant, content, direction, fee });
        } catch (err) {
            log.warn('Failed to persist algochat message', { error: err instanceof Error ? err.message : String(err) });
        }

        for (const cb of this.eventCallbacks) {
            try {
                cb(participant, content, direction, fee);
            } catch (err) {
                log.error('Event callback threw', { error: err instanceof Error ? err.message : String(err) });
            }
        }
    }

    /**
     * While approval requests are pending, poll on-chain at a faster rate
     * (5s) so the user's reply is picked up quickly.
     */
    private startFastPolling(): void {
        if (this.fastPollTimer) return;

        const FAST_POLL_MS = 5000;
        this.fastPollTimer = setInterval(() => {
            // If no more pending approvals, stop fast polling
            if (!this.approvalManager?.hasPendingRequests()) {
                this.stopFastPolling();
                return;
            }

            // Trigger a manual sync
            this.service.syncManager.sync().catch((err) => {
                log.warn('Fast-poll sync error', { error: err instanceof Error ? err.message : String(err) });
            });
        }, FAST_POLL_MS);

        log.debug('Started fast-polling for approval responses');
    }

    private stopFastPolling(): void {
        if (this.fastPollTimer) {
            clearInterval(this.fastPollTimer);
            this.fastPollTimer = null;
            log.debug('Stopped fast-polling');
        }
    }

    /**
     * Seed the SyncManager with known conversation participants from the DB
     * so that fetchAllConversations has something to iterate over.
     */
    private seedConversations(): void {
        const conversations = listConversations(this.db);
        for (const conv of conversations) {
            const syncConv = this.service.syncManager.getOrCreateConversation(conv.participantAddr);
            if (conv.lastRound > 0) {
                // Use lastRound + 1 because minRound is inclusive and we already
                // processed the message at lastRound in a previous run
                syncConv.setLastFetchedRound(conv.lastRound + 1);
            }
        }
        if (conversations.length > 0) {
            log.info(`Seeded ${conversations.length} conversation(s) from DB`);
        }
    }

    /**
     * Periodically discover new senders by querying the indexer for
     * incoming transactions from addresses not yet in the SyncManager.
     */
    private startDiscoveryPolling(): void {
        if (this.discoveryTimer) return;

        // Run immediately then on the sync interval
        this.discoverNewSenders().catch((err) => {
            log.warn('Discovery error', { error: err instanceof Error ? err.message : String(err) });
        });

        this.discoveryTimer = setInterval(() => {
            this.discoverNewSenders().catch((err) => {
                log.warn('Discovery error', { error: err instanceof Error ? err.message : String(err) });
            });
        }, this.config.syncInterval);
    }

    private stopDiscoveryPolling(): void {
        if (this.discoveryTimer) {
            clearInterval(this.discoveryTimer);
            this.discoveryTimer = null;
        }
    }

    private async discoverNewSenders(): Promise<void> {
        if (!this.service.indexerClient) return;

        const myAddr = this.service.chatAccount.address;
        const response = await this.service.indexerClient
            .searchForTransactions()
            .address(myAddr)
            .addressRole('receiver')
            .limit(50)
            .do();

        const knownParticipants = new Set(
            this.service.syncManager.getConversations().map((c) => c.participant),
        );

        const newSenders = new Set<string>();
        for (const tx of (response as { transactions?: Array<{ sender: string; note?: string }> }).transactions ?? []) {
            if (tx.sender !== myAddr && tx.note && !knownParticipants.has(tx.sender)) {
                newSenders.add(tx.sender);
            }
        }

        for (const sender of newSenders) {
            log.info(`Discovered new sender`, { address: sender });
            this.service.syncManager.getOrCreateConversation(sender);
        }
    }
}

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
import { getAgent, getAlgochatEnabledAgents } from '../db/agents';
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
import { createLogger } from '../lib/logger';

const log = createLogger('AlgoChatBridge');

const SUBSCRIPTION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const PUBLIC_KEY_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export type AlgoChatEventCallback = (
    participant: string,
    content: string,
    direction: 'inbound' | 'outbound',
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
    private subscriptionTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
    private pskManager: PSKManager | null = null;
    private approvalManager: ApprovalManager | null = null;
    private workTaskService: WorkTaskService | null = null;
    private fastPollTimer: ReturnType<typeof setInterval> | null = null;

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
        this.service.syncManager.start();
        this.pskManager?.start(this.config.syncInterval);
        log.info('Started listening for messages');
    }

    stop(): void {
        this.service.syncManager.stop();
        this.pskManager?.stop();
        this.stopFastPolling();
        // Clear all subscription timers
        for (const timer of this.subscriptionTimers.values()) {
            clearTimeout(timer);
        }
        this.subscriptionTimers.clear();
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
            for (const msg of messages) {
                this.handleIncomingMessage(participant, msg.content, msg.confirmedRound, msg.fee).catch((err) => {
                    log.error('Error handling message', { error: err instanceof Error ? err.message : String(err) });
                });
            }
        });
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
        this.processManager.subscribeAll((sessionId, event) => {
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
                    participant: conversation.participant,
                });
            }

            if (event.type === 'error' && event.error?.message) {
                log.warn(`AlgoChat session error, notifying participant`, {
                    sessionId,
                    participant: conversation.participant,
                    error: event.error.message,
                });
                this.sendResponse(conversation.participant, `[Error: ${event.error.message}]`);
            }
        });
    }

    private async handleIncomingMessage(
        participant: string,
        content: string,
        confirmedRound: number,
        fee?: number,
    ): Promise<void> {
        log.info(`Message from ${participant}`, { content: content.slice(0, 100), fee });
        this.emitEvent(participant, content, 'inbound', fee);

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
        let responseBuffer = '';

        const callback = (sid: string, event: ClaudeStreamEvent) => {
            if (sid !== sessionId) return;

            if (event.type === 'assistant' && event.message?.content) {
                responseBuffer += extractContentText(event.message.content);
            }

            if (event.type === 'result' || event.type === 'session_exited') {
                this.processManager.unsubscribe(sessionId, callback);
                this.clearSubscriptionTimer(sessionId);

                if (responseBuffer.trim()) {
                    this.sendResponse(participant, responseBuffer.trim());
                }
            }
        };

        this.processManager.subscribe(sessionId, callback);
        this.setSubscriptionTimer(sessionId, () => {
            log.warn(`Subscription timeout for session ${sessionId}`);
            this.processManager.unsubscribe(sessionId, callback);
            if (responseBuffer.trim()) {
                this.sendResponse(participant, responseBuffer.trim());
            }
        });
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

            // Condense message for non-localnet to fit on-chain limits
            let sendContent = content;
            if (this.config.network !== 'localnet') {
                try {
                    const { condenseMessage } = await import('./condenser');
                    const result = await condenseMessage(content);
                    if (result.wasCondensed) {
                        sendContent = result.content;
                        log.info('Message condensed for on-chain send', {
                            originalBytes: result.originalBytes,
                            condensedBytes: result.condensedBytes,
                        });
                    }
                } catch (err) {
                    log.warn('Condensation failed, sending original', {
                        error: err instanceof Error ? err.message : String(err),
                    });
                }
            }

            // Standard encrypted send
            const pubKey = await this.getPublicKey(participant);

            const result = await this.service.algorandService.sendMessage(
                senderAccount,
                participant,
                pubKey,
                sendContent,
            );

            log.info(`Sent response to ${participant}`, { content: content.slice(0, 100), fee: result.fee });
            this.emitEvent(participant, content, 'outbound', result.fee);
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

    private emitEvent(
        participant: string,
        content: string,
        direction: 'inbound' | 'outbound',
        fee?: number,
    ): void {
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
}

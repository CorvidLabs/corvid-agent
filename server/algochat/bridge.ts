/**
 * AlgoChatBridge — Thin orchestration layer composing seven focused services:
 *
 * - **ResponseFormatter** — Message sending, on-chain delivery, event emission
 * - **CommandHandler** — Slash command parsing, authorization, dispatch
 * - **SubscriptionManager** — Session event subscriptions and response lifecycle
 * - **DiscoveryService** — Agent/sender discovery, conversation seeding, polling
 * - **PSKContactManager** — Multi-contact PSK CRUD, URI building, PSKManager lifecycle
 * - **PSKDiscoveryPoller** — Trial-decrypt discovery polling for unmatched contacts
 * - **MessageRouter** — Incoming message routing, group reassembly, session management
 *
 * This module wires the services together. All business logic lives in the
 * extracted modules; this file is purely orchestration and lifecycle management.
 *
 * @module
 */
import type { Database } from 'bun:sqlite';
import type { ProcessManager } from '../process/manager';
import type { AlgoChatConfig } from './config';
import type { AlgoChatService } from './service';
import type { AlgoChatStatus } from '../../shared/types';
import { listConversations } from '../db/sessions';
import type { AgentWalletService } from './agent-wallet';
import type { AgentDirectory } from './agent-directory';
import type { AgentMessenger } from './agent-messenger';
import type { OnChainTransactor } from './on-chain-transactor';
import type { ApprovalManager } from '../process/approval-manager';
import type { ApprovalRequestWire } from '../process/approval-types';
import type { OwnerQuestionManager } from '../process/owner-question-manager';
import type { WorkTaskService } from '../work/service';
import { WorkCommandRouter } from './work-command-router';
import { createLogger } from '../lib/logger';

// Composed services
import { ResponseFormatter } from './response-formatter';
import { CommandHandler } from './command-handler';
import { SubscriptionManager } from './subscription-manager';
import { DiscoveryService } from './discovery-service';
import { PSKContactManager } from './psk-contact-manager';
import { PSKDiscoveryPoller } from './psk-discovery-poller';
import { MessageRouter } from './message-router';

// Channel adapter interface
import type { ChannelAdapter, SessionMessage, ChannelStatus } from '../channels/types';

// Re-export types from extracted modules so callers don't need to change imports
export type { AlgoChatEventCallback } from './response-formatter';
export type { LocalChatSendFn, LocalChatEvent, LocalChatEventFn } from './subscription-manager';

const log = createLogger('AlgoChatBridge');

/**
 * Central orchestrator for the AlgoChat system.
 *
 * Bridges on-chain Algorand messaging with the agent session system.
 * Composes seven focused services and handles lifecycle management.
 *
 * Public API surface is preserved for backward compatibility — callers
 * (server/index.ts, ws/handler.ts, routes/index.ts) require no changes.
 */
export class AlgoChatBridge implements ChannelAdapter {
    readonly channelType = 'algochat' as const;
    readonly db: Database;
    private processManager: ProcessManager;
    private config: AlgoChatConfig;
    private service: AlgoChatService;

    // Composed services
    private responseFormatter: ResponseFormatter;
    private commandHandler: CommandHandler;
    private subscriptionManager: SubscriptionManager;
    private discoveryService: DiscoveryService;
    private contactManager: PSKContactManager;
    private discoveryPoller: PSKDiscoveryPoller;
    private messageRouter: MessageRouter;

    // Optional dependencies (for getter access)
    private agentWalletService: AgentWalletService | null = null;

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

        this.contactManager = new PSKContactManager(db, config, service);
        this.discoveryPoller = new PSKDiscoveryPoller(db, config, service, this.contactManager);
        this.messageRouter = new MessageRouter(
            db, processManager, config, service,
            this.responseFormatter, this.commandHandler,
            this.subscriptionManager, this.discoveryService,
            this.contactManager,
        );

        // Wire owner check into ProcessManager so credit deduction is skipped for owners
        this.processManager.setOwnerCheck((address) => this.commandHandler.isOwner(address));

        // Wire PSK manager lookup into response formatter
        this.responseFormatter.setPskManagerLookup((address) => this.contactManager.lookupPskManager(address));

        // Wire PSK message callback to the message router
        this.contactManager.setOnPskMessage((msg) => {
            this.messageRouter.handleIncomingMessage(msg.sender, msg.content, msg.confirmedRound, msg.amount).catch((err) => {
                log.error('Error handling PSK message', { error: err instanceof Error ? err.message : String(err) });
            });
        });

        // Wire discovery poller first-message callback to the message router
        this.discoveryPoller.setOnFirstMessage((sender, text, round, amount) => {
            this.messageRouter.handleIncomingMessage(sender, text, round, amount).catch((err) => {
                log.error('Error handling discovered PSK message', { error: err instanceof Error ? err.message : String(err) });
            });
        });

        this.messageRouter.setupMessageHandler();
        this.contactManager.setupPSKManagers();
        this.messageRouter.setupSessionNotifications();
    }

    // ── Dependency injection (preserves existing API) ────────────────────

    setAgentWalletService(service: AgentWalletService): void {
        this.agentWalletService = service;
        this.responseFormatter.setAgentWalletService(service);
        this.messageRouter.setAgentWalletService(service);
    }

    getAgentWalletService(): AgentWalletService | null {
        return this.agentWalletService;
    }

    setAgentDirectory(directory: AgentDirectory): void {
        this.messageRouter.setAgentDirectory(directory);
    }

    setApprovalManager(manager: ApprovalManager): void {
        this.messageRouter.setApprovalManager(manager);
        this.discoveryService.setApprovalManager(manager);
    }

    setOwnerQuestionManager(manager: OwnerQuestionManager): void {
        this.messageRouter.setOwnerQuestionManager(manager);
    }

    setWorkTaskService(service: WorkTaskService): void {
        const router = new WorkCommandRouter(this.db);
        router.setWorkTaskService(service);
        this.commandHandler.setWorkCommandRouter(router);
    }

    setOnChainTransactor(transactor: OnChainTransactor): void {
        this.responseFormatter.setOnChainTransactor(transactor);
    }

    setAgentMessenger(messenger: AgentMessenger): void {
        this.commandHandler.setAgentMessenger(messenger);
    }

    // ── Public API ───────────────────────────────────────────────────────

    async sendApprovalRequest(participant: string, request: ApprovalRequestWire): Promise<void> {
        return this.messageRouter.sendApprovalRequest(participant, request);
    }

    start(): void {
        this.discoveryService.seedConversations();
        this.service.syncManager.start();
        this.contactManager.startMatched(this.config.syncInterval);
        this.discoveryPoller.start();
        this.discoveryService.startDiscoveryPolling();
        log.info('Started listening for messages');
    }

    stop(): void {
        this.service.syncManager.stop();
        this.contactManager.stopAll();
        this.discoveryPoller.stop();
        this.discoveryService.cleanup();
        this.messageRouter.cleanupSessionNotifications();
        this.subscriptionManager.cleanup();
        log.info('Stopped');
    }

    onEvent(callback: import('./response-formatter').AlgoChatEventCallback): void {
        this.responseFormatter.onEvent(callback);
    }

    offEvent(callback: import('./response-formatter').AlgoChatEventCallback): void {
        this.responseFormatter.offEvent(callback);
    }

    async getStatus(): Promise<AlgoChatStatus & ChannelStatus> {
        const conversations = listConversations(this.db);
        let balance = 0;
        try {
            const info = await this.service.algodClient.accountInformation(this.service.chatAccount.address).do();
            balance = Number(info.amount ?? 0);
        } catch { /* ignore — balance stays 0 */ }
        return {
            channelType: this.channelType,
            enabled: true,
            connected: true,
            details: {
                address: this.service.chatAccount.address,
                network: this.config.network,
                syncInterval: this.config.syncInterval,
                activeConversations: conversations.length,
                balance,
            },
            address: this.service.chatAccount.address,
            network: this.config.network,
            syncInterval: this.config.syncInterval,
            activeConversations: conversations.length,
            balance,
        };
    }

    async sendMessage(participant: string, content: string): Promise<void> {
        await this.responseFormatter.sendResponse(participant, content);
    }

    onMessage(handler: (msg: SessionMessage) => void): void {
        this.messageRouter.onMessage(handler);
    }

    // ── Legacy single-contact PSK API ──────────────────────────────────

    getPSKExchangeURI(): { uri: string; address: string; network: string; label: string } | null {
        return this.contactManager.getPSKExchangeURI();
    }

    generatePSKExchangeURI(): { uri: string; address: string; network: string; label: string } {
        const result = this.contactManager.generatePSKExchangeURI();
        this.discoveryPoller.start(); // ensure discovery poller runs for new contacts
        return result;
    }

    // ── Multi-contact PSK CRUD ─────────────────────────────────────────

    createPSKContact(nickname: string): { id: string; uri: string; nickname: string } {
        const result = this.contactManager.createPSKContact(nickname);
        this.discoveryPoller.start(); // ensure discovery poller runs for new contacts
        return result;
    }

    listPSKContacts() {
        return this.contactManager.listPSKContacts();
    }

    renamePSKContact(id: string, nickname: string): boolean {
        return this.contactManager.renamePSKContact(id, nickname);
    }

    cancelPSKContact(id: string): boolean {
        return this.contactManager.cancelPSKContact(id);
    }

    getPSKContactURI(id: string): string | null {
        return this.contactManager.getPSKContactURI(id);
    }

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
        return this.messageRouter.handleLocalMessage(agentId, content, sendFn, projectId, eventFn);
    }
}

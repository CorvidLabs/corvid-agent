/**
 * DiscoveryService — Handles agent/sender discovery and conversation seeding
 * for the AlgoChat bridge.
 *
 * Responsibilities:
 * - Seed the SyncManager with known conversation participants from the DB
 * - Periodically discover new senders via the Algorand indexer
 * - Fast-poll for approval responses when approvals are pending
 * - Cache and refresh agent wallet addresses
 *
 * Extracted from bridge.ts to isolate discovery/polling concerns from
 * message handling and subscription management.
 */
import type { Database } from 'bun:sqlite';
import type { AlgoChatConfig } from './config';
import type { AlgoChatService } from './service';
import type { ApprovalManager } from '../process/approval-manager';
import {
    listConversations,
} from '../db/sessions';
import { listAgents, getAlgochatEnabledAgents } from '../db/agents';
import { createLogger } from '../lib/logger';

const log = createLogger('DiscoveryService');

/**
 * Authorization check function — injected by the bridge so this module
 * doesn't need direct access to config.ownerAddresses.
 */
export type IsOwnerFn = (participant: string) => boolean;

/**
 * Manages agent discovery, conversation seeding, and polling for the
 * AlgoChat system.
 *
 * This service is responsible for:
 * - Populating the SyncManager with existing DB conversations on startup
 * - Discovering new senders by querying the Algorand indexer
 * - Fast-polling for approval responses (5s interval)
 * - Caching agent wallet addresses to filter outbound messages
 */
export class DiscoveryService {
    private db: Database;
    private config: AlgoChatConfig;
    private service: AlgoChatService;
    private isOwnerFn: IsOwnerFn;
    private approvalManager: ApprovalManager | null = null;

    /** Timer for fast-polling during pending approvals. */
    private fastPollTimer: ReturnType<typeof setInterval> | null = null;
    /** Timer for periodic sender discovery. */
    private discoveryTimer: ReturnType<typeof setInterval> | null = null;
    /** Cached agent wallet addresses (refreshed every 60s). */
    private cachedAgentWallets: Set<string> | null = null;
    private cachedAgentWalletsAt = 0;

    constructor(
        db: Database,
        config: AlgoChatConfig,
        service: AlgoChatService,
        isOwnerFn: IsOwnerFn,
    ) {
        this.db = db;
        this.config = config;
        this.service = service;
        this.isOwnerFn = isOwnerFn;
    }

    /** Inject the optional approval manager for fast-polling checks. */
    setApprovalManager(manager: ApprovalManager): void {
        this.approvalManager = manager;
    }

    /**
     * Seed the SyncManager with known conversation participants from the DB
     * so that fetchAllConversations has something to iterate over.
     */
    seedConversations(): void {
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
     * Start periodic discovery polling for new senders.
     * Runs immediately, then on the configured sync interval.
     */
    startDiscoveryPolling(): void {
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

    /** Stop the discovery polling timer. */
    stopDiscoveryPolling(): void {
        if (this.discoveryTimer) {
            clearInterval(this.discoveryTimer);
            this.discoveryTimer = null;
        }
    }

    /**
     * Discover new senders by querying the indexer for incoming transactions
     * from addresses not yet in the SyncManager.
     */
    async discoverNewSenders(): Promise<void> {
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
                if (!this.isOwnerFn(tx.sender)) continue;
                newSenders.add(tx.sender);
            }
        }

        for (const sender of newSenders) {
            log.info(`Discovered new sender`, { address: sender });
            this.service.syncManager.getOrCreateConversation(sender);
        }
    }

    /**
     * Start fast-polling (5s interval) while approval requests are pending.
     * Triggers manual syncs so the user's reply is picked up quickly.
     */
    startFastPolling(): void {
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

    /** Stop fast-polling. */
    stopFastPolling(): void {
        if (this.fastPollTimer) {
            clearInterval(this.fastPollTimer);
            this.fastPollTimer = null;
            log.debug('Stopped fast-polling');
        }
    }

    /**
     * Get the set of agent wallet addresses (cached, refreshed every 60s).
     * Used to filter outbound messages that the sync sees as 'received'.
     */
    getAgentWalletAddresses(): Set<string> {
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

    /**
     * Find the default agent for new conversations.
     * Prefers the configured default, then auto-enabled agents, then the first available.
     */
    findAgentForNewConversation(): string | null {
        if (this.config.defaultAgentId) {
            return this.config.defaultAgentId;
        }

        const agents = getAlgochatEnabledAgents(this.db);
        const autoAgent = agents.find((a) => a.algochatAuto);
        return autoAgent?.id ?? agents[0]?.id ?? null;
    }

    /**
     * Get or create the default project ID for new sessions.
     */
    getDefaultProjectId(): string {
        const { listProjects, createProject } = require('../db/projects');
        const projects = listProjects(this.db);
        if (projects.length > 0) return projects[0].id;

        const project = createProject(this.db, {
            name: 'AlgoChat Default',
            workingDir: process.cwd(),
        });
        return project.id;
    }

    /**
     * Clean up all timers. Called during bridge shutdown.
     */
    cleanup(): void {
        this.stopFastPolling();
        this.stopDiscoveryPolling();
    }
}

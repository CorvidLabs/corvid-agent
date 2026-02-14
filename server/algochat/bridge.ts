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
    readonly db: Database;
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
    private sessionNotificationCallback: ((sid: string, event: ClaudeStreamEvent) => void) | null = null;

    // Multi-contact PSK state
    /** Active PSK managers keyed by contact ID (psk_contacts.id) */
    private pskManagers: Map<string, PSKManager> = new Map();
    /** Reverse lookup: mobile address → contact ID (populated when address is discovered) */
    private pskAddressToId: Map<string, string> = new Map();
    /** Discovery poller for unmatched contacts (polls TO our address, trial-decrypts) */
    private discoveryPollTimer: ReturnType<typeof setInterval> | null = null;
    /** Last round scanned by discovery poller (avoids re-scanning old history) */
    private discoveryLastRound: number = 0;

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

        // Wire PSK manager lookup into response formatter before setup
        this.responseFormatter.setPskManagerLookup((address) => this.lookupPskManager(address));

        this.setupMessageHandler();
        this.setupPSKManagers();
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
        // Start only matched PSK managers (ones with a known mobile address).
        // Unmatched contacts are handled by the discovery poller instead.
        const matchedIds = new Set(this.pskAddressToId.values());
        for (const [contactId, mgr] of this.pskManagers) {
            if (matchedIds.has(contactId)) {
                mgr.start(this.config.syncInterval);
            }
        }
        this.startDiscoveryPoller();
        this.discoveryService.startDiscoveryPolling();
        log.info('Started listening for messages');
    }

    /** Stop all AlgoChat services and clean up resources. */
    stop(): void {
        this.service.syncManager.stop();
        for (const mgr of this.pskManagers.values()) {
            mgr.stop();
        }
        this.stopDiscoveryPoller();
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
    async getStatus(): Promise<AlgoChatStatus> {
        const conversations = listConversations(this.db);
        let balance = 0;
        try {
            const info = await this.service.algodClient.accountInformation(this.service.chatAccount.address).do();
            balance = Number(info.amount ?? 0);
        } catch { /* ignore — balance stays 0 */ }
        return {
            enabled: true,
            address: this.service.chatAccount.address,
            network: this.config.network,
            syncInterval: this.config.syncInterval,
            activeConversations: conversations.length,
            balance,
        };
    }

    // ── Legacy single-contact PSK API (backward compat) ──────────────

    /** Get or generate a PSK exchange URI for the first contact (backward compat). */
    getPSKExchangeURI(): { uri: string; address: string; network: string; label: string } | null {
        // Return first active contact's URI
        const contacts = this.listPSKContacts();
        if (contacts.length === 0) return null;
        const first = contacts[0];
        const uri = this.getPSKContactURI(first.id);
        if (!uri) return null;
        return {
            uri,
            address: this.service.chatAccount.address,
            network: this.config.network,
            label: first.nickname,
        };
    }

    /** Generate a new PSK exchange URI (backward compat — creates a new contact named "Mobile"). */
    generatePSKExchangeURI(): { uri: string; address: string; network: string; label: string } {
        const result = this.createPSKContact('Mobile');
        return {
            uri: result.uri,
            address: this.service.chatAccount.address,
            network: this.config.network,
            label: result.nickname,
        };
    }

    // ── Multi-contact PSK CRUD ─────────────────────────────────────────

    /** Create a new PSK contact. Generates a fresh PSK, stores in DB, starts a PSK manager. */
    createPSKContact(nickname: string): { id: string; uri: string; nickname: string } {
        const id = crypto.randomUUID();
        const psk = crypto.getRandomValues(new Uint8Array(32));
        const network = this.config.network;

        this.db.prepare(`
            INSERT INTO psk_contacts (id, nickname, network, initial_psk, active, created_at, updated_at)
            VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'))
        `).run(id, nickname, network, psk);

        // Also create an algochat_psk_state row so the PSKManager can operate
        this.db.prepare(`
            INSERT OR REPLACE INTO algochat_psk_state
                (address, network, initial_psk, label, send_counter, peer_last_counter, seen_counters, last_round, updated_at)
            VALUES (?, ?, ?, ?, 0, 0, '[]', 0, datetime('now'))
        `).run(id, network, psk, nickname);

        // Create and start PSKManager (no known mobile address yet — uses contact ID as address)
        const mgr = new PSKManager(this.db, this.service, { address: id, psk, label: nickname }, network, id);
        this.pskManagers.set(id, mgr);
        // Don't start polling by sender yet — discovery poller handles unmatched contacts
        // mgr.start() will be called once the mobile address is discovered

        const uri = this.buildPSKUri(psk, nickname);
        log.info(`Created PSK contact "${nickname}"`, { id });

        // Ensure discovery poller is running so we can detect the first message
        this.startDiscoveryPoller();

        return { id, uri, nickname };
    }

    /** List all PSK contacts for the current network. */
    listPSKContacts(): Array<{
        id: string;
        nickname: string;
        network: string;
        mobileAddress: string | null;
        active: boolean;
        createdAt: string;
    }> {
        const rows = this.db.prepare(
            'SELECT id, nickname, network, mobile_address, active, created_at FROM psk_contacts WHERE network = ? ORDER BY created_at ASC'
        ).all(this.config.network) as Array<{
            id: string;
            nickname: string;
            network: string;
            mobile_address: string | null;
            active: number;
            created_at: string;
        }>;
        return rows.map((r) => ({
            id: r.id,
            nickname: r.nickname,
            network: r.network,
            mobileAddress: r.mobile_address,
            active: r.active === 1,
            createdAt: r.created_at,
        }));
    }

    /** Rename a PSK contact. */
    renamePSKContact(id: string, nickname: string): boolean {
        const result = this.db.prepare(
            "UPDATE psk_contacts SET nickname = ?, updated_at = datetime('now') WHERE id = ?"
        ).run(nickname, id);
        return (result.changes ?? 0) > 0;
    }

    /** Delete a PSK contact permanently. Stops its manager and removes all state. */
    cancelPSKContact(id: string): boolean {
        // Stop and remove the manager first
        const mgr = this.pskManagers.get(id);
        if (mgr) {
            mgr.stop();
            const addr = mgr.contactAddress;
            if (this.pskAddressToId.get(addr) === id) {
                this.pskAddressToId.delete(addr);
            }
            this.pskManagers.delete(id);
        }

        // Delete PSK ratchet state (address may be contact ID or the real mobile address)
        const contact = this.db.prepare('SELECT mobile_address FROM psk_contacts WHERE id = ?').get(id) as { mobile_address: string | null } | null;
        if (contact) {
            const stateAddr = contact.mobile_address ?? id;
            this.db.prepare('DELETE FROM algochat_psk_state WHERE address = ? AND network = ?').run(stateAddr, this.config.network);
        }

        // Hard-delete from psk_contacts
        const result = this.db.prepare('DELETE FROM psk_contacts WHERE id = ?').run(id);
        if ((result.changes ?? 0) === 0) return false;

        log.info(`Deleted PSK contact`, { id });
        return true;
    }

    /** Get the PSK URI for a contact (for QR display). */
    getPSKContactURI(id: string): string | null {
        const row = this.db.prepare(
            'SELECT initial_psk, nickname FROM psk_contacts WHERE id = ?'
        ).get(id) as { initial_psk: Uint8Array; nickname: string } | null;
        if (!row) return null;

        const pskBytes = row.initial_psk instanceof Uint8Array
            ? row.initial_psk
            : new Uint8Array(row.initial_psk as ArrayBuffer);
        return this.buildPSKUri(pskBytes, row.nickname);
    }

    private buildPSKUri(psk: Uint8Array, label: string): string {
        const address = this.service.chatAccount.address;
        const network = this.config.network;
        const pskBase64 = btoa(String.fromCharCode(...psk))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
        return `algochat-psk://v1?addr=${address}&psk=${pskBase64}&label=${encodeURIComponent(label)}&network=${network}`;
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

    /** Load all active PSK contacts from DB and create PSKManagers for each. */
    private setupPSKManagers(): void {
        // Also support the legacy env-based PSK contact for backward compat
        if (this.config.pskContact) {
            this.setupLegacyPskContact();
        }

        // Load multi-contact entries from psk_contacts table
        const rows = this.db.prepare(
            'SELECT id, nickname, network, initial_psk, mobile_address FROM psk_contacts WHERE network = ? AND active = 1'
        ).all(this.config.network) as Array<{
            id: string;
            nickname: string;
            network: string;
            initial_psk: Uint8Array;
            mobile_address: string | null;
        }>;

        for (const row of rows) {
            if (this.pskManagers.has(row.id)) continue; // skip if already loaded (e.g. legacy)

            const pskBytes = row.initial_psk instanceof Uint8Array
                ? row.initial_psk
                : new Uint8Array(row.initial_psk as ArrayBuffer);

            // The PSKManager address is either the discovered mobile address or the contact ID
            const address = row.mobile_address ?? row.id;

            const mgr = new PSKManager(
                this.db, this.service,
                { address, psk: pskBytes, label: row.nickname },
                this.config.network,
                row.id,
            );
            this.pskManagers.set(row.id, mgr);

            if (row.mobile_address) {
                // Known mobile address: set up reverse lookup and poll by sender
                this.pskAddressToId.set(row.mobile_address, row.id);
                this.wirePskManagerCallbacks(mgr, row.id);
            }

            log.info(`PSK manager loaded for "${row.nickname}"`, { id: row.id, hasAddress: !!row.mobile_address });
        }
    }

    /** Set up the legacy single PSK contact from env config. */
    private setupLegacyPskContact(): void {
        const cfg = this.config.pskContact!;

        // Check if there's already a psk_contacts entry for this (migrated or manually created)
        const existing = this.db.prepare(
            "SELECT id FROM psk_contacts WHERE mobile_address = ? AND network = ? AND active = 1"
        ).get(cfg.address, this.config.network) as { id: string } | null;

        if (existing) {
            // Already in multi-contact system; skip legacy setup
            return;
        }

        const mgr = new PSKManager(this.db, this.service, cfg, this.config.network, `legacy-${cfg.address}`);
        const contactId = mgr.contactId;
        this.pskManagers.set(contactId, mgr);
        this.pskAddressToId.set(cfg.address, contactId);
        this.wirePskManagerCallbacks(mgr, contactId);

        log.info(`Legacy PSK manager initialized`, {
            label: cfg.label ?? null,
            address: cfg.address.slice(0, 8) + '...',
            contactId,
        });
    }

    /** Wire a PSKManager's onMessage callback to handleIncomingMessage. */
    private wirePskManagerCallbacks(mgr: PSKManager, _contactId: string): void {
        mgr.onMessage((msg) => {
            this.handleIncomingMessage(msg.sender, msg.content, msg.confirmedRound, msg.amount).catch((err) => {
                log.error('Error handling PSK message', { error: err instanceof Error ? err.message : String(err) });
            });
        });
    }

    /** Look up a PSKManager by participant address (for response routing). */
    private lookupPskManager(address: string): PSKManager | null {
        const contactId = this.pskAddressToId.get(address);
        if (!contactId) return null;
        return this.pskManagers.get(contactId) ?? null;
    }

    // ── Discovery poller: trial-decrypt for unmatched contacts ──────────

    /** Start the discovery poller that checks for PSK messages from unknown senders. */
    private startDiscoveryPoller(): void {
        // Only poll if there are unmatched contacts (no mobile_address)
        if (!this.hasUnmatchedContacts()) return;
        if (this.discoveryPollTimer) return;

        this.discoveryPollTimer = setInterval(() => {
            this.discoveryPoll().catch((err) => {
                log.error('Discovery poll error', { error: err instanceof Error ? err.message : String(err) });
            });
        }, this.config.syncInterval);

        // Run immediately
        this.discoveryPoll().catch((err) => {
            log.error('Initial discovery poll error', { error: err instanceof Error ? err.message : String(err) });
        });
    }

    private stopDiscoveryPoller(): void {
        if (this.discoveryPollTimer) {
            clearInterval(this.discoveryPollTimer);
            this.discoveryPollTimer = null;
        }
    }

    private hasUnmatchedContacts(): boolean {
        const row = this.db.prepare(
            'SELECT COUNT(*) as count FROM psk_contacts WHERE network = ? AND active = 1 AND mobile_address IS NULL'
        ).get(this.config.network) as { count: number };
        return row.count > 0;
    }

    /**
     * Discovery poll: look for payment transactions TO our address from unknown senders.
     * Trial-decrypt with each unmatched contact's PSK. On success, record the sender
     * as the contact's mobile_address and promote to a proper polling PSKManager.
     */
    private async discoveryPoll(): Promise<void> {
        const indexer = this.service.indexerClient;
        if (!indexer) return;

        // Get unmatched contacts
        const unmatched = this.db.prepare(
            'SELECT id, initial_psk, nickname FROM psk_contacts WHERE network = ? AND active = 1 AND mobile_address IS NULL'
        ).all(this.config.network) as Array<{ id: string; initial_psk: Uint8Array; nickname: string }>;

        if (unmatched.length === 0) {
            this.stopDiscoveryPoller();
            return;
        }

        const algochat = await import('@corvidlabs/ts-algochat');
        const myAddress = this.service.chatAccount.address;

        // On first poll, start from a recent window instead of scanning all history.
        // Fetch current round to establish a baseline.
        if (this.discoveryLastRound === 0) {
            try {
                const status = await this.service.algodClient.status().do();
                const currentRound = Number(status.lastRound ?? 0);
                // Look back ~5 minutes of blocks (~750 rounds at 0.4s/block)
                this.discoveryLastRound = Math.max(0, currentRound - 750);
                log.info('Discovery poller starting', { fromRound: this.discoveryLastRound, unmatchedContacts: unmatched.length });
            } catch (err) {
                log.error('Failed to get current round for discovery poller', { error: err instanceof Error ? err.message : String(err) });
                return;
            }
        }

        log.info('Discovery poll running', { minRound: this.discoveryLastRound + 1, unmatchedContacts: unmatched.length });

        let maxRound = this.discoveryLastRound;
        let nextToken: string | undefined;
        let totalTxns = 0;
        let pskCandidates = 0;

        // Track contacts matched and senders discovered during this poll
        // to avoid re-processing multiple old messages from the same sender.
        const matchedContactIds = new Set<string>();
        const discoveredSenders = new Set<string>();

        try {
            // Paginated loop to scan all new transactions since last poll
            do {
                let query = indexer
                    .searchForTransactions()
                    .address(myAddress)
                    .addressRole('receiver')
                    .minRound(this.discoveryLastRound + 1)
                    .limit(50);

                if (nextToken) {
                    query = query.nextToken(nextToken);
                }

                const response = await query.do() as unknown as {
                    transactions?: Array<{
                        id: string;
                        sender: string;
                        txType: string;
                        note?: string;
                        confirmedRound?: bigint;
                        paymentTransaction?: { receiver?: string; amount?: number | bigint };
                    }>;
                    'next-token'?: string;
                };

                const txns = response.transactions ?? [];
                nextToken = response['next-token'];
                totalTxns += txns.length;

                for (const tx of txns) {
                    const txRound = Number(tx.confirmedRound ?? 0);
                    if (txRound > maxRound) maxRound = txRound;

                    if (tx.txType !== 'pay') continue;
                    if (!tx.note) continue;
                    if (tx.paymentTransaction?.receiver !== myAddress) continue;

                    // Skip senders already discovered in this poll cycle
                    if (discoveredSenders.has(tx.sender)) continue;

                    // Skip senders already matched to a multi-contact entry
                    // (but NOT legacy-only entries — those may need migration)
                    const existingContactId = this.pskAddressToId.get(tx.sender);
                    if (existingContactId) {
                        const isMultiContact = this.db.prepare(
                            'SELECT id FROM psk_contacts WHERE id = ? AND mobile_address = ?'
                        ).get(existingContactId, tx.sender);
                        if (isMultiContact) continue;
                    }

                    const noteBytes = base64ToBytes(tx.note);
                    const isPsk = algochat.isPSKMessage(noteBytes);
                    if (!isPsk) continue;

                    pskCandidates++;

                    // Trial-decrypt with each unmatched contact
                    for (const contact of unmatched) {
                        if (matchedContactIds.has(contact.id)) continue;

                        try {
                            const envelope = algochat.decodePSKEnvelope(noteBytes);
                            const pskBytes = contact.initial_psk instanceof Uint8Array
                                ? contact.initial_psk
                                : new Uint8Array(contact.initial_psk as ArrayBuffer);
                            const currentPSK = algochat.derivePSKAtCounter(pskBytes, envelope.ratchetCounter);

                            const decrypted = algochat.decryptPSKMessage(
                                envelope,
                                this.service.chatAccount.encryptionKeys.privateKey,
                                this.service.chatAccount.encryptionKeys.publicKey,
                                currentPSK,
                            );

                            if (!decrypted) continue;

                            // Match found! Record the mobile address
                            log.info(`Discovered mobile address for "${contact.nickname}"`, {
                                contactId: contact.id,
                                mobileAddress: tx.sender.slice(0, 8) + '...',
                                txid: tx.id.slice(0, 12),
                                round: txRound,
                            });

                            matchedContactIds.add(contact.id);
                            discoveredSenders.add(tx.sender);

                            this.db.prepare(
                                "UPDATE psk_contacts SET mobile_address = ?, updated_at = datetime('now') WHERE id = ?"
                            ).run(tx.sender, contact.id);

                            // If this address was claimed by a legacy manager, stop it
                            // (the legacy PSK can't decrypt the new contact's messages)
                            const legacyContactId = this.pskAddressToId.get(tx.sender);
                            if (legacyContactId && legacyContactId !== contact.id) {
                                const legacyMgr = this.pskManagers.get(legacyContactId);
                                if (legacyMgr) {
                                    legacyMgr.stop();
                                    log.info(`Stopped legacy PSK manager`, {
                                        legacyContactId,
                                        replacedBy: contact.id,
                                    });
                                }
                                this.pskManagers.delete(legacyContactId);
                                this.pskAddressToId.delete(tx.sender);
                            }

                            // Stop the old manager keyed by contact ID (the unmatched one with UUID address)
                            const oldMgr = this.pskManagers.get(contact.id);
                            if (oldMgr) oldMgr.stop();

                            // Migrate algochat_psk_state from contact-id key to real address.
                            // Delete any existing row for the real address first (legacy manager
                            // may have created one with a different PSK).
                            this.db.prepare(
                                'DELETE FROM algochat_psk_state WHERE address = ? AND network = ?'
                            ).run(tx.sender, this.config.network);
                            this.db.prepare(
                                'UPDATE algochat_psk_state SET address = ? WHERE address = ? AND network = ?'
                            ).run(tx.sender, contact.id, this.config.network);

                            // Create fresh manager with real address
                            const mgr = new PSKManager(
                                this.db, this.service,
                                { address: tx.sender, psk: pskBytes, label: contact.nickname },
                                this.config.network,
                                contact.id,
                            );
                            this.pskManagers.set(contact.id, mgr);
                            this.pskAddressToId.set(tx.sender, contact.id);
                            this.wirePskManagerCallbacks(mgr, contact.id);
                            mgr.start(this.config.syncInterval);

                            // Route only the most recent message through the handler
                            // (this is the first match for this sender, older messages are skipped)
                            const txAmount = tx.paymentTransaction?.amount != null ? Number(tx.paymentTransaction.amount) : undefined;
                            this.handleIncomingMessage(tx.sender, decrypted.text, txRound, txAmount).catch((err) => {
                                log.error('Error handling discovered PSK message', { error: err instanceof Error ? err.message : String(err) });
                            });

                            break;
                        } catch {
                            // Decrypt failed — not this contact's PSK
                            continue;
                        }
                    }
                }
            } while (nextToken);
            log.info('Discovery poll complete', { totalTxns, pskCandidates, maxRound, prevRound: this.discoveryLastRound, discovered: discoveredSenders.size });
        } catch (err) {
            log.error('Discovery poll indexer error', { error: err instanceof Error ? err.message : String(err) });
        }

        // Advance the round cursor
        if (maxRound > this.discoveryLastRound) {
            this.discoveryLastRound = maxRound;
        }

        // If no unmatched contacts remain, stop the poller
        if (!this.hasUnmatchedContacts()) {
            this.stopDiscoveryPoller();
        }
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
                // Don't send "[Session completed]" on-chain — it wastes a
                // transaction fee and clutters the chat. The agent's actual
                // response is already delivered via the subscription manager.
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

        // Skip messages from known agents — handled by AgentMessenger
        if (this.agentDirectory) {
            const senderAgentId = this.agentDirectory.findAgentByAddress(participant);
            if (senderAgentId) {
                log.info('Agent-to-agent message — handled by AgentMessenger', { senderAgentId });
                return;
            }
        }

        // PSK contacts are implicitly authorized — the shared key is their credential
        const isPskContact = this.pskAddressToId.has(participant);
        const isOwner = isPskContact || this.commandHandler.isOwner(participant);

        // Non-owners are blocked unless guest access is enabled in the future.
        // For now, only owners can interact.
        if (!isOwner) {
            log.info('Ignoring message from non-owner address', { address: participant.slice(0, 8) + '...' });
            return;
        }

        // Emit feed event only for external (non-agent) messages
        this.responseFormatter.emitEvent(participant, messageContent, 'inbound', amount);

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
    }
}

/** Decode base64 string to Uint8Array (handles indexer note field encoding). */
function base64ToBytes(input: string | Uint8Array): Uint8Array {
    if (input instanceof Uint8Array) return input;
    const binary = atob(input);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

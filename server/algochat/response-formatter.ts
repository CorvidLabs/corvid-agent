/**
 * ResponseFormatter — Handles response sending routing (PSK, on-chain),
 * event emission, and message persistence for AlgoChat messages.
 *
 * On-chain transaction construction and submission is delegated to
 * OnChainTransactor; this class handles PSK routing, sender account
 * selection, event persistence, and dead-letter logging.
 */
import type { Database } from 'bun:sqlite';
import type { AlgoChatConfig } from './config';
import type { AlgoChatService } from './service';
import type { AgentWalletService } from './agent-wallet';
import type { PSKManager } from './psk';
import type { OnChainTransactor } from './on-chain-transactor';
import {
    getConversationByParticipant,
} from '../db/sessions';
import { checkAlgoLimit } from '../db/spending';
import { saveAlgoChatMessage } from '../db/algochat-messages';
import { createLogger } from '../lib/logger';

const log = createLogger('ResponseFormatter');

/**
 * Callback signature for AlgoChat feed events (UI, WS, etc.).
 */
export type AlgoChatEventCallback = (
    participant: string,
    content: string,
    direction: 'inbound' | 'outbound' | 'status',
    fee?: number,
) => void;

/**
 * Manages response serialization, on-chain delivery, and event emission.
 *
 * Responsibilities:
 * - Routing responses to PSK contacts or on-chain via OnChainTransactor
 * - Splitting oversized PSK payloads into sequential chunks
 * - Persisting messages to DB and emitting feed events
 * - Selecting sender account (per-agent wallet or main account)
 */
export class ResponseFormatter {
    private db: Database;
    private service: AlgoChatService;
    private agentWalletService: AgentWalletService | null = null;
    private transactor: OnChainTransactor | null = null;
    private pskManagerLookup: ((address: string) => PSKManager | null) | null = null;
    private eventCallbacks: Set<AlgoChatEventCallback> = new Set();

    constructor(
        db: Database,
        _config: AlgoChatConfig,
        service: AlgoChatService,
    ) {
        this.db = db;
        this.service = service;
    }

    /** Inject the optional agent wallet service for per-agent sending. */
    setAgentWalletService(service: AgentWalletService): void {
        this.agentWalletService = service;
    }

    /** Inject the OnChainTransactor for on-chain message delivery. */
    setOnChainTransactor(transactor: OnChainTransactor): void {
        this.transactor = transactor;
    }

    /** Inject a PSK manager lookup function for multi-contact PSK routing. */
    setPskManagerLookup(fn: (address: string) => PSKManager | null): void {
        this.pskManagerLookup = fn;
    }

    /** Register a callback for AlgoChat feed events. */
    onEvent(callback: AlgoChatEventCallback): void {
        this.eventCallbacks.add(callback);
    }

    /** Unregister a feed event callback. */
    offEvent(callback: AlgoChatEventCallback): void {
        this.eventCallbacks.delete(callback);
    }

    /**
     * Send a response message to a participant on-chain.
     *
     * Routing order:
     * 1. PSK contacts → PSKManager (chunked if needed)
     * 2. Per-agent wallet or main account → OnChainTransactor
     */
    async sendResponse(participant: string, content: string): Promise<void> {
        // Check daily ALGO spending limit (estimate min fee of 1000 microAlgos per txn)
        try {
            checkAlgoLimit(this.db, 1000);
        } catch (err) {
            const conversation = getConversationByParticipant(this.db, participant);
            log.warn(`On-chain response blocked by spending limit — dead letter`, {
                participant,
                conversationId: conversation?.id ?? null,
                sessionId: conversation?.sessionId ?? null,
                contentLength: content.length,
                contentPreview: content.slice(0, 200),
                error: err instanceof Error ? err.message : String(err),
            });
            return;
        }

        try {
            // Route PSK contacts through the correct PSK manager
            const pskManager = this.pskManagerLookup?.(participant);
            if (pskManager) {
                // PSK has an 878-byte payload limit per transaction.
                // Split oversized messages into sequential sends with a delay
                // between each so they land in different blocks (preserving order).
                const PSK_MAX_BYTES = 800;
                const PSK_INTER_CHUNK_DELAY_MS = 4500;
                const chunks = this.splitPskContent(content, PSK_MAX_BYTES);
                for (let i = 0; i < chunks.length; i++) {
                    if (i > 0) {
                        await new Promise((r) => setTimeout(r, PSK_INTER_CHUNK_DELAY_MS));
                    }
                    await pskManager.sendMessage(chunks[i]);
                }
                log.info(`Sent PSK response to ${participant}`, {
                    content: content.slice(0, 100),
                    chunks: chunks.length,
                });
                this.emitEvent(participant, content, 'outbound');
                return;
            }

            // Resolve sender account: per-agent wallet or main account
            let senderAccount = this.service.chatAccount;
            const conversation = getConversationByParticipant(this.db, participant);
            if (this.agentWalletService && conversation?.agentId) {
                const agentAccount = await this.agentWalletService.getAgentChatAccount(conversation.agentId);
                if (agentAccount) {
                    senderAccount = agentAccount.account;
                    log.debug(`Using agent wallet ${agentAccount.address} for response`);
                }
            }

            // Delegate on-chain send to OnChainTransactor
            if (this.transactor) {
                const sessionId = conversation?.sessionId ?? undefined;
                const result = await this.transactor.sendToAddress(
                    senderAccount,
                    participant,
                    content,
                    sessionId,
                );

                if (result) {
                    log.info(`Sent response to ${participant}`, { content: content.slice(0, 100), fee: result.fee });
                    this.emitEvent(participant, content, 'outbound', result.fee);
                } else {
                    log.warn('On-chain response send returned null (spending limit or service unavailable)', { participant });
                }
                return;
            }

            // Fallback: direct send if no transactor available (should not normally happen)
            log.warn('No OnChainTransactor available, attempting direct send');
            const pubKey = await this.service.algorandService.discoverPublicKey(participant);
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
            this.emitEvent(participant, content, 'outbound', fee);
        } catch (err) {
            // Dead-letter logging: capture full context for failed message sends
            // so they can be investigated and potentially retried.
            const conversation = getConversationByParticipant(this.db, participant);
            log.error('Failed to send response — dead letter', {
                participant,
                conversationId: conversation?.id ?? null,
                sessionId: conversation?.sessionId ?? null,
                agentId: conversation?.agentId ?? null,
                contentLength: content.length,
                contentPreview: content.slice(0, 200),
                error: err instanceof Error ? err.message : String(err),
                stack: err instanceof Error ? err.stack : undefined,
            });
        }
    }

    /**
     * Emit a feed event: persists to DB and notifies all registered callbacks.
     */
    emitEvent(
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
     * Split content into byte-limited chunks for PSK sends,
     * breaking at newlines when possible for readability.
     */
    splitPskContent(content: string, maxBytes: number): string[] {
        const encoder = new TextEncoder();
        if (encoder.encode(content).byteLength <= maxBytes) {
            return [content];
        }

        const chunks: string[] = [];
        let remaining = content;

        while (remaining.length > 0) {
            if (encoder.encode(remaining).byteLength <= maxBytes) {
                chunks.push(remaining);
                break;
            }

            // Binary search for the max character count that fits in maxBytes
            let low = 0;
            let high = remaining.length;
            while (low < high) {
                const mid = Math.floor((low + high + 1) / 2);
                if (encoder.encode(remaining.slice(0, mid)).byteLength <= maxBytes) {
                    low = mid;
                } else {
                    high = mid - 1;
                }
            }

            // Try to break at a newline within the last 20% for readability
            let cut = low;
            const searchStart = Math.floor(low * 0.8);
            const lastNewline = remaining.lastIndexOf('\n', low);
            if (lastNewline >= searchStart) {
                cut = lastNewline + 1;
            }

            chunks.push(remaining.slice(0, cut));
            remaining = remaining.slice(cut);
        }

        return chunks;
    }
}

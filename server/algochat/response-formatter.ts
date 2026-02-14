/**
 * ResponseFormatter — Handles on-chain and PSK response sending,
 * ALGO spending tracking, and event emission for AlgoChat messages.
 *
 * Extracted from bridge.ts to isolate message serialization, delivery,
 * and event persistence concerns.
 */
import type { Database } from 'bun:sqlite';
import type { AlgoChatConfig } from './config';
import type { AlgoChatService } from './service';
import type { AgentWalletService } from './agent-wallet';
import type { PSKManager } from './psk';
import {
    getConversationByParticipant,
} from '../db/sessions';
import { checkAlgoLimit, recordAlgoSpend } from '../db/spending';
import { updateSessionAlgoSpent } from '../db/sessions';
import { saveAlgoChatMessage } from '../db/algochat-messages';
import { createLogger } from '../lib/logger';

const log = createLogger('ResponseFormatter');

/** TTL for cached public keys. */
const PUBLIC_KEY_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Callback signature for AlgoChat feed events (UI, WS, etc.).
 */
export type AlgoChatEventCallback = (
    participant: string,
    content: string,
    direction: 'inbound' | 'outbound' | 'status',
    fee?: number,
) => void;

interface CachedPublicKey {
    key: Uint8Array;
    cachedAt: number;
}

/**
 * Manages response serialization, on-chain delivery, and event emission.
 *
 * Responsibilities:
 * - Sending messages on-chain (group txns, single txn fallback, PSK)
 * - Splitting oversized PSK payloads into sequential chunks
 * - Tracking ALGO spending and per-session costs
 * - Persisting messages to DB and emitting feed events
 * - Caching recipient public keys
 */
export class ResponseFormatter {
    private db: Database;
    private service: AlgoChatService;
    private agentWalletService: AgentWalletService | null = null;
    private pskManagerLookup: ((address: string) => PSKManager | null) | null = null;
    private eventCallbacks: Set<AlgoChatEventCallback> = new Set();
    private publicKeyCache: Map<string, CachedPublicKey> = new Map();

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
     * 2. Per-agent wallet → group transaction
     * 3. Main account → group transaction
     * 4. Fallback → single transaction (truncated)
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

    /**
     * Get (or cache) a recipient's public key for on-chain encryption.
     * Keys are cached for 1 hour.
     */
    async getPublicKey(address: string): Promise<Uint8Array> {
        const cached = this.publicKeyCache.get(address);
        if (cached && (Date.now() - cached.cachedAt) < PUBLIC_KEY_CACHE_TTL_MS) {
            return cached.key;
        }

        const pubKey = await this.service.algorandService.discoverPublicKey(address);
        this.publicKeyCache.set(address, { key: pubKey, cachedAt: Date.now() });
        return pubKey;
    }
}

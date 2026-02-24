/**
 * OnChainTransactor — Handles all Algorand on-chain transaction operations:
 * construction, signing, submission, spending tracking, and message condensation.
 *
 * Extracted from AgentMessenger and ResponseFormatter to isolate chain
 * interaction concerns from messaging orchestration.
 */
import type { Database } from 'bun:sqlite';
import type { ChatAccount } from '@corvidlabs/ts-algochat';
import type { AlgoChatService } from './service';
import type { AgentWalletService } from './agent-wallet';
import type { AgentDirectory } from './agent-directory';
import { checkAlgoLimit, recordAlgoSpend } from '../db/spending';
import { updateSessionAlgoSpent } from '../db/sessions';
import { createLogger } from '../lib/logger';
import { NotFoundError } from '../lib/errors';
import { getTraceId } from '../observability/trace-context';

const log = createLogger('OnChainTransactor');

/** TTL for cached public keys (1 hour). */
const PUBLIC_KEY_CACHE_TTL_MS = 60 * 60 * 1000;

interface CachedPublicKey {
    key: Uint8Array;
    cachedAt: number;
}

export interface SendMessageOptions {
    fromAgentId: string;
    toAgentId: string;
    content: string;
    paymentMicro: number;
    messageId?: string;
    sessionId?: string;
}

export interface SendMessageResult {
    txid: string | null;
    /** Whether the send was blocked by spending limits */
    blockedByLimit?: boolean;
    /** Error message if blocked */
    limitError?: string;
}

export interface SendToAddressOptions {
    senderAccount: ChatAccount;
    recipientAddress: string;
    recipientPublicKey: Uint8Array;
    content: string;
    paymentMicro?: number;
    sessionId?: string;
}

export class OnChainTransactor {
    private db: Database;
    private service: AlgoChatService | null;
    private agentWalletService: AgentWalletService;
    private agentDirectory: AgentDirectory;
    private publicKeyCache: Map<string, CachedPublicKey> = new Map();

    constructor(
        db: Database,
        service: AlgoChatService | null,
        agentWalletService: AgentWalletService,
        agentDirectory: AgentDirectory,
    ) {
        this.db = db;
        this.service = service;
        this.agentWalletService = agentWalletService;
        this.agentDirectory = agentDirectory;
    }

    /**
     * Send an on-chain message between two agents.
     *
     * Handles: spending limit checks, wallet resolution, public key discovery,
     * group transaction construction, and condense+single-txn fallback.
     */
    async sendMessage(opts: SendMessageOptions): Promise<SendMessageResult> {
        if (!this.service) return { txid: null };

        const { fromAgentId, toAgentId, content, paymentMicro, messageId, sessionId } = opts;

        // Include traceId in on-chain message payload for cross-agent correlation
        const currentTraceId = getTraceId();
        const sendContent = currentTraceId
            ? `[trace:${currentTraceId}]\n${content}`
            : content;

        // Check daily ALGO spending limit before sending
        if (paymentMicro > 0) {
            try {
                checkAlgoLimit(this.db, paymentMicro);
            } catch (err) {
                log.warn('On-chain send blocked by spending limit', {
                    fromAgentId,
                    toAgentId,
                    paymentMicro,
                    error: err instanceof Error ? err.message : String(err),
                });
                return {
                    txid: null,
                    blockedByLimit: true,
                    limitError: err instanceof Error ? err.message : String(err),
                };
            }
        }

        const fromAccount = await this.agentWalletService.getAgentChatAccount(fromAgentId);
        if (!fromAccount) {
            log.debug(`No wallet for agent ${fromAgentId}, skipping on-chain send`);
            return { txid: null };
        }

        const toEntry = await this.agentDirectory.resolve(toAgentId);
        if (!toEntry?.walletAddress) {
            log.debug(`No wallet address for agent ${toAgentId}, skipping on-chain send`);
            return { txid: null };
        }

        // Discover the target's public key for encryption
        let toPubKey: Uint8Array;
        try {
            toPubKey = await this.discoverPublicKey(toEntry.walletAddress);
        } catch {
            log.debug(`Could not discover public key for ${toEntry.walletAddress}`);
            return { txid: null };
        }

        return this.sendEncryptedMessage({
            senderAccount: fromAccount.account,
            recipientAddress: toEntry.walletAddress,
            recipientPublicKey: toPubKey,
            content: sendContent,
            paymentMicro,
            sessionId,
        }, messageId);
    }

    /**
     * Send an on-chain message from an agent to itself (for memory/audit storage).
     * Bypasses recipient resolution since we already have the agent's own keys.
     */
    async sendToSelf(agentId: string, content: string): Promise<string | null> {
        if (!this.service) return null;

        const account = await this.agentWalletService.getAgentChatAccount(agentId);
        if (!account) {
            log.debug(`No wallet for agent ${agentId}, skipping on-chain self-send`);
            return null;
        }

        // For self-sends we already have the encryption keys
        const pubKey = account.account.encryptionKeys.publicKey;

        try {
            const { sendGroupMessage } = await import('./group-sender');
            const result = await sendGroupMessage(
                this.service,
                account.account,
                account.address,
                pubKey,
                content,
            );
            log.info('On-chain self-send (memory)', { agentId, txid: result.primaryTxid, txids: result.txids.length });
            return result.primaryTxid;
        } catch {
            const { condenseMessage } = await import('./condenser');
            const { content: sendContent } = await condenseMessage(content, 800);
            const result = await this.service.algorandService.sendMessage(
                account.account,
                account.address,
                pubKey,
                sendContent,
            );
            log.info('On-chain self-send (memory, condensed fallback)', { agentId, txid: result.txid });
            return result.txid;
        }
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
        if (!this.service) return null;

        try {
            const fromAccount = await this.agentWalletService.getAgentChatAccount(fromAgentId);
            if (!fromAccount) return null;

            const toPubKey = await this.discoverPublicKey(toAddress);

            const { condenseMessage } = await import('./condenser');
            const { content: sendContent } = await condenseMessage(content, 800);

            const result = await this.service.algorandService.sendMessage(
                fromAccount.account,
                toAddress,
                toPubKey,
                sendContent,
            );

            return result.txid;
        } catch {
            return null;
        }
    }

    /** Best-effort on-chain message send. Returns txid or null. Never throws. */
    async sendBestEffort(
        fromAgentId: string,
        toAgentId: string,
        content: string,
        messageId?: string,
    ): Promise<string | null> {
        try {
            const result = await this.sendMessage({
                fromAgentId,
                toAgentId,
                content,
                paymentMicro: 0,
                messageId,
            });
            return result.txid;
        } catch {
            return null;
        }
    }

    /**
     * Send a message to an Algorand address using a specific sender account.
     * Used by ResponseFormatter for on-chain response delivery.
     *
     * Routing: group transaction first, single-txn fallback on failure.
     */
    async sendToAddress(
        senderAccount: ChatAccount,
        recipientAddress: string,
        content: string,
        sessionId?: string,
    ): Promise<{ txid: string; fee: number } | null> {
        if (!this.service) return null;

        // Check daily ALGO spending limit (estimate min fee)
        try {
            checkAlgoLimit(this.db, 1000);
        } catch {
            return null;
        }

        const pubKey = await this.discoverPublicKey(recipientAddress);

        // Try group transaction
        try {
            const { sendGroupMessage } = await import('./group-sender');
            const groupResult = await sendGroupMessage(
                this.service,
                senderAccount,
                recipientAddress,
                pubKey,
                content,
            );

            if (groupResult.fee) {
                recordAlgoSpend(this.db, groupResult.fee);
                if (sessionId) updateSessionAlgoSpent(this.db, sessionId, groupResult.fee);
            }

            return { txid: groupResult.primaryTxid, fee: groupResult.fee };
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
            recipientAddress,
            pubKey,
            sendContent,
        );

        const fee = (result as unknown as { fee?: number }).fee ?? 0;
        if (fee) {
            recordAlgoSpend(this.db, fee);
            if (sessionId) updateSessionAlgoSpent(this.db, sessionId, fee);
        }

        return { txid: result.txid, fee };
    }

    /**
     * Discover (or retrieve from cache) a recipient's public key for encryption.
     */
    async discoverPublicKey(address: string): Promise<Uint8Array> {
        const cached = this.publicKeyCache.get(address);
        if (cached && (Date.now() - cached.cachedAt) < PUBLIC_KEY_CACHE_TTL_MS) {
            return cached.key;
        }

        if (!this.service) throw new NotFoundError('AlgoChatService');

        const pubKey = await this.service.algorandService.discoverPublicKey(address);
        this.publicKeyCache.set(address, { key: pubKey, cachedAt: Date.now() });
        return pubKey;
    }

    /**
     * Internal: send an encrypted message with group txn / condense fallback.
     * Handles spending tracking.
     */
    private async sendEncryptedMessage(
        opts: SendToAddressOptions,
        messageId?: string,
    ): Promise<SendMessageResult> {
        const { senderAccount, recipientAddress, recipientPublicKey, content, sessionId } = opts;
        const paymentMicro = opts.paymentMicro ?? 0;

        try {
            const { sendGroupMessage } = await import('./group-sender');
            const result = await sendGroupMessage(
                this.service!,
                senderAccount,
                recipientAddress,
                recipientPublicKey,
                content,
                paymentMicro,
            );

            log.info('On-chain message sent', {
                from: senderAccount.address,
                to: recipientAddress,
                txid: result.primaryTxid,
                txids: result.txids.length,
                paymentMicro,
            });

            if (paymentMicro > 0) recordAlgoSpend(this.db, paymentMicro);
            const fee = result.fee ?? paymentMicro;
            if (fee > 0 && sessionId) updateSessionAlgoSpent(this.db, sessionId, fee);
            return { txid: result.primaryTxid };
        } catch (groupErr) {
            log.warn('Group send failed, falling back to condense+send', {
                error: groupErr instanceof Error ? groupErr.message : String(groupErr),
            });

            const { condenseMessage } = await import('./condenser');
            const { content: condensedContent } = await condenseMessage(content, 800, messageId);

            const sendOptions = paymentMicro > 0 ? { amount: paymentMicro } : undefined;
            const result = await this.service!.algorandService.sendMessage(
                senderAccount,
                recipientAddress,
                recipientPublicKey,
                condensedContent,
                sendOptions,
            );

            log.info('On-chain message sent (condensed fallback)', {
                from: senderAccount.address,
                to: recipientAddress,
                txid: result.txid,
                paymentMicro,
            });

            if (paymentMicro > 0) recordAlgoSpend(this.db, paymentMicro);
            const fallbackFee = (result as unknown as { fee?: number }).fee ?? paymentMicro;
            if (fallbackFee > 0 && sessionId) updateSessionAlgoSpent(this.db, sessionId, fallbackFee);
            return { txid: result.txid };
        }
    }
}

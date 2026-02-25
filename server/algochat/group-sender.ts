import type { ChatAccount } from '@corvidlabs/ts-algochat';
import { encryptMessage, encodeEnvelope, PROTOCOL } from '@corvidlabs/ts-algochat';
import type { AlgoChatService } from './service';
import { createLogger } from '../lib/logger';
import { ValidationError } from '../lib/errors';

const log = createLogger('GroupSender');

export interface GroupSendResult {
    /** First transaction ID (used as message reference) */
    primaryTxid: string;
    /** All transaction IDs in the group */
    txids: string[];
    /** Total fee across all transactions in microAlgos */
    fee: number;
}

/**
 * Estimate the max plaintext bytes per chunk after encryption overhead.
 *
 * The AlgoChat envelope header is 126 bytes + 16-byte auth tag,
 * and the Algorand note field is 1024 bytes max.
 * PROTOCOL.MAX_PAYLOAD_SIZE (882) is the ceiling for ciphertext,
 * but ciphertext = plaintext + 16 (tag).
 * So max plaintext per envelope = 882 - 16 = 866 bytes.
 *
 * We also need to reserve space for the [GRP:NN/MM] prefix
 * (up to 13 bytes for 2-digit indices) per chunk.
 */
const GROUP_PREFIX_MAX_BYTES = 13; // e.g. "[GRP:99/99]"

/**
 * Split a message into chunks that each fit in one envelope.
 * Each chunk is prefixed with `[GRP:index/total]` so the receiver can reassemble.
 * If the message fits in a single chunk, no prefix is added.
 *
 * @param maxPayload — max plaintext bytes per envelope (defaults to AlgoChat standard).
 */
export function splitMessage(content: string, maxPayload?: number): string[] {
    if (maxPayload !== undefined && maxPayload <= 0) {
        throw new ValidationError('maxPayload must be positive');
    }
    const singleMax = maxPayload ?? (PROTOCOL.MAX_PAYLOAD_SIZE - PROTOCOL.TAG_SIZE);
    const multiMax = (maxPayload ?? (PROTOCOL.MAX_PAYLOAD_SIZE - PROTOCOL.TAG_SIZE)) - GROUP_PREFIX_MAX_BYTES;

    const encoder = new TextEncoder();
    const contentBytes = encoder.encode(content).byteLength;

    // Single chunk — no prefix needed
    if (contentBytes <= singleMax) {
        return [content];
    }

    // Multi-chunk: split by byte length, respecting UTF-8 boundaries
    const chunks: string[] = [];
    let remaining = content;

    while (remaining.length > 0) {
        let chunk = remaining;
        const chunkBytes = encoder.encode(chunk).byteLength;

        // Binary search for the right cut point
        if (chunkBytes > multiMax) {
            let low = 0;
            let high = remaining.length;
            while (low < high) {
                const mid = Math.floor((low + high + 1) / 2);
                const candidateBytes = encoder.encode(remaining.slice(0, mid)).byteLength;
                if (candidateBytes <= multiMax) {
                    low = mid;
                } else {
                    high = mid - 1;
                }
            }
            chunk = remaining.slice(0, low);
        }

        chunks.push(chunk);
        remaining = remaining.slice(chunk.length);
    }

    // Apply group prefixes
    const total = chunks.length;
    return chunks.map((chunk, i) => `[GRP:${i + 1}/${total}]${chunk}`);
}

/**
 * Send a message on-chain, automatically splitting into an atomic group
 * transaction if the content exceeds the single-envelope limit.
 *
 * For single-chunk messages, delegates to the standard sendMessage().
 * For multi-chunk messages, encrypts each chunk, builds payment transactions,
 * groups them atomically with algosdk.assignGroupID(), signs, and submits.
 */
export async function sendGroupMessage(
    service: AlgoChatService,
    senderAccount: ChatAccount,
    recipientAddress: string,
    recipientPublicKey: Uint8Array,
    content: string,
    paymentMicro: number = 0,
): Promise<GroupSendResult> {
    const chunks = splitMessage(content);

    // Single chunk — use the standard path
    if (chunks.length === 1) {
        const sendOptions = paymentMicro > 0 ? { amount: paymentMicro } : undefined;
        const result = await service.algorandService.sendMessage(
            senderAccount,
            recipientAddress,
            recipientPublicKey,
            chunks[0],
            sendOptions,
        );
        return {
            primaryTxid: result.txid,
            txids: [result.txid],
            fee: (result as unknown as { fee?: number }).fee ?? 0,
        };
    }

    // Multi-chunk — build atomic group transaction
    log.info(`Splitting message into ${chunks.length} chunks for group transaction`, {
        originalBytes: new TextEncoder().encode(content).byteLength,
        chunks: chunks.length,
    });

    const algosdk = (await import('algosdk')).default;
    const params = await service.algodClient.getTransactionParams().do();

    // Send chunks in natural order (1/N, 2/N, ..., N/N).
    // The bridge reassembles by sorting on the [GRP:N/M] index regardless
    // of transmission order, and external clients vary in display order,
    // so natural order is the safest default.
    const orderedChunks = chunks;

    // Build one payment transaction per chunk
    const transactions: InstanceType<typeof algosdk.Transaction>[] = [];
    for (let i = 0; i < orderedChunks.length; i++) {
        const envelope = encryptMessage(
            orderedChunks[i],
            senderAccount.encryptionKeys.publicKey,
            recipientPublicKey,
        );
        const note = encodeEnvelope(envelope);

        // Only the first transaction carries the payment; others are 0-amount
        const amount = i === 0 ? (paymentMicro > 0 ? paymentMicro : PROTOCOL.MIN_PAYMENT) : PROTOCOL.MIN_PAYMENT;

        const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
            sender: senderAccount.address,
            receiver: recipientAddress,
            amount,
            note,
            suggestedParams: params,
        });
        transactions.push(txn);
    }

    // Assign group ID (makes them atomic)
    algosdk.assignGroupID(transactions);

    // Sign all transactions
    const signedTxns = transactions.map((txn) => txn.signTxn(senderAccount.account.sk));

    // Submit as a single batch
    const { txid } = await service.algodClient.sendRawTransaction(signedTxns).do();

    const txids = transactions.map((txn) => txn.txID());
    const totalFee = transactions.reduce((sum, txn) => sum + Number(txn.fee), 0);

    log.info(`Group transaction submitted`, {
        primaryTxid: txid,
        txids,
        totalFee,
        chunks: chunks.length,
    });

    return {
        primaryTxid: txid,
        txids,
        fee: totalFee,
    };
}

/**
 * Parse a `[GRP:N/M]` prefix from a decrypted message chunk.
 * Returns null if the message is not a group chunk.
 */
export function parseGroupPrefix(content: string): { index: number; total: number; body: string } | null {
    const match = content.match(/^\[GRP:(\d+)\/(\d+)\]/);
    if (!match) return null;
    return {
        index: parseInt(match[1], 10),
        total: parseInt(match[2], 10),
        body: content.slice(match[0].length),
    };
}

/**
 * Reassemble group message chunks into the original content.
 * Chunks should be in any order; they are sorted by index.
 * Returns null if the set is incomplete.
 */
export function reassembleGroupMessage(chunks: string[]): string | null {
    const parsed = chunks.map(parseGroupPrefix).filter((p) => p !== null);
    if (parsed.length === 0) return null;

    const total = parsed[0].total;
    if (parsed.length !== total) return null;

    // Sort by index and concatenate bodies
    parsed.sort((a, b) => a.index - b.index);

    // Verify indices are 1..total
    for (let i = 0; i < parsed.length; i++) {
        if (parsed[i].index !== i + 1) return null;
    }

    return parsed.map((p) => p.body).join('');
}

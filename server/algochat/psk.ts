import type { Database } from 'bun:sqlite';
import type { PSKContactConfig } from './config';
import type { AlgoChatService } from './service';
import type { PSKState } from '@corvidlabs/ts-algochat';
import type { AlgoChatNetwork } from '../../shared/types';
import { createLogger } from '../lib/logger';

const log = createLogger('PSK');

const MAX_PROCESSED_TXIDS = 1000;

export interface PSKMessage {
    sender: string;
    content: string;
    confirmedRound: number;
}

export type PSKMessageCallback = (message: PSKMessage) => void;

interface PSKContactEntry {
    address: string;
    initialPSK: Uint8Array;
    label: string;
    state: PSKState;
    lastRound: number;
}

interface PSKStateRow {
    address: string;
    network: string;
    initial_psk: Uint8Array;
    label: string;
    send_counter: number;
    peer_last_counter: number;
    seen_counters: string;
    last_round: number;
}

/** Indexer transaction shape (subset of fields we use) */
interface IndexerTransaction {
    id: string;
    sender: string;
    txType: string;
    note?: string;
    confirmedRound?: bigint;
    paymentTransaction?: { receiver?: string };
}

interface IndexerSearchResponse {
    transactions?: IndexerTransaction[];
    'next-token'?: string;
}

export class PSKManager {
    private db: Database;
    private service: AlgoChatService;
    private network: AlgoChatNetwork;
    private contact: PSKContactEntry;
    private pollTimer: ReturnType<typeof setInterval> | null = null;
    private callbacks: Set<PSKMessageCallback> = new Set();
    private processedTxids: Set<string> = new Set();
    /** Cached X25519 encryption public key of the contact, learned from received envelopes. */
    private contactEncryptionKey: Uint8Array | null = null;

    constructor(
        db: Database,
        service: AlgoChatService,
        pskConfig: PSKContactConfig,
        network: AlgoChatNetwork,
    ) {
        this.db = db;
        this.service = service;
        this.network = network;

        // Try to restore state from DB, otherwise create fresh
        const restored = this.loadState(pskConfig.address);
        if (restored) {
            this.contact = restored;
            log.info(
                `Restored state for ${pskConfig.label ?? pskConfig.address.slice(0, 8)}... on ${network}`,
                {
                    network,
                    sendCounter: restored.state.sendCounter,
                    peerLastCounter: restored.state.peerLastCounter,
                    lastRound: restored.lastRound,
                },
            );
        } else {
            this.contact = {
                address: pskConfig.address,
                initialPSK: pskConfig.psk,
                label: pskConfig.label ?? '',
                state: { sendCounter: 0, peerLastCounter: 0, seenCounters: new Set() },
                lastRound: 0,
            };
            this.saveState();
            log.info(`Initialized new contact: ${pskConfig.label ?? pskConfig.address.slice(0, 8)}... on ${network}`);
        }
    }

    get contactAddress(): string {
        return this.contact.address;
    }

    onMessage(callback: PSKMessageCallback): void {
        this.callbacks.add(callback);
    }

    offMessage(callback: PSKMessageCallback): void {
        this.callbacks.delete(callback);
    }

    start(intervalMs: number): void {
        if (this.pollTimer) return;

        this.pollTimer = setInterval(() => {
            this.poll().catch((err) => {
                log.error('Poll error', { error: err instanceof Error ? err.message : String(err) });
            });
        }, intervalMs);

        // Run first poll immediately
        this.poll().catch((err) => {
            log.error('Initial poll error', { error: err instanceof Error ? err.message : String(err) });
        });

        log.info(`Polling started`, { intervalMs });
    }

    stop(): void {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
        this.saveState();
        log.info('Stopped and persisted state');
    }

    async sendMessage(content: string): Promise<string> {
        const algochat = await import('@corvidlabs/ts-algochat');
        const algosdk = (await import('algosdk')).default;

        const chatAccount = this.service.chatAccount;

        // Advance send counter
        const { counter, state: newState } = algochat.advanceSendCounter(this.contact.state);
        this.contact.state = newState;

        // Derive PSK at current counter
        const currentPSK = algochat.derivePSKAtCounter(this.contact.initialPSK, counter);

        // Use cached encryption key from received envelopes, fall back to indexer discovery
        const recipientPubKey = this.contactEncryptionKey
            ?? await this.service.algorandService.discoverPublicKey(this.contact.address);

        // Encrypt
        const envelope = algochat.encryptPSKMessage(
            content,
            chatAccount.encryptionKeys.publicKey,
            recipientPubKey,
            currentPSK,
            counter,
        );

        // Encode to bytes
        const note = algochat.encodePSKEnvelope(envelope);

        // Build, sign, and submit transaction
        const params = await this.service.algodClient.getTransactionParams().do();
        const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
            sender: chatAccount.address,
            receiver: this.contact.address,
            amount: 1000, // 0.001 ALGO minimum
            note,
            suggestedParams: params,
        });

        const signedTxn = txn.signTxn(chatAccount.account.sk);
        const { txid } = await this.service.algodClient.sendRawTransaction(signedTxn).do();

        this.saveState();
        log.info(`Sent message to ${this.contact.label || this.contact.address.slice(0, 8)}...`, { txid, counter });

        return txid;
    }

    // -- Private --

    private async poll(): Promise<void> {
        const indexer = this.service.indexerClient;
        if (!indexer) {
            log.warn('No indexer client available, cannot poll');
            return;
        }

        const algochat = await import('@corvidlabs/ts-algochat');

        const chatAccount = this.service.chatAccount;
        const myAddress = chatAccount.address;
        const contactAddress = this.contact.address;

        let maxRound = this.contact.lastRound;
        let nextToken: string | undefined;

        // Paginated polling loop
        do {
            let query = indexer
                .searchForTransactions()
                .address(contactAddress)
                .addressRole('sender')
                .limit(50);

            if (this.contact.lastRound > 0) {
                query = query.minRound(this.contact.lastRound + 1);
            }

            if (nextToken) {
                query = query.nextToken(nextToken);
            }

            const response = (await query.do()) as unknown as IndexerSearchResponse;
            const txns = response.transactions ?? [];
            nextToken = response['next-token'];

            for (const tx of txns) {
                // Only payment transactions with notes, sent by the contact to us
                if (tx.txType !== 'pay' || !tx.note) continue;
                if (tx.sender !== contactAddress) continue;
                if (tx.paymentTransaction?.receiver !== myAddress) continue;

                // Deduplication check
                if (this.processedTxids.has(tx.id)) continue;

                const noteBytes = base64ToBytes(tx.note);

                // Check if this is a PSK message (protocol 0x02)
                if (!algochat.isPSKMessage(noteBytes)) continue;

                try {
                    const envelope = algochat.decodePSKEnvelope(noteBytes);

                    // Validate counter (replay protection)
                    if (!algochat.validateCounter(this.contact.state, envelope.ratchetCounter)) {
                        log.warn(`Rejected message with counter ${envelope.ratchetCounter} (replay or out of window)`);
                        continue;
                    }

                    // Derive PSK at this counter
                    const currentPSK = algochat.derivePSKAtCounter(this.contact.initialPSK, envelope.ratchetCounter);

                    // Decrypt
                    const decrypted = algochat.decryptPSKMessage(
                        envelope,
                        chatAccount.encryptionKeys.privateKey,
                        chatAccount.encryptionKeys.publicKey,
                        currentPSK,
                    );

                    if (!decrypted) {
                        log.warn(`Failed to decrypt message`, { txid: tx.id });
                        continue;
                    }

                    // Cache the contact's encryption public key from the envelope
                    if (!this.contactEncryptionKey && envelope.senderPublicKey) {
                        this.contactEncryptionKey = envelope.senderPublicKey;
                        log.info('Cached contact encryption key from received envelope');
                    }

                    // Record receive (update counter state)
                    this.contact.state = algochat.recordReceive(this.contact.state, envelope.ratchetCounter);

                    // Track processed txid
                    this.trackProcessedTxid(tx.id);

                    log.info(`Received from ${this.contact.label || contactAddress.slice(0, 8)}...`, {
                        text: decrypted.text.slice(0, 80),
                    });

                    // Emit to callbacks
                    const round = Number(tx.confirmedRound ?? 0);
                    const msg: PSKMessage = {
                        sender: contactAddress,
                        content: decrypted.text,
                        confirmedRound: round,
                    };

                    for (const cb of this.callbacks) {
                        try {
                            cb(msg);
                        } catch (err) {
                            log.error('Callback error', { error: err instanceof Error ? err.message : String(err) });
                        }
                    }
                } catch (err) {
                    log.error(`Error processing message`, { txid: tx.id, error: err instanceof Error ? err.message : String(err) });
                }

                const txRound = Number(tx.confirmedRound ?? 0);
                if (txRound > maxRound) {
                    maxRound = txRound;
                }
            }
        } while (nextToken);

        if (maxRound > this.contact.lastRound) {
            this.contact.lastRound = maxRound;
            this.saveState();
        }
    }

    private trackProcessedTxid(txid: string): void {
        this.processedTxids.add(txid);
        // Cap the set to prevent unbounded memory growth
        if (this.processedTxids.size > MAX_PROCESSED_TXIDS) {
            const iter = this.processedTxids.values();
            const oldest = iter.next().value;
            if (oldest) this.processedTxids.delete(oldest);
        }
    }

    // -- State persistence --

    private loadState(address: string): PSKContactEntry | null {
        const row = this.db.query(
            'SELECT * FROM algochat_psk_state WHERE address = ? AND network = ?',
        ).get(address, this.network) as PSKStateRow | null;

        if (!row) return null;

        const seenCounters: number[] = JSON.parse(row.seen_counters);

        return {
            address: row.address,
            initialPSK: row.initial_psk instanceof Uint8Array
                ? row.initial_psk
                : new Uint8Array(row.initial_psk as ArrayBuffer),
            label: row.label,
            state: {
                sendCounter: row.send_counter,
                peerLastCounter: row.peer_last_counter,
                seenCounters: new Set(seenCounters),
            },
            lastRound: row.last_round,
        };
    }

    private saveState(): void {
        const c = this.contact;
        const seenCountersJson = JSON.stringify([...c.state.seenCounters]);

        this.db.query(
            `INSERT INTO algochat_psk_state (address, network, initial_psk, label, send_counter, peer_last_counter, seen_counters, last_round, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, datetime('now'))
             ON CONFLICT(address, network) DO UPDATE SET
                send_counter = ?5,
                peer_last_counter = ?6,
                seen_counters = ?7,
                last_round = ?8,
                updated_at = datetime('now')`,
        ).run(
            c.address,
            this.network,
            c.initialPSK,
            c.label,
            c.state.sendCounter,
            c.state.peerLastCounter,
            seenCountersJson,
            c.lastRound,
        );
    }
}

/** Decode base64 string to Uint8Array (handles indexer note field encoding) */
function base64ToBytes(input: string | Uint8Array): Uint8Array {
    if (input instanceof Uint8Array) return input;
    const binary = atob(input);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

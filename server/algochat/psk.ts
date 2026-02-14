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
    amount?: number;
}

export type PSKMessageCallback = (message: PSKMessage) => void;

export interface PSKContactEntry {
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
    paymentTransaction?: { receiver?: string; amount?: number | bigint };
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
    private pollIntervalMs: number = 0;
    private callbacks: Set<PSKMessageCallback> = new Set();
    private processedTxids: Set<string> = new Set();
    /** Cached X25519 encryption public key of the contact, learned from received envelopes. */
    private contactEncryptionKey: Uint8Array | null = null;
    /** Unique contact ID (psk_contacts.id). Used to key multi-contact maps in bridge. */
    readonly contactId: string;

    constructor(
        db: Database,
        service: AlgoChatService,
        pskConfig: PSKContactConfig,
        network: AlgoChatNetwork,
        contactId?: string,
    ) {
        this.db = db;
        this.service = service;
        this.network = network;
        this.contactId = contactId ?? pskConfig.address;

        // Try to restore ratchet state from DB, otherwise create fresh.
        // Always use the PSK from pskConfig (authoritative source — psk_contacts
        // or env config). The DB state row may have a stale PSK from a legacy
        // manager that previously occupied the same address.
        const restored = this.loadState(pskConfig.address);
        if (restored) {
            this.contact = restored;
            // Override the PSK with the authoritative value from the caller
            this.contact.initialPSK = pskConfig.psk;
            const pskFp = Array.from(pskConfig.psk.slice(0, 8)).map((b: number) => b.toString(16).padStart(2, '0')).join('');
            log.info(
                `Restored state for ${pskConfig.label ?? pskConfig.address.slice(0, 8)}... on ${network}`,
                {
                    network,
                    pskFp,
                    pskLen: pskConfig.psk.length,
                    sendCounter: restored.state.sendCounter,
                    peerLastCounter: restored.state.peerLastCounter,
                    lastRound: restored.lastRound,
                },
            );
            this.saveState(); // persist the correct PSK to DB
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

    get psk(): Uint8Array {
        return this.contact.initialPSK;
    }

    onMessage(callback: PSKMessageCallback): void {
        this.callbacks.add(callback);
    }

    offMessage(callback: PSKMessageCallback): void {
        this.callbacks.delete(callback);
    }

    start(intervalMs: number): void {
        if (this.pollTimer) return;
        this.pollIntervalMs = intervalMs;

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

    /**
     * Reset the contact's PSK and all ratchet state.
     * Called when a new PSK exchange URI is generated (QR code regeneration).
     * Restarts polling automatically if it was running.
     */
    resetWithNewPSK(newPSK: Uint8Array): void {
        const wasPolling = this.pollTimer !== null;
        const interval = this.pollIntervalMs;

        if (wasPolling) {
            clearInterval(this.pollTimer!);
            this.pollTimer = null;
        }

        this.contact.initialPSK = newPSK;
        this.contact.state = { sendCounter: 0, peerLastCounter: 0, seenCounters: new Set() };
        this.contact.lastRound = 0;
        this.contactEncryptionKey = null;
        this.processedTxids.clear();
        this.saveState();

        const pskFp = Array.from(newPSK.slice(0, 8)).map((b: number) => b.toString(16).padStart(2, '0')).join('');
        log.info(`Reset PSK for ${this.contact.label || this.contact.address.slice(0, 8)}...`, { pskFp, pskLen: newPSK.length });

        if (wasPolling && interval > 0) {
            this.start(interval);
        }
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

                // Always advance maxRound for PSK messages so lastRound
                // advances past them and they aren't re-fetched every poll.
                const txRound = Number(tx.confirmedRound ?? 0);
                if (txRound > maxRound) {
                    maxRound = txRound;
                }

                try {
                    const envelope = algochat.decodePSKEnvelope(noteBytes);

                    // Validate counter (replay protection).
                    // Multi-device support: when multiple devices share the same
                    // wallet and PSK, they maintain independent send counters.
                    // A "duplicate" counter from a new txid is a different device,
                    // not a replay. We rely on txid dedup (processedTxids) for
                    // true replay protection instead of counter-only validation.
                    if (!algochat.validateCounter(this.contact.state, envelope.ratchetCounter)) {
                        if (this.contact.state.seenCounters.has(envelope.ratchetCounter)) {
                            // Counter already seen — but if the txid is new, it's
                            // a different device sending with the same counter.
                            // Accept it (txid dedup prevents true replays).
                            log.info(`Counter ${envelope.ratchetCounter} reused from new txid (multi-device)`, { txid: tx.id.slice(0, 12) });
                        } else {
                            // Counter is out of window — auto-resync peerLastCounter.
                            // This handles cases where the peer's send counter drifted
                            // (e.g. same wallet on different device, app reinstall, etc.)
                            log.info(`Counter ${envelope.ratchetCounter} out of window (peerLast=${this.contact.state.peerLastCounter}), resyncing`);
                            this.contact.state = {
                                ...this.contact.state,
                                peerLastCounter: envelope.ratchetCounter,
                                seenCounters: new Set<number>(),
                            };
                        }
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
                        this.trackProcessedTxid(tx.id);
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
                    const txAmount = tx.paymentTransaction?.amount != null ? Number(tx.paymentTransaction.amount) : undefined;
                    const msg: PSKMessage = {
                        sender: contactAddress,
                        content: decrypted.text,
                        confirmedRound: txRound,
                        amount: txAmount,
                    };

                    for (const cb of this.callbacks) {
                        try {
                            cb(msg);
                        } catch (err) {
                            log.error('Callback error', { error: err instanceof Error ? err.message : String(err) });
                        }
                    }
                } catch (err) {
                    // Track failed decryptions too — retrying won't help since the ciphertext won't change.
                    // After resetWithNewPSK, processedTxids is cleared so old messages get a fresh attempt.
                    this.trackProcessedTxid(tx.id);
                    log.error(`Error processing message`, { txid: tx.id, error: err instanceof Error ? err.message : String(err) });
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
                initial_psk = ?3,
                label = ?4,
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

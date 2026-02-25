/**
 * PSKDiscoveryPoller — Trial-decrypt discovery polling for unmatched PSK contacts.
 *
 * Extracted from AlgoChatBridge. Polls transactions TO our address from unknown
 * senders, trial-decrypts with each unmatched contact's PSK, and promotes
 * matched contacts via PSKContactManager.
 *
 * @module
 */
import type { Database } from 'bun:sqlite';
import type { AlgoChatConfig } from './config';
import type { AlgoChatService } from './service';
import type { PSKContactManager } from './psk-contact-manager';
import { createLogger } from '../lib/logger';

const log = createLogger('PSKDiscoveryPoller');

export class PSKDiscoveryPoller {
    private db: Database;
    private config: AlgoChatConfig;
    private service: AlgoChatService;
    private contactManager: PSKContactManager;

    private discoveryPollTimer: ReturnType<typeof setInterval> | null = null;
    private discoveryLastRound: number = 0;

    /** Callback invoked when a first message is discovered for a newly matched contact. */
    private onFirstMessage: ((sender: string, text: string, round: number, amount?: number) => void) | null = null;

    constructor(
        db: Database,
        config: AlgoChatConfig,
        service: AlgoChatService,
        contactManager: PSKContactManager,
    ) {
        this.db = db;
        this.config = config;
        this.service = service;
        this.contactManager = contactManager;
    }

    /** Set callback for first-message routing after discovery. */
    setOnFirstMessage(callback: (sender: string, text: string, round: number, amount?: number) => void): void {
        this.onFirstMessage = callback;
    }

    /** Start the discovery poller if there are unmatched contacts. */
    start(): void {
        if (!this.contactManager.hasUnmatchedContacts()) return;
        if (this.discoveryPollTimer) return;

        this.discoveryPollTimer = setInterval(() => {
            this.poll().catch((err) => {
                log.error('Discovery poll error', { error: err instanceof Error ? err.message : String(err) });
            });
        }, this.config.syncInterval);

        // Run immediately
        this.poll().catch((err) => {
            log.error('Initial discovery poll error', { error: err instanceof Error ? err.message : String(err) });
        });
    }

    /** Stop the discovery poller. */
    stop(): void {
        if (this.discoveryPollTimer) {
            clearInterval(this.discoveryPollTimer);
            this.discoveryPollTimer = null;
        }
    }

    /**
     * Discovery poll: look for payment transactions TO our address from unknown senders.
     * Trial-decrypt with each unmatched contact's PSK. On success, record the sender
     * as the contact's mobile_address and promote to a proper polling PSKManager.
     */
    private async poll(): Promise<void> {
        const indexer = this.service.indexerClient;
        if (!indexer) return;

        // Get unmatched contacts
        const unmatched = this.db.prepare(
            'SELECT id, initial_psk, nickname FROM psk_contacts WHERE network = ? AND active = 1 AND mobile_address IS NULL'
        ).all(this.config.network) as Array<{ id: string; initial_psk: Uint8Array; nickname: string }>;

        if (unmatched.length === 0) {
            this.stop();
            return;
        }

        const algochat = await import('@corvidlabs/ts-algochat');
        const myAddress = this.service.chatAccount.address;

        // On first poll, start from a recent window instead of scanning all history.
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
        const matchedContactIds = new Set<string>();
        const discoveredSenders = new Set<string>();

        try {
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

                            this.contactManager.promoteContact(
                                contact.id,
                                tx.sender,
                                pskBytes,
                                contact.nickname,
                                this.config.syncInterval,
                            );

                            // Route the first message through the handler
                            const txAmount = tx.paymentTransaction?.amount != null ? Number(tx.paymentTransaction.amount) : undefined;
                            if (this.onFirstMessage) {
                                this.onFirstMessage(tx.sender, decrypted.text, txRound, txAmount);
                            }

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
        if (!this.contactManager.hasUnmatchedContacts()) {
            this.stop();
        }
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

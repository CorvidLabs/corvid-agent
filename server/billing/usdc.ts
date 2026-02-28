/**
 * USDC Deposit Watcher — monitors an Algorand wallet for incoming USDC
 * ASA transfers and converts them to credits.
 *
 * Polls the Algorand indexer at a configurable interval (default 30s).
 * Tracks the last-processed round to avoid re-processing.
 * Idempotent: skips already-recorded transaction IDs.
 */

import type { Database } from 'bun:sqlite';
import { depositUsdc } from '../db/credits';
import { createLogger } from '../lib/logger';

const log = createLogger('UsdcWatcher');

// Mainnet USDC ASA ID
const MAINNET_USDC_ASA_ID = 31566704;

export interface UsdcWatcherConfig {
    /** The Algorand wallet address to watch for incoming USDC. */
    walletAddress: string;
    /** USDC ASA ID (mainnet: 31566704, testnet: from env). */
    asaId: number;
    /** Indexer base URL (e.g., https://mainnet-idx.4160.nodely.dev). */
    indexerBaseUrl: string;
    /** Indexer auth token (if needed). */
    indexerToken?: string;
    /** Polling interval in ms (default: 30000). */
    pollIntervalMs?: number;
    /** Database for recording deposits. */
    db: Database;
}

interface IndexerTransaction {
    id: string;
    'confirmed-round': number;
    'round-time': number;
    'asset-transfer-transaction'?: {
        amount: number;
        'asset-id': number;
        receiver: string;
        sender: string;
    };
}

interface IndexerResponse {
    transactions: IndexerTransaction[];
    'next-token'?: string;
}

export class UsdcWatcher {
    private config: UsdcWatcherConfig;
    private pollTimer: ReturnType<typeof setInterval> | null = null;
    private lastRound = 0;
    private running = false;

    constructor(config: UsdcWatcherConfig) {
        this.config = config;
    }

    /**
     * Start polling for USDC deposits.
     */
    start(): void {
        if (this.running) return;
        this.running = true;

        const intervalMs = this.config.pollIntervalMs ?? 30_000;
        log.info('USDC watcher started', {
            wallet: this.config.walletAddress.slice(0, 8) + '...',
            asaId: this.config.asaId,
            interval: `${intervalMs / 1000}s`,
        });

        // Initial poll
        this.poll().catch(err => {
            log.error('Initial USDC poll failed', { error: err instanceof Error ? err.message : String(err) });
        });

        this.pollTimer = setInterval(() => {
            this.poll().catch(err => {
                log.error('USDC poll failed', { error: err instanceof Error ? err.message : String(err) });
            });
        }, intervalMs);

        if (this.pollTimer && typeof this.pollTimer === 'object' && 'unref' in this.pollTimer) {
            (this.pollTimer as NodeJS.Timeout).unref();
        }
    }

    /**
     * Stop polling.
     */
    stop(): void {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
        this.running = false;
        log.info('USDC watcher stopped');
    }

    /**
     * Poll the indexer for new USDC deposits.
     */
    async poll(): Promise<number> {
        const { walletAddress, asaId, indexerBaseUrl, indexerToken } = this.config;

        // Query indexer for ASA transfers to our wallet
        let url = `${indexerBaseUrl}/v2/accounts/${walletAddress}/transactions?asset-id=${asaId}&tx-type=axfer&limit=50`;
        if (this.lastRound > 0) {
            url += `&min-round=${this.lastRound + 1}`;
        }

        const headers: Record<string, string> = {};
        if (indexerToken) {
            headers['X-Indexer-API-Token'] = indexerToken;
        }

        const response = await fetch(url, { headers });
        if (!response.ok) {
            log.warn('Indexer request failed', { status: response.status, url });
            return 0;
        }

        const data = await response.json() as IndexerResponse;
        const transactions = data.transactions ?? [];

        let processed = 0;
        for (const tx of transactions) {
            const transfer = tx['asset-transfer-transaction'];
            if (!transfer) continue;

            // Only process incoming transfers to our wallet
            if (transfer.receiver !== walletAddress) continue;
            if (transfer['asset-id'] !== asaId) continue;
            if (transfer.amount <= 0) continue;

            // USDC has 6 decimals, transfer.amount is in micro-units
            const added = depositUsdc(this.config.db, walletAddress, transfer.amount, tx.id);
            if (added > 0) {
                processed++;
                log.info('USDC deposit detected', {
                    txid: tx.id,
                    from: transfer.sender.slice(0, 8) + '...',
                    amount: transfer.amount / 1_000_000,
                    creditsAdded: added,
                    round: tx['confirmed-round'],
                });
            }

            // Track last processed round
            if (tx['confirmed-round'] > this.lastRound) {
                this.lastRound = tx['confirmed-round'];
            }
        }

        if (processed > 0) {
            log.info('USDC deposits processed', { count: processed, lastRound: this.lastRound });
        }

        return processed;
    }
}

/**
 * Create a USDC watcher from environment configuration.
 * Returns null if required configuration is missing.
 */
export function createUsdcWatcher(db: Database, walletAddress?: string): UsdcWatcher | null {
    const address = walletAddress ?? process.env.USDC_WATCH_ADDRESS;
    if (!address) {
        log.debug('USDC watcher not configured: no wallet address');
        return null;
    }

    const network = process.env.ALGORAND_NETWORK ?? 'localnet';
    const asaId = parseInt(process.env.USDC_ASA_ID ?? '', 10);

    // Determine ASA ID based on network
    let resolvedAsaId: number;
    if (Number.isFinite(asaId) && asaId > 0) {
        resolvedAsaId = asaId;
    } else if (network === 'mainnet') {
        resolvedAsaId = MAINNET_USDC_ASA_ID;
    } else {
        log.debug('USDC watcher not configured: no USDC_ASA_ID for non-mainnet');
        return null;
    }

    // Determine indexer URL
    const indexerBaseUrl = process.env.USDC_INDEXER_URL
        ?? process.env.LOCALNET_INDEXER_URL
        ?? (network === 'testnet' ? 'https://testnet-idx.4160.nodely.dev' : null)
        ?? (network === 'mainnet' ? 'https://mainnet-idx.4160.nodely.dev' : null);

    if (!indexerBaseUrl) {
        log.debug('USDC watcher not configured: no indexer URL');
        return null;
    }

    const pollIntervalMs = parseInt(process.env.USDC_POLL_INTERVAL_MS ?? '30000', 10);

    return new UsdcWatcher({
        walletAddress: address,
        asaId: resolvedAsaId,
        indexerBaseUrl,
        indexerToken: process.env.USDC_INDEXER_TOKEN,
        pollIntervalMs: Number.isFinite(pollIntervalMs) ? pollIntervalMs : 30_000,
        db,
    });
}

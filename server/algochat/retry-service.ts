import type { Database } from 'bun:sqlite';
import { createLogger } from '../lib/logger';

const log = createLogger('AlgoRetryService');

export interface RetryConfig {
    /** Maximum number of retry attempts */
    maxRetries: number;
    /** Base delay between retries in milliseconds */
    baseDelayMs: number;
    /** Multiplier for exponential backoff */
    backoffMultiplier: number;
    /** Maximum delay between retries */
    maxDelayMs: number;
    /** Timeout for confirmation checks */
    confirmationTimeoutMs: number;
}

export interface PendingTransaction {
    id: string;
    txid: string;
    agentId: string;
    operation: 'send_message' | 'publish_key' | 'fund_wallet';
    payload: any;
    retryCount: number;
    nextRetryAt: number;
    createdAt: number;
    lastError?: string;
}

export type TransactionStatus = 'pending' | 'confirmed' | 'failed' | 'expired';

export interface RetryResult {
    success: boolean;
    txid?: string;
    error?: string;
    status: TransactionStatus;
}

const DEFAULT_CONFIG: RetryConfig = {
    maxRetries: 3,
    baseDelayMs: 5000, // 5 seconds
    backoffMultiplier: 2,
    maxDelayMs: 60000, // 1 minute max delay
    confirmationTimeoutMs: 30000, // 30 seconds to confirm
};

/**
 * Retry service for Algorand transactions
 * Handles failed transactions with exponential backoff and confirmation tracking
 */
export class AlgoRetryService {
    private db: Database;
    private config: RetryConfig;
    private retryTimer: ReturnType<typeof setInterval> | null = null;
    private pendingTxs: Map<string, PendingTransaction> = new Map();

    constructor(db: Database, config: Partial<RetryConfig> = {}) {
        this.db = db;
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.setupDatabase();
        // Load pending transactions BEFORE starting the retry loop to avoid
        // a race where the loop processes an empty map on first tick.
        this.loadPendingTransactions();
        this.startRetryLoop();
    }

    private setupDatabase(): void {
        try {
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS pending_transactions (
                    id TEXT PRIMARY KEY,
                    txid TEXT NOT NULL,
                    agent_id TEXT NOT NULL,
                    operation TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    retry_count INTEGER DEFAULT 0,
                    next_retry_at INTEGER NOT NULL,
                    created_at INTEGER NOT NULL,
                    last_error TEXT,
                    status TEXT DEFAULT 'pending'
                );

                CREATE INDEX IF NOT EXISTS idx_pending_txs_next_retry
                ON pending_transactions(next_retry_at);

                CREATE INDEX IF NOT EXISTS idx_pending_txs_status
                ON pending_transactions(status);

                CREATE INDEX IF NOT EXISTS idx_pending_txs_agent
                ON pending_transactions(agent_id);
            `);

            log.info('Retry service database tables initialized');
        } catch (error) {
            log.error('Failed to setup retry service tables', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    private loadPendingTransactions(): void {
        try {
            const stmt = this.db.prepare(`
                SELECT id, txid, agent_id, operation, payload, retry_count,
                       next_retry_at, created_at, last_error
                FROM pending_transactions
                WHERE status = 'pending'
            `);
            const rows = stmt.all() as any[];

            for (const row of rows) {
                const tx: PendingTransaction = {
                    id: row.id,
                    txid: row.txid,
                    agentId: row.agent_id,
                    operation: row.operation,
                    payload: JSON.parse(row.payload),
                    retryCount: row.retry_count,
                    nextRetryAt: row.next_retry_at,
                    createdAt: row.created_at,
                    lastError: row.last_error,
                };

                this.pendingTxs.set(tx.id, tx);
            }

            log.info('Loaded pending transactions', { count: rows.length });
        } catch (error) {
            log.error('Failed to load pending transactions', {
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    /**
     * Submit a transaction for retry handling
     */
    async submitTransaction(
        agentId: string,
        operation: 'send_message' | 'publish_key' | 'fund_wallet',
        txid: string,
        payload: any
    ): Promise<string> {
        const id = crypto.randomUUID();
        const now = Date.now();

        const tx: PendingTransaction = {
            id,
            txid,
            agentId,
            operation,
            payload,
            retryCount: 0,
            nextRetryAt: now + this.config.confirmationTimeoutMs,
            createdAt: now,
        };

        // Store in memory and database
        this.pendingTxs.set(id, tx);
        this.savePendingTransaction(tx);

        log.info('Transaction submitted for retry tracking', {
            id,
            txid,
            agentId,
            operation
        });

        // Try to confirm immediately
        setTimeout(() => this.processTransaction(id), 1000);

        return id;
    }

    /**
     * Check if a transaction has been confirmed on the Algorand blockchain.
     *
     * TODO: Integrate with actual algod client. The implementation should:
     *   const txInfo = await this.algodClient.pendingTransactionInformation(txid).do();
     *   if (txInfo['confirmed-round'] > 0) return 'confirmed';
     *   if (txInfo['pool-error']) return 'failed';
     *   return 'pending';
     *
     * For now, this is a stub that always returns 'pending' so the retry
     * loop will attempt resubmission up to maxRetries. This is safer than
     * the previous random simulation which could falsely mark txns as confirmed.
     */
    async checkTransactionStatus(txid: string): Promise<TransactionStatus> {
        try {
            log.debug('Transaction status check (stub — always pending until algod integrated)', { txid });
            return 'pending';
        } catch (error) {
            log.warn('Failed to check transaction status', {
                txid,
                error: error instanceof Error ? error.message : String(error)
            });
            return 'failed';
        }
    }

    /**
     * Process a specific transaction (check status and retry if needed)
     */
    private async processTransaction(id: string): Promise<void> {
        const tx = this.pendingTxs.get(id);
        if (!tx) {
            log.warn('Transaction not found for processing', { id });
            return;
        }

        const now = Date.now();

        // Skip if not yet time for retry
        if (now < tx.nextRetryAt) {
            return;
        }

        try {
            // Check transaction status
            const status = await this.checkTransactionStatus(tx.txid);

            if (status === 'confirmed') {
                await this.markTransactionCompleted(id, 'confirmed');
                log.info('Transaction confirmed', { id, txid: tx.txid });
                return;
            }

            if (status === 'failed' || tx.retryCount >= this.config.maxRetries) {
                // Transaction failed or max retries exceeded
                const finalStatus = tx.retryCount >= this.config.maxRetries ? 'expired' : 'failed';
                await this.markTransactionCompleted(id, finalStatus);

                log.warn('Transaction failed or expired', {
                    id,
                    txid: tx.txid,
                    status: finalStatus,
                    retryCount: tx.retryCount,
                    maxRetries: this.config.maxRetries
                });

                return;
            }

            // Transaction is still pending - retry if not at max attempts
            if (tx.retryCount < this.config.maxRetries) {
                await this.retryTransaction(tx);
            } else {
                await this.markTransactionCompleted(id, 'expired');
                log.warn('Transaction expired after max retries', {
                    id,
                    txid: tx.txid,
                    retryCount: tx.retryCount
                });
            }

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            tx.lastError = errorMsg;

            log.error('Error processing transaction', {
                id,
                txid: tx.txid,
                error: errorMsg
            });

            // Schedule next retry with backoff
            tx.retryCount++;
            tx.nextRetryAt = now + this.calculateBackoffDelay(tx.retryCount);
            this.savePendingTransaction(tx);
        }
    }

    /**
     * Retry a failed transaction
     */
    private async retryTransaction(tx: PendingTransaction): Promise<void> {
        log.info('Retrying transaction', {
            id: tx.id,
            txid: tx.txid,
            operation: tx.operation,
            retryCount: tx.retryCount + 1,
            maxRetries: this.config.maxRetries
        });

        try {
            // Recreate the transaction based on operation type
            const newTxid = await this.resubmitTransaction(tx);

            if (newTxid) {
                // Update transaction with new txid
                tx.txid = newTxid;
                tx.retryCount++;
                tx.nextRetryAt = Date.now() + this.config.confirmationTimeoutMs;
                tx.lastError = undefined;

                this.savePendingTransaction(tx);

                log.info('Transaction resubmitted', {
                    id: tx.id,
                    oldTxid: tx.txid,
                    newTxid,
                    retryCount: tx.retryCount
                });
            } else {
                throw new Error('Failed to resubmit transaction');
            }

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            tx.lastError = errorMsg;
            tx.retryCount++;
            tx.nextRetryAt = Date.now() + this.calculateBackoffDelay(tx.retryCount);

            this.savePendingTransaction(tx);

            log.error('Failed to retry transaction', {
                id: tx.id,
                txid: tx.txid,
                error: errorMsg,
                retryCount: tx.retryCount
            });
        }
    }

    /**
     * Resubmit a transaction based on its operation type
     */
    private async resubmitTransaction(tx: PendingTransaction): Promise<string | null> {
        switch (tx.operation) {
            case 'send_message':
                return this.resubmitMessageTransaction(tx);
            case 'publish_key':
                return this.resubmitKeyPublication(tx);
            case 'fund_wallet':
                return this.resubmitWalletFunding(tx);
            default:
                throw new Error(`Unknown operation type: ${tx.operation}`);
        }
    }

    private async resubmitMessageTransaction(tx: PendingTransaction): Promise<string | null> {
        // TODO: Integrate with actual AlgoChat message sending.
        // This should call back into the AlgoChat bridge to resend the message
        // using tx.payload as the message content.
        log.warn('resubmitMessageTransaction stub — not yet integrated with AlgoChat bridge', { id: tx.id });
        return null; // Return null to indicate resubmission not available yet
    }

    private async resubmitKeyPublication(tx: PendingTransaction): Promise<string | null> {
        // TODO: Integrate with key publication service
        log.warn('resubmitKeyPublication stub — not yet integrated', { id: tx.id });
        return null;
    }

    private async resubmitWalletFunding(tx: PendingTransaction): Promise<string | null> {
        // TODO: Integrate with wallet funding service
        log.warn('resubmitWalletFunding stub — not yet integrated', { id: tx.id });
        return null;
    }

    /**
     * Mark a transaction as completed (confirmed, failed, or expired)
     */
    private async markTransactionCompleted(id: string, status: TransactionStatus): Promise<void> {
        try {
            const stmt = this.db.prepare(`
                UPDATE pending_transactions
                SET status = ?
                WHERE id = ?
            `);
            stmt.run(status, id);

            // Remove from memory
            this.pendingTxs.delete(id);

            log.debug('Transaction marked as completed', { id, status });
        } catch (error) {
            log.error('Failed to mark transaction as completed', {
                id,
                status,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    /**
     * Save pending transaction to database
     */
    private savePendingTransaction(tx: PendingTransaction): void {
        try {
            const stmt = this.db.prepare(`
                INSERT INTO pending_transactions (
                    id, txid, agent_id, operation, payload, retry_count,
                    next_retry_at, created_at, last_error, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
                ON CONFLICT(id) DO UPDATE SET
                    txid = excluded.txid,
                    retry_count = excluded.retry_count,
                    next_retry_at = excluded.next_retry_at,
                    last_error = excluded.last_error
            `);

            stmt.run(
                tx.id,
                tx.txid,
                tx.agentId,
                tx.operation,
                JSON.stringify(tx.payload),
                tx.retryCount,
                tx.nextRetryAt,
                tx.createdAt,
                tx.lastError || null
            );
        } catch (error) {
            log.error('Failed to save pending transaction', {
                id: tx.id,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    /**
     * Calculate exponential backoff delay
     */
    private calculateBackoffDelay(retryCount: number): number {
        const delay = this.config.baseDelayMs * Math.pow(this.config.backoffMultiplier, retryCount - 1);
        return Math.min(delay, this.config.maxDelayMs);
    }

    /**
     * Start the retry processing loop
     */
    private startRetryLoop(): void {
        // Process pending transactions every 10 seconds
        this.retryTimer = setInterval(() => {
            this.processAllPendingTransactions();
        }, 10000);

        log.info('Retry processing loop started');
    }

    /**
     * Process all pending transactions that are ready for retry
     */
    private async processAllPendingTransactions(): Promise<void> {
        const now = Date.now();
        const readyTxs = Array.from(this.pendingTxs.values())
            .filter(tx => tx.nextRetryAt <= now)
            .slice(0, 10); // Process max 10 at a time to avoid overload

        if (readyTxs.length > 0) {
            log.debug('Processing ready transactions', { count: readyTxs.length });

            for (const tx of readyTxs) {
                await this.processTransaction(tx.id);
            }
        }
    }

    /**
     * Get retry statistics
     */
    getRetryStats(): {
        pendingCount: number;
        totalRetries: number;
        avgRetryCount: number;
    } {
        const pending = Array.from(this.pendingTxs.values());
        const totalRetries = pending.reduce((sum, tx) => sum + tx.retryCount, 0);

        return {
            pendingCount: pending.length,
            totalRetries,
            avgRetryCount: pending.length > 0 ? totalRetries / pending.length : 0
        };
    }

    /**
     * Get status of a specific transaction
     */
    getTransactionInfo(id: string): PendingTransaction | null {
        return this.pendingTxs.get(id) || null;
    }

    /**
     * Clean up old completed/failed transactions
     */
    cleanup(): void {
        try {
            // Remove transactions older than 24 hours
            const cutoff = Date.now() - (24 * 60 * 60 * 1000);

            const stmt = this.db.prepare(`
                DELETE FROM pending_transactions
                WHERE status != 'pending' AND created_at < ?
            `);
            const result = stmt.run(cutoff);

            if (result.changes > 0) {
                log.info('Cleaned up old transaction records', { deleted: result.changes });
            }
        } catch (error) {
            log.warn('Failed to cleanup old transactions', {
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    /**
     * Stop the retry service
     */
    stop(): void {
        if (this.retryTimer) {
            clearInterval(this.retryTimer);
            this.retryTimer = null;
        }

        log.info('Retry service stopped');
    }
}
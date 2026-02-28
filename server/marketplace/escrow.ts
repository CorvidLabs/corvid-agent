/**
 * EscrowService — Marketplace escrow for credit-based transactions.
 *
 * State machine:
 *   FUNDED → DELIVERED → RELEASED
 *                     ↘ (auto-release after 72h)
 *            FUNDED → DISPUTED → RESOLVED | REFUNDED
 *
 * Credits are debited from the buyer on fund and held in escrow.
 * On release, credits are transferred to the seller.
 * On refund, credits are returned to the buyer.
 */
import type { Database } from 'bun:sqlite';
import { getBalance } from '../db/credits';
import { recordAudit } from '../db/audit';
import { createLogger } from '../lib/logger';

const log = createLogger('Escrow');

// ─── Types ───────────────────────────────────────────────────────────────────

export type EscrowState =
    | 'FUNDED'
    | 'DELIVERED'
    | 'RELEASED'
    | 'DISPUTED'
    | 'RESOLVED'
    | 'REFUNDED';

export interface EscrowTransaction {
    id: string;
    listingId: string;
    buyerTenantId: string;
    sellerTenantId: string;
    amountCredits: number;
    state: EscrowState;
    createdAt: string;
    deliveredAt: string | null;
    releasedAt: string | null;
    disputedAt: string | null;
    resolvedAt: string | null;
}

interface EscrowRecord {
    id: string;
    listing_id: string;
    buyer_tenant_id: string;
    seller_tenant_id: string;
    amount_credits: number;
    state: string;
    created_at: string;
    delivered_at: string | null;
    released_at: string | null;
    disputed_at: string | null;
    resolved_at: string | null;
}

/** Auto-release window in hours */
const AUTO_RELEASE_HOURS = 72;

// ─── Service ─────────────────────────────────────────────────────────────────

export class EscrowService {
    private db: Database;

    constructor(db: Database) {
        this.db = db;
    }

    /**
     * Create a funded escrow — debits credits from buyer's balance.
     * Returns null if buyer has insufficient funds.
     */
    fund(
        listingId: string,
        buyerTenantId: string,
        sellerTenantId: string,
        amountCredits: number,
    ): EscrowTransaction | null {
        const balance = getBalance(this.db, buyerTenantId);
        if (balance.available < amountCredits) {
            log.warn('Escrow fund failed: insufficient credits', {
                buyer: buyerTenantId,
                available: balance.available,
                required: amountCredits,
            });
            return null;
        }

        const id = crypto.randomUUID();

        const create = this.db.transaction(() => {
            // Debit buyer
            this.db.query(`
                UPDATE credit_ledger
                SET credits = credits - ?,
                    total_consumed = total_consumed + ?,
                    updated_at = datetime('now')
                WHERE wallet_address = ?
            `).run(amountCredits, amountCredits, buyerTenantId);

            // Record transaction
            const newBalance = getBalance(this.db, buyerTenantId);
            this.db.query(`
                INSERT INTO credit_transactions
                    (wallet_address, type, amount, balance_after, reference)
                VALUES (?, 'deduction', ?, ?, ?)
            `).run(buyerTenantId, amountCredits, newBalance.credits, `escrow:${id}`);

            // Create escrow record
            this.db.query(`
                INSERT INTO escrow_transactions
                    (id, listing_id, buyer_tenant_id, seller_tenant_id, amount_credits, state)
                VALUES (?, ?, ?, ?, ?, 'FUNDED')
            `).run(id, listingId, buyerTenantId, sellerTenantId, amountCredits);
        });

        create();

        recordAudit(this.db, 'credit_deduction', buyerTenantId, 'escrow_transactions', id,
            `Escrow funded: ${amountCredits} credits for listing ${listingId}`);

        log.info('Escrow funded', { id, listingId, buyer: buyerTenantId, amount: amountCredits });
        return this.getTransaction(id)!;
    }

    /**
     * Mark escrow as delivered (seller signals work is done).
     */
    markDelivered(escrowId: string, sellerTenantId: string): EscrowTransaction | null {
        const tx = this.getTransaction(escrowId);
        if (!tx) return null;
        if (tx.sellerTenantId !== sellerTenantId) return null;

        return this.transition(escrowId, 'DELIVERED', 'delivered_at');
    }

    /**
     * Release escrow — transfers credits to seller.
     * Can be called by buyer (explicit) or automatically (72h timeout).
     */
    release(escrowId: string): EscrowTransaction | null {
        const tx = this.getTransaction(escrowId);
        if (!tx) return null;
        if (tx.state !== 'DELIVERED') return null;

        const doRelease = this.db.transaction(() => {
            // Ensure seller ledger row exists, then credit seller
            this.db.query(`
                INSERT OR IGNORE INTO credit_ledger
                    (wallet_address, credits, reserved, total_purchased, total_consumed)
                VALUES (?, 0, 0, 0, 0)
            `).run(tx.sellerTenantId);

            this.db.query(`
                UPDATE credit_ledger
                SET credits = credits + ?,
                    updated_at = datetime('now')
                WHERE wallet_address = ?
            `).run(tx.amountCredits, tx.sellerTenantId);

            const sellerBalance = getBalance(this.db, tx.sellerTenantId);
            this.db.query(`
                INSERT INTO credit_transactions
                    (wallet_address, type, amount, balance_after, reference)
                VALUES (?, 'grant', ?, ?, ?)
            `).run(tx.sellerTenantId, tx.amountCredits, sellerBalance.credits, `escrow_release:${escrowId}`);

            // Update escrow state
            this.db.query(`
                UPDATE escrow_transactions
                SET state = 'RELEASED', released_at = datetime('now')
                WHERE id = ?
            `).run(escrowId);
        });

        doRelease();

        recordAudit(this.db, 'credit_grant', 'system', 'escrow_transactions', escrowId,
            `Escrow released: ${tx.amountCredits} credits to ${tx.sellerTenantId}`);

        log.info('Escrow released', { id: escrowId, seller: tx.sellerTenantId, amount: tx.amountCredits });
        return this.getTransaction(escrowId);
    }

    /**
     * Raise a dispute on an escrow (buyer disputes within 72h of delivery).
     */
    dispute(escrowId: string, buyerTenantId: string): EscrowTransaction | null {
        const tx = this.getTransaction(escrowId);
        if (!tx) return null;
        if (tx.buyerTenantId !== buyerTenantId) return null;
        if (tx.state !== 'FUNDED' && tx.state !== 'DELIVERED') return null;

        return this.transition(escrowId, 'DISPUTED', 'disputed_at');
    }

    /**
     * Resolve a dispute in seller's favor — release credits to seller.
     */
    resolveForSeller(escrowId: string): EscrowTransaction | null {
        const tx = this.getTransaction(escrowId);
        if (!tx || tx.state !== 'DISPUTED') return null;

        // Credit seller (same as release flow)
        const doResolve = this.db.transaction(() => {
            this.db.query(`
                INSERT OR IGNORE INTO credit_ledger
                    (wallet_address, credits, reserved, total_purchased, total_consumed)
                VALUES (?, 0, 0, 0, 0)
            `).run(tx.sellerTenantId);

            this.db.query(`
                UPDATE credit_ledger
                SET credits = credits + ?,
                    updated_at = datetime('now')
                WHERE wallet_address = ?
            `).run(tx.amountCredits, tx.sellerTenantId);

            const sellerBalance = getBalance(this.db, tx.sellerTenantId);
            this.db.query(`
                INSERT INTO credit_transactions
                    (wallet_address, type, amount, balance_after, reference)
                VALUES (?, 'grant', ?, ?, ?)
            `).run(tx.sellerTenantId, tx.amountCredits, sellerBalance.credits, `escrow_resolved:${escrowId}`);

            this.db.query(`
                UPDATE escrow_transactions
                SET state = 'RESOLVED', resolved_at = datetime('now')
                WHERE id = ?
            `).run(escrowId);
        });

        doResolve();

        recordAudit(this.db, 'credit_grant', 'system', 'escrow_transactions', escrowId,
            `Dispute resolved for seller: ${tx.amountCredits} credits to ${tx.sellerTenantId}`);

        log.info('Dispute resolved for seller', { id: escrowId });
        return this.getTransaction(escrowId);
    }

    /**
     * Refund a disputed escrow — return credits to buyer.
     */
    refund(escrowId: string): EscrowTransaction | null {
        const tx = this.getTransaction(escrowId);
        if (!tx || tx.state !== 'DISPUTED') return null;

        const doRefund = this.db.transaction(() => {
            // Credit buyer back
            this.db.query(`
                UPDATE credit_ledger
                SET credits = credits + ?,
                    updated_at = datetime('now')
                WHERE wallet_address = ?
            `).run(tx.amountCredits, tx.buyerTenantId);

            const buyerBalance = getBalance(this.db, tx.buyerTenantId);
            this.db.query(`
                INSERT INTO credit_transactions
                    (wallet_address, type, amount, balance_after, reference)
                VALUES (?, 'refund', ?, ?, ?)
            `).run(tx.buyerTenantId, tx.amountCredits, buyerBalance.credits, `escrow_refund:${escrowId}`);

            this.db.query(`
                UPDATE escrow_transactions
                SET state = 'REFUNDED', resolved_at = datetime('now')
                WHERE id = ?
            `).run(escrowId);
        });

        doRefund();

        recordAudit(this.db, 'credit_deduction', 'system', 'escrow_transactions', escrowId,
            `Escrow refunded: ${tx.amountCredits} credits to ${tx.buyerTenantId}`);

        log.info('Escrow refunded', { id: escrowId, buyer: tx.buyerTenantId, amount: tx.amountCredits });
        return this.getTransaction(escrowId);
    }

    /**
     * Process auto-releases for delivered escrows past the 72h window.
     * Call this at query time or periodically.
     */
    processAutoReleases(): EscrowTransaction[] {
        const candidates = this.db.query(`
            SELECT * FROM escrow_transactions
            WHERE state = 'DELIVERED'
              AND delivered_at IS NOT NULL
              AND datetime(delivered_at, '+${AUTO_RELEASE_HOURS} hours') <= datetime('now')
        `).all() as EscrowRecord[];

        const released: EscrowTransaction[] = [];
        for (const row of candidates) {
            const result = this.release(row.id);
            if (result) {
                log.info('Auto-released escrow', { id: row.id });
                released.push(result);
            }
        }
        return released;
    }

    /**
     * Get a single escrow transaction.
     */
    getTransaction(id: string): EscrowTransaction | null {
        // Check for auto-release eligibility on read
        const row = this.db.query(
            'SELECT * FROM escrow_transactions WHERE id = ?',
        ).get(id) as EscrowRecord | null;

        if (!row) return null;
        return recordToTransaction(row);
    }

    /**
     * Get all escrow transactions for a buyer.
     */
    getByBuyer(buyerTenantId: string): EscrowTransaction[] {
        const rows = this.db.query(
            'SELECT * FROM escrow_transactions WHERE buyer_tenant_id = ? ORDER BY created_at DESC',
        ).all(buyerTenantId) as EscrowRecord[];

        return rows.map(recordToTransaction);
    }

    /**
     * Get all escrow transactions for a seller.
     */
    getBySeller(sellerTenantId: string): EscrowTransaction[] {
        const rows = this.db.query(
            'SELECT * FROM escrow_transactions WHERE seller_tenant_id = ? ORDER BY created_at DESC',
        ).all(sellerTenantId) as EscrowRecord[];

        return rows.map(recordToTransaction);
    }

    // ─── Private ─────────────────────────────────────────────────────────

    private transition(
        escrowId: string,
        newState: EscrowState,
        timestampColumn: string,
    ): EscrowTransaction | null {
        this.db.query(`
            UPDATE escrow_transactions
            SET state = ?, ${timestampColumn} = datetime('now')
            WHERE id = ?
        `).run(newState, escrowId);

        log.info('Escrow state transition', { id: escrowId, newState });
        return this.getTransaction(escrowId);
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function recordToTransaction(row: EscrowRecord): EscrowTransaction {
    return {
        id: row.id,
        listingId: row.listing_id,
        buyerTenantId: row.buyer_tenant_id,
        sellerTenantId: row.seller_tenant_id,
        amountCredits: row.amount_credits,
        state: row.state as EscrowState,
        createdAt: row.created_at,
        deliveredAt: row.delivered_at,
        releasedAt: row.released_at,
        disputedAt: row.disputed_at,
        resolvedAt: row.resolved_at,
    };
}

export { AUTO_RELEASE_HOURS };

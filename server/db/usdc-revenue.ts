/**
 * CRUD operations for the agent_usdc_revenue table.
 * Tracks USDC received by agent wallets and forwarding status.
 */

import type { Database } from 'bun:sqlite';

export interface UsdcRevenueRow {
    id: number;
    agent_id: string;
    amount_micro: number;
    from_address: string;
    txid: string;
    forward_txid: string | null;
    forward_status: string;
    created_at: string;
}

export interface UsdcRevenueSummary {
    totalEarnedMicro: number;
    totalForwardedMicro: number;
    pendingMicro: number;
    entryCount: number;
}

/**
 * Record an incoming USDC payment to an agent's wallet.
 * Returns true if inserted, false if txid already exists (idempotent).
 */
export function recordRevenue(
    db: Database,
    agentId: string,
    amountMicro: number,
    fromAddress: string,
    txid: string,
): boolean {
    try {
        db.query(
            `INSERT INTO agent_usdc_revenue (agent_id, amount_micro, from_address, txid)
             VALUES (?, ?, ?, ?)`,
        ).run(agentId, amountMicro, fromAddress, txid);
        return true;
    } catch (err) {
        // UNIQUE constraint on txid — already recorded
        if (err instanceof Error && err.message.includes('UNIQUE')) return false;
        throw err;
    }
}

/**
 * Mark a revenue entry as forwarded with the forward transaction ID.
 */
export function markForwarded(
    db: Database,
    revenueId: number,
    forwardTxid: string,
): void {
    db.query(
        `UPDATE agent_usdc_revenue SET forward_txid = ?, forward_status = 'forwarded' WHERE id = ?`,
    ).run(forwardTxid, revenueId);
}

/**
 * Mark a revenue entry as failed forwarding.
 */
export function markForwardFailed(
    db: Database,
    revenueId: number,
): void {
    db.query(
        `UPDATE agent_usdc_revenue SET forward_status = 'failed' WHERE id = ?`,
    ).run(revenueId);
}

/**
 * Get all pending revenue entries (not yet forwarded).
 */
export function getPendingRevenue(db: Database): UsdcRevenueRow[] {
    return db.query(
        `SELECT * FROM agent_usdc_revenue WHERE forward_status = 'pending' ORDER BY created_at ASC`,
    ).all() as UsdcRevenueRow[];
}

/**
 * Get revenue entries for a specific agent.
 */
export function getAgentRevenue(db: Database, agentId: string): UsdcRevenueRow[] {
    return db.query(
        `SELECT * FROM agent_usdc_revenue WHERE agent_id = ? ORDER BY created_at DESC`,
    ).all(agentId) as UsdcRevenueRow[];
}

/**
 * Get a summary of an agent's revenue.
 */
export function getAgentRevenueSummary(db: Database, agentId: string): UsdcRevenueSummary {
    const row = db.query(`
        SELECT
            COALESCE(SUM(amount_micro), 0) as total_earned,
            COALESCE(SUM(CASE WHEN forward_status = 'forwarded' THEN amount_micro ELSE 0 END), 0) as total_forwarded,
            COALESCE(SUM(CASE WHEN forward_status = 'pending' THEN amount_micro ELSE 0 END), 0) as pending,
            COUNT(*) as entry_count
        FROM agent_usdc_revenue WHERE agent_id = ?
    `).get(agentId) as { total_earned: number; total_forwarded: number; pending: number; entry_count: number } | null;

    return {
        totalEarnedMicro: row?.total_earned ?? 0,
        totalForwardedMicro: row?.total_forwarded ?? 0,
        pendingMicro: row?.pending ?? 0,
        entryCount: row?.entry_count ?? 0,
    };
}

import type { Database } from 'bun:sqlite';
import { createLogger } from '../lib/logger';

const log = createLogger('CreditManager');

// ─── Types ────────────────────────────────────────────────────────────────

export interface CreditBalance {
    walletAddress: string;
    credits: number;
    reserved: number;
    available: number; // credits - reserved
    totalPurchased: number;
    totalConsumed: number;
}

export type CreditTransactionType =
    | 'purchase'        // ALGO payment → credits
    | 'deduction'       // Per-turn deduction
    | 'agent_message'   // Agent-to-agent message cost
    | 'reserve'         // Reserved for group messages
    | 'release'         // Released from reserve
    | 'grant'           // Free credits (first message, admin grant)
    | 'refund';         // Refund (session error, etc.)

export interface CreditTransaction {
    id: number;
    walletAddress: string;
    type: CreditTransactionType;
    amount: number;
    balanceAfter: number;
    reference: string | null;
    txid: string | null;
    sessionId: string | null;
    createdAt: string;
}

export interface CreditConfig {
    creditsPerAlgo: number;
    lowCreditThreshold: number;
    reservePerGroupMessage: number;
    creditsPerTurn: number;
    creditsPerAgentMessage: number;
    freeCreditsOnFirstMessage: number;
}

// ─── Config helpers ───────────────────────────────────────────────────────

export function getCreditConfig(db: Database): CreditConfig {
    const rows = db.query('SELECT key, value FROM credit_config').all() as { key: string; value: string }[];
    const map = new Map(rows.map((r) => [r.key, r.value]));
    return {
        creditsPerAlgo: parseInt(map.get('credits_per_algo') ?? '1000', 10),
        lowCreditThreshold: parseInt(map.get('low_credit_threshold') ?? '50', 10),
        reservePerGroupMessage: parseInt(map.get('reserve_per_group_message') ?? '10', 10),
        creditsPerTurn: parseInt(map.get('credits_per_turn') ?? '1', 10),
        creditsPerAgentMessage: parseInt(map.get('credits_per_agent_message') ?? '5', 10),
        freeCreditsOnFirstMessage: parseInt(map.get('free_credits_on_first_message') ?? '100', 10),
    };
}

/**
 * Initialize credit config from environment variables (if set).
 * Call on server startup after migrations.
 */
export function initCreditConfigFromEnv(db: Database): void {
    const envMappings: [string, string][] = [
        ['CREDITS_PER_ALGO', 'credits_per_algo'],
        ['LOW_CREDIT_THRESHOLD', 'low_credit_threshold'],
        ['RESERVE_PER_GROUP_MESSAGE', 'reserve_per_group_message'],
        ['CREDITS_PER_TURN', 'credits_per_turn'],
        ['CREDITS_PER_AGENT_MESSAGE', 'credits_per_agent_message'],
        ['FREE_CREDITS_ON_FIRST_MESSAGE', 'free_credits_on_first_message'],
    ];

    for (const [envKey, configKey] of envMappings) {
        const value = process.env[envKey];
        if (value !== undefined) {
            updateCreditConfig(db, configKey, value);
            log.debug(`Credit config from env: ${configKey} = ${value}`);
        }
    }
}

export function updateCreditConfig(db: Database, key: string, value: string): void {
    db.query(
        `INSERT INTO credit_config (key, value, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')`
    ).run(key, value, value);
}

// ─── Balance operations ───────────────────────────────────────────────────

function ensureLedgerRow(db: Database, walletAddress: string): void {
    db.query(
        `INSERT OR IGNORE INTO credit_ledger (wallet_address, credits, reserved, total_purchased, total_consumed)
         VALUES (?, 0, 0, 0, 0)`
    ).run(walletAddress);
}

export function getBalance(db: Database, walletAddress: string): CreditBalance {
    ensureLedgerRow(db, walletAddress);
    const row = db.query(
        `SELECT wallet_address, credits, reserved, total_purchased, total_consumed
         FROM credit_ledger WHERE wallet_address = ?`
    ).get(walletAddress) as {
        wallet_address: string;
        credits: number;
        reserved: number;
        total_purchased: number;
        total_consumed: number;
    };
    return {
        walletAddress: row.wallet_address,
        credits: row.credits,
        reserved: row.reserved,
        available: row.credits - row.reserved,
        totalPurchased: row.total_purchased,
        totalConsumed: row.total_consumed,
    };
}

function recordTransaction(
    db: Database,
    walletAddress: string,
    type: CreditTransactionType,
    amount: number,
    balanceAfter: number,
    reference?: string | null,
    txid?: string | null,
    sessionId?: string | null,
): void {
    db.query(
        `INSERT INTO credit_transactions (wallet_address, type, amount, balance_after, reference, txid, session_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(walletAddress, type, amount, balanceAfter, reference ?? null, txid ?? null, sessionId ?? null);
}

// ─── Credit operations ────────────────────────────────────────────────────

/**
 * Add credits from an ALGO payment.
 * @param microAlgos The amount paid in microALGOs
 * @returns The number of credits added
 */
export function purchaseCredits(
    db: Database,
    walletAddress: string,
    microAlgos: number,
    txid?: string,
): number {
    const config = getCreditConfig(db);
    // Convert microALGOs to ALGO, then multiply by rate
    const algoAmount = microAlgos / 1_000_000;
    const creditsToAdd = Math.floor(algoAmount * config.creditsPerAlgo);

    if (creditsToAdd <= 0) {
        log.debug('Payment too small for credits', { walletAddress, microAlgos });
        return 0;
    }

    ensureLedgerRow(db, walletAddress);

    db.query(
        `UPDATE credit_ledger
         SET credits = credits + ?,
             total_purchased = total_purchased + ?,
             updated_at = datetime('now')
         WHERE wallet_address = ?`
    ).run(creditsToAdd, creditsToAdd, walletAddress);

    const balance = getBalance(db, walletAddress);
    recordTransaction(db, walletAddress, 'purchase', creditsToAdd, balance.credits, `${algoAmount} ALGO`, txid);

    log.info(`Credits purchased`, {
        walletAddress: walletAddress.slice(0, 8) + '...',
        microAlgos,
        creditsAdded: creditsToAdd,
        newBalance: balance.credits,
    });

    return creditsToAdd;
}

/**
 * Grant free credits (e.g., first-time user bonus).
 */
export function grantCredits(
    db: Database,
    walletAddress: string,
    amount: number,
    reference?: string,
): void {
    ensureLedgerRow(db, walletAddress);

    db.query(
        `UPDATE credit_ledger
         SET credits = credits + ?,
             total_purchased = total_purchased + ?,
             updated_at = datetime('now')
         WHERE wallet_address = ?`
    ).run(amount, amount, walletAddress);

    const balance = getBalance(db, walletAddress);
    recordTransaction(db, walletAddress, 'grant', amount, balance.credits, reference);

    log.info(`Credits granted`, { walletAddress: walletAddress.slice(0, 8) + '...', amount, reference });
}

/**
 * Deduct credits for a conversation turn.
 * @returns Object with success status and remaining balance info.
 */
export function deductTurnCredits(
    db: Database,
    walletAddress: string,
    sessionId?: string,
): { success: boolean; creditsRemaining: number; isLow: boolean; isExhausted: boolean } {
    const config = getCreditConfig(db);
    const balance = getBalance(db, walletAddress);

    if (balance.available < config.creditsPerTurn) {
        return {
            success: false,
            creditsRemaining: balance.available,
            isLow: true,
            isExhausted: true,
        };
    }

    db.query(
        `UPDATE credit_ledger
         SET credits = credits - ?,
             total_consumed = total_consumed + ?,
             updated_at = datetime('now')
         WHERE wallet_address = ?`
    ).run(config.creditsPerTurn, config.creditsPerTurn, walletAddress);

    // Update session credits_consumed if we have a session
    if (sessionId) {
        db.query(
            `UPDATE sessions SET credits_consumed = credits_consumed + ? WHERE id = ?`
        ).run(config.creditsPerTurn, sessionId);
    }

    const newBalance = getBalance(db, walletAddress);
    recordTransaction(db, walletAddress, 'deduction', config.creditsPerTurn, newBalance.credits, 'turn', null, sessionId);

    return {
        success: true,
        creditsRemaining: newBalance.available,
        isLow: newBalance.available <= config.lowCreditThreshold,
        isExhausted: newBalance.available <= 0,
    };
}

/**
 * Deduct credits for an agent-to-agent message.
 */
export function deductAgentMessageCredits(
    db: Database,
    walletAddress: string,
    toAgent: string,
    sessionId?: string,
): { success: boolean; creditsRemaining: number } {
    const config = getCreditConfig(db);
    const balance = getBalance(db, walletAddress);

    if (balance.available < config.creditsPerAgentMessage) {
        return { success: false, creditsRemaining: balance.available };
    }

    db.query(
        `UPDATE credit_ledger
         SET credits = credits - ?,
             total_consumed = total_consumed + ?,
             updated_at = datetime('now')
         WHERE wallet_address = ?`
    ).run(config.creditsPerAgentMessage, config.creditsPerAgentMessage, walletAddress);

    const newBalance = getBalance(db, walletAddress);
    recordTransaction(
        db, walletAddress, 'agent_message', config.creditsPerAgentMessage,
        newBalance.credits, `to:${toAgent}`, null, sessionId,
    );

    return { success: true, creditsRemaining: newBalance.available };
}

// ─── Reserve system (for group messages) ──────────────────────────────────

/**
 * Reserve credits for sending a group message.
 * @param memberCount Number of agents in the group
 * @returns success and the amount reserved
 */
export function reserveGroupCredits(
    db: Database,
    walletAddress: string,
    memberCount: number,
): { success: boolean; reserved: number; creditsRemaining: number } {
    const config = getCreditConfig(db);
    const reserveAmount = config.reservePerGroupMessage * memberCount;
    const balance = getBalance(db, walletAddress);

    if (balance.available < reserveAmount) {
        return { success: false, reserved: 0, creditsRemaining: balance.available };
    }

    db.query(
        `UPDATE credit_ledger
         SET reserved = reserved + ?,
             updated_at = datetime('now')
         WHERE wallet_address = ?`
    ).run(reserveAmount, walletAddress);

    const newBalance = getBalance(db, walletAddress);
    recordTransaction(db, walletAddress, 'reserve', reserveAmount, newBalance.credits, `group:${memberCount}`);

    return { success: true, reserved: reserveAmount, creditsRemaining: newBalance.available };
}

/**
 * Consume reserved credits after group message is sent.
 */
export function consumeReservedCredits(
    db: Database,
    walletAddress: string,
    amount: number,
    sessionId?: string,
): void {
    db.query(
        `UPDATE credit_ledger
         SET reserved = MAX(0, reserved - ?),
             credits = credits - ?,
             total_consumed = total_consumed + ?,
             updated_at = datetime('now')
         WHERE wallet_address = ?`
    ).run(amount, amount, amount, walletAddress);

    const balance = getBalance(db, walletAddress);
    recordTransaction(db, walletAddress, 'deduction', amount, balance.credits, 'group_consumed', null, sessionId);
}

/**
 * Release reserved credits (e.g., group message failed/cancelled).
 */
export function releaseReservedCredits(
    db: Database,
    walletAddress: string,
    amount: number,
): void {
    db.query(
        `UPDATE credit_ledger
         SET reserved = MAX(0, reserved - ?),
             updated_at = datetime('now')
         WHERE wallet_address = ?`
    ).run(amount, walletAddress);

    const balance = getBalance(db, walletAddress);
    recordTransaction(db, walletAddress, 'release', amount, balance.credits, 'group_release');
}

// ─── Query helpers ────────────────────────────────────────────────────────

/**
 * Check if a wallet has any credits at all (including first-time check).
 */
export function hasAnyCredits(db: Database, walletAddress: string): boolean {
    const balance = getBalance(db, walletAddress);
    return balance.totalPurchased > 0 || balance.credits > 0;
}

/**
 * Check if a wallet has enough credits to start a session.
 */
export function canStartSession(db: Database, walletAddress: string): { allowed: boolean; credits: number; reason?: string } {
    const balance = getBalance(db, walletAddress);
    if (balance.available <= 0) {
        return {
            allowed: false,
            credits: balance.available,
            reason: `No credits remaining (${balance.credits} total, ${balance.reserved} reserved). Send ALGO to purchase more credits.`,
        };
    }
    return { allowed: true, credits: balance.available };
}

/**
 * Get recent credit transactions for a wallet.
 */
export function getTransactionHistory(
    db: Database,
    walletAddress: string,
    limit = 20,
): CreditTransaction[] {
    const rows = db.query(
        `SELECT id, wallet_address, type, amount, balance_after, reference, txid, session_id, created_at
         FROM credit_transactions
         WHERE wallet_address = ?
         ORDER BY created_at DESC
         LIMIT ?`
    ).all(walletAddress, limit) as Array<{
        id: number;
        wallet_address: string;
        type: string;
        amount: number;
        balance_after: number;
        reference: string | null;
        txid: string | null;
        session_id: string | null;
        created_at: string;
    }>;

    return rows.map((r) => ({
        id: r.id,
        walletAddress: r.wallet_address,
        type: r.type as CreditTransactionType,
        amount: r.amount,
        balanceAfter: r.balance_after,
        reference: r.reference,
        txid: r.txid,
        sessionId: r.session_id,
        createdAt: r.created_at,
    }));
}

/**
 * Check if this is the first message from a wallet (for free credit grant).
 */
export function isFirstTimeWallet(db: Database, walletAddress: string): boolean {
    const row = db.query(
        `SELECT total_purchased FROM credit_ledger WHERE wallet_address = ?`
    ).get(walletAddress) as { total_purchased: number } | null;
    return !row || row.total_purchased === 0;
}

/**
 * Grant first-time credits if eligible.
 * @returns The number of credits granted (0 if not eligible).
 */
export function maybeGrantFirstTimeCredits(db: Database, walletAddress: string): number {
    if (!isFirstTimeWallet(db, walletAddress)) return 0;

    const config = getCreditConfig(db);
    if (config.freeCreditsOnFirstMessage <= 0) return 0;

    grantCredits(db, walletAddress, config.freeCreditsOnFirstMessage, 'first_message_bonus');
    log.info(`First-time credits granted`, {
        walletAddress: walletAddress.slice(0, 8) + '...',
        amount: config.freeCreditsOnFirstMessage,
    });
    return config.freeCreditsOnFirstMessage;
}

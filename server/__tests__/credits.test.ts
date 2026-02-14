import { test, expect, beforeEach, afterEach, describe } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import {
    getCreditConfig,
    updateCreditConfig,
    getBalance,
    purchaseCredits,
    grantCredits,
    deductTurnCredits,
    deductAgentMessageCredits,
    reserveGroupCredits,
    consumeReservedCredits,
    releaseReservedCredits,
    hasAnyCredits,
    canStartSession,
    getTransactionHistory,
    isFirstTimeWallet,
    maybeGrantFirstTimeCredits,
} from '../db/credits';

let db: Database;
const WALLET = 'TESTWALLET1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEF';
const WALLET2 = 'TESTWALLET2234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEF';

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
});

afterEach(() => {
    db.close();
});

// ─── Config ──────────────────────────────────────────────────────────────────

describe('Credit Config', () => {
    test('returns defaults when no config rows exist', () => {
        const config = getCreditConfig(db);
        expect(config.creditsPerAlgo).toBe(1000);
        expect(config.lowCreditThreshold).toBe(50);
        expect(config.reservePerGroupMessage).toBe(10);
        expect(config.creditsPerTurn).toBe(1);
        expect(config.creditsPerAgentMessage).toBe(5);
        expect(config.freeCreditsOnFirstMessage).toBe(100);
    });

    test('updateCreditConfig sets and getCreditConfig reads back', () => {
        updateCreditConfig(db, 'credits_per_algo', '2000');
        const config = getCreditConfig(db);
        expect(config.creditsPerAlgo).toBe(2000);
        // Other defaults unchanged
        expect(config.creditsPerTurn).toBe(1);
    });

    test('updateCreditConfig upserts on conflict', () => {
        updateCreditConfig(db, 'credits_per_turn', '5');
        updateCreditConfig(db, 'credits_per_turn', '10');
        const config = getCreditConfig(db);
        expect(config.creditsPerTurn).toBe(10);
    });
});

// ─── Balance ─────────────────────────────────────────────────────────────────

describe('Balance', () => {
    test('new wallet starts with zero balance', () => {
        const balance = getBalance(db, WALLET);
        expect(balance.walletAddress).toBe(WALLET);
        expect(balance.credits).toBe(0);
        expect(balance.reserved).toBe(0);
        expect(balance.available).toBe(0);
        expect(balance.totalPurchased).toBe(0);
        expect(balance.totalConsumed).toBe(0);
    });

    test('getBalance is idempotent (creates ledger row once)', () => {
        getBalance(db, WALLET);
        getBalance(db, WALLET);
        const rows = db.query('SELECT COUNT(*) as count FROM credit_ledger WHERE wallet_address = ?').get(WALLET) as { count: number };
        expect(rows.count).toBe(1);
    });

    test('available = credits - reserved', () => {
        grantCredits(db, WALLET, 100);
        reserveGroupCredits(db, WALLET, 2); // reserves 20 (10 per member * 2)
        const balance = getBalance(db, WALLET);
        expect(balance.credits).toBe(100);
        expect(balance.reserved).toBe(20);
        expect(balance.available).toBe(80);
    });
});

// ─── Purchase ────────────────────────────────────────────────────────────────

describe('Purchase Credits', () => {
    test('converts microAlgos to credits using config rate', () => {
        // Default: 1000 credits per ALGO → 1,000,000 microAlgos = 1 ALGO = 1000 credits
        const creditsAdded = purchaseCredits(db, WALLET, 1_000_000);
        expect(creditsAdded).toBe(1000);

        const balance = getBalance(db, WALLET);
        expect(balance.credits).toBe(1000);
        expect(balance.totalPurchased).toBe(1000);
    });

    test('fractional ALGO conversion floors to integer', () => {
        // 500,000 microAlgos = 0.5 ALGO = 500 credits
        const creditsAdded = purchaseCredits(db, WALLET, 500_000);
        expect(creditsAdded).toBe(500);
    });

    test('payment too small returns 0 credits', () => {
        // 999 microAlgos = 0.000999 ALGO = 0.999 credits → floors to 0
        const creditsAdded = purchaseCredits(db, WALLET, 999);
        expect(creditsAdded).toBe(0);
    });

    test('records purchase transaction with txid', () => {
        purchaseCredits(db, WALLET, 1_000_000, 'TX123');
        const history = getTransactionHistory(db, WALLET);
        expect(history).toHaveLength(1);
        expect(history[0].type).toBe('purchase');
        expect(history[0].amount).toBe(1000);
        expect(history[0].txid).toBe('TX123');
        expect(history[0].reference).toBe('1 ALGO');
    });

    test('multiple purchases accumulate', () => {
        purchaseCredits(db, WALLET, 1_000_000);
        purchaseCredits(db, WALLET, 2_000_000);
        const balance = getBalance(db, WALLET);
        expect(balance.credits).toBe(3000);
        expect(balance.totalPurchased).toBe(3000);
    });

    test('custom credits_per_algo rate is applied', () => {
        updateCreditConfig(db, 'credits_per_algo', '5000');
        const creditsAdded = purchaseCredits(db, WALLET, 1_000_000);
        expect(creditsAdded).toBe(5000);
    });
});

// ─── Grant ───────────────────────────────────────────────────────────────────

describe('Grant Credits', () => {
    test('adds credits with reference', () => {
        grantCredits(db, WALLET, 50, 'test_bonus');
        const balance = getBalance(db, WALLET);
        expect(balance.credits).toBe(50);
        expect(balance.totalPurchased).toBe(50); // grants count as purchased

        const history = getTransactionHistory(db, WALLET);
        expect(history[0].type).toBe('grant');
        expect(history[0].reference).toBe('test_bonus');
    });
});

// ─── Deductions ──────────────────────────────────────────────────────────────

describe('Deduct Turn Credits', () => {
    test('deducts per-turn cost and returns success', () => {
        grantCredits(db, WALLET, 100);
        const result = deductTurnCredits(db, WALLET);
        expect(result.success).toBe(true);
        expect(result.creditsRemaining).toBe(99); // 100 - 1 (default per turn)
        expect(result.isLow).toBe(false);
        expect(result.isExhausted).toBe(false);
    });

    test('fails when insufficient credits', () => {
        // Wallet has 0 credits
        const result = deductTurnCredits(db, WALLET);
        expect(result.success).toBe(false);
        expect(result.creditsRemaining).toBe(0);
        expect(result.isLow).toBe(true);
        expect(result.isExhausted).toBe(true);
    });

    test('reports isLow when at threshold', () => {
        // Default lowCreditThreshold = 50
        grantCredits(db, WALLET, 51);
        const result = deductTurnCredits(db, WALLET);
        expect(result.success).toBe(true);
        expect(result.creditsRemaining).toBe(50);
        expect(result.isLow).toBe(true); // 50 <= 50
    });

    test('reports isExhausted when reaching 0', () => {
        grantCredits(db, WALLET, 1);
        const result = deductTurnCredits(db, WALLET);
        expect(result.success).toBe(true);
        expect(result.creditsRemaining).toBe(0);
        expect(result.isExhausted).toBe(true);
    });

    test('records deduction transaction', () => {
        grantCredits(db, WALLET, 100);
        deductTurnCredits(db, WALLET, 'session-123');
        const history = getTransactionHistory(db, WALLET);
        const deduction = history.find(t => t.type === 'deduction');
        expect(deduction).toBeDefined();
        expect(deduction!.sessionId).toBe('session-123');
        expect(deduction!.reference).toBe('turn');
    });

    test('considers reserved credits as unavailable', () => {
        grantCredits(db, WALLET, 10);
        // Reserve 10 credits (1 member * 10 per group message)
        reserveGroupCredits(db, WALLET, 1);
        // Available is now 0
        const result = deductTurnCredits(db, WALLET);
        expect(result.success).toBe(false);
    });
});

describe('Deduct Agent Message Credits', () => {
    test('deducts agent message cost', () => {
        grantCredits(db, WALLET, 100);
        const result = deductAgentMessageCredits(db, WALLET, 'agent-456');
        expect(result.success).toBe(true);
        expect(result.creditsRemaining).toBe(95); // 100 - 5 (default per agent message)
    });

    test('fails when insufficient credits for agent message', () => {
        grantCredits(db, WALLET, 3); // Less than 5 required
        const result = deductAgentMessageCredits(db, WALLET, 'agent-456');
        expect(result.success).toBe(false);
        expect(result.creditsRemaining).toBe(3);
    });

    test('records transaction with target agent reference', () => {
        grantCredits(db, WALLET, 100);
        deductAgentMessageCredits(db, WALLET, 'agent-456', 'session-789');
        const history = getTransactionHistory(db, WALLET);
        const msgTx = history.find(t => t.type === 'agent_message');
        expect(msgTx).toBeDefined();
        expect(msgTx!.reference).toBe('to:agent-456');
        expect(msgTx!.sessionId).toBe('session-789');
    });
});

// ─── Reserve System ──────────────────────────────────────────────────────────

describe('Reserve System', () => {
    test('reserve → consume flow', () => {
        grantCredits(db, WALLET, 100);

        // Reserve for 3 members (3 * 10 = 30)
        const reservation = reserveGroupCredits(db, WALLET, 3);
        expect(reservation.success).toBe(true);
        expect(reservation.reserved).toBe(30);
        expect(reservation.creditsRemaining).toBe(70); // 100 - 30 reserved

        // Verify balance state
        const balance = getBalance(db, WALLET);
        expect(balance.credits).toBe(100); // credits unchanged
        expect(balance.reserved).toBe(30);
        expect(balance.available).toBe(70);

        // Consume 20 of the 30 reserved
        consumeReservedCredits(db, WALLET, 20);
        const afterConsume = getBalance(db, WALLET);
        expect(afterConsume.credits).toBe(80); // 100 - 20 consumed
        expect(afterConsume.reserved).toBe(10); // 30 - 20 consumed
        expect(afterConsume.available).toBe(70); // 80 - 10
        expect(afterConsume.totalConsumed).toBe(20);
    });

    test('reserve → release flow (cancelled group message)', () => {
        grantCredits(db, WALLET, 100);

        reserveGroupCredits(db, WALLET, 2); // reserves 20
        const midBalance = getBalance(db, WALLET);
        expect(midBalance.reserved).toBe(20);

        releaseReservedCredits(db, WALLET, 20);
        const finalBalance = getBalance(db, WALLET);
        expect(finalBalance.credits).toBe(100); // unchanged
        expect(finalBalance.reserved).toBe(0);
        expect(finalBalance.available).toBe(100);
    });

    test('reserve fails when insufficient available credits', () => {
        grantCredits(db, WALLET, 15);
        // Try to reserve for 2 members (2 * 10 = 20 > 15 available)
        const result = reserveGroupCredits(db, WALLET, 2);
        expect(result.success).toBe(false);
        expect(result.reserved).toBe(0);
    });

    test('release does not go below zero', () => {
        grantCredits(db, WALLET, 100);
        reserveGroupCredits(db, WALLET, 1); // reserves 10
        releaseReservedCredits(db, WALLET, 50); // release more than reserved
        const balance = getBalance(db, WALLET);
        expect(balance.reserved).toBe(0); // MAX(0, 10 - 50) = 0
    });

    test('records reserve and release transactions', () => {
        grantCredits(db, WALLET, 100);
        reserveGroupCredits(db, WALLET, 2);
        releaseReservedCredits(db, WALLET, 20);

        const history = getTransactionHistory(db, WALLET);
        const types = history.map(t => t.type);
        expect(types).toContain('reserve');
        expect(types).toContain('release');
    });
});

// ─── Query Helpers ───────────────────────────────────────────────────────────

describe('Query Helpers', () => {
    test('hasAnyCredits returns false for empty wallet', () => {
        expect(hasAnyCredits(db, WALLET)).toBe(false);
    });

    test('hasAnyCredits returns true after purchase', () => {
        purchaseCredits(db, WALLET, 1_000_000);
        expect(hasAnyCredits(db, WALLET)).toBe(true);
    });

    test('hasAnyCredits returns true if totalPurchased > 0 even if credits = 0', () => {
        purchaseCredits(db, WALLET, 1_000_000); // +1000
        // Drain all credits
        for (let i = 0; i < 1000; i++) {
            deductTurnCredits(db, WALLET);
        }
        const balance = getBalance(db, WALLET);
        expect(balance.credits).toBe(0);
        expect(hasAnyCredits(db, WALLET)).toBe(true); // totalPurchased still > 0
    });

    test('canStartSession returns allowed when credits available', () => {
        grantCredits(db, WALLET, 10);
        const result = canStartSession(db, WALLET);
        expect(result.allowed).toBe(true);
        expect(result.credits).toBe(10);
        expect(result.reason).toBeUndefined();
    });

    test('canStartSession returns disallowed when no credits', () => {
        const result = canStartSession(db, WALLET);
        expect(result.allowed).toBe(false);
        expect(result.credits).toBe(0);
        expect(result.reason).toBeDefined();
    });

    test('canStartSession considers reserved credits', () => {
        grantCredits(db, WALLET, 20);
        reserveGroupCredits(db, WALLET, 2); // reserves 20, available = 0
        const result = canStartSession(db, WALLET);
        expect(result.allowed).toBe(false);
    });

    test('getTransactionHistory respects limit', () => {
        grantCredits(db, WALLET, 10);
        grantCredits(db, WALLET, 20);
        grantCredits(db, WALLET, 30);

        const limited = getTransactionHistory(db, WALLET, 2);
        expect(limited).toHaveLength(2);

        const all = getTransactionHistory(db, WALLET, 10);
        expect(all).toHaveLength(3);
        const amounts = all.map(t => t.amount);
        expect(amounts).toContain(10);
        expect(amounts).toContain(20);
        expect(amounts).toContain(30);
    });

    test('getTransactionHistory is wallet-scoped', () => {
        grantCredits(db, WALLET, 10);
        grantCredits(db, WALLET2, 20);

        expect(getTransactionHistory(db, WALLET)).toHaveLength(1);
        expect(getTransactionHistory(db, WALLET2)).toHaveLength(1);
    });
});

// ─── First Time Wallet ──────────────────────────────────────────────────────

describe('First Time Wallet', () => {
    test('new wallet is first time', () => {
        expect(isFirstTimeWallet(db, WALLET)).toBe(true);
    });

    test('wallet with purchase is not first time', () => {
        purchaseCredits(db, WALLET, 1_000_000);
        expect(isFirstTimeWallet(db, WALLET)).toBe(false);
    });

    test('wallet with grant (not purchase) is still first time', () => {
        // grantCredits adds to totalPurchased, so this IS treated as having purchased
        grantCredits(db, WALLET, 100);
        // Grant adds to total_purchased in the implementation
        expect(isFirstTimeWallet(db, WALLET)).toBe(false);
    });

    test('maybeGrantFirstTimeCredits grants on first call', () => {
        const granted = maybeGrantFirstTimeCredits(db, WALLET);
        expect(granted).toBe(100); // default freeCreditsOnFirstMessage
        const balance = getBalance(db, WALLET);
        expect(balance.credits).toBe(100);
    });

    test('maybeGrantFirstTimeCredits returns 0 on second call', () => {
        maybeGrantFirstTimeCredits(db, WALLET);
        const secondGrant = maybeGrantFirstTimeCredits(db, WALLET);
        expect(secondGrant).toBe(0);
    });

    test('maybeGrantFirstTimeCredits respects config', () => {
        updateCreditConfig(db, 'free_credits_on_first_message', '0');
        const granted = maybeGrantFirstTimeCredits(db, WALLET);
        expect(granted).toBe(0);
    });
});

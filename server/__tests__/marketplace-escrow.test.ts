/**
 * Tests for marketplace escrow service.
 */
import { test, expect, describe, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { EscrowService } from '../marketplace/escrow';
import { getBalance, grantCredits } from '../db/credits';

// ─── DB Setup ───────────────────────────────────────────────────────────────

let db: Database;

function setupDb(): Database {
    const d = new Database(':memory:');
    runMigrations(d);

    d.exec(`
        CREATE TABLE IF NOT EXISTS escrow_transactions (
            id                TEXT PRIMARY KEY,
            listing_id        TEXT NOT NULL,
            buyer_tenant_id   TEXT NOT NULL,
            seller_tenant_id  TEXT NOT NULL,
            amount_credits    INTEGER NOT NULL,
            state             TEXT NOT NULL DEFAULT 'FUNDED',
            created_at        TEXT DEFAULT (datetime('now')),
            delivered_at      TEXT DEFAULT NULL,
            released_at       TEXT DEFAULT NULL,
            disputed_at       TEXT DEFAULT NULL,
            resolved_at       TEXT DEFAULT NULL
        )
    `);

    return d;
}

const BUYER = 'BUYER_WALLET_ADDR';
const SELLER = 'SELLER_WALLET_ADDR';
const LISTING = 'listing-1';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('EscrowService', () => {
    let escrow: EscrowService;

    beforeEach(() => {
        db = setupDb();
        escrow = new EscrowService(db);
        // Give buyer some credits
        grantCredits(db, BUYER, 1000, 'test_setup');
    });

    // ─── Fund ────────────────────────────────────────────────────────────

    test('fund creates escrow and debits buyer', () => {
        const tx = escrow.fund(LISTING, BUYER, SELLER, 100);
        expect(tx).not.toBeNull();
        expect(tx!.state).toBe('FUNDED');
        expect(tx!.amountCredits).toBe(100);
        expect(tx!.buyerTenantId).toBe(BUYER);
        expect(tx!.sellerTenantId).toBe(SELLER);

        const balance = getBalance(db, BUYER);
        expect(balance.credits).toBe(900);
    });

    test('fund fails with insufficient credits', () => {
        const tx = escrow.fund(LISTING, BUYER, SELLER, 2000);
        expect(tx).toBeNull();

        const balance = getBalance(db, BUYER);
        expect(balance.credits).toBe(1000); // Unchanged
    });

    // ─── Deliver ─────────────────────────────────────────────────────────

    test('markDelivered transitions from FUNDED to DELIVERED', () => {
        const tx = escrow.fund(LISTING, BUYER, SELLER, 100)!;
        const delivered = escrow.markDelivered(tx.id, SELLER);

        expect(delivered).not.toBeNull();
        expect(delivered!.state).toBe('DELIVERED');
        expect(delivered!.deliveredAt).toBeTruthy();
    });

    test('markDelivered rejected for wrong seller', () => {
        const tx = escrow.fund(LISTING, BUYER, SELLER, 100)!;
        const result = escrow.markDelivered(tx.id, 'WRONG_SELLER');
        expect(result).toBeNull();
    });

    // ─── Release ─────────────────────────────────────────────────────────

    test('release transfers credits to seller', () => {
        const tx = escrow.fund(LISTING, BUYER, SELLER, 100)!;
        escrow.markDelivered(tx.id, SELLER);
        const released = escrow.release(tx.id);

        expect(released).not.toBeNull();
        expect(released!.state).toBe('RELEASED');
        expect(released!.releasedAt).toBeTruthy();

        const sellerBalance = getBalance(db, SELLER);
        expect(sellerBalance.credits).toBe(100);
    });

    test('release fails if not delivered', () => {
        const tx = escrow.fund(LISTING, BUYER, SELLER, 100)!;
        const result = escrow.release(tx.id);
        expect(result).toBeNull();
    });

    // ─── Dispute ─────────────────────────────────────────────────────────

    test('dispute on FUNDED escrow works', () => {
        const tx = escrow.fund(LISTING, BUYER, SELLER, 100)!;
        const disputed = escrow.dispute(tx.id, BUYER);

        expect(disputed).not.toBeNull();
        expect(disputed!.state).toBe('DISPUTED');
        expect(disputed!.disputedAt).toBeTruthy();
    });

    test('dispute on DELIVERED escrow works', () => {
        const tx = escrow.fund(LISTING, BUYER, SELLER, 100)!;
        escrow.markDelivered(tx.id, SELLER);
        const disputed = escrow.dispute(tx.id, BUYER);

        expect(disputed).not.toBeNull();
        expect(disputed!.state).toBe('DISPUTED');
    });

    test('dispute rejected for wrong buyer', () => {
        const tx = escrow.fund(LISTING, BUYER, SELLER, 100)!;
        const result = escrow.dispute(tx.id, 'WRONG_BUYER');
        expect(result).toBeNull();
    });

    // ─── Resolve / Refund ────────────────────────────────────────────────

    test('resolveForSeller credits seller from disputed escrow', () => {
        const tx = escrow.fund(LISTING, BUYER, SELLER, 100)!;
        escrow.dispute(tx.id, BUYER);
        const resolved = escrow.resolveForSeller(tx.id);

        expect(resolved).not.toBeNull();
        expect(resolved!.state).toBe('RESOLVED');

        const sellerBalance = getBalance(db, SELLER);
        expect(sellerBalance.credits).toBe(100);
    });

    test('refund returns credits to buyer from disputed escrow', () => {
        const tx = escrow.fund(LISTING, BUYER, SELLER, 100)!;
        escrow.dispute(tx.id, BUYER);
        const refunded = escrow.refund(tx.id);

        expect(refunded).not.toBeNull();
        expect(refunded!.state).toBe('REFUNDED');

        const buyerBalance = getBalance(db, BUYER);
        expect(buyerBalance.credits).toBe(1000); // Fully restored
    });

    test('resolveForSeller fails if not disputed', () => {
        const tx = escrow.fund(LISTING, BUYER, SELLER, 100)!;
        expect(escrow.resolveForSeller(tx.id)).toBeNull();
    });

    test('refund fails if not disputed', () => {
        const tx = escrow.fund(LISTING, BUYER, SELLER, 100)!;
        expect(escrow.refund(tx.id)).toBeNull();
    });

    // ─── Query ───────────────────────────────────────────────────────────

    test('getByBuyer returns buyer transactions', () => {
        escrow.fund(LISTING, BUYER, SELLER, 50);
        escrow.fund(LISTING, BUYER, SELLER, 75);

        const txs = escrow.getByBuyer(BUYER);
        expect(txs.length).toBe(2);
    });

    test('getBySeller returns seller transactions', () => {
        escrow.fund(LISTING, BUYER, SELLER, 50);

        const txs = escrow.getBySeller(SELLER);
        expect(txs.length).toBe(1);
    });

    test('getTransaction returns null for unknown id', () => {
        expect(escrow.getTransaction('nonexistent')).toBeNull();
    });

    // ─── Auto-Release ────────────────────────────────────────────────────

    test('processAutoReleases releases expired delivered escrows', () => {
        const tx = escrow.fund(LISTING, BUYER, SELLER, 100)!;
        escrow.markDelivered(tx.id, SELLER);

        // Manually backdate the delivered_at to trigger auto-release
        db.exec(`
            UPDATE escrow_transactions
            SET delivered_at = datetime('now', '-73 hours')
            WHERE id = '${tx.id}'
        `);

        const released = escrow.processAutoReleases();
        expect(released.length).toBe(1);
        expect(released[0].state).toBe('RELEASED');

        const sellerBalance = getBalance(db, SELLER);
        expect(sellerBalance.credits).toBe(100);
    });

    test('processAutoReleases skips non-expired escrows', () => {
        const tx = escrow.fund(LISTING, BUYER, SELLER, 100)!;
        escrow.markDelivered(tx.id, SELLER);
        // delivered_at is now — within 72h window

        const released = escrow.processAutoReleases();
        expect(released.length).toBe(0);
    });

    // ─── Full Happy Path ─────────────────────────────────────────────────

    test('full flow: fund → deliver → release', () => {
        const funded = escrow.fund(LISTING, BUYER, SELLER, 200)!;
        expect(funded.state).toBe('FUNDED');
        expect(getBalance(db, BUYER).credits).toBe(800);

        const delivered = escrow.markDelivered(funded.id, SELLER)!;
        expect(delivered.state).toBe('DELIVERED');

        const released = escrow.release(funded.id)!;
        expect(released.state).toBe('RELEASED');
        expect(getBalance(db, SELLER).credits).toBe(200);
    });
});

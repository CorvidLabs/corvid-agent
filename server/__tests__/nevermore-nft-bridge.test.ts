/**
 * Tests for Nevermore NFT bridge:
 * - NevermoreService: verification, credit grants, revocation, audit
 * - Route handlers: verify, status, holders, audit
 */
import { test, expect, describe, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { NevermoreService, NEVERMORE_CREDITS } from '../nevermore/service';
import type { AssetVerifier } from '../nevermore/service';
import { getBalance } from '../db/credits';
import { handleNevermoreRoutes } from '../routes/nevermore';

// ─── Test Helpers ────────────────────────────────────────────────────────────

const TEST_ASSET_ID = 123456789;
const WALLET_A = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const WALLET_B = 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

let db: Database;

function setupDb(): Database {
    const d = new Database(':memory:');
    runMigrations(d);
    return d;
}

/** Mock verifier that returns configurable balances per wallet. */
function mockVerifier(holdings: Record<string, number>): AssetVerifier {
    return {
        async getAssetBalance(walletAddress: string, _assetId: number): Promise<number> {
            return holdings[walletAddress] ?? 0;
        },
    };
}

function fakeReq(method: string, path: string, body?: unknown): { req: Request; url: URL } {
    const url = new URL(`http://localhost:3000${path}`);
    const opts: RequestInit = { method };
    if (body !== undefined) {
        opts.body = JSON.stringify(body);
        opts.headers = { 'Content-Type': 'application/json' };
    }
    return { req: new Request(url.toString(), opts), url };
}

// ─── NevermoreService Tests ──────────────────────────────────────────────────

describe('NevermoreService', () => {
    let svc: NevermoreService;

    beforeEach(() => {
        db = setupDb();
    });

    describe('verify', () => {
        test('grants credits to NFT holder', async () => {
            svc = new NevermoreService(db, TEST_ASSET_ID, {
                verifier: mockVerifier({ [WALLET_A]: 1 }),
            });

            const holder = await svc.verify(WALLET_A);
            expect(holder).not.toBeNull();
            expect(holder!.walletAddress).toBe(WALLET_A);
            expect(holder!.assetId).toBe(TEST_ASSET_ID);
            expect(holder!.creditsGranted).toBe(NEVERMORE_CREDITS);
            expect(holder!.status).toBe('active');

            // Verify credits were granted
            const balance = getBalance(db, WALLET_A);
            expect(balance.credits).toBe(NEVERMORE_CREDITS);
        });

        test('returns null when wallet does not hold NFT', async () => {
            svc = new NevermoreService(db, TEST_ASSET_ID, {
                verifier: mockVerifier({}),
            });

            const holder = await svc.verify(WALLET_A);
            expect(holder).toBeNull();

            const balance = getBalance(db, WALLET_A);
            expect(balance.credits).toBe(0);
        });

        test('returns existing holder without re-granting credits', async () => {
            svc = new NevermoreService(db, TEST_ASSET_ID, {
                verifier: mockVerifier({ [WALLET_A]: 1 }),
            });

            const first = await svc.verify(WALLET_A);
            const second = await svc.verify(WALLET_A);

            expect(first!.id).toBe(second!.id);

            // Credits should only be granted once
            const balance = getBalance(db, WALLET_A);
            expect(balance.credits).toBe(NEVERMORE_CREDITS);
        });

        test('re-verifies revoked holder and grants additional credits', async () => {
            svc = new NevermoreService(db, TEST_ASSET_ID, {
                verifier: mockVerifier({ [WALLET_A]: 1 }),
            });

            await svc.verify(WALLET_A);
            svc.revoke(WALLET_A);

            const reVerified = await svc.verify(WALLET_A);
            expect(reVerified).not.toBeNull();
            expect(reVerified!.status).toBe('active');
            expect(reVerified!.creditsGranted).toBe(NEVERMORE_CREDITS * 2);

            const balance = getBalance(db, WALLET_A);
            expect(balance.credits).toBe(NEVERMORE_CREDITS * 2);
        });

        test('custom credit allocation', async () => {
            svc = new NevermoreService(db, TEST_ASSET_ID, {
                verifier: mockVerifier({ [WALLET_A]: 1 }),
                creditAllocation: 1000,
            });

            await svc.verify(WALLET_A);
            const balance = getBalance(db, WALLET_A);
            expect(balance.credits).toBe(1000);
        });

        test('works without verifier (trusts caller)', async () => {
            svc = new NevermoreService(db, TEST_ASSET_ID);

            const holder = await svc.verify(WALLET_A);
            expect(holder).not.toBeNull();
            expect(holder!.status).toBe('active');

            const balance = getBalance(db, WALLET_A);
            expect(balance.credits).toBe(NEVERMORE_CREDITS);
        });
    });

    describe('getHolder', () => {
        test('returns null for unknown wallet', () => {
            svc = new NevermoreService(db, TEST_ASSET_ID);
            expect(svc.getHolder(WALLET_A)).toBeNull();
        });

        test('returns holder record', async () => {
            svc = new NevermoreService(db, TEST_ASSET_ID);
            await svc.verify(WALLET_A);

            const holder = svc.getHolder(WALLET_A);
            expect(holder).not.toBeNull();
            expect(holder!.walletAddress).toBe(WALLET_A);
        });
    });

    describe('revoke', () => {
        test('revokes active holder', async () => {
            svc = new NevermoreService(db, TEST_ASSET_ID);
            await svc.verify(WALLET_A);

            const revoked = svc.revoke(WALLET_A);
            expect(revoked).toBe(true);

            const holder = svc.getHolder(WALLET_A);
            expect(holder!.status).toBe('revoked');
        });

        test('returns false for unknown wallet', () => {
            svc = new NevermoreService(db, TEST_ASSET_ID);
            expect(svc.revoke(WALLET_A)).toBe(false);
        });

        test('returns false for already-revoked holder', async () => {
            svc = new NevermoreService(db, TEST_ASSET_ID);
            await svc.verify(WALLET_A);
            svc.revoke(WALLET_A);

            expect(svc.revoke(WALLET_A)).toBe(false);
        });
    });

    describe('listHolders', () => {
        test('lists all holders', async () => {
            svc = new NevermoreService(db, TEST_ASSET_ID);
            await svc.verify(WALLET_A);
            await svc.verify(WALLET_B);

            const holders = svc.listHolders();
            expect(holders.length).toBe(2);
        });

        test('filters by status', async () => {
            svc = new NevermoreService(db, TEST_ASSET_ID);
            await svc.verify(WALLET_A);
            await svc.verify(WALLET_B);
            svc.revoke(WALLET_A);

            const active = svc.listHolders('active');
            expect(active.length).toBe(1);
            expect(active[0].walletAddress).toBe(WALLET_B);

            const revoked = svc.listHolders('revoked');
            expect(revoked.length).toBe(1);
            expect(revoked[0].walletAddress).toBe(WALLET_A);
        });
    });

    describe('audit', () => {
        test('revokes holders who no longer hold NFT', async () => {
            const holdings: Record<string, number> = {
                [WALLET_A]: 1,
                [WALLET_B]: 1,
            };

            svc = new NevermoreService(db, TEST_ASSET_ID, {
                verifier: mockVerifier(holdings),
            });

            await svc.verify(WALLET_A);
            await svc.verify(WALLET_B);

            // Simulate WALLET_A transferring NFT away
            holdings[WALLET_A] = 0;
            svc = new NevermoreService(db, TEST_ASSET_ID, {
                verifier: mockVerifier(holdings),
            });

            const result = await svc.audit();
            expect(result.verified).toBe(1);
            expect(result.revoked).toBe(1);

            const holderA = svc.getHolder(WALLET_A);
            expect(holderA!.status).toBe('revoked');

            const holderB = svc.getHolder(WALLET_B);
            expect(holderB!.status).toBe('active');
        });

        test('returns zeros without verifier', async () => {
            svc = new NevermoreService(db, TEST_ASSET_ID);
            const result = await svc.audit();
            expect(result.verified).toBe(0);
            expect(result.revoked).toBe(0);
        });
    });
});

// ─── Route Tests ─────────────────────────────────────────────────────────────

describe('Nevermore routes', () => {
    let svc: NevermoreService;

    beforeEach(() => {
        db = setupDb();
        svc = new NevermoreService(db, TEST_ASSET_ID);
    });

    test('returns null for non-nevermore paths', () => {
        const { req, url } = fakeReq('GET', '/api/agents');
        const res = handleNevermoreRoutes(req, url, db, svc);
        expect(res).toBeNull();
    });

    test('returns 503 when service not available', () => {
        const { req, url } = fakeReq('GET', '/api/nevermore/status?walletAddress=test');
        const res = handleNevermoreRoutes(req, url, db, null);
        expect(res).not.toBeNull();
        expect((res as Response).status).toBe(503);
    });

    describe('POST /api/nevermore/verify', () => {
        test('verifies and grants credits', async () => {
            const { req, url } = fakeReq('POST', '/api/nevermore/verify', {
                walletAddress: WALLET_A,
            });

            const res = await handleNevermoreRoutes(req, url, db, svc);
            expect(res).not.toBeNull();
            expect(res!.status).toBe(200);

            const body = await res!.json();
            expect(body.verified).toBe(true);
            expect(body.walletAddress).toBe(WALLET_A);
            expect(body.creditsGranted).toBe(NEVERMORE_CREDITS);
        });

        test('returns 400 without walletAddress', async () => {
            const { req, url } = fakeReq('POST', '/api/nevermore/verify', {});
            const res = await handleNevermoreRoutes(req, url, db, svc);
            expect(res).not.toBeNull();
            expect(res!.status).toBe(400);
        });

        test('returns 403 when wallet does not hold NFT', async () => {
            svc = new NevermoreService(db, TEST_ASSET_ID, {
                verifier: mockVerifier({}),
            });

            const { req, url } = fakeReq('POST', '/api/nevermore/verify', {
                walletAddress: WALLET_A,
            });

            const res = await handleNevermoreRoutes(req, url, db, svc);
            expect(res).not.toBeNull();
            expect(res!.status).toBe(403);

            const body = await res!.json();
            expect(body.verified).toBe(false);
        });
    });

    describe('GET /api/nevermore/status', () => {
        test('returns holder status', async () => {
            await svc.verify(WALLET_A);

            const { req, url } = fakeReq('GET', `/api/nevermore/status?walletAddress=${WALLET_A}`);
            const res = handleNevermoreRoutes(req, url, db, svc) as Response;
            expect(res.status).toBe(200);

            const body = await res.json();
            expect(body.status).toBe('active');
            expect(body.walletAddress).toBe(WALLET_A);
        });

        test('returns 404 for unknown wallet', () => {
            const { req, url } = fakeReq('GET', `/api/nevermore/status?walletAddress=${WALLET_A}`);
            const res = handleNevermoreRoutes(req, url, db, svc) as Response;
            expect(res.status).toBe(404);
        });

        test('returns 400 without walletAddress', () => {
            const { req, url } = fakeReq('GET', '/api/nevermore/status');
            const res = handleNevermoreRoutes(req, url, db, svc) as Response;
            expect(res.status).toBe(400);
        });
    });

    describe('GET /api/nevermore/holders', () => {
        test('lists all holders', async () => {
            await svc.verify(WALLET_A);
            await svc.verify(WALLET_B);

            const { req, url } = fakeReq('GET', '/api/nevermore/holders');
            const res = handleNevermoreRoutes(req, url, db, svc) as Response;
            expect(res.status).toBe(200);

            const body = await res.json();
            expect(body.count).toBe(2);
            expect(body.holders.length).toBe(2);
        });

        test('filters by status', async () => {
            await svc.verify(WALLET_A);
            await svc.verify(WALLET_B);
            svc.revoke(WALLET_A);

            const { req, url } = fakeReq('GET', '/api/nevermore/holders?status=active');
            const res = handleNevermoreRoutes(req, url, db, svc) as Response;
            const body = await res.json();
            expect(body.count).toBe(1);
        });
    });

    describe('POST /api/nevermore/audit', () => {
        test('audits holders', async () => {
            await svc.verify(WALLET_A);

            const { req, url } = fakeReq('POST', '/api/nevermore/audit');
            const res = await handleNevermoreRoutes(req, url, db, svc);
            expect(res).not.toBeNull();
            expect(res!.status).toBe(200);

            const body = await res!.json();
            expect(body.verified).toBe(0);
            expect(body.revoked).toBe(0);
        });
    });
});

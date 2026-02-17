/**
 * Tests for ReputationVerifier — on-chain attestation scanning and trust derivation.
 *
 * Mocks global fetch to simulate Algorand indexer responses.
 */
import { describe, it, expect, beforeEach, afterEach, afterAll } from 'bun:test';
import { ReputationVerifier } from '../reputation/verifier';

// ─── Helpers ────────────────────────────────────────────────────────────────

const TEST_WALLET = 'TESTWALLETADDRESS1234567890ABCDEFGHIJKLMNOPQRST';
const INDEXER_URL = 'https://test-indexer.example.com';

const originalFetch = globalThis.fetch;

beforeEach(() => {
    // Reset fetch mock between tests
    globalThis.fetch = originalFetch;
});

afterEach(() => {
    globalThis.fetch = originalFetch;
});

afterAll(() => {
    // Ensure global fetch is restored after this file completes
    globalThis.fetch = originalFetch;
});

/**
 * Build a mock Algorand transaction with a corvid-reputation note.
 * Note fields in Algorand are base64-encoded.
 */
function makeAttestation(agentId: string, hash: string, txId: string, round: number, roundTime: number) {
    const noteText = `corvid-reputation:${agentId}:${hash}`;
    const noteB64 = Buffer.from(noteText).toString('base64');
    return {
        id: txId,
        note: noteB64,
        'confirmed-round': round,
        'round-time': roundTime,
    };
}

/**
 * Create N attestation transactions with unique IDs.
 */
function makeAttestations(count: number) {
    return Array.from({ length: count }, (_, i) =>
        makeAttestation(`agent${i}`, `${String(i).padStart(4, '0')}abcdef0123456789`, `txn-${i}`, 10000 + i, 1700000000 + i),
    );
}

/**
 * Mock globalThis.fetch to return the given transactions array.
 */
function mockFetchTransactions(transactions: unknown[]) {
    globalThis.fetch = (async () =>
        new Response(JSON.stringify({ transactions }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        })) as unknown as typeof fetch;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ReputationVerifier', () => {
    let verifier: ReputationVerifier;

    beforeEach(() => {
        verifier = new ReputationVerifier(INDEXER_URL);
    });

    it('returns untrusted when no attestations found', async () => {
        mockFetchTransactions([]);

        const result = await verifier.checkRemoteTrust(TEST_WALLET);

        expect(result.trustLevel).toBe('untrusted');
        expect(result.attestationCount).toBe(0);
        expect(result.attestations).toEqual([]);
        expect(result.walletAddress).toBe(TEST_WALLET);
    });

    it('returns low trust for 1-2 attestations', async () => {
        mockFetchTransactions(makeAttestations(2));

        const result = await verifier.checkRemoteTrust(TEST_WALLET);

        expect(result.trustLevel).toBe('low');
        expect(result.attestationCount).toBe(2);
        expect(result.attestations.length).toBe(2);
        // Verify attestation structure
        expect(result.attestations[0].txid).toBe('txn-0');
        expect(result.attestations[0].agentId).toBe('agent0');
        expect(result.attestations[0].round).toBe(10000);
        expect(result.attestations[0].timestamp).toBeTruthy();
    });

    it('returns medium trust for 3-5 attestations', async () => {
        mockFetchTransactions(makeAttestations(4));

        const result = await verifier.checkRemoteTrust(TEST_WALLET);

        expect(result.trustLevel).toBe('medium');
        expect(result.attestationCount).toBe(4);
    });

    it('returns high trust for 6-9 attestations', async () => {
        mockFetchTransactions(makeAttestations(7));

        const result = await verifier.checkRemoteTrust(TEST_WALLET);

        expect(result.trustLevel).toBe('high');
        expect(result.attestationCount).toBe(7);
    });

    it('returns verified trust for 10+ attestations', async () => {
        mockFetchTransactions(makeAttestations(12));

        const result = await verifier.checkRemoteTrust(TEST_WALLET);

        expect(result.trustLevel).toBe('verified');
        expect(result.attestationCount).toBe(12);
        expect(result.meetsMinimum).toBe(true);
    });

    it('checkRemoteTrust returns meetsMinimum=false when trust level is below minTrust', async () => {
        // 2 attestations => 'low' trust
        mockFetchTransactions(makeAttestations(2));

        const result = await verifier.checkRemoteTrust(TEST_WALLET, 'high');

        expect(result.trustLevel).toBe('low');
        expect(result.meetsMinimum).toBe(false);
        expect(result.attestationCount).toBe(2);
    });
});

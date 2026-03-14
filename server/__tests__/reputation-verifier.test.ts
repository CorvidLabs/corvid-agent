import { test, expect, describe, beforeEach, afterEach, mock } from 'bun:test';
import { ReputationVerifier } from '../reputation/verifier';

function makeIndexerResponse(transactions: Array<{ id: string; note?: string; 'confirmed-round'?: number; 'round-time'?: number }>) {
    return new Response(JSON.stringify({ transactions }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}

function makeAttestation(agentId: string, hash: string): string {
    return Buffer.from(`corvid-reputation:${agentId}:${hash}`).toString('base64');
}

let originalFetch: typeof global.fetch;

beforeEach(() => {
    originalFetch = global.fetch;
});

afterEach(() => {
    global.fetch = originalFetch;
});

// ─── scanAttestations ───────────────────────────────────────────────────────

describe('scanAttestations', () => {
    test('parses valid attestation transactions', async () => {
        global.fetch = mock(() => Promise.resolve(makeIndexerResponse([
            {
                id: 'txn-1',
                note: makeAttestation('agent-1', 'abc123'),
                'confirmed-round': 1000,
                'round-time': 1710000000,
            },
            {
                id: 'txn-2',
                note: makeAttestation('agent-2', 'def456'),
                'confirmed-round': 1001,
                'round-time': 1710000100,
            },
        ]))) as unknown as typeof global.fetch;

        const verifier = new ReputationVerifier('https://mock-indexer');
        const attestations = await verifier.scanAttestations('WALLETADDR');

        expect(attestations).toHaveLength(2);
        expect(attestations[0].txid).toBe('txn-1');
        expect(attestations[0].agentId).toBe('agent-1');
        expect(attestations[0].hash).toBe('abc123');
        expect(attestations[0].round).toBe(1000);
        expect(attestations[1].agentId).toBe('agent-2');
    });

    test('skips transactions without notes', async () => {
        global.fetch = mock(() => Promise.resolve(makeIndexerResponse([
            { id: 'txn-1' },
            { id: 'txn-2', note: makeAttestation('agent-1', 'abc123') },
        ]))) as unknown as typeof global.fetch;

        const verifier = new ReputationVerifier('https://mock-indexer');
        const attestations = await verifier.scanAttestations('WALLETADDR');

        expect(attestations).toHaveLength(1);
    });

    test('skips malformed note prefix', async () => {
        global.fetch = mock(() => Promise.resolve(makeIndexerResponse([
            {
                id: 'txn-1',
                note: Buffer.from('not-corvid-format:data').toString('base64'),
            },
        ]))) as unknown as typeof global.fetch;

        const verifier = new ReputationVerifier('https://mock-indexer');
        const attestations = await verifier.scanAttestations('WALLETADDR');

        expect(attestations).toHaveLength(0);
    });

    test('returns empty on indexer HTTP error', async () => {
        global.fetch = mock(() => Promise.resolve(new Response('Not Found', { status: 404 }))) as unknown as typeof global.fetch;

        const verifier = new ReputationVerifier('https://mock-indexer');
        const attestations = await verifier.scanAttestations('WALLETADDR');

        expect(attestations).toHaveLength(0);
    });

    test('returns empty on network failure', async () => {
        global.fetch = mock(() => Promise.reject(new Error('Network error'))) as unknown as typeof global.fetch;

        const verifier = new ReputationVerifier('https://mock-indexer');
        const attestations = await verifier.scanAttestations('WALLETADDR');

        expect(attestations).toHaveLength(0);
    });

    test('handles empty transactions array', async () => {
        global.fetch = mock(() => Promise.resolve(makeIndexerResponse([]))) as unknown as typeof global.fetch;

        const verifier = new ReputationVerifier('https://mock-indexer');
        const attestations = await verifier.scanAttestations('WALLETADDR');

        expect(attestations).toHaveLength(0);
    });

    test('handles missing round-time gracefully', async () => {
        global.fetch = mock(() => Promise.resolve(makeIndexerResponse([
            {
                id: 'txn-1',
                note: makeAttestation('agent-1', 'abc123'),
                'confirmed-round': 500,
            },
        ]))) as unknown as typeof global.fetch;

        const verifier = new ReputationVerifier('https://mock-indexer');
        const attestations = await verifier.scanAttestations('WALLETADDR');

        expect(attestations).toHaveLength(1);
        expect(attestations[0].timestamp).toBe('');
        expect(attestations[0].round).toBe(500);
    });
});

// ─── checkRemoteTrust ───────────────────────────────────────────────────────

describe('checkRemoteTrust', () => {
    function mockAttestations(count: number): void {
        const txns = Array.from({ length: count }, (_, i) => ({
            id: `txn-${i}`,
            note: makeAttestation(`agent-${i}`, `hash${i}`),
            'confirmed-round': 1000 + i,
            'round-time': 1710000000 + i,
        }));
        global.fetch = mock(() => Promise.resolve(makeIndexerResponse(txns))) as unknown as typeof global.fetch;
    }

    test('untrusted with 0 attestations', async () => {
        mockAttestations(0);
        const verifier = new ReputationVerifier('https://mock-indexer');
        const result = await verifier.checkRemoteTrust('WALLET');

        expect(result.trustLevel).toBe('untrusted');
        expect(result.attestationCount).toBe(0);
        expect(result.meetsMinimum).toBe(false);
    });

    test('low trust with 1 attestation', async () => {
        mockAttestations(1);
        const verifier = new ReputationVerifier('https://mock-indexer');
        const result = await verifier.checkRemoteTrust('WALLET');

        expect(result.trustLevel).toBe('low');
        expect(result.meetsMinimum).toBe(true);
    });

    test('medium trust with 3 attestations', async () => {
        mockAttestations(3);
        const verifier = new ReputationVerifier('https://mock-indexer');
        const result = await verifier.checkRemoteTrust('WALLET');

        expect(result.trustLevel).toBe('medium');
    });

    test('high trust with 6 attestations', async () => {
        mockAttestations(6);
        const verifier = new ReputationVerifier('https://mock-indexer');
        const result = await verifier.checkRemoteTrust('WALLET');

        expect(result.trustLevel).toBe('high');
    });

    test('verified trust with 10+ attestations', async () => {
        mockAttestations(12);
        const verifier = new ReputationVerifier('https://mock-indexer');
        const result = await verifier.checkRemoteTrust('WALLET');

        expect(result.trustLevel).toBe('verified');
        expect(result.attestationCount).toBe(12);
    });

    test('meetsMinimum is false when trust is below threshold', async () => {
        mockAttestations(1);
        const verifier = new ReputationVerifier('https://mock-indexer');
        const result = await verifier.checkRemoteTrust('WALLET', 'high');

        expect(result.trustLevel).toBe('low');
        expect(result.meetsMinimum).toBe(false);
    });

    test('meetsMinimum is true when trust equals threshold', async () => {
        mockAttestations(6);
        const verifier = new ReputationVerifier('https://mock-indexer');
        const result = await verifier.checkRemoteTrust('WALLET', 'high');

        expect(result.meetsMinimum).toBe(true);
    });

    test('includes wallet address in result', async () => {
        mockAttestations(0);
        const verifier = new ReputationVerifier('https://mock-indexer');
        const result = await verifier.checkRemoteTrust('MY_WALLET_ADDR');

        expect(result.walletAddress).toBe('MY_WALLET_ADDR');
    });
});

// ─── constructor defaults ───────────────────────────────────────────────────

describe('constructor', () => {
    test('uses provided indexer URL', async () => {
        let calledUrl = '';
        global.fetch = mock((url: string) => {
            calledUrl = url;
            return Promise.resolve(makeIndexerResponse([]));
        }) as unknown as typeof global.fetch;

        const verifier = new ReputationVerifier('https://custom-indexer.example.com');
        await verifier.scanAttestations('WALLET');

        expect(calledUrl).toContain('custom-indexer.example.com');
    });
});

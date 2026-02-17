/**
 * ReputationVerifier — scans on-chain Algorand attestations for remote agents.
 *
 * Derives a trust level from the count and consistency of published
 * `corvid-reputation:` note-prefixed transactions.
 */

import type { TrustLevel } from './types';
import { createLogger } from '../lib/logger';

const log = createLogger('ReputationVerifier');

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AttestationInfo {
    txid: string;
    agentId: string;
    hash: string;
    round: number;
    timestamp: string;
}

export interface RemoteTrustResult {
    walletAddress: string;
    trustLevel: TrustLevel;
    attestationCount: number;
    attestations: AttestationInfo[];
    meetsMinimum: boolean;
}

// ─── Trust Derivation ────────────────────────────────────────────────────────

function deriveTrustLevel(attestationCount: number): TrustLevel {
    if (attestationCount >= 10) return 'verified';
    if (attestationCount >= 6) return 'high';
    if (attestationCount >= 3) return 'medium';
    if (attestationCount >= 1) return 'low';
    return 'untrusted';
}

// ─── Verifier Service ────────────────────────────────────────────────────────

export class ReputationVerifier {
    private indexerBaseUrl: string;

    constructor(indexerBaseUrl?: string) {
        this.indexerBaseUrl = indexerBaseUrl ?? (
            process.env.ALGORAND_INDEXER_URL ?? 'https://mainnet-idx.algonode.cloud'
        );
    }

    /**
     * Scan on-chain attestations for a wallet address.
     *
     * Queries the Algorand indexer for transactions from the given wallet
     * whose note prefix matches `corvid-reputation:`.
     */
    async scanAttestations(walletAddress: string): Promise<AttestationInfo[]> {
        const notePrefix = Buffer.from('corvid-reputation:').toString('base64');
        const url = `${this.indexerBaseUrl}/v2/accounts/${walletAddress}/transactions?note-prefix=${notePrefix}&limit=50`;

        log.debug('Scanning attestations', { walletAddress, url });

        try {
            const response = await fetch(url, {
                headers: { Accept: 'application/json' },
                signal: AbortSignal.timeout(15_000),
            });

            if (!response.ok) {
                log.warn('Indexer request failed', { status: response.status, walletAddress });
                return [];
            }

            const data = await response.json() as {
                transactions?: Array<{
                    id: string;
                    note?: string;
                    'confirmed-round'?: number;
                    'round-time'?: number;
                }>;
            };

            const attestations: AttestationInfo[] = [];

            for (const txn of data.transactions ?? []) {
                if (!txn.note) continue;

                let noteText: string;
                try {
                    noteText = Buffer.from(txn.note, 'base64').toString('utf-8');
                } catch {
                    continue;
                }

                // Parse: corvid-reputation:{agentId}:{hash}
                const match = noteText.match(/^corvid-reputation:([^:]+):([0-9a-f]+)$/);
                if (!match) continue;

                attestations.push({
                    txid: txn.id,
                    agentId: match[1],
                    hash: match[2],
                    round: txn['confirmed-round'] ?? 0,
                    timestamp: txn['round-time']
                        ? new Date(txn['round-time'] * 1000).toISOString()
                        : '',
                });
            }

            log.info('Scanned attestations', {
                walletAddress,
                count: attestations.length,
            });

            return attestations;
        } catch (err) {
            log.warn('Failed to scan attestations', {
                walletAddress,
                error: err instanceof Error ? err.message : String(err),
            });
            return [];
        }
    }

    /**
     * Check remote trust for a wallet address.
     * Returns trust level and attestation details.
     */
    async checkRemoteTrust(
        walletAddress: string,
        minTrust: TrustLevel = 'low',
    ): Promise<RemoteTrustResult> {
        const attestations = await this.scanAttestations(walletAddress);
        const trustLevel = deriveTrustLevel(attestations.length);

        const trustOrder: TrustLevel[] = ['untrusted', 'low', 'medium', 'high', 'verified'];
        const meetsMinimum = trustOrder.indexOf(trustLevel) >= trustOrder.indexOf(minTrust);

        return {
            walletAddress,
            trustLevel,
            attestationCount: attestations.length,
            attestations,
            meetsMinimum,
        };
    }
}

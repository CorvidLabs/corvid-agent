/**
 * Attestation — On-chain reputation hash via Algorand.
 *
 * Publishes a hash of the agent's reputation score on-chain,
 * creating a verifiable, tamper-proof record of trust level.
 */
import type { Database } from 'bun:sqlite';
import type { ReputationScore } from './types';
import { createLogger } from '../lib/logger';

const log = createLogger('ReputationAttestation');

/**
 * Build a canonical string representation of a reputation score for hashing.
 */
function buildAttestationPayload(score: ReputationScore): string {
    return JSON.stringify({
        agentId: score.agentId,
        overallScore: score.overallScore,
        trustLevel: score.trustLevel,
        components: score.components,
        computedAt: score.computedAt,
    });
}

/**
 * Hash the attestation payload using SHA-256.
 */
async function hashPayload(payload: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(payload);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = new Uint8Array(hashBuffer);
    return Array.from(hashArray).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class ReputationAttestation {
    private db: Database;

    constructor(db: Database) {
        this.db = db;
    }

    /**
     * Create a hash of the reputation score.
     * This can be published on-chain as a note in an Algorand transaction.
     */
    async createAttestation(score: ReputationScore): Promise<string> {
        const payload = buildAttestationPayload(score);
        const hash = await hashPayload(payload);

        // Store the attestation
        this.db.query(`
            INSERT OR REPLACE INTO reputation_attestations
                (agent_id, hash, payload, created_at)
            VALUES (?, ?, ?, datetime('now'))
        `).run(score.agentId, hash, payload);

        // Update the reputation record
        this.db.query(
            'UPDATE agent_reputation SET attestation_hash = ? WHERE agent_id = ?',
        ).run(hash, score.agentId);

        log.info('Created reputation attestation', {
            agentId: score.agentId,
            hash: hash.slice(0, 16) + '...',
            trustLevel: score.trustLevel,
        });

        return hash;
    }

    /**
     * Verify that a stored attestation matches a recomputed score.
     */
    async verifyAttestation(score: ReputationScore, expectedHash: string): Promise<boolean> {
        const payload = buildAttestationPayload(score);
        const computedHash = await hashPayload(payload);
        return computedHash === expectedHash;
    }

    /**
     * Get the latest attestation for an agent.
     */
    getAttestation(agentId: string): { hash: string; payload: string; createdAt: string } | null {
        const row = this.db.query(`
            SELECT hash, payload, created_at
            FROM reputation_attestations
            WHERE agent_id = ?
            ORDER BY created_at DESC
            LIMIT 1
        `).get(agentId) as { hash: string; payload: string; created_at: string } | null;

        if (!row) return null;
        return { hash: row.hash, payload: row.payload, createdAt: row.created_at };
    }

    /**
     * Publish attestation on-chain (Algorand note transaction).
     * Requires AlgoChat service to be available.
     */
    async publishOnChain(
        agentId: string,
        hash: string,
        sendTransaction: (note: string) => Promise<string>,
    ): Promise<string> {
        const note = `corvid-reputation:${agentId}:${hash}`;
        const txid = await sendTransaction(note);

        // Record the txid
        this.db.query(`
            UPDATE reputation_attestations
            SET txid = ?, published_at = datetime('now')
            WHERE agent_id = ? AND hash = ?
        `).run(txid, agentId, hash);

        log.info('Published attestation on-chain', {
            agentId,
            hash: hash.slice(0, 16) + '...',
            txid,
        });

        return txid;
    }
}

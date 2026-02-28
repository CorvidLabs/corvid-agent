/**
 * IdentityVerification — Agent identity tier management.
 *
 * Tiers (ascending trust):
 *   UNVERIFIED      — Default, no verification
 *   GITHUB_VERIFIED — Linked GitHub account with commit history
 *   OWNER_VOUCHED   — An existing owner has vouched for this agent
 *   ESTABLISHED     — 30+ days active, 10+ completed tasks, score > 0.7
 */
import type { Database } from 'bun:sqlite';
import { createLogger } from '../lib/logger';

const log = createLogger('IdentityVerification');

// ─── Types ───────────────────────────────────────────────────────────────────

export type VerificationTier =
    | 'UNVERIFIED'
    | 'GITHUB_VERIFIED'
    | 'OWNER_VOUCHED'
    | 'ESTABLISHED';

/** Tier ordering for comparison (higher = more trusted) */
const TIER_RANK: Record<VerificationTier, number> = {
    UNVERIFIED: 0,
    GITHUB_VERIFIED: 1,
    OWNER_VOUCHED: 2,
    ESTABLISHED: 3,
};

export interface AgentIdentity {
    agentId: string;
    tier: VerificationTier;
    verifiedAt: string | null;
    verificationDataHash: string | null;
    updatedAt: string;
}

interface AgentIdentityRecord {
    agent_id: string;
    tier: string;
    verified_at: string | null;
    verification_data_hash: string | null;
    updated_at: string;
}

// ─── Established Tier Thresholds ─────────────────────────────────────────────

const ESTABLISHED_MIN_DAYS = 30;
const ESTABLISHED_MIN_TASKS = 10;
const ESTABLISHED_MIN_SCORE = 0.7; // 70/100 overall score

// ─── Escrow Caps by Tier ─────────────────────────────────────────────────────

const ESCROW_CAPS: Record<VerificationTier, number> = {
    UNVERIFIED: 0,         // Cannot use escrow
    GITHUB_VERIFIED: 500,
    OWNER_VOUCHED: 2000,
    ESTABLISHED: 10000,
};

// ─── Service ─────────────────────────────────────────────────────────────────

export class IdentityVerification {
    private db: Database;

    constructor(db: Database) {
        this.db = db;
    }

    /**
     * Get the current verification tier for an agent.
     * Returns UNVERIFIED if no record exists.
     */
    getTier(agentId: string): VerificationTier {
        const row = this.db.query(
            'SELECT tier FROM agent_identity WHERE agent_id = ?',
        ).get(agentId) as { tier: string } | null;

        return (row?.tier as VerificationTier) ?? 'UNVERIFIED';
    }

    /**
     * Get the full identity record for an agent.
     */
    getIdentity(agentId: string): AgentIdentity | null {
        const row = this.db.query(
            'SELECT * FROM agent_identity WHERE agent_id = ?',
        ).get(agentId) as AgentIdentityRecord | null;

        if (!row) return null;
        return recordToIdentity(row);
    }

    /**
     * Set the verification tier for an agent.
     * Only allows upgrades — cannot downgrade (except via admin reset).
     */
    setTier(agentId: string, tier: VerificationTier, dataHash?: string): AgentIdentity {
        const current = this.getTier(agentId);
        if (TIER_RANK[tier] < TIER_RANK[current]) {
            log.warn('Attempted tier downgrade blocked', { agentId, current, requested: tier });
            return this.getIdentity(agentId) ?? this.ensureRecord(agentId);
        }

        this.db.query(`
            INSERT INTO agent_identity (agent_id, tier, verified_at, verification_data_hash, updated_at)
            VALUES (?, ?, datetime('now'), ?, datetime('now'))
            ON CONFLICT(agent_id) DO UPDATE SET
                tier = ?,
                verified_at = datetime('now'),
                verification_data_hash = COALESCE(?, verification_data_hash),
                updated_at = datetime('now')
        `).run(agentId, tier, dataHash ?? null, tier, dataHash ?? null);

        log.info('Verification tier updated', { agentId, tier });
        return this.getIdentity(agentId)!;
    }

    /**
     * Record a GitHub verification for an agent.
     */
    verifyGithub(agentId: string, githubDataHash: string): AgentIdentity {
        return this.setTier(agentId, 'GITHUB_VERIFIED', githubDataHash);
    }

    /**
     * Record an owner vouch for an agent.
     */
    recordVouch(agentId: string, voucherHash: string): AgentIdentity {
        return this.setTier(agentId, 'OWNER_VOUCHED', voucherHash);
    }

    /**
     * Evaluate whether an agent qualifies for ESTABLISHED tier.
     * Auto-assigns if thresholds are met. Returns the (possibly updated) tier.
     */
    evaluateEstablished(agentId: string): VerificationTier {
        // Only upgrade if currently below ESTABLISHED
        const current = this.getTier(agentId);
        if (TIER_RANK[current] >= TIER_RANK.ESTABLISHED) return current;

        // Check age
        const agent = this.db.query(
            'SELECT created_at FROM agents WHERE id = ?',
        ).get(agentId) as { created_at: string } | null;

        if (!agent) return current;
        const ageDays = (Date.now() - new Date(agent.created_at).getTime()) / (1000 * 60 * 60 * 24);
        if (ageDays < ESTABLISHED_MIN_DAYS) return current;

        // Check completed tasks
        const taskRow = this.db.query(`
            SELECT COUNT(*) as completed FROM work_tasks
            WHERE agent_id = ? AND status = 'completed'
        `).get(agentId) as { completed: number };

        if (taskRow.completed < ESTABLISHED_MIN_TASKS) return current;

        // Check reputation score
        const scoreRow = this.db.query(
            'SELECT overall_score FROM agent_reputation WHERE agent_id = ?',
        ).get(agentId) as { overall_score: number } | null;

        if (!scoreRow || scoreRow.overall_score < ESTABLISHED_MIN_SCORE * 100) return current;

        // All thresholds met — upgrade
        this.setTier(agentId, 'ESTABLISHED');
        log.info('Agent auto-upgraded to ESTABLISHED', { agentId });
        return 'ESTABLISHED';
    }

    /**
     * Get the maximum escrow amount allowed for a tier.
     */
    getEscrowCap(tier: VerificationTier): number {
        return ESCROW_CAPS[tier];
    }

    /**
     * Check whether the given tier meets the minimum requirement.
     */
    meetsMinimumTier(agentTier: VerificationTier, requiredTier: VerificationTier): boolean {
        return TIER_RANK[agentTier] >= TIER_RANK[requiredTier];
    }

    /**
     * Get all agent identities (for admin listing).
     */
    getAllIdentities(): AgentIdentity[] {
        const rows = this.db.query(
            'SELECT * FROM agent_identity ORDER BY updated_at DESC',
        ).all() as AgentIdentityRecord[];

        return rows.map(recordToIdentity);
    }

    // ─── Private ─────────────────────────────────────────────────────────

    private ensureRecord(agentId: string): AgentIdentity {
        this.db.query(`
            INSERT OR IGNORE INTO agent_identity (agent_id, tier)
            VALUES (?, 'UNVERIFIED')
        `).run(agentId);

        return this.getIdentity(agentId)!;
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function recordToIdentity(row: AgentIdentityRecord): AgentIdentity {
    return {
        agentId: row.agent_id,
        tier: row.tier as VerificationTier,
        verifiedAt: row.verified_at,
        verificationDataHash: row.verification_data_hash,
        updatedAt: row.updated_at,
    };
}

export { TIER_RANK, ESCROW_CAPS };

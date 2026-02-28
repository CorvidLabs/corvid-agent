/**
 * ReputationScorer — Weighted composite scoring for agent reputation.
 *
 * Computes reputation scores from multiple components:
 * - Task completion rate
 * - Peer ratings from marketplace reviews
 * - Credit spending patterns
 * - Security compliance (violations reduce score)
 * - Activity level (recent sessions/tasks)
 */
import type { Database } from 'bun:sqlite';
import type {
    ReputationScore,
    ReputationComponents,
    TrustLevel,
    ScoreWeights,
    ReputationRecord,
    ReputationEventRecord,
    RecordEventInput,
} from './types';
import { DEFAULT_WEIGHTS } from './types';
import { createLogger } from '../lib/logger';

const log = createLogger('ReputationScorer');

// ─── Decay Constants ─────────────────────────────────────────────────────────

/** Days of inactivity before decay begins */
const DECAY_GRACE_DAYS = 30;
/** Decay rate per week after grace period */
const DECAY_RATE_PER_WEEK = 0.95;
/** Minimum reputation floor (never fully zero) */
const REPUTATION_FLOOR = 0.1;

// ─── Trust Level Thresholds ──────────────────────────────────────────────────

function computeTrustLevel(score: number): TrustLevel {
    if (score >= 90) return 'verified';
    if (score >= 70) return 'high';
    if (score >= 50) return 'medium';
    if (score >= 25) return 'low';
    return 'untrusted';
}

// ─── Component Computation ───────────────────────────────────────────────────

/**
 * Compute task completion rate from work_tasks table.
 * Score = (completed / total) * 100, with a minimum of 3 tasks for meaningful data.
 */
function computeTaskCompletion(db: Database, agentId: string): number {
    const row = db.query(`
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
        FROM work_tasks
        WHERE agent_id = ?
          AND created_at > datetime('now', '-90 days')
    `).get(agentId) as { total: number; completed: number } | null;

    if (!row || row.total < 3) return 50; // Default for insufficient data
    return Math.round((row.completed / row.total) * 100);
}

/**
 * Compute peer rating from marketplace reviews.
 * Normalized to 0-100 scale (reviews are 1-5).
 */
function computePeerRating(db: Database, agentId: string): number {
    const row = db.query(`
        SELECT AVG(r.rating) as avg_rating, COUNT(*) as count
        FROM marketplace_reviews r
        JOIN marketplace_listings l ON l.id = r.listing_id
        WHERE l.agent_id = ?
    `).get(agentId) as { avg_rating: number | null; count: number } | null;

    if (!row || row.count === 0 || row.avg_rating === null) return 50;
    // Convert 1-5 scale to 0-100
    return Math.round(((row.avg_rating - 1) / 4) * 100);
}

/**
 * Compute credit spending pattern score.
 * Agents that earn more than they spend are rated higher.
 */
function computeCreditPattern(db: Database, agentId: string): number {
    const events = db.query(`
        SELECT event_type, SUM(ABS(score_impact)) as total
        FROM reputation_events
        WHERE agent_id = ?
          AND event_type IN ('credit_spent', 'credit_earned')
          AND created_at > datetime('now', '-90 days')
        GROUP BY event_type
    `).all(agentId) as { event_type: string; total: number }[];

    let earned = 0;
    let spent = 0;
    for (const row of events) {
        if (row.event_type === 'credit_earned') earned = row.total;
        if (row.event_type === 'credit_spent') spent = row.total;
    }

    if (earned === 0 && spent === 0) return 50;
    // Ratio-based: earning >> spending = high score
    const ratio = spent > 0 ? earned / spent : earned > 0 ? 2.0 : 1.0;
    return Math.min(100, Math.round(ratio * 50));
}

/**
 * Compute security compliance score.
 * Starts at 100, each violation in the last 90 days deducts 20 points.
 */
function computeSecurityCompliance(db: Database, agentId: string): number {
    const row = db.query(`
        SELECT COUNT(*) as violations
        FROM reputation_events
        WHERE agent_id = ?
          AND event_type = 'security_violation'
          AND created_at > datetime('now', '-90 days')
    `).get(agentId) as { violations: number } | null;

    const violations = row?.violations ?? 0;
    return Math.max(0, 100 - violations * 20);
}

/**
 * Compute activity level from recent sessions.
 * More active agents get higher scores, capped at 100.
 */
function computeActivityLevel(db: Database, agentId: string): number {
    const row = db.query(`
        SELECT COUNT(*) as sessions
        FROM sessions
        WHERE agent_id = ?
          AND created_at > datetime('now', '-30 days')
    `).get(agentId) as { sessions: number } | null;

    const sessions = row?.sessions ?? 0;
    if (sessions === 0) return 0;
    // 10+ sessions in 30 days = full score
    return Math.min(100, sessions * 10);
}

// ─── Reputation Decay ────────────────────────────────────────────────────────

/**
 * Compute time-based decay factor for an inactive agent.
 *
 * "Inactivity" = no completed work tasks AND no positive attestations
 * after the grace period. Decay is 5% per week beyond 30 days.
 * Returns a multiplier in the range [REPUTATION_FLOOR, 1.0].
 */
function computeDecayFactor(db: Database, agentId: string): number {
    // Find the most recent positive signal: completed task or positive attestation
    const lastActivity = db.query(`
        SELECT MAX(latest) as last_active FROM (
            SELECT MAX(created_at) as latest FROM work_tasks
            WHERE agent_id = ? AND status = 'completed'
            UNION ALL
            SELECT MAX(created_at) as latest FROM reputation_events
            WHERE agent_id = ? AND event_type IN ('task_completed', 'attestation_published')
        )
    `).get(agentId, agentId) as { last_active: string | null } | null;

    if (!lastActivity?.last_active) {
        // No activity at all — check if agent even exists
        const agent = db.query('SELECT created_at FROM agents WHERE id = ?').get(agentId) as { created_at: string } | null;
        if (!agent) return 1.0; // Unknown agent, no decay
        // Use agent creation date as baseline
        const ageDays = (Date.now() - new Date(agent.created_at).getTime()) / (1000 * 60 * 60 * 24);
        if (ageDays <= DECAY_GRACE_DAYS) return 1.0;
        const weeksInactive = (ageDays - DECAY_GRACE_DAYS) / 7;
        return Math.max(REPUTATION_FLOOR, Math.pow(DECAY_RATE_PER_WEEK, weeksInactive));
    }

    const lastActiveDate = new Date(lastActivity.last_active);
    if (isNaN(lastActiveDate.getTime())) return 1.0; // Invalid date, no decay

    const daysSinceActivity = (Date.now() - lastActiveDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceActivity <= DECAY_GRACE_DAYS) return 1.0;

    const weeksInactive = (daysSinceActivity - DECAY_GRACE_DAYS) / 7;
    return Math.max(REPUTATION_FLOOR, Math.pow(DECAY_RATE_PER_WEEK, weeksInactive));
}

// ─── Scorer Service ──────────────────────────────────────────────────────────

export class ReputationScorer {
    private db: Database;
    private weights: ScoreWeights;

    constructor(db: Database, weights: ScoreWeights = DEFAULT_WEIGHTS) {
        this.db = db;
        this.weights = weights;
    }

    /**
     * Compute the full reputation score for an agent.
     */
    computeScore(agentId: string): ReputationScore {
        const components = this.computeComponents(agentId);
        const rawScore = this.computeOverall(components);

        // Apply time-based decay for inactive agents
        const decayFactor = computeDecayFactor(this.db, agentId);
        const overallScore = Math.max(
            1, // Never fully zero — minimum floor
            Math.round(rawScore * decayFactor),
        );
        const trustLevel = computeTrustLevel(overallScore);

        // Check for existing attestation hash
        const existing = this.db.query(
            'SELECT attestation_hash FROM agent_reputation WHERE agent_id = ?',
        ).get(agentId) as { attestation_hash: string | null } | null;

        const score: ReputationScore = {
            agentId,
            overallScore,
            trustLevel,
            components,
            attestationHash: existing?.attestation_hash ?? null,
            computedAt: new Date().toISOString(),
        };

        // Persist
        this.saveScore(score);

        return score;
    }

    /**
     * Get the cached reputation score (without recomputing).
     */
    getCachedScore(agentId: string): ReputationScore | null {
        const row = this.db.query(
            'SELECT * FROM agent_reputation WHERE agent_id = ?',
        ).get(agentId) as ReputationRecord | null;

        if (!row) return null;

        return {
            agentId: row.agent_id,
            overallScore: row.overall_score,
            trustLevel: row.trust_level as TrustLevel,
            components: {
                taskCompletion: row.task_completion,
                peerRating: row.peer_rating,
                creditPattern: row.credit_pattern,
                securityCompliance: row.security_compliance,
                activityLevel: row.activity_level,
            },
            attestationHash: row.attestation_hash,
            computedAt: row.computed_at,
        };
    }

    /**
     * Record a reputation event.
     */
    recordEvent(input: RecordEventInput): void {
        const id = crypto.randomUUID();

        this.db.query(`
            INSERT INTO reputation_events (id, agent_id, event_type, score_impact, metadata)
            VALUES (?, ?, ?, ?, ?)
        `).run(
            id,
            input.agentId,
            input.eventType,
            input.scoreImpact,
            JSON.stringify(input.metadata ?? {}),
        );

        log.debug('Recorded reputation event', { id, agentId: input.agentId, type: input.eventType });
    }

    /**
     * Get reputation events for an agent.
     */
    getEvents(agentId: string, limit: number = 50): ReputationEventRecord[] {
        return this.db.query(`
            SELECT * FROM reputation_events
            WHERE agent_id = ?
            ORDER BY created_at DESC
            LIMIT ?
        `).all(agentId, limit) as ReputationEventRecord[];
    }

    /**
     * Compute scores for all agents that are stale or missing.
     * Staleness threshold: 5 minutes.
     */
    computeAllIfStale(): ReputationScore[] {
        const STALE_MINUTES = 5;
        const now = Date.now();
        const threshold = STALE_MINUTES * 60 * 1000;

        // Batch-fetch all agents and their cached computed_at timestamps in two queries
        const agents = this.db.query('SELECT id FROM agents').all() as { id: string }[];
        const cachedRows = this.db.query(
            'SELECT agent_id, computed_at FROM agent_reputation',
        ).all() as { agent_id: string; computed_at: string }[];

        const computedAtMap = new Map<string, string>();
        for (const row of cachedRows) {
            computedAtMap.set(row.agent_id, row.computed_at);
        }

        const results: ReputationScore[] = [];

        for (const agent of agents) {
            const cachedTime = computedAtMap.get(agent.id);
            let isStale = true;
            if (cachedTime) {
                const computedAt = new Date(cachedTime).getTime();
                // Treat invalid/NaN dates as stale
                isStale = !Number.isFinite(computedAt) || (now - computedAt) > threshold;
            }

            if (isStale) {
                results.push(this.computeScore(agent.id));
            } else {
                results.push(this.getCachedScore(agent.id)!);
            }
        }

        // Sort by score descending
        results.sort((a, b) => b.overallScore - a.overallScore);
        return results;
    }

    /**
     * Force-recompute scores for all agents.
     */
    computeAll(): ReputationScore[] {
        const agents = this.db.query('SELECT id FROM agents').all() as { id: string }[];
        const results = agents.map((a) => this.computeScore(a.id));
        results.sort((a, b) => b.overallScore - a.overallScore);
        return results;
    }

    /**
     * Get reputation scores for all agents.
     */
    getAllScores(): ReputationScore[] {
        const rows = this.db.query(
            'SELECT * FROM agent_reputation ORDER BY overall_score DESC',
        ).all() as ReputationRecord[];

        return rows.map((row) => ({
            agentId: row.agent_id,
            overallScore: row.overall_score,
            trustLevel: row.trust_level as TrustLevel,
            components: {
                taskCompletion: row.task_completion,
                peerRating: row.peer_rating,
                creditPattern: row.credit_pattern,
                securityCompliance: row.security_compliance,
                activityLevel: row.activity_level,
            },
            attestationHash: row.attestation_hash,
            computedAt: row.computed_at,
        }));
    }

    /**
     * Update the attestation hash for an agent's reputation.
     */
    setAttestationHash(agentId: string, hash: string): void {
        this.db.query(
            'UPDATE agent_reputation SET attestation_hash = ? WHERE agent_id = ?',
        ).run(hash, agentId);
    }

    // ─── Private ─────────────────────────────────────────────────────────────

    private computeComponents(agentId: string): ReputationComponents {
        return {
            taskCompletion: computeTaskCompletion(this.db, agentId),
            peerRating: computePeerRating(this.db, agentId),
            creditPattern: computeCreditPattern(this.db, agentId),
            securityCompliance: computeSecurityCompliance(this.db, agentId),
            activityLevel: computeActivityLevel(this.db, agentId),
        };
    }

    private computeOverall(components: ReputationComponents): number {
        const weighted =
            components.taskCompletion * this.weights.taskCompletion +
            components.peerRating * this.weights.peerRating +
            components.creditPattern * this.weights.creditPattern +
            components.securityCompliance * this.weights.securityCompliance +
            components.activityLevel * this.weights.activityLevel;

        return Math.round(Math.max(0, Math.min(100, weighted)));
    }

    private saveScore(score: ReputationScore): void {
        this.db.query(`
            INSERT OR REPLACE INTO agent_reputation
                (agent_id, overall_score, trust_level, task_completion, peer_rating,
                 credit_pattern, security_compliance, activity_level, attestation_hash, computed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            score.agentId,
            score.overallScore,
            score.trustLevel,
            score.components.taskCompletion,
            score.components.peerRating,
            score.components.creditPattern,
            score.components.securityCompliance,
            score.components.activityLevel,
            score.attestationHash,
            score.computedAt,
        );
    }
}

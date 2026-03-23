/**
 * FlockConflictResolver — Cross-machine conflict detection and resolution
 * for multi-agent deployments.
 *
 * When multiple agent instances run on different machines, they need to
 * coordinate to avoid duplicate work on the same repo/issue. This service
 * manages "work claims" — ephemeral records that track which agent is
 * actively working on which repo/issue.
 *
 * Claims are stored in the local DB and broadcast to the Flock Directory
 * so other instances can check before starting work.
 *
 * Flow:
 * 1. Before starting a work task, agent calls `checkAndClaim()`
 * 2. If no conflicting claim exists, a claim is created and broadcast
 * 3. When the task finishes (success or failure), agent calls `releaseClaim()`
 * 4. Stale claims auto-expire after a configurable TTL
 */

import type { Database } from 'bun:sqlite';
import type { FlockDirectoryService } from './service';
import { createLogger } from '../lib/logger';

const log = createLogger('FlockConflictResolver');

/** Default claim TTL: 2 hours (longer than repo locks since work tasks can be long) */
const DEFAULT_CLAIM_TTL_MS = 2 * 60 * 60 * 1000;

export interface WorkClaim {
    /** Unique claim ID */
    id: string;
    /** Agent ID (flock_agents.id) that holds the claim */
    agentId: string;
    /** Agent name for display */
    agentName: string;
    /** Repository identifier (e.g. "CorvidLabs/corvid-agent") */
    repo: string;
    /** GitHub issue number being worked on, if any */
    issueNumber: number | null;
    /** Branch name the agent is working on */
    branch: string | null;
    /** Human-readable description of the work */
    description: string;
    /** When the claim was created */
    claimedAt: string;
    /** When the claim expires */
    expiresAt: string;
    /** Claim status */
    status: 'active' | 'released' | 'expired' | 'superseded';
}

export interface ClaimConflict {
    /** The existing claim that conflicts */
    existingClaim: WorkClaim;
    /** Why this is a conflict */
    reason: 'same_issue' | 'same_repo' | 'same_branch';
    /** Whether the conflict can be overridden (e.g. expired or lower-priority agent) */
    overridable: boolean;
}

export interface CheckClaimResult {
    /** Whether the agent can proceed */
    allowed: boolean;
    /** Any conflicts found */
    conflicts: ClaimConflict[];
    /** The claim that was created (if allowed) */
    claim: WorkClaim | null;
}

export interface ConflictResolverConfig {
    /** Claim TTL in milliseconds */
    claimTtlMs: number;
    /** This agent's flock ID (from self-registration) */
    selfAgentId: string;
    /** This agent's name */
    selfAgentName: string;
    /** Whether to allow overriding expired claims automatically */
    autoOverrideExpired: boolean;
    /** Whether same-repo (but different issue) conflicts should block */
    blockOnSameRepo: boolean;
}

const DEFAULT_CONFIG: ConflictResolverConfig = {
    claimTtlMs: DEFAULT_CLAIM_TTL_MS,
    selfAgentId: '',
    selfAgentName: '',
    autoOverrideExpired: true,
    blockOnSameRepo: false, // Only block on same issue by default
};

export class FlockConflictResolver {
    private readonly db: Database;
    readonly flockService: FlockDirectoryService;
    private readonly config: ConflictResolverConfig;

    constructor(
        db: Database,
        flockService: FlockDirectoryService,
        config?: Partial<ConflictResolverConfig>,
    ) {
        this.db = db;
        this.flockService = flockService;
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Initialize the work_claims table if it doesn't exist.
     * Called during bootstrap.
     */
    ensureSchema(): void {
        this.db.run(`
            CREATE TABLE IF NOT EXISTS work_claims (
                id TEXT PRIMARY KEY,
                agent_id TEXT NOT NULL,
                agent_name TEXT NOT NULL DEFAULT '',
                repo TEXT NOT NULL,
                issue_number INTEGER,
                branch TEXT,
                description TEXT NOT NULL DEFAULT '',
                claimed_at TEXT NOT NULL DEFAULT (datetime('now')),
                expires_at TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'active',
                resolved_reason TEXT
            )
        `);
        this.db.run(`
            CREATE INDEX IF NOT EXISTS idx_work_claims_repo_active
            ON work_claims (repo, status) WHERE status = 'active'
        `);
        this.db.run(`
            CREATE INDEX IF NOT EXISTS idx_work_claims_agent
            ON work_claims (agent_id, status)
        `);
    }

    /**
     * Check for conflicts and create a claim if no blocking conflicts exist.
     *
     * Returns the check result with any conflicts found and the claim if created.
     */
    checkAndClaim(opts: {
        repo: string;
        issueNumber?: number;
        branch?: string;
        description: string;
    }): CheckClaimResult {
        // Clean expired claims first
        this.cleanExpired();

        const conflicts = this.findConflicts(opts.repo, opts.issueNumber ?? null, opts.branch ?? null);

        // Filter to blocking conflicts
        const blocking = conflicts.filter(c => !c.overridable);

        if (blocking.length > 0) {
            log.info('Work claim blocked by existing claims', {
                repo: opts.repo,
                issueNumber: opts.issueNumber,
                conflicts: blocking.map(c => ({
                    agentName: c.existingClaim.agentName,
                    reason: c.reason,
                    claimedAt: c.existingClaim.claimedAt,
                })),
            });

            return {
                allowed: false,
                conflicts,
                claim: null,
            };
        }

        // Override any expired claims on this repo/issue
        if (this.config.autoOverrideExpired) {
            for (const conflict of conflicts) {
                if (conflict.overridable) {
                    this.supersedeClaim(conflict.existingClaim.id);
                }
            }
        }

        // Create the claim
        const claim = this.createClaim(opts);

        log.info('Work claim created', {
            claimId: claim.id,
            repo: opts.repo,
            issueNumber: opts.issueNumber,
            branch: opts.branch,
            overrodeExpired: conflicts.filter(c => c.overridable).length,
        });

        return {
            allowed: true,
            conflicts,
            claim,
        };
    }

    /**
     * Release a claim when work is done (success or failure).
     */
    releaseClaim(claimId: string, reason?: string): boolean {
        const result = this.db.query(`
            UPDATE work_claims SET status = 'released', resolved_reason = ?
            WHERE id = ? AND status = 'active'
        `).run(reason ?? 'completed', claimId);

        if (result.changes > 0) {
            log.debug('Work claim released', { claimId, reason });
            return true;
        }
        return false;
    }

    /**
     * Release all claims held by this agent instance.
     * Called during graceful shutdown.
     */
    releaseAllClaims(reason = 'shutdown'): number {
        const result = this.db.query(`
            UPDATE work_claims SET status = 'released', resolved_reason = ?
            WHERE agent_id = ? AND status = 'active'
        `).run(reason, this.config.selfAgentId);

        if (result.changes > 0) {
            log.info('Released all claims on shutdown', { count: result.changes });
        }
        return result.changes;
    }

    /**
     * Find conflicts for a proposed claim.
     */
    findConflicts(
        repo: string,
        issueNumber: number | null,
        branch: string | null,
    ): ClaimConflict[] {
        const conflicts: ClaimConflict[] = [];
        const now = new Date().toISOString();

        // Get all active claims on this repo
        const activeClaims = this.db.query(`
            SELECT * FROM work_claims
            WHERE repo = ? AND status = 'active'
            ORDER BY claimed_at DESC
        `).all(repo) as WorkClaimRow[];

        for (const row of activeClaims) {
            // Skip our own claims
            if (row.agent_id === this.config.selfAgentId) continue;

            const claim = rowToClaim(row);
            const isExpired = new Date(claim.expiresAt) < new Date(now);

            // Same issue number — strongest conflict
            if (issueNumber !== null && row.issue_number === issueNumber) {
                conflicts.push({
                    existingClaim: claim,
                    reason: 'same_issue',
                    overridable: isExpired,
                });
                continue;
            }

            // Same branch — strong conflict
            if (branch !== null && row.branch === branch) {
                conflicts.push({
                    existingClaim: claim,
                    reason: 'same_branch',
                    overridable: isExpired,
                });
                continue;
            }

            // Same repo (different issue) — weak conflict, only blocks if configured
            if (this.config.blockOnSameRepo) {
                conflicts.push({
                    existingClaim: claim,
                    reason: 'same_repo',
                    overridable: isExpired,
                });
            }
        }

        return conflicts;
    }

    /**
     * List all active claims, optionally filtered by repo.
     */
    listActiveClaims(repo?: string): WorkClaim[] {
        this.cleanExpired();

        const query = repo
            ? `SELECT * FROM work_claims WHERE status = 'active' AND repo = ? ORDER BY claimed_at DESC`
            : `SELECT * FROM work_claims WHERE status = 'active' ORDER BY claimed_at DESC`;

        const rows = (repo
            ? this.db.query(query).all(repo)
            : this.db.query(query).all()
        ) as WorkClaimRow[];

        return rows.map(rowToClaim);
    }

    /**
     * Get a claim by ID.
     */
    getClaim(claimId: string): WorkClaim | null {
        const row = this.db.query(
            `SELECT * FROM work_claims WHERE id = ?`,
        ).get(claimId) as WorkClaimRow | null;

        return row ? rowToClaim(row) : null;
    }

    /**
     * Get claims held by a specific agent.
     */
    getAgentClaims(agentId: string): WorkClaim[] {
        const rows = this.db.query(`
            SELECT * FROM work_claims
            WHERE agent_id = ? AND status = 'active'
            ORDER BY claimed_at DESC
        `).all(agentId) as WorkClaimRow[];

        return rows.map(rowToClaim);
    }

    /**
     * Get conflict resolution statistics.
     */
    getStats(): {
        activeClaims: number;
        totalClaims: number;
        conflictsBlocked: number;
        conflictsOverridden: number;
    } {
        const active = (this.db.query(
            `SELECT COUNT(*) as cnt FROM work_claims WHERE status = 'active'`,
        ).get() as { cnt: number }).cnt;

        const total = (this.db.query(
            `SELECT COUNT(*) as cnt FROM work_claims`,
        ).get() as { cnt: number }).cnt;

        const blocked = (this.db.query(
            `SELECT COUNT(*) as cnt FROM work_claims WHERE status = 'released' AND resolved_reason = 'conflict_blocked'`,
        ).get() as { cnt: number }).cnt;

        const overridden = (this.db.query(
            `SELECT COUNT(*) as cnt FROM work_claims WHERE status = 'superseded'`,
        ).get() as { cnt: number }).cnt;

        return {
            activeClaims: active,
            totalClaims: total,
            conflictsBlocked: blocked,
            conflictsOverridden: overridden,
        };
    }

    // ─── Private Methods ────────────────────────────────────────────────

    private createClaim(opts: {
        repo: string;
        issueNumber?: number;
        branch?: string;
        description: string;
    }): WorkClaim {
        const id = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + this.config.claimTtlMs).toISOString();

        this.db.query(`
            INSERT INTO work_claims (id, agent_id, agent_name, repo, issue_number, branch, description, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            id,
            this.config.selfAgentId,
            this.config.selfAgentName,
            opts.repo,
            opts.issueNumber ?? null,
            opts.branch ?? null,
            opts.description,
            expiresAt,
        );

        return this.getClaim(id)!;
    }

    private supersedeClaim(claimId: string): void {
        this.db.query(`
            UPDATE work_claims SET status = 'superseded', resolved_reason = 'expired_override'
            WHERE id = ?
        `).run(claimId);
        log.debug('Superseded expired claim', { claimId });
    }

    private cleanExpired(): number {
        const result = this.db.query(`
            UPDATE work_claims SET status = 'expired', resolved_reason = 'ttl'
            WHERE status = 'active' AND expires_at < datetime('now')
        `).run();

        if (result.changes > 0) {
            log.debug('Cleaned expired work claims', { count: result.changes });
        }

        // Trim old history
        this.db.query(`
            DELETE FROM work_claims
            WHERE status IN ('released', 'expired', 'superseded')
              AND claimed_at < datetime('now', '-7 days')
        `).run();

        return result.changes;
    }
}

// ─── Internal Types ─────────────────────────────────────────────────────────

interface WorkClaimRow {
    id: string;
    agent_id: string;
    agent_name: string;
    repo: string;
    issue_number: number | null;
    branch: string | null;
    description: string;
    claimed_at: string;
    expires_at: string;
    status: string;
    resolved_reason: string | null;
}

function rowToClaim(row: WorkClaimRow): WorkClaim {
    return {
        id: row.id,
        agentId: row.agent_id,
        agentName: row.agent_name,
        repo: row.repo,
        issueNumber: row.issue_number,
        branch: row.branch,
        description: row.description,
        claimedAt: row.claimed_at,
        expiresAt: row.expires_at,
        status: row.status as WorkClaim['status'],
    };
}

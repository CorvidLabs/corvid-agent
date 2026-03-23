/**
 * CapabilityRouter — Routes tasks to the best available agent based on
 * capabilities, reputation, and current workload.
 *
 * This bridges the Flock Directory (who can do what) with the work task
 * system (what needs to be done). When a task arrives that could be
 * delegated, the router selects the best candidate from the flock.
 *
 * Selection criteria (weighted):
 * 1. Capability match (required) — agent must have the needed capability
 * 2. Reputation score (40%) — higher reputation preferred
 * 3. Current workload (30%) — prefer agents with fewer active claims
 * 4. Uptime (20%) — prefer agents with better availability
 * 5. Recency of heartbeat (10%) — prefer recently-active agents
 */

import type { FlockDirectoryService } from './service';
import type { FlockConflictResolver } from './conflict-resolver';
import type { FlockAgent } from '../../shared/types/flock-directory';
import { createLogger } from '../lib/logger';

const log = createLogger('CapabilityRouter');

/** Well-known capability identifiers used across the flock. */
export const CAPABILITIES = {
    CODE_REVIEW: 'code_review',
    BUG_FIX: 'bug_fix',
    FEATURE_WORK: 'feature_work',
    SECURITY_AUDIT: 'security_audit',
    DEPENDENCY_AUDIT: 'dependency_audit',
    DOCUMENTATION: 'documentation',
    TESTING: 'testing',
    DEVOPS: 'devops',
    REFACTORING: 'refactoring',
    TRIAGE: 'triage',
} as const;

export type Capability = (typeof CAPABILITIES)[keyof typeof CAPABILITIES];

/** Maps action types (from schedules/work tasks) to required capabilities. */
const ACTION_CAPABILITY_MAP: Record<string, Capability[]> = {
    code_review: [CAPABILITIES.CODE_REVIEW],
    codebase_review: [CAPABILITIES.CODE_REVIEW, CAPABILITIES.REFACTORING],
    security_audit: [CAPABILITIES.SECURITY_AUDIT],
    dependency_audit: [CAPABILITIES.DEPENDENCY_AUDIT],
    improvement_loop: [CAPABILITIES.FEATURE_WORK, CAPABILITIES.REFACTORING],
    work_task: [CAPABILITIES.FEATURE_WORK, CAPABILITIES.BUG_FIX],
    github_suggest: [CAPABILITIES.FEATURE_WORK],
    documentation: [CAPABILITIES.DOCUMENTATION],
    testing: [CAPABILITIES.TESTING],
    triage: [CAPABILITIES.TRIAGE],
};

export interface RouteCandidate {
    agent: FlockAgent;
    /** Overall routing score (0–100) */
    score: number;
    /** Breakdown of score components */
    breakdown: {
        capabilityMatch: number;
        reputation: number;
        workload: number;
        uptime: number;
        recency: number;
    };
    /** Number of active claims this agent holds */
    activeClaims: number;
}

export interface RouteResult {
    /** Best candidate, or null if no suitable agent found */
    bestCandidate: RouteCandidate | null;
    /** All candidates considered, sorted by score descending */
    candidates: RouteCandidate[];
    /** Why certain agents were excluded */
    exclusions: Array<{ agentId: string; agentName: string; reason: string }>;
}

/** Scoring weights — must sum to 100. */
const WEIGHTS = {
    reputation: 40,
    workload: 30,
    uptime: 20,
    recency: 10,
} as const;

export class CapabilityRouter {
    private readonly flockService: FlockDirectoryService;
    private readonly conflictResolver: FlockConflictResolver | null;
    private readonly selfAgentId: string;

    constructor(
        flockService: FlockDirectoryService,
        conflictResolver?: FlockConflictResolver,
        selfAgentId?: string,
    ) {
        this.flockService = flockService;
        this.conflictResolver = conflictResolver ?? null;
        this.selfAgentId = selfAgentId ?? '';
    }

    /**
     * Find the best agent to handle a task with the given action type.
     *
     * @param actionType - The type of action (maps to required capabilities)
     * @param requiredCapabilities - Override: explicit capabilities required
     * @param excludeAgentIds - Agent IDs to exclude (e.g. self)
     * @param repo - If provided, checks for conflicting claims on this repo
     */
    route(opts: {
        actionType?: string;
        requiredCapabilities?: string[];
        excludeAgentIds?: string[];
        repo?: string;
    }): RouteResult {
        const required = opts.requiredCapabilities
            ?? (opts.actionType ? ACTION_CAPABILITY_MAP[opts.actionType] : null)
            ?? [];

        const excludeSet = new Set(opts.excludeAgentIds ?? []);
        // Always exclude self from routing
        if (this.selfAgentId) excludeSet.add(this.selfAgentId);

        // Get all active agents from the flock
        const allAgents = this.flockService.listActive(200);

        const candidates: RouteCandidate[] = [];
        const exclusions: RouteResult['exclusions'] = [];

        for (const agent of allAgents) {
            // Skip excluded agents
            if (excludeSet.has(agent.id)) {
                exclusions.push({ agentId: agent.id, agentName: agent.name, reason: 'excluded' });
                continue;
            }

            // Check capability match
            if (required.length > 0) {
                const hasAll = required.every(cap =>
                    agent.capabilities.includes(cap),
                );
                if (!hasAll) {
                    const missing = required.filter(cap => !agent.capabilities.includes(cap));
                    exclusions.push({
                        agentId: agent.id,
                        agentName: agent.name,
                        reason: `missing capabilities: ${missing.join(', ')}`,
                    });
                    continue;
                }
            }

            // Check for repo conflicts
            let activeClaims = 0;
            if (this.conflictResolver) {
                const claims = this.conflictResolver.getAgentClaims(agent.id);
                activeClaims = claims.length;

                if (opts.repo) {
                    const hasConflict = claims.some(c => c.repo === opts.repo);
                    if (hasConflict) {
                        exclusions.push({
                            agentId: agent.id,
                            agentName: agent.name,
                            reason: `already working on ${opts.repo}`,
                        });
                        continue;
                    }
                }
            }

            // Score the candidate
            const breakdown = this.scoreCandidate(agent, required, activeClaims);
            const score = Math.round(
                breakdown.reputation + breakdown.workload + breakdown.uptime + breakdown.recency,
            );

            candidates.push({ agent, score, breakdown, activeClaims });
        }

        // Sort by score descending
        candidates.sort((a, b) => b.score - a.score);

        const bestCandidate = candidates.length > 0 ? candidates[0] : null;

        if (bestCandidate) {
            log.info('Route result', {
                actionType: opts.actionType,
                bestAgent: bestCandidate.agent.name,
                bestScore: bestCandidate.score,
                totalCandidates: candidates.length,
                totalExcluded: exclusions.length,
            });
        } else {
            log.info('No suitable agent found for routing', {
                actionType: opts.actionType,
                requiredCapabilities: required,
                totalAgents: allAgents.length,
                exclusions: exclusions.length,
            });
        }

        return { bestCandidate, candidates, exclusions };
    }

    /**
     * Get the required capabilities for an action type.
     */
    getRequiredCapabilities(actionType: string): string[] {
        return ACTION_CAPABILITY_MAP[actionType] ?? [];
    }

    /**
     * Check if an action type is routable (has a known capability mapping).
     */
    isRoutable(actionType: string): boolean {
        return actionType in ACTION_CAPABILITY_MAP;
    }

    /**
     * List all known capabilities with descriptions.
     */
    listCapabilities(): Array<{ id: string; name: string }> {
        return Object.entries(CAPABILITIES).map(([name, id]) => ({
            id,
            name: name.toLowerCase().replace(/_/g, ' '),
        }));
    }

    // ─── Scoring ────────────────────────────────────────────────────────

    private scoreCandidate(
        agent: FlockAgent,
        _requiredCapabilities: string[],
        activeClaims: number,
    ): RouteCandidate['breakdown'] {
        // Reputation: direct mapping (0–100 → 0–WEIGHTS.reputation)
        const reputation = (agent.reputationScore / 100) * WEIGHTS.reputation;

        // Workload: fewer active claims = higher score
        // 0 claims = full score, 3+ claims = near zero
        const workloadFactor = Math.max(0, 1 - (activeClaims / 3));
        const workload = workloadFactor * WEIGHTS.workload;

        // Uptime: direct percentage mapping
        const uptime = (Math.min(agent.uptimePct, 100) / 100) * WEIGHTS.uptime;

        // Recency: how recently the agent sent a heartbeat
        // Within last hour = full score, 24+ hours = near zero
        let recency = 0;
        if (agent.lastHeartbeat) {
            const hoursSinceHeartbeat = (Date.now() - new Date(agent.lastHeartbeat).getTime()) / (1000 * 60 * 60);
            const recencyFactor = Math.max(0, 1 - (hoursSinceHeartbeat / 24));
            recency = recencyFactor * WEIGHTS.recency;
        }

        return {
            capabilityMatch: 100, // Already filtered — all candidates match
            reputation: Math.round(reputation * 10) / 10,
            workload: Math.round(workload * 10) / 10,
            uptime: Math.round(uptime * 10) / 10,
            recency: Math.round(recency * 10) / 10,
        };
    }
}

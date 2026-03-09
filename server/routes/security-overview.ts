/**
 * Security Overview route — returns all security configuration as JSON.
 *
 * Read-only endpoint that aggregates security settings from:
 * - Protected paths (basenames + substrings)
 * - Code scanner patterns (critical + warning)
 * - Approved fetch domains
 * - Governance tiers (Layer 0/1/2)
 * - GitHub allowlist count
 * - Repo blocklist count
 * - Branch protection configuration
 */

import type { Database } from 'bun:sqlite';
import { PROTECTED_BASENAMES, PROTECTED_SUBSTRINGS } from '../process/protected-paths';
import { APPROVED_DOMAINS } from '../lib/fetch-detector';
import {
    GOVERNANCE_TIERS,
    LAYER_0_BASENAMES, LAYER_0_SUBSTRINGS,
    LAYER_1_BASENAMES, LAYER_1_SUBSTRINGS,
} from '../councils/governance';
import { json } from '../lib/response';
import { ALL_PATTERNS } from '../lib/code-scanner';

/** Derive blocked-pattern summaries from the canonical code-scanner rules
 *  so this file never contains literal suspicious strings. */
const BLOCKED_PATTERNS = ALL_PATTERNS.map((p) => ({
    name: p.name,
    category: p.category,
    severity: p.severity,
}));

function queryCount(db: Database, sql: string): number {
    const row = db.query(sql).get() as { cnt: number } | null;
    return row?.cnt ?? 0;
}

export function handleSecurityOverviewRoutes(
    req: Request,
    url: URL,
    db: Database,
): Response | null {
    if (url.pathname !== '/api/security/overview' || req.method !== 'GET') {
        return null;
    }

    const allowlistCount = queryCount(db, 'SELECT COUNT(*) as cnt FROM github_allowlist');
    const blocklistCount = queryCount(db, 'SELECT COUNT(*) as cnt FROM repo_blocklist');

    return json({
        protectedBasenames: [...PROTECTED_BASENAMES],
        protectedSubstrings: [...PROTECTED_SUBSTRINGS],
        approvedDomains: [...APPROVED_DOMAINS],
        blockedPatterns: BLOCKED_PATTERNS,
        governanceTiers: Object.values(GOVERNANCE_TIERS).map((t) => ({
            tier: t.tier,
            label: t.label,
            description: t.description,
            quorumThreshold: t.quorumThreshold,
            requiresHumanApproval: t.requiresHumanApproval,
            allowsAutomation: t.allowsAutomation,
        })),
        governancePaths: {
            layer0: { basenames: [...LAYER_0_BASENAMES], substrings: [...LAYER_0_SUBSTRINGS] },
            layer1: { basenames: [...LAYER_1_BASENAMES], substrings: [...LAYER_1_SUBSTRINGS] },
        },
        autoMergeEnabled: true,
        branchProtection: {
            enforced: true,
            requiredReviews: 1,
            dismissStaleReviews: true,
            blockForcePushes: true,
            blockDeletions: true,
            enforceAdmins: true,
            requiredStatusChecks: [
                'Build & Test (ubuntu-latest)',
                'Build & Test (macos-latest)',
                'Build & Test (windows-latest)',
            ],
        },
        allowlistCount,
        blocklistCount,
    });
}

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

/** Summarized code scanner pattern for the overview response. */
interface PatternSummary {
    name: string;
    category: string;
    severity: 'critical' | 'warning';
}

/** The critical/warning patterns are not exported from code-scanner.ts,
 *  so we maintain a static summary here. Kept in sync via tests. */
const BLOCKED_PATTERNS: PatternSummary[] = [
    { name: 'eval()', category: 'dynamic_code_execution', severity: 'critical' },
    { name: 'new Function()', category: 'dynamic_code_execution', severity: 'critical' },
    { name: 'setTimeout/setInterval with string arg', category: 'dynamic_code_execution', severity: 'critical' },
    { name: "require('child_process')", category: 'child_process', severity: 'critical' },
    { name: "import 'child_process'", category: 'child_process', severity: 'critical' },
    { name: 'process.kill()', category: 'process_control', severity: 'critical' },
    { name: 'reverse shell (nc -e)', category: 'backdoor', severity: 'critical' },
    { name: 'hex-encoded eval', category: 'obfuscation', severity: 'critical' },
    { name: 'base64 decode + execute', category: 'obfuscation', severity: 'critical' },
    { name: 'stratum mining URL', category: 'crypto_mining', severity: 'critical' },
    { name: 'mining pool WebSocket', category: 'crypto_mining', severity: 'critical' },
    { name: 'process.exit()', category: 'process_control', severity: 'warning' },
    { name: 'excessive hex escapes', category: 'obfuscation', severity: 'warning' },
    { name: 'excessive unicode escapes', category: 'obfuscation', severity: 'warning' },
    { name: 'server binding in non-server file', category: 'backdoor', severity: 'warning' },
];

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
        allowlistCount,
        blocklistCount,
    });
}

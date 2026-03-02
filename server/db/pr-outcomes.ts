/**
 * PR Outcome tracking — CRUD operations for the pr_outcomes table.
 *
 * Tracks whether PRs created by work tasks were merged, closed, or went stale.
 */

import type { Database } from 'bun:sqlite';

export type PrState = 'open' | 'merged' | 'closed';
export type FailureReason = 'ci_fail' | 'review_rejection' | 'stale' | 'merge_conflict' | null;

export interface PrOutcome {
    id: string;
    workTaskId: string;
    prUrl: string;
    repo: string;
    prNumber: number;
    prState: PrState;
    failureReason: FailureReason;
    checkedAt: string | null;
    resolvedAt: string | null;
    createdAt: string;
}

interface PrOutcomeRow {
    id: string;
    work_task_id: string;
    pr_url: string;
    repo: string;
    pr_number: number;
    pr_state: string;
    failure_reason: string | null;
    checked_at: string | null;
    resolved_at: string | null;
    created_at: string;
}

function rowToOutcome(row: PrOutcomeRow): PrOutcome {
    return {
        id: row.id,
        workTaskId: row.work_task_id,
        prUrl: row.pr_url,
        repo: row.repo,
        prNumber: row.pr_number,
        prState: row.pr_state as PrState,
        failureReason: row.failure_reason as FailureReason,
        checkedAt: row.checked_at,
        resolvedAt: row.resolved_at,
        createdAt: row.created_at,
    };
}

/**
 * Parse a GitHub PR URL into repo and PR number.
 * Supports: https://github.com/owner/repo/pull/123
 */
export function parsePrUrl(prUrl: string): { repo: string; prNumber: number } | null {
    const match = prUrl.match(/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/);
    if (!match) return null;
    return { repo: match[1], prNumber: parseInt(match[2], 10) };
}

export function createPrOutcome(
    db: Database,
    params: {
        workTaskId: string;
        prUrl: string;
        repo: string;
        prNumber: number;
    },
): PrOutcome {
    const id = crypto.randomUUID();
    db.query(
        `INSERT INTO pr_outcomes (id, work_task_id, pr_url, repo, pr_number)
         VALUES (?, ?, ?, ?, ?)`
    ).run(id, params.workTaskId, params.prUrl, params.repo, params.prNumber);
    return getPrOutcome(db, id)!;
}

export function getPrOutcome(db: Database, id: string): PrOutcome | null {
    const row = db.query('SELECT * FROM pr_outcomes WHERE id = ?').get(id) as PrOutcomeRow | null;
    return row ? rowToOutcome(row) : null;
}

export function getPrOutcomeByWorkTask(db: Database, workTaskId: string): PrOutcome | null {
    const row = db.query(
        'SELECT * FROM pr_outcomes WHERE work_task_id = ?'
    ).get(workTaskId) as PrOutcomeRow | null;
    return row ? rowToOutcome(row) : null;
}

export function listOpenPrOutcomes(db: Database): PrOutcome[] {
    const rows = db.query(
        `SELECT * FROM pr_outcomes WHERE pr_state = 'open' ORDER BY created_at ASC`
    ).all() as PrOutcomeRow[];
    return rows.map(rowToOutcome);
}

export function listPrOutcomes(db: Database, opts?: {
    repo?: string;
    prState?: PrState;
    since?: string;
    limit?: number;
}): PrOutcome[] {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (opts?.repo) { conditions.push('repo = ?'); params.push(opts.repo); }
    if (opts?.prState) { conditions.push('pr_state = ?'); params.push(opts.prState); }
    if (opts?.since) { conditions.push('created_at >= ?'); params.push(opts.since); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = opts?.limit ?? 100;

    const rows = db.query(
        `SELECT * FROM pr_outcomes ${where} ORDER BY created_at DESC LIMIT ?`
    ).all(...params, limit) as PrOutcomeRow[];
    return rows.map(rowToOutcome);
}

export function updatePrOutcomeState(
    db: Database,
    id: string,
    prState: PrState,
    failureReason?: FailureReason,
): void {
    const resolved = prState !== 'open' ? "datetime('now')" : 'NULL';
    db.query(
        `UPDATE pr_outcomes
         SET pr_state = ?, failure_reason = ?, checked_at = datetime('now'), resolved_at = ${resolved}
         WHERE id = ?`
    ).run(prState, failureReason ?? null, id);
}

export function markPrChecked(db: Database, id: string): void {
    db.query(
        `UPDATE pr_outcomes SET checked_at = datetime('now') WHERE id = ?`
    ).run(id);
}

// ─── Aggregate Queries ──────────────────────────────────────────────────────

export interface OutcomeStats {
    total: number;
    merged: number;
    closed: number;
    open: number;
    mergeRate: number;
}

export function getOutcomeStatsByRepo(db: Database, since?: string): Record<string, OutcomeStats> {
    const condition = since ? 'WHERE created_at >= ?' : '';
    const params = since ? [since] : [];

    const rows = db.query(
        `SELECT repo, pr_state, COUNT(*) as count
         FROM pr_outcomes ${condition}
         GROUP BY repo, pr_state`
    ).all(...params) as { repo: string; pr_state: string; count: number }[];

    const stats: Record<string, OutcomeStats> = {};
    for (const row of rows) {
        if (!stats[row.repo]) {
            stats[row.repo] = { total: 0, merged: 0, closed: 0, open: 0, mergeRate: 0 };
        }
        stats[row.repo][row.pr_state as PrState] += row.count;
        stats[row.repo].total += row.count;
    }

    for (const repo of Object.keys(stats)) {
        const s = stats[repo];
        const resolved = s.merged + s.closed;
        s.mergeRate = resolved > 0 ? s.merged / resolved : 0;
    }

    return stats;
}

export function getFailureReasonBreakdown(db: Database, since?: string): Record<string, number> {
    const condition = since ? `WHERE pr_state = 'closed' AND created_at >= ?` : `WHERE pr_state = 'closed'`;
    const params = since ? [since] : [];

    const rows = db.query(
        `SELECT COALESCE(failure_reason, 'unknown') as reason, COUNT(*) as count
         FROM pr_outcomes ${condition}
         GROUP BY reason`
    ).all(...params) as { reason: string; count: number }[];

    const breakdown: Record<string, number> = {};
    for (const row of rows) {
        breakdown[row.reason] = row.count;
    }
    return breakdown;
}

export function getOverallOutcomeStats(db: Database, since?: string): OutcomeStats {
    const condition = since ? 'WHERE created_at >= ?' : '';
    const params = since ? [since] : [];

    const rows = db.query(
        `SELECT pr_state, COUNT(*) as count
         FROM pr_outcomes ${condition}
         GROUP BY pr_state`
    ).all(...params) as { pr_state: string; count: number }[];

    const stats: OutcomeStats = { total: 0, merged: 0, closed: 0, open: 0, mergeRate: 0 };
    for (const row of rows) {
        stats[row.pr_state as PrState] += row.count;
        stats.total += row.count;
    }

    const resolved = stats.merged + stats.closed;
    stats.mergeRate = resolved > 0 ? stats.merged / resolved : 0;

    return stats;
}

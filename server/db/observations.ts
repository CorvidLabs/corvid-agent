/**
 * DB helpers for memory observations — short-term insights that accumulate
 * relevance and may graduate to long-term ARC-69 memories.
 */

import type { Database } from 'bun:sqlite';
import type { MemoryObservation, ObservationSource, ObservationStatus } from '../../shared/types';

interface ObservationRow {
    id: string;
    agent_id: string;
    source: string;
    source_id: string | null;
    content: string;
    suggested_key: string | null;
    relevance_score: number;
    access_count: number;
    last_accessed_at: string | null;
    status: string;
    graduated_key: string | null;
    created_at: string;
    expires_at: string | null;
}

function rowToObservation(row: ObservationRow): MemoryObservation {
    return {
        id: row.id,
        agentId: row.agent_id,
        source: row.source as ObservationSource,
        sourceId: row.source_id,
        content: row.content,
        suggestedKey: row.suggested_key,
        relevanceScore: row.relevance_score,
        accessCount: row.access_count,
        lastAccessedAt: row.last_accessed_at,
        status: row.status as ObservationStatus,
        graduatedKey: row.graduated_key,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
    };
}

// ─── Create ─────────────────────────────────────────────────────────────────

export function recordObservation(
    db: Database,
    params: {
        agentId: string;
        source: ObservationSource;
        sourceId?: string;
        content: string;
        suggestedKey?: string;
        relevanceScore?: number;
        expiresAt?: string;
    },
): MemoryObservation {
    const id = crypto.randomUUID();
    const defaultExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

    db.query(
        `INSERT INTO memory_observations
            (id, agent_id, source, source_id, content, suggested_key, relevance_score, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
        id,
        params.agentId,
        params.source,
        params.sourceId ?? null,
        params.content,
        params.suggestedKey ?? null,
        params.relevanceScore ?? 1.0,
        params.expiresAt ?? defaultExpiry,
    );

    const row = db.query('SELECT * FROM memory_observations WHERE id = ?').get(id) as ObservationRow;
    return rowToObservation(row);
}

// ─── Read ───────────────────────────────────────────────────────────────────

export function getObservation(db: Database, id: string): MemoryObservation | null {
    const row = db.query('SELECT * FROM memory_observations WHERE id = ?').get(id) as ObservationRow | null;
    return row ? rowToObservation(row) : null;
}

export function listObservations(
    db: Database,
    agentId: string,
    opts?: { status?: ObservationStatus; limit?: number; source?: ObservationSource },
): MemoryObservation[] {
    const conditions = ['agent_id = ?'];
    const params: (string | number)[] = [agentId];

    if (opts?.status) {
        conditions.push('status = ?');
        params.push(opts.status);
    }
    if (opts?.source) {
        conditions.push('source = ?');
        params.push(opts.source);
    }

    const limit = opts?.limit ?? 50;
    params.push(limit);

    const rows = db.query(
        `SELECT * FROM memory_observations
         WHERE ${conditions.join(' AND ')}
         ORDER BY relevance_score DESC, created_at DESC
         LIMIT ?`,
    ).all(...params) as ObservationRow[];

    return rows.map(rowToObservation);
}

export function searchObservations(
    db: Database,
    agentId: string,
    query: string,
): MemoryObservation[] {
    // FTS5 search
    try {
        const cleaned = query.replace(/[":(){}[\]^~*\\]/g, ' ').trim();
        if (cleaned) {
            const words = cleaned.split(/\s+/).filter((w) => w.length > 0).map((w) => `"${w}"*`);
            const ftsQuery = words.join(' ');
            if (ftsQuery) {
                const rows = db.query(
                    `SELECT o.*
                     FROM memory_observations_fts fts
                     JOIN memory_observations o ON o.rowid = fts.rowid
                     WHERE memory_observations_fts MATCH ?
                       AND o.agent_id = ?
                       AND o.status = 'active'
                     ORDER BY rank
                     LIMIT 20`,
                ).all(ftsQuery, agentId) as ObservationRow[];
                if (rows.length > 0) return rows.map(rowToObservation);
            }
        }
    } catch { /* fall through to LIKE */ }

    const pattern = `%${query}%`;
    const rows = db.query(
        `SELECT * FROM memory_observations
         WHERE agent_id = ? AND content LIKE ? AND status = 'active'
         ORDER BY relevance_score DESC
         LIMIT 20`,
    ).all(agentId, pattern) as ObservationRow[];
    return rows.map(rowToObservation);
}

// ─── Update ─────────────────────────────────────────────────────────────────

/** Bump relevance score and access count when observation proves useful. */
export function boostObservation(
    db: Database,
    id: string,
    scoreBoost: number = 1.0,
): void {
    db.query(
        `UPDATE memory_observations
         SET relevance_score = relevance_score + ?,
             access_count = access_count + 1,
             last_accessed_at = datetime('now')
         WHERE id = ?`,
    ).run(scoreBoost, id);
}

/** Mark an observation as graduated and record the memory key. */
export function markGraduated(
    db: Database,
    id: string,
    graduatedKey: string,
): void {
    db.query(
        `UPDATE memory_observations
         SET status = 'graduated', graduated_key = ?
         WHERE id = ?`,
    ).run(graduatedKey, id);
}

/** Dismiss an observation — user or agent decided it's not worth keeping. */
export function dismissObservation(db: Database, id: string): void {
    db.query(
        `UPDATE memory_observations SET status = 'dismissed' WHERE id = ?`,
    ).run(id);
}

// ─── Graduation candidates ─────────────────────────────────────────────────

/**
 * Find observations that meet graduation criteria:
 * - Active status
 * - Relevance score >= threshold
 * - Access count >= minAccess
 * - Not already graduated
 */
export function getGraduationCandidates(
    db: Database,
    agentId: string,
    opts?: { scoreThreshold?: number; minAccess?: number; limit?: number },
): MemoryObservation[] {
    const threshold = opts?.scoreThreshold ?? 3.0;
    const minAccess = opts?.minAccess ?? 2;
    const limit = opts?.limit ?? 10;

    const rows = db.query(
        `SELECT * FROM memory_observations
         WHERE agent_id = ?
           AND status = 'active'
           AND relevance_score >= ?
           AND access_count >= ?
         ORDER BY relevance_score DESC
         LIMIT ?`,
    ).all(agentId, threshold, minAccess, limit) as ObservationRow[];

    return rows.map(rowToObservation);
}

// ─── Cleanup ────────────────────────────────────────────────────────────────

/** Expire observations past their expiry date. Returns count expired. */
export function expireObservations(db: Database): number {
    const result = db.query(
        `UPDATE memory_observations
         SET status = 'expired'
         WHERE status = 'active'
           AND expires_at IS NOT NULL
           AND expires_at < datetime('now')`,
    ).run();
    return (result as unknown as { changes: number }).changes;
}

/** Hard-delete observations that have been expired/dismissed for more than 30 days. */
export function purgeOldObservations(db: Database, retentionDays: number = 30): number {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
    const result = db.query(
        `DELETE FROM memory_observations
         WHERE status IN ('expired', 'dismissed')
           AND created_at < ?`,
    ).run(cutoff);
    return (result as unknown as { changes: number }).changes;
}

// ─── Stats ──────────────────────────────────────────────────────────────────

export function countObservations(db: Database, agentId: string): {
    active: number;
    graduated: number;
    expired: number;
    dismissed: number;
} {
    const rows = db.query(
        `SELECT status, COUNT(*) as cnt FROM memory_observations
         WHERE agent_id = ? GROUP BY status`,
    ).all(agentId) as { status: string; cnt: number }[];

    const counts = { active: 0, graduated: 0, expired: 0, dismissed: 0 };
    for (const row of rows) {
        if (row.status in counts) {
            counts[row.status as keyof typeof counts] = row.cnt;
        }
    }
    return counts;
}

import type { Database } from 'bun:sqlite';
import type { AgentMemory, MemoryStatus } from '../../shared/types';
import { queryCount } from './types';

interface AgentMemoryRow {
    id: string;
    agent_id: string;
    key: string;
    content: string;
    txid: string | null;
    asa_id: number | null;
    status: string;
    created_at: string;
    updated_at: string;
    // Added by migration 112 — optional until migration is applied
    expires_at?: string | null;
    access_count?: number;
}

/**
 * Per-connection cache: tracks whether the agent_memories table has the
 * `expires_at` / `access_count` decay columns (added by migration 112).
 * Keyed by Database instance so tests with `:memory:` DBs get independent checks.
 */
const _decayColumnsCache = new WeakMap<Database, boolean>();

function hasDecayColumns(db: Database): boolean {
    if (_decayColumnsCache.has(db)) {
        return _decayColumnsCache.get(db)!;
    }
    const cols = db.query('PRAGMA table_info(agent_memories)').all() as Array<{ name: string }>;
    const has = cols.some((c) => c.name === 'expires_at');
    _decayColumnsCache.set(db, has);
    return has;
}

function rowToAgentMemory(row: AgentMemoryRow): AgentMemory {
    return {
        id: row.id,
        agentId: row.agent_id,
        key: row.key,
        content: row.content,
        txid: row.txid,
        asaId: row.asa_id ?? null,
        status: row.status as MemoryStatus,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        expiresAt: row.expires_at ?? null,
        accessCount: row.access_count ?? 0,
    };
}

export function saveMemory(
    db: Database,
    params: { agentId: string; key: string; content: string; ttlDays?: number },
): AgentMemory {
    const id = crypto.randomUUID();

    if (hasDecayColumns(db)) {
        const ttlDays = Math.max(1, Math.min(365, Math.floor(params.ttlDays ?? 7)));
        const ttlModifier = `+${ttlDays} days`;
        db.query(
            `INSERT INTO agent_memories (id, agent_id, key, content, status, expires_at)
             VALUES (?, ?, ?, ?, 'short_term', datetime('now', ?))
             ON CONFLICT(agent_id, key) DO UPDATE SET
                 content = excluded.content,
                 status = 'short_term',
                 expires_at = datetime('now', ?),
                 txid = NULL,
                 updated_at = datetime('now')`
        ).run(id, params.agentId, params.key, params.content, ttlModifier, ttlModifier);
    } else {
        db.query(
            `INSERT INTO agent_memories (id, agent_id, key, content, status)
             VALUES (?, ?, ?, ?, 'short_term')
             ON CONFLICT(agent_id, key) DO UPDATE SET
                 content = excluded.content,
                 status = 'short_term',
                 txid = NULL,
                 updated_at = datetime('now')`
        ).run(id, params.agentId, params.key, params.content);
    }

    // Return the upserted row (may have a different id if it was an update)
    const row = db.query(
        'SELECT * FROM agent_memories WHERE agent_id = ? AND key = ?'
    ).get(params.agentId, params.key) as AgentMemoryRow | null;

    return row ? rowToAgentMemory(row) : rowToAgentMemory({
        id,
        agent_id: params.agentId,
        key: params.key,
        content: params.content,
        txid: null,
        asa_id: null,
        status: 'short_term',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    });
}

export function recallMemory(
    db: Database,
    agentId: string,
    key: string,
): AgentMemory | null {
    const row = db.query(
        'SELECT * FROM agent_memories WHERE agent_id = ? AND key = ?'
    ).get(agentId, key) as AgentMemoryRow | null;

    if (!row) return null;

    // Bump access_count and optionally extend TTL for short_term memories
    if (row.status === 'short_term' && hasDecayColumns(db)) {
        db.query(`
            UPDATE agent_memories
            SET access_count = access_count + 1,
                expires_at = CASE
                    WHEN access_count + 1 >= 3
                         AND (expires_at IS NULL OR expires_at < datetime('now', '+90 days'))
                    THEN datetime('now', '+14 days')
                    ELSE expires_at
                END,
                updated_at = datetime('now')
            WHERE id = ?
        `).run(row.id);

        const updated = db.query(
            'SELECT * FROM agent_memories WHERE id = ?'
        ).get(row.id) as AgentMemoryRow | null;
        return updated ? rowToAgentMemory(updated) : rowToAgentMemory(row);
    }

    return rowToAgentMemory(row);
}

export function searchMemories(
    db: Database,
    agentId: string,
    query: string,
): AgentMemory[] {
    // Try FTS5 full-text search first for ranked, semantic-style results
    try {
        const ftsQuery = sanitizeFtsQuery(query);
        if (ftsQuery) {
            const rows = db.query(
                `SELECT m.*, rank
                 FROM agent_memories_fts fts
                 JOIN agent_memories m ON m.rowid = fts.rowid
                 WHERE agent_memories_fts MATCH ?
                   AND m.agent_id = ?
                   AND m.archived = 0
                 ORDER BY rank
                 LIMIT 20`
            ).all(ftsQuery, agentId) as (AgentMemoryRow & { rank: number })[];
            if (rows.length > 0) {
                return rows.map(rowToAgentMemory);
            }
        }
    } catch {
        // FTS5 table may not exist yet or query may be invalid — fall through to LIKE
    }

    // Fallback: simple LIKE search
    const pattern = `%${query}%`;
    const rows = db.query(
        `SELECT * FROM agent_memories
         WHERE agent_id = ? AND (key LIKE ? OR content LIKE ?)
           AND archived = 0
         ORDER BY updated_at DESC
         LIMIT 20`
    ).all(agentId, pattern, pattern) as AgentMemoryRow[];
    return rows.map(rowToAgentMemory);
}

/**
 * Sanitize a user query for FTS5 MATCH syntax.
 * Wraps each word as a prefix match (word*) and joins with implicit AND.
 * Returns null if the query is empty after sanitization.
 */
function sanitizeFtsQuery(query: string): string | null {
    // Strip FTS5 special characters that could cause syntax errors
    const cleaned = query.replace(/[":(){}[\]^~*\\]/g, ' ').trim();
    if (!cleaned) return null;

    const words = cleaned
        .split(/\s+/)
        .filter((w) => w.length > 0)
        .map((w) => `"${w}"*`); // Prefix match per word, quoted for safety

    return words.length > 0 ? words.join(' ') : null;
}

export function listMemories(
    db: Database,
    agentId: string,
): AgentMemory[] {
    const rows = db.query(
        `SELECT * FROM agent_memories
         WHERE agent_id = ?
           AND archived = 0
         ORDER BY updated_at DESC
         LIMIT 20`
    ).all(agentId) as AgentMemoryRow[];
    return rows.map(rowToAgentMemory);
}

export function updateMemoryTxid(
    db: Database,
    id: string,
    txid: string,
): void {
    db.query(
        "UPDATE agent_memories SET txid = ?, status = 'confirmed' WHERE id = ?"
    ).run(txid, id);
}

export function updateMemoryStatus(
    db: Database,
    id: string,
    status: MemoryStatus,
): void {
    db.query(
        'UPDATE agent_memories SET status = ?, updated_at = datetime(\'now\') WHERE id = ?'
    ).run(status, id);
}

export function getPendingMemories(
    db: Database,
    limit: number = 20,
): AgentMemory[] {
    const rows = db.query(
        `SELECT * FROM agent_memories
         WHERE status IN ('pending', 'failed')
         ORDER BY updated_at ASC
         LIMIT ?`
    ).all(limit) as AgentMemoryRow[];
    return rows.map(rowToAgentMemory);
}

export function countPendingMemories(db: Database): number {
    return queryCount(db, "SELECT COUNT(*) as cnt FROM agent_memories WHERE status IN ('pending', 'failed')");
}

export function updateMemoryAsaId(
    db: Database,
    id: string,
    asaId: number,
): void {
    db.query(
        'UPDATE agent_memories SET asa_id = ?, updated_at = datetime(\'now\') WHERE id = ?'
    ).run(asaId, id);
}

export function getMemoryByAsaId(
    db: Database,
    agentId: string,
    asaId: number,
): AgentMemory | null {
    const row = db.query(
        'SELECT * FROM agent_memories WHERE agent_id = ? AND asa_id = ?'
    ).get(agentId, asaId) as AgentMemoryRow | null;
    return row ? rowToAgentMemory(row) : null;
}

export function deleteMemoryRow(
    db: Database,
    agentId: string,
    key: string,
): boolean {
    const result = db.query(
        'DELETE FROM agent_memories WHERE agent_id = ? AND key = ?'
    ).run(agentId, key);
    return (result as unknown as { changes: number }).changes > 0;
}

export function archiveMemory(
    db: Database,
    agentId: string,
    key: string,
): boolean {
    const result = db.query(
        "UPDATE agent_memories SET archived = 1, updated_at = datetime('now') WHERE agent_id = ? AND key = ?"
    ).run(agentId, key);
    return (result as unknown as { changes: number }).changes > 0;
}

/**
 * Archives short_term memories whose expires_at has passed.
 * Returns the number of memories archived.
 * No-op if decay columns (migration 112) have not been applied.
 *
 * Note: counts matching rows before the UPDATE to avoid bun:sqlite's
 * inflated `.changes` count caused by FTS5 trigger operations.
 */
export function expireShortTermMemories(db: Database): number {
    if (!hasDecayColumns(db)) return 0;
    const { c } = db.query(`
        SELECT COUNT(*) as c FROM agent_memories
        WHERE status = 'short_term'
          AND expires_at IS NOT NULL
          AND expires_at < datetime('now')
          AND archived = 0
    `).get() as { c: number };
    if (c === 0) return 0;
    db.query(`
        UPDATE agent_memories
        SET archived = 1, updated_at = datetime('now')
        WHERE status = 'short_term'
          AND expires_at IS NOT NULL
          AND expires_at < datetime('now')
          AND archived = 0
    `).run();
    return c;
}

/**
 * Deletes archived short_term memories whose updated_at is older than
 * `daysAfterArchive` days (default 30). Returns the number of rows deleted.
 *
 * Note: counts matching rows before the DELETE to avoid bun:sqlite's
 * inflated `.changes` count caused by FTS5 trigger operations.
 * Returns 0 gracefully if the schema lacks required columns (e.g. test environments).
 */
export function purgeOldArchivedMemories(db: Database, daysAfterArchive = 30): number {
    try {
        const { c } = db.query(`
            SELECT COUNT(*) as c FROM agent_memories
            WHERE status = 'short_term'
              AND archived = 1
              AND updated_at < datetime('now', '-' || ? || ' days')
        `).get(daysAfterArchive) as { c: number };
        if (c === 0) return 0;
        db.query(`
            DELETE FROM agent_memories
            WHERE status = 'short_term'
              AND archived = 1
              AND updated_at < datetime('now', '-' || ? || ' days')
        `).run(daysAfterArchive);
        return c;
    } catch {
        // Schema may not have archived column in minimal test environments
        return 0;
    }
}

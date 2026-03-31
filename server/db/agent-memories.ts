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
    };
}

export function saveMemory(
    db: Database,
    params: { agentId: string; key: string; content: string },
): AgentMemory {
    const id = crypto.randomUUID();
    db.query(
        `INSERT INTO agent_memories (id, agent_id, key, content, status)
         VALUES (?, ?, ?, ?, 'short_term')
         ON CONFLICT(agent_id, key) DO UPDATE SET
             content = excluded.content,
             status = 'short_term',
             txid = NULL,
             updated_at = datetime('now')`
    ).run(id, params.agentId, params.key, params.content);

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
    return row ? rowToAgentMemory(row) : null;
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
 * Look up the ASA ID for a given memory key from the local DB mapping.
 */
export function resolveAsaForKey(
    db: Database,
    agentId: string,
    key: string,
): number | null {
    const row = db.query(
        'SELECT asa_id FROM agent_memories WHERE agent_id = ? AND key = ? AND asa_id IS NOT NULL'
    ).get(agentId, key) as { asa_id: number } | null;
    return row?.asa_id ?? null;
}

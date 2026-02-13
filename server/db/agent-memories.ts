import type { Database } from 'bun:sqlite';
import type { AgentMemory, MemoryStatus } from '../../shared/types';

interface AgentMemoryRow {
    id: string;
    agent_id: string;
    key: string;
    content: string;
    txid: string | null;
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
         VALUES (?, ?, ?, ?, 'pending')
         ON CONFLICT(agent_id, key) DO UPDATE SET
             content = excluded.content,
             status = 'pending',
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
        status: 'pending',
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
    const pattern = `%${query}%`;
    const rows = db.query(
        `SELECT * FROM agent_memories
         WHERE agent_id = ? AND (key LIKE ? OR content LIKE ?)
         ORDER BY updated_at DESC
         LIMIT 20`
    ).all(agentId, pattern, pattern) as AgentMemoryRow[];
    return rows.map(rowToAgentMemory);
}

export function listMemories(
    db: Database,
    agentId: string,
): AgentMemory[] {
    const rows = db.query(
        `SELECT * FROM agent_memories
         WHERE agent_id = ?
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
    const row = db.query(
        "SELECT COUNT(*) as count FROM agent_memories WHERE status IN ('pending', 'failed')"
    ).get() as { count: number };
    return row.count;
}

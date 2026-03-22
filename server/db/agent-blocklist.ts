/**
 * Agent blocklist — CRUD operations for the agent_blocklist table.
 *
 * Prevents blacklisted agents from sending or receiving messages.
 * Used by the kill switch: a single confirmed malicious action
 * instantly blacklists the agent address.
 */

import type { Database } from 'bun:sqlite';

export type BlocklistReason =
    | 'security_violation'
    | 'reputation_farming'
    | 'malicious_content'
    | 'manual'
    | 'behavioral_drift';

export interface AgentBlocklistEntry {
    agentId: string;
    reason: BlocklistReason;
    detail: string;
    blockedBy: string;
    createdAt: string;
}

interface AgentBlocklistRow {
    agent_id: string;
    reason: string;
    detail: string;
    blocked_by: string;
    created_at: string;
}

function rowToEntry(row: AgentBlocklistRow): AgentBlocklistEntry {
    return {
        agentId: row.agent_id,
        reason: row.reason as BlocklistReason,
        detail: row.detail,
        blockedBy: row.blocked_by,
        createdAt: row.created_at,
    };
}

export function isAgentBlocked(db: Database, agentId: string): boolean {
    const row = db.query(
        'SELECT 1 FROM agent_blocklist WHERE agent_id = ? LIMIT 1',
    ).get(agentId);
    return !!row;
}

export function getAgentBlocklistEntry(db: Database, agentId: string): AgentBlocklistEntry | null {
    const row = db.query(
        'SELECT * FROM agent_blocklist WHERE agent_id = ?',
    ).get(agentId) as AgentBlocklistRow | null;
    return row ? rowToEntry(row) : null;
}

export function addToAgentBlocklist(
    db: Database,
    agentId: string,
    opts?: { reason?: BlocklistReason; detail?: string; blockedBy?: string },
): AgentBlocklistEntry {
    db.query(
        `INSERT INTO agent_blocklist (agent_id, reason, detail, blocked_by)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(agent_id) DO UPDATE SET
           reason = excluded.reason,
           detail = excluded.detail,
           blocked_by = excluded.blocked_by`,
    ).run(
        agentId,
        opts?.reason ?? 'manual',
        opts?.detail ?? '',
        opts?.blockedBy ?? 'system',
    );
    return getAgentBlocklistEntry(db, agentId)!;
}

export function removeFromAgentBlocklist(db: Database, agentId: string): boolean {
    const result = db.query(
        'DELETE FROM agent_blocklist WHERE agent_id = ?',
    ).run(agentId);
    return result.changes > 0;
}

export function listAgentBlocklist(db: Database): AgentBlocklistEntry[] {
    const rows = db.query(
        'SELECT * FROM agent_blocklist ORDER BY created_at DESC',
    ).all() as AgentBlocklistRow[];
    return rows.map(rowToEntry);
}

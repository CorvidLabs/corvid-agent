/**
 * Per-agent conversation access control — allowlist, blocklist, and rate-limit CRUD.
 *
 * @module
 */
import type { Database } from 'bun:sqlite';
import type { AgentAllowlistEntry, AgentBlocklistEntry, RateLimitStatus } from '../../shared/types';

// Re-export types for spec coverage
export type { AgentAllowlistEntry, AgentBlocklistEntry, RateLimitStatus };

// ─── Allowlist ───────────────────────────────────────────────────────────────

interface AllowlistRow {
    agent_id: string;
    address: string;
    label: string;
    created_at: string;
}

function allowlistRowToEntry(row: AllowlistRow): AgentAllowlistEntry {
    return { agentId: row.agent_id, address: row.address, label: row.label, createdAt: row.created_at };
}

export function listAgentAllowlist(db: Database, agentId: string): AgentAllowlistEntry[] {
    const rows = db.query(
        'SELECT * FROM agent_conversation_allowlist WHERE agent_id = ? ORDER BY created_at DESC',
    ).all(agentId) as AllowlistRow[];
    return rows.map(allowlistRowToEntry);
}

export function isOnAgentAllowlist(db: Database, agentId: string, address: string): boolean {
    const row = db.query(
        'SELECT 1 FROM agent_conversation_allowlist WHERE agent_id = ? AND address = ? LIMIT 1',
    ).get(agentId, address);
    return row != null;
}

export function addToAgentAllowlist(
    db: Database,
    agentId: string,
    address: string,
    label?: string,
): AgentAllowlistEntry {
    db.query(
        `INSERT INTO agent_conversation_allowlist (agent_id, address, label) VALUES (?, ?, ?)
         ON CONFLICT(agent_id, address) DO UPDATE SET label = excluded.label`,
    ).run(agentId, address, label ?? '');
    const row = db.query(
        'SELECT * FROM agent_conversation_allowlist WHERE agent_id = ? AND address = ?',
    ).get(agentId, address) as AllowlistRow;
    return allowlistRowToEntry(row);
}

export function removeFromAgentAllowlist(db: Database, agentId: string, address: string): boolean {
    const result = db.query(
        'DELETE FROM agent_conversation_allowlist WHERE agent_id = ? AND address = ?',
    ).run(agentId, address);
    return result.changes > 0;
}

// ─── Blocklist ───────────────────────────────────────────────────────────────

interface BlocklistRow {
    agent_id: string;
    address: string;
    reason: string;
    created_at: string;
}

function blocklistRowToEntry(row: BlocklistRow): AgentBlocklistEntry {
    return { agentId: row.agent_id, address: row.address, reason: row.reason, createdAt: row.created_at };
}

export function listAgentBlocklist(db: Database, agentId: string): AgentBlocklistEntry[] {
    const rows = db.query(
        'SELECT * FROM agent_conversation_blocklist WHERE agent_id = ? ORDER BY created_at DESC',
    ).all(agentId) as BlocklistRow[];
    return rows.map(blocklistRowToEntry);
}

export function isOnAgentBlocklist(db: Database, agentId: string, address: string): boolean {
    const row = db.query(
        'SELECT 1 FROM agent_conversation_blocklist WHERE agent_id = ? AND address = ? LIMIT 1',
    ).get(agentId, address);
    return row != null;
}

export function addToAgentBlocklist(
    db: Database,
    agentId: string,
    address: string,
    reason?: string,
): AgentBlocklistEntry {
    db.query(
        `INSERT INTO agent_conversation_blocklist (agent_id, address, reason) VALUES (?, ?, ?)
         ON CONFLICT(agent_id, address) DO UPDATE SET reason = excluded.reason`,
    ).run(agentId, address, reason ?? 'manual');
    const row = db.query(
        'SELECT * FROM agent_conversation_blocklist WHERE agent_id = ? AND address = ?',
    ).get(agentId, address) as BlocklistRow;
    return blocklistRowToEntry(row);
}

export function removeFromAgentBlocklist(db: Database, agentId: string, address: string): boolean {
    const result = db.query(
        'DELETE FROM agent_conversation_blocklist WHERE agent_id = ? AND address = ?',
    ).run(agentId, address);
    return result.changes > 0;
}

// ─── Rate Limiting ───────────────────────────────────────────────────────────

/** Record a message timestamp for rate-limit tracking. */
export function recordConversationMessage(db: Database, agentId: string, address: string): void {
    db.query(
        `INSERT INTO agent_conversation_rate_limits (agent_id, address, message_at)
         VALUES (?, ?, datetime('now'))`,
    ).run(agentId, address);
}

/** Prune rate-limit entries older than the given window (in seconds). */
export function pruneRateLimitEntries(db: Database, windowSeconds: number): number {
    const result = db.query(
        `DELETE FROM agent_conversation_rate_limits
         WHERE message_at < datetime('now', '-' || ? || ' seconds')`,
    ).run(windowSeconds);
    return result.changes;
}

/** Check the rate-limit status for a participant messaging an agent. */
export function getConversationRateLimit(
    db: Database,
    agentId: string,
    address: string,
    windowSeconds: number,
    maxMessages: number,
): RateLimitStatus {
    const windowStart = new Date(Date.now() - windowSeconds * 1000).toISOString().replace('T', ' ').slice(0, 19);

    const row = db.query(
        `SELECT COUNT(*) as cnt, MIN(message_at) as oldest
         FROM agent_conversation_rate_limits
         WHERE agent_id = ? AND address = ? AND message_at >= ?`,
    ).get(agentId, address, windowStart) as { cnt: number; oldest: string | null };

    const count = row.cnt;
    const remaining = Math.max(0, maxMessages - count);
    const resetsAt = row.oldest
        ? new Date(new Date(row.oldest + 'Z').getTime() + windowSeconds * 1000).toISOString()
        : new Date(Date.now() + windowSeconds * 1000).toISOString();

    return {
        allowed: count < maxMessages,
        remaining,
        resetsAt,
    };
}

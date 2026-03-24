/**
 * Buddy mode DB helpers — CRUD for pairings, sessions, and messages.
 */

import { Database } from 'bun:sqlite';
import type {
    BuddyPairing,
    BuddySession,
    BuddyMessage,
    BuddyRole,
    BuddySessionStatus,
    BuddySource,
    CreateBuddySessionInput,
} from '../../shared/types/buddy';

// ── Row types ───────────────────────────────────────────────────────

interface PairingRow {
    id: string;
    agent_id: string;
    buddy_agent_id: string;
    enabled: number;
    max_rounds: number;
    buddy_role: string;
    created_at: string;
    updated_at: string;
}

interface SessionRow {
    id: string;
    work_task_id: string | null;
    session_id: string | null;
    lead_agent_id: string;
    buddy_agent_id: string;
    source: string;
    source_id: string | null;
    prompt: string;
    status: string;
    current_round: number;
    max_rounds: number;
    created_at: string;
    completed_at: string | null;
}

interface MessageRow {
    id: string;
    buddy_session_id: string;
    agent_id: string;
    round: number;
    role: string;
    content: string;
    created_at: string;
}

// ── Row mappers ─────────────────────────────────────────────────────

function rowToPairing(row: PairingRow): BuddyPairing {
    return {
        id: row.id,
        agentId: row.agent_id,
        buddyAgentId: row.buddy_agent_id,
        enabled: row.enabled === 1,
        maxRounds: row.max_rounds,
        buddyRole: row.buddy_role as BuddyRole,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function rowToSession(row: SessionRow): BuddySession {
    return {
        id: row.id,
        workTaskId: row.work_task_id,
        sessionId: row.session_id,
        leadAgentId: row.lead_agent_id,
        buddyAgentId: row.buddy_agent_id,
        source: row.source as BuddySource,
        sourceId: row.source_id,
        prompt: row.prompt,
        status: row.status as BuddySessionStatus,
        currentRound: row.current_round,
        maxRounds: row.max_rounds,
        createdAt: row.created_at,
        completedAt: row.completed_at,
    };
}

function rowToMessage(row: MessageRow): BuddyMessage {
    return {
        id: row.id,
        buddySessionId: row.buddy_session_id,
        agentId: row.agent_id,
        round: row.round,
        role: row.role as 'lead' | 'buddy',
        content: row.content,
        createdAt: row.created_at,
    };
}

// ── Pairings CRUD ───────────────────────────────────────────────────

export function createBuddyPairing(
    db: Database,
    agentId: string,
    buddyAgentId: string,
    opts?: { maxRounds?: number; buddyRole?: BuddyRole },
): BuddyPairing {
    const id = crypto.randomUUID();
    db.prepare(`
        INSERT INTO buddy_pairings (id, agent_id, buddy_agent_id, max_rounds, buddy_role)
        VALUES (?, ?, ?, ?, ?)
    `).run(id, agentId, buddyAgentId, opts?.maxRounds ?? 5, opts?.buddyRole ?? 'reviewer');
    return getBuddyPairing(db, id)!;
}

export function getBuddyPairing(db: Database, id: string): BuddyPairing | null {
    const row = db.prepare('SELECT * FROM buddy_pairings WHERE id = ?').get(id) as PairingRow | null;
    return row ? rowToPairing(row) : null;
}

export function listBuddyPairings(db: Database, agentId: string): BuddyPairing[] {
    const rows = db.prepare('SELECT * FROM buddy_pairings WHERE agent_id = ? ORDER BY created_at').all(agentId) as PairingRow[];
    return rows.map(rowToPairing);
}

export function getDefaultBuddyForAgent(db: Database, agentId: string): BuddyPairing | null {
    const row = db.prepare(
        'SELECT * FROM buddy_pairings WHERE agent_id = ? AND enabled = 1 ORDER BY created_at LIMIT 1',
    ).get(agentId) as PairingRow | null;
    return row ? rowToPairing(row) : null;
}

export function updateBuddyPairing(
    db: Database,
    id: string,
    updates: { enabled?: boolean; maxRounds?: number; buddyRole?: BuddyRole },
): void {
    const sets: string[] = [];
    const values: (string | number)[] = [];
    if (updates.enabled !== undefined) { sets.push('enabled = ?'); values.push(updates.enabled ? 1 : 0); }
    if (updates.maxRounds !== undefined) { sets.push('max_rounds = ?'); values.push(updates.maxRounds); }
    if (updates.buddyRole !== undefined) { sets.push('buddy_role = ?'); values.push(updates.buddyRole); }
    if (sets.length === 0) return;
    sets.push("updated_at = datetime('now')");
    values.push(id);
    db.prepare(`UPDATE buddy_pairings SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}

export function deleteBuddyPairing(db: Database, id: string): void {
    db.prepare('DELETE FROM buddy_pairings WHERE id = ?').run(id);
}

// ── Sessions CRUD ───────────────────────────────────────────────────

export function createBuddySession(db: Database, input: CreateBuddySessionInput): BuddySession {
    const id = crypto.randomUUID();
    db.prepare(`
        INSERT INTO buddy_sessions (id, lead_agent_id, buddy_agent_id, prompt, source, source_id, work_task_id, session_id, max_rounds)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id,
        input.leadAgentId,
        input.buddyAgentId,
        input.prompt,
        input.source,
        input.sourceId ?? null,
        input.workTaskId ?? null,
        input.sessionId ?? null,
        input.maxRounds ?? 5,
    );
    return getBuddySession(db, id)!;
}

export function getBuddySession(db: Database, id: string): BuddySession | null {
    const row = db.prepare('SELECT * FROM buddy_sessions WHERE id = ?').get(id) as SessionRow | null;
    return row ? rowToSession(row) : null;
}

export function listBuddySessions(db: Database, opts?: {
    leadAgentId?: string;
    buddyAgentId?: string;
    workTaskId?: string;
    status?: BuddySessionStatus;
    limit?: number;
}): BuddySession[] {
    const conditions: string[] = [];
    const values: (string | number)[] = [];
    if (opts?.leadAgentId) { conditions.push('lead_agent_id = ?'); values.push(opts.leadAgentId); }
    if (opts?.buddyAgentId) { conditions.push('buddy_agent_id = ?'); values.push(opts.buddyAgentId); }
    if (opts?.workTaskId) { conditions.push('work_task_id = ?'); values.push(opts.workTaskId); }
    if (opts?.status) { conditions.push('status = ?'); values.push(opts.status); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = opts?.limit ?? 50;
    values.push(limit);
    const rows = db.prepare(`SELECT * FROM buddy_sessions ${where} ORDER BY created_at DESC LIMIT ?`).all(...values) as SessionRow[];
    return rows.map(rowToSession);
}

export function updateBuddySessionStatus(
    db: Database,
    id: string,
    status: BuddySessionStatus,
    round?: number,
): void {
    if (status === 'completed' || status === 'failed') {
        db.prepare(
            "UPDATE buddy_sessions SET status = ?, current_round = COALESCE(?, current_round), completed_at = datetime('now') WHERE id = ?",
        ).run(status, round ?? null, id);
    } else {
        db.prepare(
            'UPDATE buddy_sessions SET status = ?, current_round = COALESCE(?, current_round) WHERE id = ?',
        ).run(status, round ?? null, id);
    }
}

// ── Messages CRUD ───────────────────────────────────────────────────

export function addBuddyMessage(
    db: Database,
    buddySessionId: string,
    agentId: string,
    round: number,
    role: 'lead' | 'buddy',
    content: string,
): BuddyMessage {
    const id = crypto.randomUUID();
    db.prepare(`
        INSERT INTO buddy_messages (id, buddy_session_id, agent_id, round, role, content)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, buddySessionId, agentId, round, role, content);
    return { id, buddySessionId, agentId, round, role, content, createdAt: new Date().toISOString() };
}

export function listBuddyMessages(db: Database, buddySessionId: string): BuddyMessage[] {
    const rows = db.prepare(
        'SELECT * FROM buddy_messages WHERE buddy_session_id = ? ORDER BY round ASC, created_at ASC',
    ).all(buddySessionId) as MessageRow[];
    return rows.map(rowToMessage);
}

import { Database, type SQLQueryBindings } from 'bun:sqlite';
import type {
    Session,
    SessionMessage,
    CreateSessionInput,
    UpdateSessionInput,
    AlgoChatConversation,
} from '../../shared/types';

interface SessionRow {
    id: string;
    project_id: string;
    agent_id: string | null;
    name: string;
    status: string;
    source: string;
    initial_prompt: string;
    pid: number | null;
    total_cost_usd: number;
    total_algo_spent: number;
    total_turns: number;
    council_launch_id: string | null;
    council_role: string | null;
    created_at: string;
    updated_at: string;
}

interface MessageRow {
    id: number;
    session_id: string;
    role: string;
    content: string;
    cost_usd: number;
    timestamp: string;
}

interface ConversationRow {
    id: string;
    participant_addr: string;
    agent_id: string | null;
    session_id: string | null;
    last_round: number;
    created_at: string;
}

function rowToSession(row: SessionRow): Session {
    return {
        id: row.id,
        projectId: row.project_id,
        agentId: row.agent_id,
        name: row.name,
        status: row.status as Session['status'],
        source: row.source as Session['source'],
        initialPrompt: row.initial_prompt,
        pid: row.pid,
        totalCostUsd: row.total_cost_usd,
        totalAlgoSpent: row.total_algo_spent ?? 0,
        totalTurns: row.total_turns,
        councilLaunchId: row.council_launch_id ?? null,
        councilRole: (row.council_role as Session['councilRole']) ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function rowToMessage(row: MessageRow): SessionMessage {
    return {
        id: row.id,
        sessionId: row.session_id,
        role: row.role as SessionMessage['role'],
        content: row.content,
        costUsd: row.cost_usd,
        timestamp: row.timestamp,
    };
}

function rowToConversation(row: ConversationRow): AlgoChatConversation {
    return {
        id: row.id,
        participantAddr: row.participant_addr,
        agentId: row.agent_id,
        sessionId: row.session_id,
        lastRound: row.last_round,
        createdAt: row.created_at,
    };
}

// MARK: - Session CRUD

export function listSessions(db: Database, projectId?: string): Session[] {
    if (projectId) {
        const rows = db.query(
            'SELECT * FROM sessions WHERE project_id = ? ORDER BY updated_at DESC'
        ).all(projectId) as SessionRow[];
        return rows.map(rowToSession);
    }
    const rows = db.query('SELECT * FROM sessions ORDER BY updated_at DESC').all() as SessionRow[];
    return rows.map(rowToSession);
}

export function getSession(db: Database, id: string): Session | null {
    const row = db.query('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow | null;
    return row ? rowToSession(row) : null;
}

export function createSession(db: Database, input: CreateSessionInput): Session {
    const id = crypto.randomUUID();

    db.query(
        `INSERT INTO sessions (id, project_id, agent_id, name, source, initial_prompt, council_launch_id, council_role)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
        id,
        input.projectId,
        input.agentId ?? null,
        input.name ?? '',
        input.source ?? 'web',
        input.initialPrompt ?? '',
        input.councilLaunchId ?? null,
        input.councilRole ?? null,
    );

    return getSession(db, id) as Session;
}

export function listSessionsByCouncilLaunch(db: Database, launchId: string): Session[] {
    const rows = db.query(
        'SELECT * FROM sessions WHERE council_launch_id = ? ORDER BY created_at ASC'
    ).all(launchId) as SessionRow[];
    return rows.map(rowToSession);
}

export function updateSession(db: Database, id: string, input: UpdateSessionInput): Session | null {
    const existing = getSession(db, id);
    if (!existing) return null;

    const fields: string[] = [];
    const values: unknown[] = [];

    if (input.name !== undefined) {
        fields.push('name = ?');
        values.push(input.name);
    }
    if (input.status !== undefined) {
        fields.push('status = ?');
        values.push(input.status);
    }

    if (fields.length === 0) return existing;

    fields.push("updated_at = datetime('now')");
    values.push(id);

    db.query(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`).run(...(values as SQLQueryBindings[]));
    return getSession(db, id);
}

export function updateSessionPid(db: Database, id: string, pid: number | null): void {
    db.query("UPDATE sessions SET pid = ?, updated_at = datetime('now') WHERE id = ?").run(pid, id);
}

export function updateSessionStatus(db: Database, id: string, status: string): void {
    db.query("UPDATE sessions SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
}

export function updateSessionCost(db: Database, id: string, costUsd: number, turns: number): void {
    db.query(
        "UPDATE sessions SET total_cost_usd = ?, total_turns = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(costUsd, turns, id);
}

export function updateSessionAlgoSpent(db: Database, id: string, microAlgos: number): void {
    db.query(
        "UPDATE sessions SET total_algo_spent = total_algo_spent + ?, updated_at = datetime('now') WHERE id = ?"
    ).run(microAlgos, id);
}

export function deleteSession(db: Database, id: string): boolean {
    db.query('DELETE FROM session_messages WHERE session_id = ?').run(id);
    const result = db.query('DELETE FROM sessions WHERE id = ?').run(id);
    return result.changes > 0;
}

// MARK: - Session Messages

export function getSessionMessages(db: Database, sessionId: string): SessionMessage[] {
    const rows = db.query(
        'SELECT * FROM session_messages WHERE session_id = ? ORDER BY timestamp ASC'
    ).all(sessionId) as MessageRow[];
    return rows.map(rowToMessage);
}

export function addSessionMessage(
    db: Database,
    sessionId: string,
    role: string,
    content: string,
    costUsd: number = 0,
): SessionMessage {
    const result = db.query(
        `INSERT INTO session_messages (session_id, role, content, cost_usd) VALUES (?, ?, ?, ?)`
    ).run(sessionId, role, content, costUsd);

    const row = db.query('SELECT * FROM session_messages WHERE id = ?').get(
        result.lastInsertRowid
    ) as MessageRow;
    return rowToMessage(row);
}

// MARK: - AlgoChat Conversations

export function listConversations(db: Database): AlgoChatConversation[] {
    const rows = db.query(
        'SELECT * FROM algochat_conversations ORDER BY created_at DESC'
    ).all() as ConversationRow[];
    return rows.map(rowToConversation);
}

export function getConversationByParticipant(
    db: Database,
    participantAddr: string,
): AlgoChatConversation | null {
    const row = db.query(
        'SELECT * FROM algochat_conversations WHERE participant_addr = ?'
    ).get(participantAddr) as ConversationRow | null;
    return row ? rowToConversation(row) : null;
}

export function createConversation(
    db: Database,
    participantAddr: string,
    agentId: string | null,
    sessionId: string | null,
): AlgoChatConversation {
    const id = crypto.randomUUID();

    db.query(
        `INSERT INTO algochat_conversations (id, participant_addr, agent_id, session_id)
         VALUES (?, ?, ?, ?)`
    ).run(id, participantAddr, agentId, sessionId);

    const row = db.query('SELECT * FROM algochat_conversations WHERE id = ?').get(id) as ConversationRow;
    return rowToConversation(row);
}

export function updateConversationRound(db: Database, id: string, lastRound: number): void {
    db.query('UPDATE algochat_conversations SET last_round = ? WHERE id = ?').run(lastRound, id);
}

import type { Database } from 'bun:sqlite';

export type EscalationStatus = 'pending' | 'approved' | 'denied' | 'expired';

export interface EscalationRequest {
    id: number;
    sessionId: string;
    toolName: string;
    toolInput: string;
    status: EscalationStatus;
    createdAt: string;
    resolvedAt: string | null;
}

interface EscalationRow {
    id: number;
    session_id: string;
    tool_name: string;
    tool_input: string;
    status: string;
    created_at: string;
    resolved_at: string | null;
}

function rowToEscalation(row: EscalationRow): EscalationRequest {
    return {
        id: row.id,
        sessionId: row.session_id,
        toolName: row.tool_name,
        toolInput: row.tool_input,
        status: row.status as EscalationStatus,
        createdAt: row.created_at,
        resolvedAt: row.resolved_at,
    };
}

export function enqueueRequest(
    db: Database,
    sessionId: string,
    toolName: string,
    toolInput: Record<string, unknown>,
): EscalationRequest {
    const result = db.query(
        `INSERT INTO escalation_queue (session_id, tool_name, tool_input) VALUES (?, ?, ?)`
    ).run(sessionId, toolName, JSON.stringify(toolInput));

    const row = db.query(
        `SELECT * FROM escalation_queue WHERE id = ?`
    ).get(result.lastInsertRowid) as EscalationRow;

    return rowToEscalation(row);
}

export function resolveRequest(
    db: Database,
    id: number,
    resolution: 'approved' | 'denied',
): EscalationRequest | null {
    db.query(
        `UPDATE escalation_queue SET status = ?, resolved_at = datetime('now') WHERE id = ? AND status = 'pending'`
    ).run(resolution, id);

    const row = db.query(
        `SELECT * FROM escalation_queue WHERE id = ?`
    ).get(id) as EscalationRow | null;

    return row ? rowToEscalation(row) : null;
}

export function getPendingRequests(db: Database): EscalationRequest[] {
    const rows = db.query(
        `SELECT * FROM escalation_queue WHERE status = 'pending' ORDER BY created_at ASC`
    ).all() as EscalationRow[];

    return rows.map(rowToEscalation);
}

export function expireOldRequests(db: Database, maxAgeHours: number = 24): number {
    const result = db.query(
        `UPDATE escalation_queue
         SET status = 'expired', resolved_at = datetime('now')
         WHERE status = 'pending'
           AND created_at < datetime('now', ? || ' hours')`
    ).run(`-${maxAgeHours}`);

    return result.changes;
}

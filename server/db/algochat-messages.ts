import type { Database } from 'bun:sqlite';

export interface AlgoChatMessage {
    id: number;
    participant: string;
    content: string;
    direction: 'inbound' | 'outbound' | 'status';
    fee: number;
    createdAt: string;
}

interface AlgoChatMessageRow {
    id: number;
    participant: string;
    content: string;
    direction: string;
    fee: number;
    created_at: string;
}

function rowToMessage(row: AlgoChatMessageRow): AlgoChatMessage {
    return {
        id: row.id,
        participant: row.participant,
        content: row.content,
        direction: row.direction as AlgoChatMessage['direction'],
        fee: row.fee,
        createdAt: row.created_at,
    };
}

export function saveAlgoChatMessage(
    db: Database,
    params: {
        participant: string;
        content: string;
        direction: 'inbound' | 'outbound' | 'status';
        fee?: number;
    },
): AlgoChatMessage {
    const stmt = db.query(
        `INSERT INTO algochat_messages (participant, content, direction, fee)
         VALUES (?, ?, ?, ?)`,
    );
    stmt.run(params.participant, params.content, params.direction, params.fee ?? 0);

    const last = db.query('SELECT last_insert_rowid() as id').get() as { id: number };
    const row = db.query('SELECT * FROM algochat_messages WHERE id = ?').get(last.id) as AlgoChatMessageRow;
    return rowToMessage(row);
}

export function listRecentAlgoChatMessages(
    db: Database,
    limit: number = 50,
    offset: number = 0,
): { messages: AlgoChatMessage[]; total: number } {
    const countRow = db.query('SELECT COUNT(*) as cnt FROM algochat_messages').get() as { cnt: number };
    const rows = db.query(
        `SELECT * FROM algochat_messages ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    ).all(limit, offset) as AlgoChatMessageRow[];

    return { messages: rows.map(rowToMessage), total: countRow.cnt };
}

export function searchAlgoChatMessages(
    db: Database,
    options: {
        limit?: number;
        offset?: number;
        search?: string;
        participant?: string;
    },
): { messages: AlgoChatMessage[]; total: number } {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.search) {
        conditions.push('content LIKE ?');
        params.push(`%${options.search}%`);
    }
    if (options.participant) {
        conditions.push('participant = ?');
        params.push(options.participant);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countRow = db.query(`SELECT COUNT(*) as cnt FROM algochat_messages ${where}`).get(...(params as string[])) as { cnt: number };
    const limit = Math.min(options.limit ?? 50, 100);
    const offset = options.offset ?? 0;

    const rows = db.query(
        `SELECT * FROM algochat_messages ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    ).all(...(params as string[]), limit, offset) as AlgoChatMessageRow[];

    return { messages: rows.map(rowToMessage), total: countRow.cnt };
}

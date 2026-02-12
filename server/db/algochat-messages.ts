import type { Database } from 'bun:sqlite';

export interface AlgoChatMessage {
    id: number;
    participant: string;
    content: string;
    direction: 'inbound' | 'outbound' | 'status';
    fee: number;
    provider?: string;
    model?: string;
    createdAt: string;
}

interface AlgoChatMessageRow {
    id: number;
    participant: string;
    content: string;
    direction: string;
    fee: number;
    provider: string;
    model: string;
    created_at: string;
}

function rowToMessage(row: AlgoChatMessageRow): AlgoChatMessage {
    return {
        id: row.id,
        participant: row.participant,
        content: row.content,
        direction: row.direction as AlgoChatMessage['direction'],
        fee: row.fee,
        provider: row.provider || undefined,
        model: row.model || undefined,
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
        provider?: string;
        model?: string;
    },
): AlgoChatMessage {
    const stmt = db.query(
        `INSERT INTO algochat_messages (participant, content, direction, fee, provider, model)
         VALUES (?, ?, ?, ?, ?, ?)`,
    );
    stmt.run(params.participant, params.content, params.direction, params.fee ?? 0, params.provider ?? '', params.model ?? '');

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

// ─── Wallet Summaries ────────────────────────────────────────────────────

export interface WalletSummary {
    address: string;
    label: string;
    messageCount: number;
    inboundCount: number;
    outboundCount: number;
    lastActive: string;
    onAllowlist: boolean;
    credits: number;
    totalPurchased: number;
}

interface WalletSummaryRow {
    participant: string;
    message_count: number;
    inbound_count: number;
    outbound_count: number;
    last_active: string;
}

/**
 * Get a summary of all external wallets that have interacted via AlgoChat.
 * Joins with allowlist for labels and credit_ledger for balances.
 */
export function getWalletSummaries(
    db: Database,
    options?: { search?: string },
): WalletSummary[] {
    let where = '';
    const params: string[] = [];

    if (options?.search) {
        where = 'WHERE m.participant LIKE ? OR COALESCE(a.label, \'\') LIKE ?';
        params.push(`%${options.search}%`, `%${options.search}%`);
    }

    const rows = db.query(`
        SELECT
            m.participant,
            COUNT(*) as message_count,
            SUM(CASE WHEN m.direction = 'inbound' THEN 1 ELSE 0 END) as inbound_count,
            SUM(CASE WHEN m.direction = 'outbound' THEN 1 ELSE 0 END) as outbound_count,
            MAX(m.created_at) as last_active
        FROM algochat_messages m
        LEFT JOIN algochat_allowlist a ON m.participant = a.address
        ${where}
        GROUP BY m.participant
        ORDER BY last_active DESC
    `).all(...params) as WalletSummaryRow[];

    return rows.map((row) => {
        const allowlistRow = db.query(
            'SELECT label FROM algochat_allowlist WHERE address = ?'
        ).get(row.participant) as { label: string } | null;

        const creditRow = db.query(
            'SELECT credits, total_purchased FROM credit_ledger WHERE wallet_address = ?'
        ).get(row.participant) as { credits: number; total_purchased: number } | null;

        return {
            address: row.participant,
            label: allowlistRow?.label ?? '',
            messageCount: row.message_count,
            inboundCount: row.inbound_count,
            outboundCount: row.outbound_count,
            lastActive: row.last_active,
            onAllowlist: allowlistRow !== null,
            credits: creditRow?.credits ?? 0,
            totalPurchased: creditRow?.total_purchased ?? 0,
        };
    });
}

/**
 * Get messages for a specific wallet address, chronologically.
 */
export function getWalletMessages(
    db: Database,
    address: string,
    limit: number = 50,
    offset: number = 0,
): { messages: AlgoChatMessage[]; total: number } {
    const countRow = db.query(
        'SELECT COUNT(*) as cnt FROM algochat_messages WHERE participant = ?'
    ).get(address) as { cnt: number };

    const rows = db.query(
        `SELECT * FROM algochat_messages WHERE participant = ? ORDER BY created_at ASC LIMIT ? OFFSET ?`,
    ).all(address, limit, offset) as AlgoChatMessageRow[];

    return { messages: rows.map(rowToMessage), total: countRow.cnt };
}

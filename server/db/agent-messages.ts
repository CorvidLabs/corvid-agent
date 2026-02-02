import type { Database } from 'bun:sqlite';
import type { AgentMessage, AgentMessageStatus } from '../../shared/types';

interface AgentMessageRow {
    id: string;
    from_agent_id: string;
    to_agent_id: string;
    content: string;
    payment_micro: number;
    txid: string | null;
    status: string;
    response: string | null;
    response_txid: string | null;
    session_id: string | null;
    created_at: string;
    completed_at: string | null;
}

function rowToAgentMessage(row: AgentMessageRow): AgentMessage {
    return {
        id: row.id,
        fromAgentId: row.from_agent_id,
        toAgentId: row.to_agent_id,
        content: row.content,
        paymentMicro: row.payment_micro,
        txid: row.txid,
        status: row.status as AgentMessageStatus,
        response: row.response,
        responseTxid: row.response_txid,
        sessionId: row.session_id,
        createdAt: row.created_at,
        completedAt: row.completed_at,
    };
}

export function createAgentMessage(
    db: Database,
    params: {
        fromAgentId: string;
        toAgentId: string;
        content: string;
        paymentMicro?: number;
    },
): AgentMessage {
    const id = crypto.randomUUID();
    db.query(
        `INSERT INTO agent_messages (id, from_agent_id, to_agent_id, content, payment_micro)
         VALUES (?, ?, ?, ?, ?)`
    ).run(id, params.fromAgentId, params.toAgentId, params.content, params.paymentMicro ?? 0);

    return getAgentMessage(db, id) as AgentMessage;
}

export function getAgentMessage(db: Database, id: string): AgentMessage | null {
    const row = db.query('SELECT * FROM agent_messages WHERE id = ?').get(id) as AgentMessageRow | null;
    return row ? rowToAgentMessage(row) : null;
}

export function updateAgentMessageStatus(
    db: Database,
    id: string,
    status: AgentMessageStatus,
    extra?: {
        txid?: string;
        sessionId?: string;
        response?: string;
        responseTxid?: string;
    },
): void {
    const fields: string[] = ['status = ?'];
    const values: unknown[] = [status];

    if (extra?.txid !== undefined) {
        fields.push('txid = ?');
        values.push(extra.txid);
    }
    if (extra?.sessionId !== undefined) {
        fields.push('session_id = ?');
        values.push(extra.sessionId);
    }
    if (extra?.response !== undefined) {
        fields.push('response = ?');
        values.push(extra.response);
    }
    if (extra?.responseTxid !== undefined) {
        fields.push('response_txid = ?');
        values.push(extra.responseTxid);
    }
    if (status === 'completed' || status === 'failed') {
        fields.push("completed_at = datetime('now')");
    }

    values.push(id);
    db.query(`UPDATE agent_messages SET ${fields.join(', ')} WHERE id = ?`).run(...(values as string[]));
}

export function listAgentMessages(db: Database, agentId: string): AgentMessage[] {
    const rows = db.query(
        `SELECT * FROM agent_messages
         WHERE from_agent_id = ? OR to_agent_id = ?
         ORDER BY created_at DESC`
    ).all(agentId, agentId) as AgentMessageRow[];
    return rows.map(rowToAgentMessage);
}

export function getAgentMessageBySessionId(db: Database, sessionId: string): AgentMessage | null {
    const row = db.query(
        'SELECT * FROM agent_messages WHERE session_id = ?'
    ).get(sessionId) as AgentMessageRow | null;
    return row ? rowToAgentMessage(row) : null;
}

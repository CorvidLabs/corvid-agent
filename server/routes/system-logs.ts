/**
 * System Logs API routes — provides escalation queue history,
 * council launch logs, credit transactions, and work task logs.
 */

import type { Database } from 'bun:sqlite';
import { json } from '../lib/response';

export function handleSystemLogRoutes(req: Request, url: URL, db: Database): Response | null {
    // GET /api/system-logs — aggregated system logs
    if (url.pathname === '/api/system-logs' && req.method === 'GET') {
        const limit = Number(url.searchParams.get('limit') ?? '100');
        const offset = Number(url.searchParams.get('offset') ?? '0');
        const type = url.searchParams.get('type') ?? 'all';
        return handleLogs(db, limit, offset, type);
    }

    // GET /api/system-logs/credit-transactions — credit ledger
    if (url.pathname === '/api/system-logs/credit-transactions' && req.method === 'GET') {
        const limit = Number(url.searchParams.get('limit') ?? '50');
        const offset = Number(url.searchParams.get('offset') ?? '0');
        return handleCreditTransactions(db, limit, offset);
    }

    return null;
}

interface LogEntry {
    type: string;
    id: string | number;
    message: string;
    detail: string | null;
    level: string;
    timestamp: string;
}

function handleLogs(db: Database, limit: number, offset: number, type: string): Response {
    const clampedLimit = Math.min(Math.max(limit, 1), 500);
    const logs: LogEntry[] = [];

    // Council launch logs
    if (type === 'all' || type === 'council') {
        const councilLogs = db.query(`
            SELECT
                cll.id, cll.level, cll.message, cll.detail, cll.created_at,
                cl.council_id
            FROM council_launch_logs cll
            JOIN council_launches cl ON cll.launch_id = cl.id
            ORDER BY cll.created_at DESC
            LIMIT ? OFFSET ?
        `).all(clampedLimit, offset) as {
            id: number; level: string; message: string; detail: string | null;
            created_at: string; council_id: string;
        }[];

        for (const log of councilLogs) {
            logs.push({
                type: 'council',
                id: log.id,
                message: log.message,
                detail: log.detail,
                level: log.level,
                timestamp: log.created_at,
            });
        }
    }

    // Escalation queue events
    if (type === 'all' || type === 'escalation') {
        const escalations = db.query(`
            SELECT id, session_id, tool_name, status, created_at, resolved_at
            FROM escalation_queue
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        `).all(clampedLimit, offset) as {
            id: number; session_id: string; tool_name: string;
            status: string; created_at: string; resolved_at: string | null;
        }[];

        for (const esc of escalations) {
            logs.push({
                type: 'escalation',
                id: esc.id,
                message: `Tool "${esc.tool_name}" escalation — ${esc.status}`,
                detail: `Session: ${esc.session_id}${esc.resolved_at ? ` | Resolved: ${esc.resolved_at}` : ''}`,
                level: esc.status === 'pending' ? 'warn' : 'info',
                timestamp: esc.created_at,
            });
        }
    }

    // Work task events
    if (type === 'all' || type === 'work-task') {
        const tasks = db.query(`
            SELECT wt.id, wt.description, wt.status, wt.branch_name, wt.pr_url,
                   wt.error, wt.created_at, wt.completed_at, a.name as agent_name
            FROM work_tasks wt
            LEFT JOIN agents a ON wt.agent_id = a.id
            ORDER BY wt.created_at DESC
            LIMIT ? OFFSET ?
        `).all(clampedLimit, offset) as {
            id: string; description: string; status: string; branch_name: string | null;
            pr_url: string | null; error: string | null; created_at: string;
            completed_at: string | null; agent_name: string | null;
        }[];

        for (const task of tasks) {
            const level = task.status === 'failed' ? 'error'
                : task.status === 'completed' ? 'info'
                    : 'warn';
            logs.push({
                type: 'work-task',
                id: task.id,
                message: `[${task.agent_name ?? 'unknown'}] ${task.description.slice(0, 100)}`,
                detail: task.error ?? task.pr_url ?? task.branch_name ?? null,
                level,
                timestamp: task.created_at,
            });
        }
    }

    // Sort all logs by timestamp descending
    logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply limit after merging
    const paged = logs.slice(0, clampedLimit);

    return json({ logs: paged, total: logs.length });
}

function handleCreditTransactions(db: Database, limit: number, offset: number): Response {
    const clampedLimit = Math.min(Math.max(limit, 1), 200);

    const transactions = db.query(`
        SELECT id, wallet_address, type, amount, balance_after, reference, txid, session_id, created_at
        FROM credit_transactions
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
    `).all(clampedLimit, offset) as {
        id: number; wallet_address: string; type: string; amount: number;
        balance_after: number; reference: string | null; txid: string | null;
        session_id: string | null; created_at: string;
    }[];

    const countRow = db.query(`SELECT COUNT(*) as count FROM credit_transactions`).get() as { count: number };

    return json({
        transactions,
        total: countRow.count,
        limit: clampedLimit,
        offset,
    });
}

/**
 * Analytics API routes — provides spending, session, and agent usage data
 * for the Analytics Dashboard page.
 */

import type { Database } from 'bun:sqlite';
import { json } from '../lib/response';

interface DailySpendingRow {
    date: string;
    algo_micro: number;
    api_cost_usd: number;
}

interface SessionRow {
    id: string;
    agent_id: string | null;
    status: string;
    source: string;
    total_cost_usd: number;
    total_algo_spent: number;
    total_turns: number;
    credits_consumed: number;
    created_at: string;
}

interface WorkTaskRow {
    status: string;
    count: number;
}

interface SessionByAgentRow {
    agent_id: string;
    session_count: number;
    total_cost: number;
    total_turns: number;
}

interface MessageCountRow {
    count: number;
}

export function handleAnalyticsRoutes(req: Request, url: URL, db: Database): Response | null {
    // GET /api/analytics/overview — summary stats
    if (url.pathname === '/api/analytics/overview' && req.method === 'GET') {
        return handleOverview(db);
    }

    // GET /api/analytics/spending — daily spending over time
    if (url.pathname === '/api/analytics/spending' && req.method === 'GET') {
        const days = Number(url.searchParams.get('days') ?? '30');
        return handleSpending(db, days);
    }

    // GET /api/analytics/sessions — session stats
    if (url.pathname === '/api/analytics/sessions' && req.method === 'GET') {
        return handleSessionStats(db);
    }

    return null;
}

function handleOverview(db: Database): Response {
    // Total sessions & costs
    const sessionStats = db.query(`
        SELECT
            COUNT(*) as total_sessions,
            SUM(total_cost_usd) as total_cost_usd,
            SUM(total_algo_spent) as total_algo_spent,
            SUM(total_turns) as total_turns,
            SUM(credits_consumed) as total_credits
        FROM sessions
    `).get() as Record<string, number | null>;

    // Active sessions
    const activeCount = db.query(`
        SELECT COUNT(*) as count FROM sessions WHERE status = 'running'
    `).get() as MessageCountRow;

    // Total agents
    const agentCount = db.query(`
        SELECT COUNT(*) as count FROM agents
    `).get() as MessageCountRow;

    // Total projects
    const projectCount = db.query(`
        SELECT COUNT(*) as count FROM projects
    `).get() as MessageCountRow;

    // Work task breakdown
    const workTasks = db.query(`
        SELECT status, COUNT(*) as count FROM work_tasks GROUP BY status
    `).all() as WorkTaskRow[];

    const workTaskMap: Record<string, number> = {};
    for (const row of workTasks) {
        workTaskMap[row.status] = row.count;
    }

    // Agent messages total
    const agentMsgCount = db.query(`
        SELECT COUNT(*) as count FROM agent_messages
    `).get() as MessageCountRow;

    // AlgoChat messages total
    const algochatMsgCount = db.query(`
        SELECT COUNT(*) as count FROM algochat_messages
    `).get() as MessageCountRow;

    // Today's spending
    const today = new Date().toISOString().slice(0, 10);
    const todaySpending = db.query(`
        SELECT algo_micro, api_cost_usd FROM daily_spending WHERE date = ?
    `).get(today) as DailySpendingRow | null;

    return json({
        totalSessions: sessionStats.total_sessions ?? 0,
        totalCostUsd: sessionStats.total_cost_usd ?? 0,
        totalAlgoSpent: sessionStats.total_algo_spent ?? 0,
        totalTurns: sessionStats.total_turns ?? 0,
        totalCreditsConsumed: sessionStats.total_credits ?? 0,
        activeSessions: activeCount.count,
        totalAgents: agentCount.count,
        totalProjects: projectCount.count,
        workTasks: workTaskMap,
        agentMessages: agentMsgCount.count,
        algochatMessages: algochatMsgCount.count,
        todaySpending: {
            algoMicro: todaySpending?.algo_micro ?? 0,
            apiCostUsd: todaySpending?.api_cost_usd ?? 0,
        },
    });
}

function handleSpending(db: Database, days: number): Response {
    const clampedDays = Math.min(Math.max(days, 1), 365);

    // Get daily spending data
    const spending = db.query(`
        SELECT date, algo_micro, api_cost_usd
        FROM daily_spending
        WHERE date >= date('now', '-' || ? || ' days')
        ORDER BY date ASC
    `).all(clampedDays) as DailySpendingRow[];

    // Get session costs by day
    const sessionCosts = db.query(`
        SELECT
            date(created_at) as date,
            COUNT(*) as session_count,
            SUM(total_cost_usd) as cost_usd,
            SUM(total_turns) as turns
        FROM sessions
        WHERE created_at >= datetime('now', '-' || ? || ' days')
        GROUP BY date(created_at)
        ORDER BY date ASC
    `).all(clampedDays) as { date: string; session_count: number; cost_usd: number; turns: number }[];

    return json({
        spending,
        sessionCosts,
        days: clampedDays,
    });
}

function handleSessionStats(db: Database): Response {
    // Sessions by agent
    const byAgent = db.query(`
        SELECT
            s.agent_id,
            a.name as agent_name,
            COUNT(*) as session_count,
            SUM(s.total_cost_usd) as total_cost,
            SUM(s.total_turns) as total_turns
        FROM sessions s
        LEFT JOIN agents a ON s.agent_id = a.id
        WHERE s.agent_id IS NOT NULL
        GROUP BY s.agent_id
        ORDER BY session_count DESC
    `).all() as (SessionByAgentRow & { agent_name: string })[];

    // Sessions by source
    const bySource = db.query(`
        SELECT source, COUNT(*) as count
        FROM sessions
        GROUP BY source
    `).all() as { source: string; count: number }[];

    // Sessions by status
    const byStatus = db.query(`
        SELECT status, COUNT(*) as count
        FROM sessions
        GROUP BY status
    `).all() as { status: string; count: number }[];

    // Recent sessions (last 20)
    const recent = db.query(`
        SELECT id, agent_id, status, source, total_cost_usd, total_turns, created_at
        FROM sessions
        ORDER BY created_at DESC
        LIMIT 20
    `).all() as SessionRow[];

    return json({
        byAgent,
        bySource,
        byStatus,
        recent,
    });
}

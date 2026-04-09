/**
 * Analytics API routes — provides spending, session, and agent usage data
 * for the Analytics Dashboard page.
 */

import type { Database } from 'bun:sqlite';
import { getMetricsAggregate, getSessionMetrics, listRecentMetrics } from '../db/session-metrics';
import { json, safeNumParam } from '../lib/response';
import type { RequestContext } from '../middleware/guards';

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

export function handleAnalyticsRoutes(req: Request, url: URL, db: Database, context?: RequestContext): Response | null {
  const tenantId = context?.tenantId ?? 'default';

  // GET /api/analytics/overview — summary stats
  if (url.pathname === '/api/analytics/overview' && req.method === 'GET') {
    return handleOverview(db, tenantId);
  }

  // GET /api/analytics/spending — daily spending over time
  if (url.pathname === '/api/analytics/spending' && req.method === 'GET') {
    const days = safeNumParam(url.searchParams.get('days'), 30);
    return handleSpending(db, days, tenantId);
  }

  // GET /api/analytics/sessions — session stats
  if (url.pathname === '/api/analytics/sessions' && req.method === 'GET') {
    return handleSessionStats(db, tenantId);
  }

  // GET /api/analytics/session-metrics — aggregate tool-chain metrics
  if (url.pathname === '/api/analytics/session-metrics' && req.method === 'GET') {
    return handleSessionMetrics(db, url);
  }

  // GET /api/analytics/session-metrics/:sessionId — metrics for a specific session
  const metricsMatch = url.pathname.match(/^\/api\/analytics\/session-metrics\/([^/]+)$/);
  if (metricsMatch && req.method === 'GET') {
    return handleSessionMetricsById(db, metricsMatch[1]);
  }

  // GET /api/analytics/weekly-recap — 7-day activity summary
  if (url.pathname === '/api/analytics/weekly-recap' && req.method === 'GET') {
    const days = safeNumParam(url.searchParams.get('days'), 7);
    return handleWeeklyRecap(db, tenantId, days);
  }

  return null;
}

function handleOverview(db: Database, tenantId: string): Response {
  const isDefault = tenantId === 'default';
  const tenantFilter = isDefault ? '' : ' AND a.tenant_id = ?';
  const tenantBinding = isDefault ? [] : [tenantId];

  // Total sessions & costs (filtered by tenant's agents)
  const sessionStats = db
    .query(`
        SELECT
            COUNT(*) as total_sessions,
            SUM(s.total_cost_usd) as total_cost_usd,
            SUM(s.total_algo_spent) as total_algo_spent,
            SUM(s.total_turns) as total_turns,
            SUM(s.credits_consumed) as total_credits
        FROM sessions s
        ${isDefault ? '' : 'JOIN agents a ON s.agent_id = a.id'}
        WHERE 1=1${isDefault ? '' : tenantFilter}
    `)
    .get(...tenantBinding) as Record<string, number | null>;

  // Active sessions
  const activeCount = db
    .query(`
        SELECT COUNT(*) as count FROM sessions s
        ${isDefault ? '' : 'JOIN agents a ON s.agent_id = a.id'}
        WHERE s.status = 'running'${isDefault ? '' : tenantFilter}
    `)
    .get(...tenantBinding) as MessageCountRow;

  // Total agents
  const agentCount = db
    .query(`
        SELECT COUNT(*) as count FROM agents a WHERE 1=1${tenantFilter}
    `)
    .get(...tenantBinding) as MessageCountRow;

  // Total projects
  const projectCount = db
    .query(`
        SELECT COUNT(*) as count FROM projects p
        ${isDefault ? '' : 'WHERE p.tenant_id = ?'}
    `)
    .get(...tenantBinding) as MessageCountRow;

  // Work task breakdown
  const workTasks = db
    .query(`
        SELECT wt.status, COUNT(*) as count FROM work_tasks wt
        ${isDefault ? '' : 'WHERE wt.tenant_id = ?'}
        GROUP BY wt.status
    `)
    .all(...tenantBinding) as WorkTaskRow[];

  const workTaskMap: Record<string, number> = {};
  for (const row of workTasks) {
    workTaskMap[row.status] = row.count;
  }

  // Agent messages total
  const agentMsgCount = db
    .query(`
        SELECT COUNT(*) as count FROM agent_messages
    `)
    .get() as MessageCountRow;

  // AlgoChat messages total
  const algochatMsgCount = db
    .query(`
        SELECT COUNT(*) as count FROM algochat_messages
    `)
    .get() as MessageCountRow;

  // Today's spending
  const today = new Date().toISOString().slice(0, 10);
  const todaySpending = db
    .query(`
        SELECT algo_micro, api_cost_usd FROM daily_spending WHERE date = ?
    `)
    .get(today) as DailySpendingRow | null;

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

function handleSpending(db: Database, days: number, tenantId: string): Response {
  const clampedDays = Math.min(Math.max(days, 1), 365);
  const isDefault = tenantId === 'default';
  const tenantBinding = isDefault ? [] : [tenantId];

  // Get daily spending data (global — not tenant-scoped since daily_spending is an aggregate table)
  const spending = db
    .query(`
        SELECT date, algo_micro, api_cost_usd
        FROM daily_spending
        WHERE date >= date('now', '-' || ? || ' days')
        ORDER BY date ASC
    `)
    .all(clampedDays) as DailySpendingRow[];

  // Get session costs by day
  const sessionCosts = db
    .query(`
        SELECT
            date(s.created_at) as date,
            COUNT(*) as session_count,
            SUM(s.total_cost_usd) as cost_usd,
            SUM(s.total_turns) as turns
        FROM sessions s
        ${isDefault ? '' : 'JOIN agents a ON s.agent_id = a.id'}
        WHERE s.created_at >= datetime('now', '-' || ? || ' days')${isDefault ? '' : ' AND a.tenant_id = ?'}
        GROUP BY date(s.created_at)
        ORDER BY date ASC
    `)
    .all(clampedDays, ...tenantBinding) as { date: string; session_count: number; cost_usd: number; turns: number }[];

  return json({
    spending,
    sessionCosts,
    days: clampedDays,
  });
}

function handleSessionStats(db: Database, tenantId: string): Response {
  const isDefault = tenantId === 'default';
  const tenantFilter = isDefault ? '' : ' AND a.tenant_id = ?';
  const tenantBinding = isDefault ? [] : [tenantId];

  // Sessions by agent
  const byAgent = db
    .query(`
        SELECT
            s.agent_id,
            a.name as agent_name,
            COUNT(*) as session_count,
            SUM(s.total_cost_usd) as total_cost,
            SUM(s.total_turns) as total_turns
        FROM sessions s
        LEFT JOIN agents a ON s.agent_id = a.id
        WHERE s.agent_id IS NOT NULL${tenantFilter}
        GROUP BY s.agent_id
        ORDER BY session_count DESC
    `)
    .all(...tenantBinding) as (SessionByAgentRow & { agent_name: string })[];

  // Sessions by source
  const bySource = db
    .query(`
        SELECT s.source, COUNT(*) as count
        FROM sessions s
        ${isDefault ? '' : 'JOIN agents a ON s.agent_id = a.id'}
        WHERE 1=1${isDefault ? '' : tenantFilter}
        GROUP BY s.source
    `)
    .all(...tenantBinding) as { source: string; count: number }[];

  // Sessions by status
  const byStatus = db
    .query(`
        SELECT s.status, COUNT(*) as count
        FROM sessions s
        ${isDefault ? '' : 'JOIN agents a ON s.agent_id = a.id'}
        WHERE 1=1${isDefault ? '' : tenantFilter}
        GROUP BY s.status
    `)
    .all(...tenantBinding) as { status: string; count: number }[];

  // Recent sessions (last 20)
  const recent = db
    .query(`
        SELECT s.id, s.agent_id, s.status, s.source, s.total_cost_usd, s.total_turns, s.created_at
        FROM sessions s
        ${isDefault ? '' : 'JOIN agents a ON s.agent_id = a.id'}
        WHERE 1=1${isDefault ? '' : tenantFilter}
        ORDER BY s.created_at DESC
        LIMIT 20
    `)
    .all(...tenantBinding) as SessionRow[];

  return json({
    byAgent,
    bySource,
    byStatus,
    recent,
  });
}

function handleSessionMetrics(db: Database, url: URL): Response {
  const model = url.searchParams.get('model') ?? undefined;
  const tier = url.searchParams.get('tier') ?? undefined;
  const days = url.searchParams.has('days') ? safeNumParam(url.searchParams.get('days'), 30) : undefined;
  const limit = safeNumParam(url.searchParams.get('limit'), 20);

  const aggregate = getMetricsAggregate(db, { model, tier, days });
  const recent = listRecentMetrics(db, Math.min(limit, 100));

  return json({ aggregate, recent });
}

function handleSessionMetricsById(db: Database, sessionId: string): Response {
  const metrics = getSessionMetrics(db, sessionId);
  return json({ metrics });
}

function handleWeeklyRecap(db: Database, tenantId: string, days: number): Response {
  const clampedDays = Math.max(1, Math.min(days, 90));
  const isDefault = tenantId === 'default';
  const tenantFilter = isDefault ? '' : ' AND wt.tenant_id = ?';
  const tenantBinding = isDefault ? [] : [tenantId];

  // Work tasks started and completed in period
  const workTaskStats = db
    .query(`
        SELECT
            COUNT(*) as total_started,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as total_completed,
            SUM(CASE WHEN pr_url IS NOT NULL THEN 1 ELSE 0 END) as prs_created
        FROM work_tasks wt
        WHERE created_at >= datetime('now', ? || ' days')${tenantFilter}
    `)
    .get(`-${clampedDays}`, ...tenantBinding) as {
    total_started: number;
    total_completed: number;
    prs_created: number;
  };

  // Sessions started in period
  const sessionStats = db
    .query(`
        SELECT
            COUNT(*) as sessions_started,
            SUM(total_cost_usd) as total_cost_usd,
            SUM(total_algo_spent) as total_algo_spent,
            SUM(total_turns) as total_turns
        FROM sessions s
        ${isDefault ? '' : 'JOIN agents a ON s.agent_id = a.id'}
        WHERE s.created_at >= datetime('now', ? || ' days')${isDefault ? '' : ' AND a.tenant_id = ?'}
    `)
    .get(`-${clampedDays}`, ...(isDefault ? [] : [tenantId])) as {
    sessions_started: number;
    total_cost_usd: number | null;
    total_algo_spent: number | null;
    total_turns: number | null;
  };

  // Agent messages in period
  const agentMsgCount = db
    .query(`
        SELECT COUNT(*) as count FROM agent_messages
        WHERE created_at >= datetime('now', ? || ' days')
    `)
    .get(`-${clampedDays}`) as { count: number };

  // AlgoChat messages in period
  const algochatMsgCount = db
    .query(`
        SELECT COUNT(*) as count FROM algochat_messages
        WHERE created_at >= datetime('now', ? || ' days')
    `)
    .get(`-${clampedDays}`) as { count: number };

  return json({
    periodDays: clampedDays,
    generatedAt: new Date().toISOString(),
    workTasks: {
      started: workTaskStats?.total_started ?? 0,
      completed: workTaskStats?.total_completed ?? 0,
      prsCreated: workTaskStats?.prs_created ?? 0,
    },
    sessions: {
      started: sessionStats?.sessions_started ?? 0,
      totalTurns: sessionStats?.total_turns ?? 0,
      costUsd: sessionStats?.total_cost_usd ?? 0,
      algoSpent: sessionStats?.total_algo_spent ?? 0,
    },
    messages: {
      agentToAgent: agentMsgCount?.count ?? 0,
      algochat: algochatMsgCount?.count ?? 0,
    },
  });
}

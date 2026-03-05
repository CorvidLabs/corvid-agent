/**
 * Dashboard summary API — provides a single aggregated endpoint
 * so the frontend can load the dashboard view in one request instead of N×2.
 */

import type { Database } from 'bun:sqlite';
import type { RequestContext } from '../middleware/guards';
import { json, safeNumParam } from '../lib/response';

interface CountRow {
    count: number;
}

interface StatusCountRow {
    status: string;
    count: number;
}

interface ActivityRow {
    id: number;
    timestamp: string;
    action: string;
    actor: string;
    resource_type: string;
    resource_id: string | null;
    detail: string | null;
}

export function handleDashboardRoutes(req: Request, url: URL, db: Database, context?: RequestContext): Response | null {
    if (url.pathname !== '/api/dashboard/summary' || req.method !== 'GET') {
        return null;
    }

    const tenantId = context?.tenantId ?? 'default';
    const activityLimit = safeNumParam(url.searchParams.get('activityLimit'), 20);
    const isDefault = tenantId === 'default';
    const tenantFilter = isDefault ? '' : ' AND a.tenant_id = ?';
    const tenantBinding = isDefault ? [] : [tenantId];

    // Agents: total count and status (running sessions per agent approximates "active")
    const agentCount = db.query(`
        SELECT COUNT(*) as count FROM agents a WHERE 1=1${tenantFilter}
    `).get(...tenantBinding) as CountRow;

    // Sessions: active (running) count
    const activeSessions = db.query(`
        SELECT COUNT(*) as count FROM sessions s
        ${isDefault ? '' : 'JOIN agents a ON s.agent_id = a.id'}
        WHERE s.status = 'running'${isDefault ? '' : tenantFilter}
    `).get(...tenantBinding) as CountRow;

    // Sessions by status
    const sessionsByStatus = db.query(`
        SELECT s.status, COUNT(*) as count FROM sessions s
        ${isDefault ? '' : 'JOIN agents a ON s.agent_id = a.id'}
        WHERE 1=1${isDefault ? '' : tenantFilter}
        GROUP BY s.status
    `).all(...tenantBinding) as StatusCountRow[];

    const sessionStatusMap: Record<string, number> = {};
    for (const row of sessionsByStatus) {
        sessionStatusMap[row.status] = row.count;
    }

    // Council sessions: active (non-complete) count
    const activeCouncils = db.query(`
        SELECT COUNT(*) as count FROM council_launches cl
        WHERE cl.stage != 'complete'${isDefault ? '' : ' AND cl.tenant_id = ?'}
    `).get(...tenantBinding) as CountRow;

    // Work tasks: count and status breakdown
    const workTasksByStatus = db.query(`
        SELECT wt.status, COUNT(*) as count FROM work_tasks wt
        ${isDefault ? '' : 'WHERE wt.tenant_id = ?'}
        GROUP BY wt.status
    `).all(...tenantBinding) as StatusCountRow[];

    const workTaskStatusMap: Record<string, number> = {};
    let workTaskTotal = 0;
    for (const row of workTasksByStatus) {
        workTaskStatusMap[row.status] = row.count;
        workTaskTotal += row.count;
    }

    // Recent activity feed from audit_log (last N events)
    const clampedLimit = Math.min(Math.max(activityLimit, 1), 100);
    const recentActivity = db.query(`
        SELECT id, timestamp, action, actor, resource_type, resource_id, detail
        FROM audit_log
        ORDER BY timestamp DESC, id DESC
        LIMIT ?
    `).all(clampedLimit) as ActivityRow[];

    return json({
        agents: {
            total: agentCount.count,
        },
        sessions: {
            active: activeSessions.count,
            byStatus: sessionStatusMap,
        },
        councils: {
            active: activeCouncils.count,
        },
        workTasks: {
            total: workTaskTotal,
            byStatus: workTaskStatusMap,
        },
        recentActivity,
    });
}

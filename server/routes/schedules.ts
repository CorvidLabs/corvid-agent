import type { Database } from 'bun:sqlite';
import type { SchedulerService } from '../scheduler/service';
import { validateScheduleFrequency } from '../scheduler/service';
import {
    listSchedules,
    getSchedule,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    listExecutions,
    getExecution,
} from '../db/schedules';
import { parseBodyOrThrow, ValidationError, CreateScheduleSchema, UpdateScheduleSchema, ScheduleApprovalSchema } from '../lib/validation';
import { isGitHubConfigured } from '../github/operations';

function json(data: unknown, status: number = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

export function handleScheduleRoutes(
    req: Request,
    url: URL,
    db: Database,
    schedulerService: SchedulerService | null,
): Response | Promise<Response> | null {
    // List schedules
    if (url.pathname === '/api/schedules' && req.method === 'GET') {
        const agentId = url.searchParams.get('agentId') ?? undefined;
        const schedules = listSchedules(db, agentId);
        return json(schedules);
    }

    // Create schedule
    if (url.pathname === '/api/schedules' && req.method === 'POST') {
        return handleCreateSchedule(req, db);
    }

    // Get single schedule
    const scheduleMatch = url.pathname.match(/^\/api\/schedules\/([^/]+)$/);
    if (scheduleMatch && req.method === 'GET') {
        const schedule = getSchedule(db, scheduleMatch[1]);
        if (!schedule) return json({ error: 'Schedule not found' }, 404);
        return json(schedule);
    }

    // Update schedule
    if (scheduleMatch && req.method === 'PUT') {
        return handleUpdateSchedule(req, db, scheduleMatch[1]);
    }

    // Delete schedule
    if (scheduleMatch && req.method === 'DELETE') {
        const deleted = deleteSchedule(db, scheduleMatch[1]);
        if (!deleted) return json({ error: 'Schedule not found' }, 404);
        return json({ ok: true });
    }

    // List executions for a schedule
    const execsMatch = url.pathname.match(/^\/api\/schedules\/([^/]+)\/executions$/);
    if (execsMatch && req.method === 'GET') {
        const limit = Number(url.searchParams.get('limit') ?? '50');
        const executions = listExecutions(db, execsMatch[1], limit);
        return json(executions);
    }

    // List all executions
    if (url.pathname === '/api/schedule-executions' && req.method === 'GET') {
        const limit = Number(url.searchParams.get('limit') ?? '50');
        const executions = listExecutions(db, undefined, limit);
        return json(executions);
    }

    // Get single execution
    const execMatch = url.pathname.match(/^\/api\/schedule-executions\/([^/]+)$/);
    if (execMatch && req.method === 'GET') {
        const execution = getExecution(db, execMatch[1]);
        if (!execution) return json({ error: 'Execution not found' }, 404);
        return json(execution);
    }

    // Approve/deny execution
    const approvalMatch = url.pathname.match(/^\/api\/schedule-executions\/([^/]+)\/resolve$/);
    if (approvalMatch && req.method === 'POST') {
        return handleResolveApproval(req, db, approvalMatch[1], schedulerService);
    }

    // Scheduler health
    if (url.pathname === '/api/scheduler/health' && req.method === 'GET') {
        if (!schedulerService) {
            return json({ running: false, activeSchedules: 0, pausedSchedules: 0, runningExecutions: 0, maxConcurrent: 0, recentFailures: 0 });
        }
        return json(schedulerService.getStats());
    }

    // GitHub status
    if (url.pathname === '/api/github/status' && req.method === 'GET') {
        return json({ configured: isGitHubConfigured() });
    }

    return null;
}

async function handleCreateSchedule(req: Request, db: Database): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, CreateScheduleSchema);
        validateScheduleFrequency(data.cronExpression, data.intervalMs);
        const schedule = createSchedule(db, data);
        return json(schedule, 201);
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.message }, 400);
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('Minimum interval') || message.includes('fires every') || message.includes('too short')) {
            return json({ error: message }, 400);
        }
        return json({ error: message }, 500);
    }
}

async function handleUpdateSchedule(req: Request, db: Database, id: string): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, UpdateScheduleSchema);
        const schedule = updateSchedule(db, id, data);
        if (!schedule) return json({ error: 'Schedule not found' }, 404);
        return json(schedule);
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.message }, 400);
        const message = err instanceof Error ? err.message : String(err);
        return json({ error: message }, 500);
    }
}

async function handleResolveApproval(
    req: Request,
    db: Database,
    executionId: string,
    schedulerService: SchedulerService | null,
): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, ScheduleApprovalSchema);

        if (schedulerService) {
            const execution = schedulerService.resolveApproval(executionId, data.approved);
            if (!execution) return json({ error: 'Execution not found or not awaiting approval' }, 404);
            return json(execution);
        }

        // Fallback: just update DB status
        const { resolveScheduleApproval } = await import('../db/schedules');
        const execution = resolveScheduleApproval(db, executionId, data.approved);
        if (!execution) return json({ error: 'Execution not found or not awaiting approval' }, 404);
        return json(execution);
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.message }, 400);
        const message = err instanceof Error ? err.message : String(err);
        return json({ error: message }, 500);
    }
}

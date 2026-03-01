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
    listExecutionsFiltered,
    getExecution,
    updateScheduleNextRun,
} from '../db/schedules';
import { getNextCronDate } from '../scheduler/cron-parser';
import { parseBodyOrThrow, ValidationError, CreateScheduleSchema, UpdateScheduleSchema, ScheduleApprovalSchema, BulkScheduleActionSchema } from '../lib/validation';
import { isGitHubConfigured } from '../github/operations';
import { json, handleRouteError, badRequest, safeNumParam } from '../lib/response';
import { scanForInjection } from '../lib/prompt-injection';
import { createLogger } from '../lib/logger';

const log = createLogger('ScheduleRoutes');

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
        const limit = safeNumParam(url.searchParams.get('limit'), 50);
        const executions = listExecutions(db, execsMatch[1], limit);
        return json(executions);
    }

    // List all executions (with optional filters)
    if (url.pathname === '/api/schedule-executions' && req.method === 'GET') {
        const status = url.searchParams.get('status') ?? undefined;
        const actionType = url.searchParams.get('actionType') ?? undefined;
        const since = url.searchParams.get('since') ?? undefined;
        const until = url.searchParams.get('until') ?? undefined;
        const offset = safeNumParam(url.searchParams.get('offset'), 0);
        const limit = safeNumParam(url.searchParams.get('limit'), 50);

        // If any filter params are present, use filtered query
        if (status || actionType || since || until || offset > 0) {
            const result = listExecutionsFiltered(db, { status, actionType, since, until, limit, offset });
            return json(result);
        }
        // Backwards-compatible: plain array when no filters
        const executions = listExecutions(db, undefined, limit);
        return json(executions);
    }

    // Cancel a running execution
    const cancelMatch = url.pathname.match(/^\/api\/schedule-executions\/([^/]+)\/cancel$/);
    if (cancelMatch && req.method === 'POST') {
        if (!schedulerService) return json({ error: 'Scheduler not available' }, 503);
        const execution = schedulerService.cancelExecution(cancelMatch[1]);
        if (!execution) return json({ error: 'Execution not found or not running' }, 404);
        return json(execution);
    }

    // Get single execution
    const execMatch = url.pathname.match(/^\/api\/schedule-executions\/([^/]+)$/);
    if (execMatch && req.method === 'GET') {
        const execution = getExecution(db, execMatch[1]);
        if (!execution) return json({ error: 'Execution not found' }, 404);
        return json(execution);
    }

    // Bulk schedule actions (pause/resume/delete)
    if (url.pathname === '/api/schedules/bulk' && req.method === 'POST') {
        return handleBulkAction(req, db);
    }

    // Trigger schedule now
    const triggerMatch = url.pathname.match(/^\/api\/schedules\/([^/]+)\/trigger$/);
    if (triggerMatch && req.method === 'POST') {
        if (!schedulerService) return json({ error: 'Scheduler not available' }, 503);
        return handleTriggerNow(triggerMatch[1], schedulerService);
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

/**
 * Scan all prompt/description fields in schedule actions for injection patterns.
 * Returns an error message if blocked, or null if safe.
 */
function scanScheduleActions(actions: Array<{ prompt?: string; description?: string; message?: string }>): string | null {
    for (const action of actions) {
        for (const field of ['prompt', 'description', 'message'] as const) {
            const value = action[field];
            if (!value) continue;
            const result = scanForInjection(value);
            if (result.blocked) {
                const categories = [...new Set(result.matches.map((m) => m.category))].join(', ');
                log.warn('Schedule action blocked by injection scanner', {
                    field,
                    confidence: result.confidence,
                    categories,
                    preview: value.slice(0, 80),
                });
                return `Schedule action ${field} was rejected: suspicious content detected (${categories})`;
            }
        }
    }
    return null;
}

async function handleCreateSchedule(req: Request, db: Database): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, CreateScheduleSchema);

        // Only validate frequency if cron/interval is provided (event-only schedules skip this)
        const isEventOnly = !data.cronExpression && !data.intervalMs && data.triggerEvents && data.triggerEvents.length > 0;
        if (!isEventOnly) {
            validateScheduleFrequency(data.cronExpression, data.intervalMs);
        }

        const injectionError = scanScheduleActions(data.actions);
        if (injectionError) return badRequest(injectionError);

        const schedule = createSchedule(db, data);

        // Compute and persist next_run_at so the scheduler picks it up (null for event-only)
        const nextRun = computeNextRun(schedule.cronExpression, schedule.intervalMs);
        if (nextRun) {
            updateScheduleNextRun(db, schedule.id, nextRun);
            schedule.nextRunAt = nextRun;
        }

        return json(schedule, 201);
    } catch (err) {
        if (err instanceof ValidationError) return badRequest(err.detail);
        if (isScheduleFrequencyError(err)) return badRequest('Schedule frequency too high');
        return handleRouteError(err);
    }
}

/** Check if an error is a known schedule frequency validation error. */
function isScheduleFrequencyError(err: unknown): boolean {
    if (!(err instanceof Error)) return false;
    const msg = err.message;
    return msg.includes('Minimum interval') || msg.includes('fires every') || msg.includes('too short');
}

async function handleUpdateSchedule(req: Request, db: Database, id: string): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, UpdateScheduleSchema);

        // Validate frequency constraints if cron/interval is being updated
        if (data.cronExpression !== undefined || data.intervalMs !== undefined) {
            const existing = getSchedule(db, id);
            if (!existing) return json({ error: 'Schedule not found' }, 404);
            const effectiveCron = data.cronExpression ?? existing.cronExpression;
            const effectiveInterval = data.intervalMs ?? existing.intervalMs;
            validateScheduleFrequency(effectiveCron, effectiveInterval ?? undefined);
        }

        if (data.actions) {
            const injectionError = scanScheduleActions(data.actions);
            if (injectionError) return badRequest(injectionError);
        }

        const schedule = updateSchedule(db, id, data);
        if (!schedule) return json({ error: 'Schedule not found' }, 404);

        // Recompute next_run_at if cron/interval changed
        if (data.cronExpression !== undefined || data.intervalMs !== undefined) {
            const nextRun = computeNextRun(schedule.cronExpression, schedule.intervalMs);
            if (nextRun) {
                updateScheduleNextRun(db, schedule.id, nextRun);
                schedule.nextRunAt = nextRun;
            }
        }

        return json(schedule);
    } catch (err) {
        if (err instanceof ValidationError) return badRequest(err.detail);
        if (isScheduleFrequencyError(err)) return badRequest('Schedule frequency too high');
        return handleRouteError(err);
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
        return handleRouteError(err);
    }
}

async function handleTriggerNow(scheduleId: string, schedulerService: SchedulerService): Promise<Response> {
    try {
        await schedulerService.triggerNow(scheduleId);
        return json({ ok: true });
    } catch (err) {
        return handleRouteError(err);
    }
}

async function handleBulkAction(req: Request, db: Database): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, BulkScheduleActionSchema);
        const results: Array<{ id: string; ok: boolean; error?: string }> = [];

        for (const id of data.ids) {
            try {
                if (data.action === 'delete') {
                    const deleted = deleteSchedule(db, id);
                    results.push({ id, ok: deleted, error: deleted ? undefined : 'Not found' });
                } else {
                    const status = data.action === 'pause' ? 'paused' : 'active';
                    const schedule = updateSchedule(db, id, { status });
                    results.push({ id, ok: !!schedule, error: schedule ? undefined : 'Not found' });
                }
            } catch (err) {
                results.push({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
            }
        }

        return json({ results });
    } catch (err) {
        if (err instanceof ValidationError) return badRequest(err.detail);
        return handleRouteError(err);
    }
}

function computeNextRun(cronExpression: string | null, intervalMs: number | null): string | null {
    if (cronExpression) {
        try {
            return getNextCronDate(cronExpression).toISOString();
        } catch {
            return null;
        }
    }
    if (intervalMs && intervalMs > 0) {
        return new Date(Date.now() + intervalMs).toISOString();
    }
    return null;
}

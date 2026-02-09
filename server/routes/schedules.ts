/**
 * REST API routes for schedules and schedule runs.
 *
 * All endpoints follow the existing route pattern:
 *   - Return Response | Promise<Response> | null
 *   - null means "not my route" — the dispatcher tries the next handler
 */

import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { Cron } from 'croner';
import { parseBodyOrThrow, ValidationError } from '../lib/validation';
import {
    createSchedule,
    getSchedule,
    listSchedules,
    updateSchedule,
    deleteSchedule,
    listScheduleRuns,
} from '../db/schedules';
import type { SchedulerService } from '../scheduler/service';

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const ACTION_TYPES: [string, ...string[]] = [
    'star_repos', 'fork_repos', 'review_prs', 'work_on_repo',
    'suggest_improvements', 'council_review', 'custom',
];

const MIN_INTERVAL_MINUTES = parseInt(process.env.SCHEDULER_MIN_INTERVAL_MINUTES ?? '5', 10);

const CreateScheduleSchema = z.object({
    name: z.string().min(1, 'name is required'),
    actionType: z.enum(ACTION_TYPES),
    cronExpression: z.string().min(1, 'cronExpression is required'),
    agentId: z.string().nullable().optional(),
    councilId: z.string().nullable().optional(),
    actionConfig: z.record(z.string(), z.unknown()).default({}),
    source: z.enum(['owner', 'agent']).optional().default('owner'),
    requiresApproval: z.boolean().optional().default(false),
    maxBudgetUsd: z.number().min(0).optional().default(1.0),
    dailyBudgetUsd: z.number().min(0).optional().default(5.0),
    approvalTimeoutH: z.number().int().min(1).optional().default(8),
});

const UpdateScheduleSchema = z.object({
    name: z.string().min(1).optional(),
    cronExpression: z.string().min(1).optional(),
    actionConfig: z.record(z.string(), z.unknown()).optional(),
    requiresApproval: z.boolean().optional(),
    maxBudgetUsd: z.number().min(0).optional(),
    dailyBudgetUsd: z.number().min(0).optional(),
    approvalTimeoutH: z.number().int().min(1).optional(),
    status: z.enum(['active', 'paused']).optional(),
});

const PauseResumeSchema = z.object({
    paused: z.boolean(),
});

// ─── Validation Helpers ──────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

/**
 * Validate cron interval: compute the next 2 runs and ensure gap >= min interval.
 */
function validateCronInterval(cronExpression: string): string | null {
    try {
        const cron = new Cron(cronExpression);
        const runs: Date[] = [];
        let cursor: Date | null = new Date();

        for (let i = 0; i < 2 && cursor; i++) {
            cursor = cron.nextRun(cursor);
            if (cursor) {
                runs.push(new Date(cursor.getTime()));
                // Advance by 1ms so nextRun finds the next one
                cursor = new Date(cursor.getTime() + 1);
            }
        }

        if (runs.length < 2) {
            return 'Cron expression does not produce at least 2 future runs.';
        }

        const gapMs = runs[1].getTime() - runs[0].getTime();
        const minGapMs = MIN_INTERVAL_MINUTES * 60 * 1000;
        if (gapMs < minGapMs) {
            return `Cron interval too short: ${Math.round(gapMs / 60000)} min (minimum ${MIN_INTERVAL_MINUTES} min).`;
        }

        return null;
    } catch {
        return 'Invalid cron expression.';
    }
}

/**
 * Validate that exactly one of agentId / councilId is set.
 */
function validateTarget(agentId?: string | null, councilId?: string | null): string | null {
    const hasAgent = agentId != null && agentId !== '';
    const hasCouncil = councilId != null && councilId !== '';

    if (hasAgent && hasCouncil) return 'Only one of agentId or councilId can be set.';
    if (!hasAgent && !hasCouncil) return 'Exactly one of agentId or councilId must be set.';
    return null;
}

/**
 * Compute the next run time for a cron expression.
 */
function computeNextRunAt(cronExpression: string): string | null {
    try {
        const cron = new Cron(cronExpression);
        const next = cron.nextRun(new Date());
        return next ? next.toISOString() : null;
    } catch {
        return null;
    }
}

// ─── Route Handler ───────────────────────────────────────────────────────────

export function handleScheduleRoutes(
    req: Request,
    url: URL,
    db: Database,
    schedulerService?: SchedulerService | null,
): Response | Promise<Response> | null {

    // GET /api/schedules — list all schedules
    if (url.pathname === '/api/schedules' && req.method === 'GET') {
        const status = url.searchParams.get('status') ?? undefined;
        const agentId = url.searchParams.get('agentId') ?? undefined;
        const councilId = url.searchParams.get('councilId') ?? undefined;
        const schedules = listSchedules(db, { status, agentId, councilId });
        return json({ schedules });
    }

    // POST /api/schedules — create a schedule
    if (url.pathname === '/api/schedules' && req.method === 'POST') {
        return handleCreateSchedule(req, db);
    }

    // GET /api/schedules/:id
    const idMatch = url.pathname.match(/^\/api\/schedules\/([^/]+)$/);
    if (idMatch && req.method === 'GET') {
        const schedule = getSchedule(db, idMatch[1]);
        if (!schedule) return json({ error: 'Schedule not found' }, 404);
        return json(schedule);
    }

    // PUT /api/schedules/:id
    if (idMatch && req.method === 'PUT') {
        return handleUpdateSchedule(req, db, idMatch[1]);
    }

    // DELETE /api/schedules/:id
    if (idMatch && req.method === 'DELETE') {
        const deleted = deleteSchedule(db, idMatch[1]);
        if (!deleted) return json({ error: 'Schedule not found' }, 404);
        return json({ ok: true });
    }

    // GET /api/schedules/:id/runs — list runs for a schedule
    const runsMatch = url.pathname.match(/^\/api\/schedules\/([^/]+)\/runs$/);
    if (runsMatch && req.method === 'GET') {
        const schedule = getSchedule(db, runsMatch[1]);
        if (!schedule) return json({ error: 'Schedule not found' }, 404);
        const limit = Number(url.searchParams.get('limit') ?? '50');
        const offset = Number(url.searchParams.get('offset') ?? '0');
        const runs = listScheduleRuns(db, runsMatch[1], { limit, offset });
        return json({ runs });
    }

    // POST /api/scheduler/pause — global pause/resume (emergency kill switch)
    if (url.pathname === '/api/scheduler/pause' && req.method === 'POST') {
        return handleGlobalPause(req, schedulerService);
    }

    // GET /api/scheduler/health
    if (url.pathname === '/api/scheduler/health' && req.method === 'GET') {
        if (!schedulerService) {
            return json({ error: 'Scheduler not enabled' }, 503);
        }
        return json(schedulerService.getHealth());
    }

    return null;
}

// ─── Handler Implementations ─────────────────────────────────────────────────

async function handleCreateSchedule(req: Request, db: Database): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, CreateScheduleSchema);

        // Validate target
        const targetErr = validateTarget(data.agentId, data.councilId);
        if (targetErr) return json({ error: targetErr }, 400);

        // Validate cron interval
        const cronErr = validateCronInterval(data.cronExpression);
        if (cronErr) return json({ error: cronErr }, 400);

        // custom action_type rejected when source='agent'
        if (data.source === 'agent' && data.actionType === 'custom') {
            return json({ error: 'Agents cannot create schedules with custom action type.' }, 403);
        }

        // Agent-created schedules: force requires_approval for write actions
        const WRITE_ACTIONS = new Set(['work_on_repo', 'suggest_improvements', 'fork_repos']);
        let requiresApproval = data.requiresApproval;
        if (data.source === 'agent' && WRITE_ACTIONS.has(data.actionType)) {
            requiresApproval = true;
        }

        // Max 10 schedules per agent
        const maxPerAgent = parseInt(process.env.SCHEDULER_MAX_SCHEDULES_PER_AGENT ?? '10', 10);
        if (data.agentId) {
            const { countSchedulesByAgent } = await import('../db/schedules');
            const count = countSchedulesByAgent(db, data.agentId);
            if (count >= maxPerAgent) {
                return json({ error: `Agent has reached the maximum of ${maxPerAgent} schedules.` }, 400);
            }
        }

        const id = crypto.randomUUID();
        const nextRunAt = computeNextRunAt(data.cronExpression);

        const schedule = createSchedule(db, {
            ...data,
            actionType: data.actionType as import('../scheduler/types').ActionType,
            id,
            requiresApproval,
            nextRunAt,
        });

        return json(schedule, 201);
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.message }, 400);
        const message = err instanceof Error ? err.message : String(err);
        return json({ error: message }, 500);
    }
}

async function handleUpdateSchedule(req: Request, db: Database, id: string): Promise<Response> {
    try {
        const existing = getSchedule(db, id);
        if (!existing) return json({ error: 'Schedule not found' }, 404);

        const data = await parseBodyOrThrow(req, UpdateScheduleSchema);

        // If cron changed, validate interval
        if (data.cronExpression) {
            const cronErr = validateCronInterval(data.cronExpression);
            if (cronErr) return json({ error: cronErr }, 400);
        }

        // If reactivating from error, reset consecutive failures
        const extras: Record<string, unknown> = {};
        if (data.status === 'active' && existing.status === 'error') {
            extras.consecutiveFailures = 0;
        }

        // Recompute next_run_at if cron changed
        if (data.cronExpression) {
            extras.nextRunAt = computeNextRunAt(data.cronExpression);
        }

        // If resuming from paused, recompute next_run_at
        if (data.status === 'active' && existing.status !== 'active') {
            const cron = data.cronExpression ?? existing.cronExpression;
            extras.nextRunAt = computeNextRunAt(cron);
        }

        const schedule = updateSchedule(db, id, { ...data, ...extras });
        if (!schedule) return json({ error: 'Schedule not found' }, 404);
        return json(schedule);
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.message }, 400);
        const message = err instanceof Error ? err.message : String(err);
        return json({ error: message }, 500);
    }
}

async function handleGlobalPause(
    req: Request,
    schedulerService?: SchedulerService | null,
): Promise<Response> {
    if (!schedulerService) {
        return json({ error: 'Scheduler not enabled' }, 503);
    }

    try {
        const data = await parseBodyOrThrow(req, PauseResumeSchema);
        schedulerService.setPaused(data.paused);
        return json({ ok: true, paused: data.paused });
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.message }, 400);
        const message = err instanceof Error ? err.message : String(err);
        return json({ error: message }, 500);
    }
}

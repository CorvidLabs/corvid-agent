import type { Database } from 'bun:sqlite';
import type { WorkTaskService } from '../work/service';
import type { RequestContext } from '../middleware/guards';
import { tenantRoleGuard } from '../middleware/guards';
import { checkInjection } from '../lib/injection-guard';
import { parseBodyOrThrow, ValidationError, CreateWorkTaskSchema } from '../lib/validation';
import { json, handleRouteError } from '../lib/response';

export function handleWorkTaskRoutes(
    req: Request,
    url: URL,
    workTaskService: WorkTaskService,
    context?: RequestContext,
    db?: Database,
): Response | Promise<Response> | null {
    const path = url.pathname;
    const method = req.method;
    const tenantId = context?.tenantId ?? 'default';

    // GET /api/work-tasks/queue-status — queue status
    if (path === '/api/work-tasks/queue-status' && method === 'GET') {
        const status = workTaskService.getQueueStatus();
        if (!status) return json({ error: 'Task queue not enabled' }, 503);
        return json(status);
    }

    // GET /api/work-tasks — list (optional ?agentId= filter)
    if (path === '/api/work-tasks' && method === 'GET') {
        const agentId = url.searchParams.get('agentId') ?? undefined;
        return json(workTaskService.listTasks(agentId, tenantId));
    }

    // POST /api/work-tasks — create
    if (path === '/api/work-tasks' && method === 'POST') {
        if (context) {
            const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
            if (denied) return denied;
        }
        return handleCreate(req, workTaskService, tenantId, db);
    }

    // POST /api/work-tasks/:id/cancel — cancel a running task
    const cancelMatch = path.match(/^\/api\/work-tasks\/([^/]+)\/cancel$/);
    if (cancelMatch && method === 'POST') {
        if (context) {
            const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
            if (denied) return denied;
        }
        return handleCancel(cancelMatch[1], workTaskService);
    }

    // POST /api/work-tasks/:id/retry — retry a failed task
    const retryMatch = path.match(/^\/api\/work-tasks\/([^/]+)\/retry$/);
    if (retryMatch && method === 'POST') {
        if (context) {
            const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
            if (denied) return denied;
        }
        return handleRetry(retryMatch[1], workTaskService, tenantId);
    }

    // GET /api/work-tasks/:id — get single
    const idMatch = path.match(/^\/api\/work-tasks\/([^/]+)$/);
    if (idMatch && method === 'GET') {
        const task = workTaskService.getTask(idMatch[1], tenantId);
        if (!task) return json({ error: 'Work task not found' }, 404);
        return json(task);
    }

    return null;
}

async function handleRetry(taskId: string, workTaskService: WorkTaskService, tenantId: string): Promise<Response> {
    try {
        const task = await workTaskService.retryTask(taskId, tenantId);
        if (!task) return json({ error: 'Work task not found' }, 404);
        return json(task);
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.detail }, 400);
        return handleRouteError(err);
    }
}

async function handleCancel(taskId: string, workTaskService: WorkTaskService): Promise<Response> {
    const task = await workTaskService.cancelTask(taskId);
    if (!task) return json({ error: 'Work task not found' }, 404);
    return json(task);
}

async function handleCreate(req: Request, workTaskService: WorkTaskService, tenantId: string, db?: Database): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, CreateWorkTaskSchema);
        if (db) {
            const injectionDenied = checkInjection(db, data.description, 'work_task', req);
            if (injectionDenied) return injectionDenied;
        }

        const task = await workTaskService.create({
            agentId: data.agentId,
            description: data.description,
            projectId: data.projectId,
            source: data.source,
            sourceId: data.sourceId,
            requesterInfo: data.requesterInfo,
            // priority is accepted via CreateWorkTaskInput but not yet in the validation schema
            // (requires Layer 0 migration). Service defaults to P2.
        }, tenantId);

        return json(task, 201);
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.detail }, 400);
        return handleRouteError(err);
    }
}

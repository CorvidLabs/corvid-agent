import type { WorkTaskService } from '../work/service';
import type { RequestContext } from '../middleware/guards';
import { tenantRoleGuard } from '../middleware/guards';
import { parseBodyOrThrow, ValidationError, CreateWorkTaskSchema, AddTaskDependencySchema } from '../lib/validation';
import { json, handleRouteError } from '../lib/response';
import { NotFoundError } from '../lib/errors';

export function handleWorkTaskRoutes(
    req: Request,
    url: URL,
    workTaskService: WorkTaskService,
    context?: RequestContext,
): Response | Promise<Response> | null {
    const path = url.pathname;
    const method = req.method;
    const tenantId = context?.tenantId ?? 'default';

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
        return handleCreate(req, workTaskService, tenantId);
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

    // GET /api/work-tasks/:id/dependencies — list dependencies
    const depsGetMatch = path.match(/^\/api\/work-tasks\/([^/]+)\/dependencies$/);
    if (depsGetMatch && method === 'GET') {
        return handleGetDependencies(depsGetMatch[1], workTaskService, tenantId);
    }

    // POST /api/work-tasks/:id/dependencies — add dependency
    const depsPostMatch = path.match(/^\/api\/work-tasks\/([^/]+)\/dependencies$/);
    if (depsPostMatch && method === 'POST') {
        if (context) {
            const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
            if (denied) return denied;
        }
        return handleAddDependency(req, depsPostMatch[1], workTaskService, tenantId);
    }

    // DELETE /api/work-tasks/:id/dependencies/:depId — remove dependency
    const depsDeleteMatch = path.match(/^\/api\/work-tasks\/([^/]+)\/dependencies\/([^/]+)$/);
    if (depsDeleteMatch && method === 'DELETE') {
        if (context) {
            const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
            if (denied) return denied;
        }
        return handleRemoveDependency(depsDeleteMatch[1], depsDeleteMatch[2], workTaskService, tenantId);
    }

    // GET /api/work-tasks/:id/dependents — list tasks that depend on this task
    const dependentsMatch = path.match(/^\/api\/work-tasks\/([^/]+)\/dependents$/);
    if (dependentsMatch && method === 'GET') {
        return handleGetDependents(dependentsMatch[1], workTaskService, tenantId);
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

async function handleCreate(req: Request, workTaskService: WorkTaskService, tenantId: string): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, CreateWorkTaskSchema);

        const task = await workTaskService.create({
            agentId: data.agentId,
            description: data.description,
            projectId: data.projectId,
            source: data.source,
            sourceId: data.sourceId,
            requesterInfo: data.requesterInfo,
            maxRetries: data.maxRetries,
            retryBackoff: data.retryBackoff,
            dependsOn: data.dependsOn,
        }, tenantId);

        return json(task, 201);
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.detail }, 400);
        return handleRouteError(err);
    }
}

function handleGetDependencies(taskId: string, workTaskService: WorkTaskService, tenantId: string): Response {
    const task = workTaskService.getTask(taskId, tenantId);
    if (!task) return json({ error: 'Work task not found' }, 404);
    return json(workTaskService.getTaskDependencies(taskId));
}

async function handleAddDependency(req: Request, taskId: string, workTaskService: WorkTaskService, tenantId: string): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, AddTaskDependencySchema);
        const dep = workTaskService.addDependency(taskId, data.dependsOnTaskId, tenantId);
        return json(dep, 201);
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.detail }, 400);
        if (err instanceof NotFoundError) return json({ error: err.message }, 404);
        return handleRouteError(err);
    }
}

function handleRemoveDependency(taskId: string, dependsOnTaskId: string, workTaskService: WorkTaskService, tenantId: string): Response {
    try {
        const task = workTaskService.getTask(taskId, tenantId);
        if (!task) return json({ error: 'Work task not found' }, 404);
        workTaskService.removeDependency(taskId, dependsOnTaskId, tenantId);
        return json({ ok: true });
    } catch (err) {
        return handleRouteError(err);
    }
}

function handleGetDependents(taskId: string, workTaskService: WorkTaskService, tenantId: string): Response {
    const task = workTaskService.getTask(taskId, tenantId);
    if (!task) return json({ error: 'Work task not found' }, 404);
    return json(workTaskService.getTaskDependents(taskId));
}

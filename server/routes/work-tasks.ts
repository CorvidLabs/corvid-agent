import type { WorkTaskService } from '../work/service';

function json(data: unknown, status: number = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

export function handleWorkTaskRoutes(
    req: Request,
    url: URL,
    workTaskService: WorkTaskService,
): Response | Promise<Response> | null {
    const path = url.pathname;
    const method = req.method;

    // GET /api/work-tasks — list (optional ?agentId= filter)
    if (path === '/api/work-tasks' && method === 'GET') {
        const agentId = url.searchParams.get('agentId') ?? undefined;
        return json(workTaskService.listTasks(agentId));
    }

    // POST /api/work-tasks — create
    if (path === '/api/work-tasks' && method === 'POST') {
        return handleCreate(req, workTaskService);
    }

    // POST /api/work-tasks/:id/cancel — cancel a running task
    const cancelMatch = path.match(/^\/api\/work-tasks\/([^/]+)\/cancel$/);
    if (cancelMatch && method === 'POST') {
        return handleCancel(cancelMatch[1], workTaskService);
    }

    // GET /api/work-tasks/:id — get single
    const idMatch = path.match(/^\/api\/work-tasks\/([^/]+)$/);
    if (idMatch && method === 'GET') {
        const task = workTaskService.getTask(idMatch[1]);
        if (!task) return json({ error: 'Work task not found' }, 404);
        return json(task);
    }

    return null;
}

async function handleCancel(taskId: string, workTaskService: WorkTaskService): Promise<Response> {
    const task = await workTaskService.cancelTask(taskId);
    if (!task) return json({ error: 'Work task not found' }, 404);
    return json(task);
}

async function handleCreate(req: Request, workTaskService: WorkTaskService): Promise<Response> {
    try {
        const body = await req.json();
        if (!body.agentId || !body.description) {
            return json({ error: 'agentId and description are required' }, 400);
        }

        const task = await workTaskService.create({
            agentId: body.agentId,
            description: body.description,
            projectId: body.projectId,
            source: body.source ?? 'web',
            sourceId: body.sourceId,
            requesterInfo: body.requesterInfo,
        });

        return json(task, 201);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return json({ error: message }, 400);
    }
}

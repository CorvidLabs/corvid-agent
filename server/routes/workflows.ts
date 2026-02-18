import type { Database } from 'bun:sqlite';
import type { WorkflowService } from '../workflow/service';
import {
    listWorkflows,
    getWorkflow,
    createWorkflow,
    updateWorkflow,
    deleteWorkflow,
    getWorkflowRun,
    listWorkflowRuns,
    listNodeRuns,
} from '../db/workflows';
import {
    parseBodyOrThrow,
    ValidationError,
    CreateWorkflowSchema,
    UpdateWorkflowSchema,
    TriggerWorkflowSchema,
    WorkflowRunActionSchema,
} from '../lib/validation';
import { json, handleRouteError, badRequest, safeNumParam } from '../lib/response';

export function handleWorkflowRoutes(
    req: Request,
    url: URL,
    db: Database,
    workflowService: WorkflowService | null,
): Response | Promise<Response> | null {
    // List workflows
    if (url.pathname === '/api/workflows' && req.method === 'GET') {
        const agentId = url.searchParams.get('agentId') ?? undefined;
        const workflows = listWorkflows(db, agentId);
        return json(workflows);
    }

    // Create workflow
    if (url.pathname === '/api/workflows' && req.method === 'POST') {
        return handleCreateWorkflow(req, db);
    }

    // Get single workflow
    const workflowMatch = url.pathname.match(/^\/api\/workflows\/([^/]+)$/);
    if (workflowMatch && req.method === 'GET') {
        const workflow = getWorkflow(db, workflowMatch[1]);
        if (!workflow) return json({ error: 'Workflow not found' }, 404);
        return json(workflow);
    }

    // Update workflow
    if (workflowMatch && req.method === 'PUT') {
        return handleUpdateWorkflow(req, db, workflowMatch[1]);
    }

    // Delete workflow
    if (workflowMatch && req.method === 'DELETE') {
        const deleted = deleteWorkflow(db, workflowMatch[1]);
        if (!deleted) return json({ error: 'Workflow not found' }, 404);
        return json({ ok: true });
    }

    // Trigger workflow execution
    const triggerMatch = url.pathname.match(/^\/api\/workflows\/([^/]+)\/trigger$/);
    if (triggerMatch && req.method === 'POST') {
        return handleTriggerWorkflow(req, db, triggerMatch[1], workflowService);
    }

    // List runs for a workflow
    const runsMatch = url.pathname.match(/^\/api\/workflows\/([^/]+)\/runs$/);
    if (runsMatch && req.method === 'GET') {
        const limit = safeNumParam(url.searchParams.get('limit'), 50);
        const runs = listWorkflowRuns(db, runsMatch[1], limit);
        return json(runs);
    }

    // List all workflow runs
    if (url.pathname === '/api/workflow-runs' && req.method === 'GET') {
        const limit = safeNumParam(url.searchParams.get('limit'), 50);
        const runs = listWorkflowRuns(db, undefined, limit);
        return json(runs);
    }

    // Get single run (with node runs)
    const runMatch = url.pathname.match(/^\/api\/workflow-runs\/([^/]+)$/);
    if (runMatch && req.method === 'GET') {
        const run = getWorkflowRun(db, runMatch[1]);
        if (!run) return json({ error: 'Workflow run not found' }, 404);
        return json(run);
    }

    // Pause/resume/cancel a run
    const runActionMatch = url.pathname.match(/^\/api\/workflow-runs\/([^/]+)\/action$/);
    if (runActionMatch && req.method === 'POST') {
        return handleRunAction(req, runActionMatch[1], workflowService);
    }

    // List node runs for a run
    const nodeRunsMatch = url.pathname.match(/^\/api\/workflow-runs\/([^/]+)\/nodes$/);
    if (nodeRunsMatch && req.method === 'GET') {
        const nodeRuns = listNodeRuns(db, nodeRunsMatch[1]);
        return json(nodeRuns);
    }

    // Workflow service health
    if (url.pathname === '/api/workflows/health' && req.method === 'GET') {
        if (!workflowService) {
            return json({ running: false, activeRuns: 0, runningNodes: 0, totalWorkflows: 0 });
        }
        return json(workflowService.getStats());
    }

    return null;
}

async function handleCreateWorkflow(req: Request, db: Database): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, CreateWorkflowSchema);
        const workflow = createWorkflow(db, data);
        return json(workflow, 201);
    } catch (err) {
        if (err instanceof ValidationError) return badRequest(err.detail);
        return handleRouteError(err);
    }
}

async function handleUpdateWorkflow(req: Request, db: Database, id: string): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, UpdateWorkflowSchema);
        const workflow = updateWorkflow(db, id, data);
        if (!workflow) return json({ error: 'Workflow not found' }, 404);
        return json(workflow);
    } catch (err) {
        if (err instanceof ValidationError) return badRequest(err.detail);
        return handleRouteError(err);
    }
}

async function handleTriggerWorkflow(
    req: Request,
    _db: Database,
    workflowId: string,
    workflowService: WorkflowService | null,
): Promise<Response> {
    if (!workflowService) {
        return json({ error: 'Workflow service not available' }, 503);
    }

    try {
        const data = await parseBodyOrThrow(req, TriggerWorkflowSchema);
        const run = await workflowService.triggerWorkflow(workflowId, data.input);
        return json(run, 201);
    } catch (err) {
        if (err instanceof ValidationError) return badRequest(err.detail);
        const errMsg = err instanceof Error ? err.message : '';
        if (errMsg.includes('not found') || errMsg.includes('not active')) {
            return badRequest('Workflow not found or not active');
        }
        return handleRouteError(err);
    }
}

async function handleRunAction(
    req: Request,
    runId: string,
    workflowService: WorkflowService | null,
): Promise<Response> {
    if (!workflowService) {
        return json({ error: 'Workflow service not available' }, 503);
    }

    try {
        const data = await parseBodyOrThrow(req, WorkflowRunActionSchema);

        switch (data.action) {
            case 'pause': {
                const ok = workflowService.pauseRun(runId);
                if (!ok) return json({ error: 'Run not found or not running' }, 400);
                return json({ ok: true, action: 'paused' });
            }
            case 'resume': {
                const ok = await workflowService.resumeRun(runId);
                if (!ok) return json({ error: 'Run not found or not paused' }, 400);
                return json({ ok: true, action: 'resumed' });
            }
            case 'cancel': {
                const ok = workflowService.cancelRun(runId);
                if (!ok) return json({ error: 'Run not found or not running/paused' }, 400);
                return json({ ok: true, action: 'cancelled' });
            }
            default:
                return json({ error: `Unknown action: ${data.action}` }, 400);
        }
    } catch (err) {
        if (err instanceof ValidationError) return badRequest(err.detail);
        return handleRouteError(err);
    }
}

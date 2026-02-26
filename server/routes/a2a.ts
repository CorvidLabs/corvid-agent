/**
 * A2A inbound task routes.
 *
 * POST /a2a/tasks/send — create and start a task
 * GET  /a2a/tasks/:id  — poll task status/result
 */

import type { Database } from 'bun:sqlite';
import type { ProcessManager } from '../process/manager';
import { handleTaskSend, handleTaskGet, type A2ATaskDeps } from '../a2a/task-handler';
import { json, notFound, handleRouteError } from '../lib/response';
import { parseBodyOrThrow, ValidationError, SendA2ATaskSchema } from '../lib/validation';
import { createLogger } from '../lib/logger';

const log = createLogger('A2ARoutes');

export async function handleA2ARoutes(
    req: Request,
    url: URL,
    db: Database,
    processManager: ProcessManager,
): Promise<Response | null> {
    // POST /a2a/tasks/send
    if (url.pathname === '/a2a/tasks/send' && req.method === 'POST') {
        try {
            const data = await parseBodyOrThrow(req, SendA2ATaskSchema);
            const params = data.params ?? data;

            const deps: A2ATaskDeps = { db, processManager };
            const task = handleTaskSend(deps, {
                message: params.message!,
                skill: params.skill,
                timeoutMs: params.timeoutMs,
            });

            return json(task);
        } catch (err) {
            if (err instanceof ValidationError) return json({ error: err.detail }, 400);
            log.error('A2A tasks/send failed', { error: err instanceof Error ? err.message : String(err) });
            return handleRouteError(err);
        }
    }

    // GET /a2a/tasks/:id
    const taskMatch = url.pathname.match(/^\/a2a\/tasks\/([^/]+)$/);
    if (taskMatch && req.method === 'GET') {
        const taskId = taskMatch[1];
        const task = handleTaskGet(taskId);
        if (!task) {
            return notFound('Task not found');
        }
        return json(task);
    }

    return null;
}
